// ============================================
// COSMEON FS-LITE — Chunk Replicator
// ============================================

import { fsLogger } from "./logger";
import { getOnlineNodes, hasCapacity, simulateLatency } from "./node-manager";
import { storageClient } from "./storage-client";
import type { FSChunk } from "./types";
import { DEFAULT_CONFIG } from "./types";

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
        // Read chunk data from primary node
        const data = await storageClient.readChunk(chunk.nodeId, chunk.chunkId);

        // Simulate network latency
        await simulateLatency(targetNode.nodeId);

        // Write to target node
        await storageClient.writeChunk(targetNode.nodeId, chunk.chunkId, data);

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
): Promise<boolean> {
  try {
    // Try to read from primary node first
    let data: Buffer | null = null;
    const nodesToTry = [chunk.nodeId, ...chunk.replicas];

    for (const nodeId of nodesToTry) {
      try {
        data = await storageClient.readChunk(nodeId, chunk.chunkId);
        break;
      } catch {}
    }

    if (!data) {
      throw new Error("No available source for chunk");
    }

    await simulateLatency(targetNodeId);
    await storageClient.writeChunk(targetNodeId, chunk.chunkId, data);

    return true;
  } catch {
    return false;
  }
}
