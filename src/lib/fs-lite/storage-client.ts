// ============================================
// COSMEON FS-LITE — Unified Storage Client
// ============================================
//
// Abstraction layer that routes chunk I/O to either:
//   - Local disk (STORAGE_MODE=local, default)
//   - Docker containers via HTTP (STORAGE_MODE=docker)
//
// This allows the entire system to run in both modes
// without any other file needing to know the difference.
// ============================================

import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "./types";
import { getNode } from "./node-manager";

/**
 * Resolve the storage mode from environment or config.
 */
function getStorageMode(): "local" | "docker" {
  return (
    (process.env.STORAGE_MODE as "local" | "docker") ||
    DEFAULT_CONFIG.storageMode
  );
}

/**
 * Get the base URL for a Docker node container.
 */
function getNodeUrl(nodeId: string): string {
  const node = getNode(nodeId);
  if (node?.host && node?.port) {
    return `http://${node.host}:${node.port}`;
  }
  // Fallback: try NODE_HOSTS env var
  const hosts = process.env.NODE_HOSTS?.split(",") || [];
  // NODE_HOSTS format: "node-1:4001,node-2:4002,..."
  // We map by index, but this is only a fallback
  for (const hostEntry of hosts) {
    const [host, port] = hostEntry.trim().split(":");
    if (host && port) {
      return `http://${host}:${port}`;
    }
  }
  throw new Error(`No host/port configured for node ${nodeId}`);
}

/**
 * Ensure the local node directory exists.
 */
async function ensureLocalDir(nodeId: string, dataDir: string): Promise<void> {
  const dirPath = join(process.cwd(), dataDir, "nodes", nodeId);
  await mkdir(dirPath, { recursive: true });
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export const storageClient = {
  /**
   * Write a chunk to a node.
   */
  async writeChunk(
    nodeId: string,
    chunkId: string,
    data: Buffer,
    dataDir: string = DEFAULT_CONFIG.dataDir,
  ): Promise<void> {
    const mode = getStorageMode();

    if (mode === "docker") {
      const url = getNodeUrl(nodeId);
      const res = await fetch(`${url}/chunk/${chunkId}`, {
        method: "PUT",
        body: new Uint8Array(data),
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": data.length.toString(),
        },
      });
      if (!res.ok) {
        throw new Error(
          `Failed to write chunk ${chunkId} to node ${nodeId}: ${res.statusText}`,
        );
      }
    } else {
      await ensureLocalDir(nodeId, dataDir);
      const chunkPath = join(process.cwd(), dataDir, "nodes", nodeId, chunkId);
      await writeFile(chunkPath, data);
    }
  },

  /**
   * Read a chunk from a node.
   */
  async readChunk(
    nodeId: string,
    chunkId: string,
    dataDir: string = DEFAULT_CONFIG.dataDir,
  ): Promise<Buffer> {
    const mode = getStorageMode();

    if (mode === "docker") {
      const url = getNodeUrl(nodeId);
      const res = await fetch(`${url}/chunk/${chunkId}`);
      if (!res.ok) {
        throw new Error(
          `Failed to read chunk ${chunkId} from node ${nodeId}: ${res.statusText}`,
        );
      }
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } else {
      const chunkPath = join(process.cwd(), dataDir, "nodes", nodeId, chunkId);
      return readFile(chunkPath);
    }
  },

  /**
   * Delete a chunk from a node.
   */
  async deleteChunk(
    nodeId: string,
    chunkId: string,
    dataDir: string = DEFAULT_CONFIG.dataDir,
  ): Promise<boolean> {
    const mode = getStorageMode();

    try {
      if (mode === "docker") {
        const url = getNodeUrl(nodeId);
        const res = await fetch(`${url}/chunk/${chunkId}`, {
          method: "DELETE",
        });
        return res.ok;
      } else {
        const chunkPath = join(
          process.cwd(),
          dataDir,
          "nodes",
          nodeId,
          chunkId,
        );
        await unlink(chunkPath);
        return true;
      }
    } catch {
      return false;
    }
  },

  /**
   * Check if a specific node is reachable (Docker mode) or dir exists (local).
   */
  async healthCheck(nodeId: string): Promise<boolean> {
    const mode = getStorageMode();

    try {
      if (mode === "docker") {
        const url = getNodeUrl(nodeId);
        const res = await fetch(`${url}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        return res.ok;
      } else {
        // Local mode: always healthy
        return true;
      }
    } catch {
      return false;
    }
  },
};
