// ============================================
// COSMEON FS-LITE — Satellite Node Manager
// ============================================

import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { connectDB, NodeModel } from "./db";
import { fsLogger } from "./logger";
import type { FSNode, NodeStatus } from "./types";
import { DEFAULT_CONFIG } from "./types";

// In-memory cache of nodes (synced with MongoDB)
let nodesCache: Map<string, FSNode> = new Map();
let initialized = false;

/**
 * Ensure the data directory and node directories exist.
 */
async function ensureNodeDir(
  nodeId: string,
  dataDir: string = DEFAULT_CONFIG.dataDir,
): Promise<void> {
  const dirPath = join(process.cwd(), dataDir, "nodes", nodeId);
  await mkdir(dirPath, { recursive: true });
}

/**
 * Initialize default nodes if none exist.
 */
export async function initializeNodes(
  count: number = DEFAULT_CONFIG.defaultNodeCount,
  dataDir: string = DEFAULT_CONFIG.dataDir,
): Promise<void> {
  if (initialized) return;

  try {
    await connectDB();

    // 1. Check local file system for node folders
    const nodesDirPath = join(process.cwd(), dataDir, "nodes");
    let localFolderIds: string[] = [];

    try {
      const dirents = await readdir(nodesDirPath, { withFileTypes: true });
      localFolderIds = dirents
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
    } catch {
      // Directory doesn't exist yet, which is fine
    }

    let existingNodes: any[] = [];

    // 2. Query DB for matching node records
    if (localFolderIds.length > 0) {
      existingNodes = await NodeModel.find({
        nodeId: { $in: localFolderIds },
      }).lean();
    }

    // 3. Fallback: If no local folders match, load any nodes from DB
    if (existingNodes.length === 0) {
      existingNodes = await NodeModel.find({}).lean();
    }

    // 4. Load found nodes into cache and ensure folders exist
    if (existingNodes.length > 0) {
      // Load from DB into cache
      for (const doc of existingNodes) {
        const node: FSNode = {
          nodeId: doc.nodeId as string,
          name: doc.name as string,
          status: doc.status as NodeStatus,
          createdAt: doc.createdAt as string,
          capacityBytes: doc.capacityBytes as number,
          usedBytes: doc.usedBytes as number,
          chunkCount: doc.chunkCount as number,
          latencyMs: doc.latencyMs as number,
        };
        nodesCache.set(node.nodeId, node);
        await ensureNodeDir(node.nodeId, dataDir);
      }
      initialized = true;
      return;
    }
  } catch (error) {
    // MongoDB not available, continue with in-memory only
    if (nodesCache.size > 0) {
      initialized = true;
      return;
    }
  }

  // Create default nodes
  const defaultLatencies = [50, 120, 300, 80, 200];
  const defaultCapacities = [
    100 * 1024 * 1024, // 100 MB
    150 * 1024 * 1024, // 150 MB
    80 * 1024 * 1024,  //  80 MB
    200 * 1024 * 1024, // 200 MB
    120 * 1024 * 1024, // 120 MB
  ];
  // Rack assignment: simulates 3 failure domains for CRUSH placement
  const defaultRacks = ["rack-alpha", "rack-alpha", "rack-beta", "rack-beta", "rack-gamma"];

  for (let i = 0; i < count; i++) {
    const nodeId = uuidv4();
    const node: FSNode = {
      nodeId,
      name: `ORBIT-${i + 1}`,
      status: "online",
      createdAt: new Date().toISOString(),
      rackId: defaultRacks[i] || "rack-alpha",
      capacityBytes: defaultCapacities[i] || 100 * 1024 * 1024,
      usedBytes: 0,
      chunkCount: 0,
      latencyMs: defaultLatencies[i] || 100,
    };

    nodesCache.set(nodeId, node);
    await ensureNodeDir(nodeId, dataDir);

    // Persist to MongoDB
    try {
      await NodeModel.create(node);
    } catch {
      // Continue without persistence
    }

    fsLogger.log("NODE_CREATE", `Node "${node.name}" created`, {
      nodeId,
      capacity: node.capacityBytes,
      latency: node.latencyMs,
    });
  }

  initialized = true;
}

/**
 * Create a new satellite node.
 */
export async function createNode(
  name: string,
  config?: {
    capacityBytes?: number;
    latencyMs?: number;
  },
): Promise<FSNode> {
  const nodeId = uuidv4();
  const node: FSNode = {
    nodeId,
    name,
    status: "online",
    createdAt: new Date().toISOString(),
    capacityBytes: config?.capacityBytes || 100 * 1024 * 1024,
    usedBytes: 0,
    chunkCount: 0,
    latencyMs: config?.latencyMs || 100,
  };

  nodesCache.set(nodeId, node);
  await ensureNodeDir(nodeId);

  try {
    await connectDB();
    await NodeModel.create(node);
  } catch {
    // Continue without persistence
  }

  fsLogger.log("NODE_CREATE", `Node "${name}" created`, { nodeId });
  return node;
}

/**
 * Set a node's status (simulate failure/recovery).
 */
export async function setNodeStatus(
  nodeId: string,
  status: NodeStatus,
): Promise<FSNode | null> {
  const node = nodesCache.get(nodeId);
  if (!node) return null;

  const prevStatus = node.status;
  node.status = status;
  nodesCache.set(nodeId, node);

  // Persist to MongoDB
  try {
    await connectDB();
    await NodeModel.updateOne({ nodeId }, { status });
  } catch {
    // Continue without persistence
  }

  const eventType =
    status === "offline"
      ? "NODE_FAILURE"
      : status === "degraded"
        ? "NODE_DEGRADED"
        : "NODE_RECOVERY";

  fsLogger.log(
    eventType,
    `Node "${node.name}" status: ${prevStatus} → ${status}`,
    {
      nodeId,
      prevStatus,
      newStatus: status,
    },
  );

  return node;
}

/**
 * Get all nodes.
 */
export function getNodes(): FSNode[] {
  return Array.from(nodesCache.values());
}

/**
 * Get only online nodes.
 */
export function getOnlineNodes(): FSNode[] {
  return getNodes().filter((n) => n.status === "online");
}

/**
 * Get a specific node.
 */
export function getNode(nodeId: string): FSNode | undefined {
  return nodesCache.get(nodeId);
}

/**
 * Update a node's storage usage.
 */
export async function updateNodeUsage(
  nodeId: string,
  bytesChange: number,
  chunkCountChange: number,
): Promise<void> {
  const node = nodesCache.get(nodeId);
  if (!node) return;

  node.usedBytes += bytesChange;
  node.chunkCount += chunkCountChange;
  nodesCache.set(nodeId, node);

  try {
    await connectDB();
    await NodeModel.updateOne(
      { nodeId },
      { usedBytes: node.usedBytes, chunkCount: node.chunkCount },
    );
  } catch {
    // Continue without persistence
  }
}

/**
 * Check if a node has capacity for a chunk of given size.
 */
export function hasCapacity(nodeId: string, chunkSize: number): boolean {
  const node = nodesCache.get(nodeId);
  if (!node) return false;
  return node.usedBytes + chunkSize <= node.capacityBytes;
}

/**
 * Simulate latency for a node operation.
 */
export function simulateLatency(nodeId: string): Promise<void> {
  const node = nodesCache.get(nodeId);
  if (!node || node.latencyMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, node.latencyMs));
}

/**
 * Reset initialization state (for testing).
 */
export function resetNodes(): void {
  nodesCache = new Map();
  initialized = false;
}
