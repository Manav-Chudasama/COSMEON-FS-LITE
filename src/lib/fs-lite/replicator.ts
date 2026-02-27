// ============================================
// COSMEON FS-LITE — Chunk Replicator
// ============================================

import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FSChunk, FSNode } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { getOnlineNodes, simulateLatency } from "./node-manager";
import { hasCapacity } from "./node-manager";
import { fsLogger } from "./logger";

/**
 * Replicate chunks across nodes for fault tolerance.
 *
 * For each chunk, copies the chunk data to additional nodes
 * based on the replication factor.
 *
 * @returns Updated chunks with replica information.
 */
export async function replicateChunks(
  chunks: FSChunk[],
  replicationFactor: number = DEFAULT_CONFIG.replicationFactor,
  dataDir: string = DEFAULT_CONFIG.dataDir,
): Promise<FSChunk[]> {
  const onlineNodes = getOnlineNodes();

  if (onlineNodes.length < 2) {
    // Not enough nodes for replication
    return chunks;
  }

  const updatedChunks: FSChunk[] = [];

  for (const chunk of chunks) {
    const replicas: string[] = [];

    // Find nodes to replicate to (exclude the primary node)
    const candidateNodes = onlineNodes.filter(
      (n) =>
        n.nodeId !== chunk.nodeId &&
        hasCapacity(n.nodeId, chunk.size) &&
        !chunk.replicas.includes(n.nodeId),
    );

    // How many replicas we need
    const replicasNeeded = Math.min(
      replicationFactor - 1, // -1 because primary counts
      candidateNodes.length,
    );

    for (let i = 0; i < replicasNeeded; i++) {
      const targetNode = candidateNodes[i];

      try {
        const sourcePath = join(
          process.cwd(),
          dataDir,
          "nodes",
          chunk.nodeId,
          chunk.chunkId,
        );
        const targetPath = join(
          process.cwd(),
          dataDir,
          "nodes",
          targetNode.nodeId,
          chunk.chunkId,
        );

        // Simulate network latency
        await simulateLatency(targetNode.nodeId);

        await copyFile(sourcePath, targetPath);
        replicas.push(targetNode.nodeId);

        fsLogger.log(
          "CHUNK_REPLICATE",
          `Chunk ${chunk.index} replicated to ${targetNode.name}`,
          {
            chunkId: chunk.chunkId,
            sourceNodeId: chunk.nodeId,
            targetNodeId: targetNode.nodeId,
            targetNodeName: targetNode.name,
          },
        );
      } catch (error) {
        fsLogger.log(
          "CHUNK_REPLICATE",
          `Failed to replicate chunk ${chunk.index} to ${targetNode.name}: ${error instanceof Error ? error.message : "Unknown"}`,
          {
            chunkId: chunk.chunkId,
            targetNodeId: targetNode.nodeId,
            error: true,
          },
        );
      }
    }

    updatedChunks.push({
      ...chunk,
      replicas: [...chunk.replicas, ...replicas],
    });
  }

  return updatedChunks;
}

/**
 * Replicate a single chunk to a specific target node.
 */
export async function replicateChunkToNode(
  chunk: FSChunk,
  targetNodeId: string,
  dataDir: string = DEFAULT_CONFIG.dataDir,
): Promise<boolean> {
  try {
    // Try to read from primary node first
    let sourceNodeId = chunk.nodeId;
    let sourcePath = join(
      process.cwd(),
      dataDir,
      "nodes",
      sourceNodeId,
      chunk.chunkId,
    );

    let data: Buffer;
    try {
      data = await readFile(sourcePath);
    } catch {
      // If primary fails, try replicas
      let found = false;
      for (const replicaNodeId of chunk.replicas) {
        try {
          sourcePath = join(
            process.cwd(),
            dataDir,
            "nodes",
            replicaNodeId,
            chunk.chunkId,
          );
          data = await readFile(sourcePath);
          sourceNodeId = replicaNodeId;
          found = true;
          break;
        } catch {
          continue;
        }
      }
      if (!found) {
        throw new Error("No available source for chunk");
      }
    }

    const targetPath = join(
      process.cwd(),
      dataDir,
      "nodes",
      targetNodeId,
      chunk.chunkId,
    );

    await simulateLatency(targetNodeId);
    await writeFile(targetPath, data!);

    return true;
  } catch {
    return false;
  }
}
