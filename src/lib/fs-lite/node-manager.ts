// ============================================
// COSMEON FS-LITE — Satellite Node Manager
// ============================================

import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { connectDB, FileModel, NodeModel } from "./db";
import { fsLogger } from "./logger";
import type { FSNode, NodeStatus } from "./types";
import { DEFAULT_CONFIG } from "./types";

// In-memory cache of nodes (synced with MongoDB)
let nodesCache: Map<string, FSNode> = new Map();
let initialized = false;

/**
 * Ensure the data directory and node directories exist (local mode only).
 */
async function ensureNodeDir(
  nodeId: string,
  dataDir: string = DEFAULT_CONFIG.dataDir,
): Promise<void> {
  // In Docker mode, containers manage their own volumes
  if (process.env.STORAGE_MODE === "docker") return;
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

  // ── Docker Mode: discover nodes from NODE_HOSTS env var ──
  if (process.env.STORAGE_MODE === "docker" && process.env.NODE_HOSTS) {
    try {
      await connectDB();
    } catch {
      // Continue without persistence
    }

    const hostEntries = process.env.NODE_HOSTS.split(",").map((h) => h.trim());

    for (let i = 0; i < hostEntries.length; i++) {
      const [host, portStr] = hostEntries[i].split(":");
      const port = parseInt(portStr || "4000", 10);
      const nodeName = `ORBIT-${i + 1}`;

      // Check if this node already exists in DB
      let existingNode: any = null;
      try {
        existingNode = await NodeModel.findOne({ name: nodeName }).lean();
      } catch {
        // No DB
      }

      if (existingNode) {
        const node: FSNode = {
          nodeId: existingNode.nodeId as string,
          name: existingNode.name as string,
          status: existingNode.status as NodeStatus,
          createdAt: existingNode.createdAt as string,
          capacityBytes: existingNode.capacityBytes as number,
          usedBytes: existingNode.usedBytes as number,
          chunkCount: existingNode.chunkCount as number,
          latencyMs: existingNode.latencyMs as number,
          host,
          port,
        };
        nodesCache.set(node.nodeId, node);
      } else {
        const nodeId = uuidv4();
        const node: FSNode = {
          nodeId,
          name: nodeName,
          status: "online",
          createdAt: new Date().toISOString(),
          capacityBytes: 100 * 1024 * 1024, // 100 MB
          usedBytes: 0,
          chunkCount: 0,
          latencyMs: 10, // Real network latency in Docker
          host,
          port,
        };
        nodesCache.set(nodeId, node);

        try {
          await NodeModel.create({ ...node, host, port });
        } catch {
          // Continue without persistence
        }

        fsLogger.log(
          "NODE_CREATE",
          `Docker node "${nodeName}" registered at ${host}:${port}`,
          {
            nodeId,
            host,
            port,
          },
        );
      }
    }

    // ── Health check logging: confirm all Docker containers are reachable ──
    console.log("[FS-LITE] ── Docker Node Health Check ──");
    for (const [, node] of nodesCache) {
      try {
        const res = await fetch(`http://${node.host}:${node.port}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            chunkCount?: number;
            usedBytes?: number;
          };
          console.log(
            `[FS-LITE] ✓ ${node.name} (${node.host}:${node.port}) — ONLINE | chunks: ${data.chunkCount ?? 0} | used: ${((data.usedBytes ?? 0) / 1024).toFixed(1)} KB`,
          );
        } else {
          console.warn(
            `[FS-LITE] ✗ ${node.name} (${node.host}:${node.port}) — UNHEALTHY (status ${res.status})`,
          );
        }
      } catch {
        console.warn(
          `[FS-LITE] ✗ ${node.name} (${node.host}:${node.port}) — UNREACHABLE`,
        );
      }
    }
    console.log("[FS-LITE] ── Health Check Complete ──");

    await reconcileNodeStats();
    initialized = true;
    return;
  }

  // ── Local Mode: existing behavior ──
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
      await reconcileNodeStats();
      initialized = true;
      return;
    }
  } catch (_error) {
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
    80 * 1024 * 1024, //  80 MB
    200 * 1024 * 1024, // 200 MB
    120 * 1024 * 1024, // 120 MB
  ];
  // Rack assignment: simulates 3 failure domains for CRUSH placement
  const defaultRacks = [
    "rack-alpha",
    "rack-alpha",
    "rack-beta",
    "rack-beta",
    "rack-gamma",
  ];

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

  await reconcileNodeStats();
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
  return Array.from(nodesCache.values()).map((n) => ({ ...n }));
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

  node.usedBytes = Math.max(0, node.usedBytes + bytesChange);
  node.chunkCount = Math.max(0, node.chunkCount + chunkCountChange);
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

/**
 * Reconcile and synchronize node storage usage and chunk counts
 * with the actual files stored in the database.
 */
export async function reconcileNodeStats(): Promise<void> {
  try {
    await connectDB();
    const files = await FileModel.find({}, { chunks: 1 }).lean();

    // Map actual chunk counts and sizes per node from existing files
    const nodeStats = new Map<string, { usedBytes: number; chunkCount: number }>();
    for (const file of files) {
      if (Array.isArray(file.chunks)) {
        for (const chunk of file.chunks) {
          if (chunk.nodeId) {
            const current = nodeStats.get(chunk.nodeId) || {
              usedBytes: 0,
              chunkCount: 0,
            };
            current.usedBytes += chunk.size || 0;
            current.chunkCount += 1;
            nodeStats.set(chunk.nodeId, current);
          }
        }
      }
    }

    // Update nodes in cache and database
    for (const [nodeId, node] of nodesCache) {
      const stats = nodeStats.get(nodeId) || { usedBytes: 0, chunkCount: 0 };
      if (
        node.usedBytes !== stats.usedBytes ||
        node.chunkCount !== stats.chunkCount
      ) {
        node.usedBytes = stats.usedBytes;
        node.chunkCount = stats.chunkCount;
        nodesCache.set(nodeId, node);
        await NodeModel.updateOne(
          { nodeId },
          { usedBytes: stats.usedBytes, chunkCount: stats.chunkCount },
        ).catch(() => {});
      }
    }
  } catch {
    // Non-blocking fallback
  }
}
