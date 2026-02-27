// ============================================
// COSMEON FS-LITE — Chunk Distributor
// ============================================

import type { FSChunk, FSNode, DistributionStrategy } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { hasCapacity } from "./node-manager";
import { fsLogger } from "./logger";

/**
 * Distribute chunks across available online nodes.
 *
 * @param chunks  - Chunks to distribute (without nodeId assigned)
 * @param nodes   - Online nodes to distribute to
 * @param strategy - Distribution strategy
 * @returns Chunks with nodeId assigned
 */
export function distributeChunks(
  chunks: Omit<FSChunk, "nodeId" | "replicas">[],
  nodes: FSNode[],
  strategy: DistributionStrategy = DEFAULT_CONFIG.distributionStrategy,
): FSChunk[] {
  if (nodes.length === 0) {
    throw new Error("No online nodes available for distribution");
  }

  const assignedChunks: FSChunk[] =
    strategy === "weighted"
      ? distributeWeighted(chunks, nodes)
      : distributeRoundRobin(chunks, nodes);

  fsLogger.log(
    "CHUNK_DISTRIBUTE",
    `Distributed ${chunks.length} chunks across ${nodes.length} nodes (${strategy})`,
    {
      chunkCount: chunks.length,
      nodeCount: nodes.length,
      strategy,
      distribution: summarizeDistribution(assignedChunks, nodes),
    },
  );

  return assignedChunks;
}

/**
 * Round-robin distribution: assign chunks to nodes in sequence,
 * skipping nodes that lack capacity.
 */
function distributeRoundRobin(
  chunks: Omit<FSChunk, "nodeId" | "replicas">[],
  nodes: FSNode[],
): FSChunk[] {
  const result: FSChunk[] = [];
  let nodeIndex = 0;

  for (const chunk of chunks) {
    let assigned = false;
    let attempts = 0;

    while (!assigned && attempts < nodes.length) {
      const node = nodes[nodeIndex % nodes.length];

      if (hasCapacity(node.nodeId, chunk.size)) {
        result.push({
          ...chunk,
          nodeId: node.nodeId,
          replicas: [],
        });
        assigned = true;
      }

      nodeIndex++;
      attempts++;
    }

    if (!assigned) {
      // Fallback: assign to first node regardless of capacity
      result.push({
        ...chunk,
        nodeId: nodes[0].nodeId,
        replicas: [],
      });
    }
  }

  return result;
}

/**
 * Weighted distribution: assign to the node with the most
 * available capacity (greedy).
 */
function distributeWeighted(
  chunks: Omit<FSChunk, "nodeId" | "replicas">[],
  nodes: FSNode[],
): FSChunk[] {
  const result: FSChunk[] = [];

  // Track temporary usage during this distribution
  const tempUsage = new Map<string, number>();
  for (const node of nodes) {
    tempUsage.set(node.nodeId, node.usedBytes);
  }

  for (const chunk of chunks) {
    // Find node with most available space
    let bestNode = nodes[0];
    let bestAvailable = 0;

    for (const node of nodes) {
      const used = tempUsage.get(node.nodeId) || 0;
      const available = node.capacityBytes - used;
      if (available > bestAvailable) {
        bestAvailable = available;
        bestNode = node;
      }
    }

    result.push({
      ...chunk,
      nodeId: bestNode.nodeId,
      replicas: [],
    });

    // Update temporary usage
    tempUsage.set(
      bestNode.nodeId,
      (tempUsage.get(bestNode.nodeId) || 0) + chunk.size,
    );
  }

  return result;
}

/**
 * Summarize distribution as { nodeName: chunkCount }.
 */
function summarizeDistribution(
  chunks: FSChunk[],
  nodes: FSNode[],
): Record<string, number> {
  const summary: Record<string, number> = {};
  const nodeMap = new Map(nodes.map((n) => [n.nodeId, n.name]));

  for (const chunk of chunks) {
    const name = nodeMap.get(chunk.nodeId) || chunk.nodeId;
    summary[name] = (summary[name] || 0) + 1;
  }

  return summary;
}
