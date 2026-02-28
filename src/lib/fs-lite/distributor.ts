// ============================================
// COSMEON FS-LITE -- Chunk Distributor
// ============================================

import { fsLogger } from "./logger";
import { hasCapacity } from "./node-manager";
import type { DistributionStrategy, FSChunk, FSNode } from "./types";
import { DEFAULT_CONFIG } from "./types";

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
      : strategy === "crush"
        ? distributeCRUSH(chunks, nodes)
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
 * djb2 hash: deterministic float in [0, 1] from a string.
 * Avoids node:crypto so the bundler can statically analyse this module.
 */
function hashToFloat(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (((h << 5) + h) ^ input.charCodeAt(i)) >>> 0;
  }
  return h / 4294967295;
}

/**
 * CRUSH -- Controlled Replication Under Scalable Hashing.
 *
 * For each chunk:
 *  1. Score every eligible node via capacity-weighted rendezvous hashing.
 *  2. Sort nodes by score descending.
 *  3. Primary = highest scorer.
 *  4. Replicas = next-highest scorers from different racks (failure domains).
 *
 * Properties:
 *  - Deterministic: same inputs always produce the same placement.
 *  - Capacity-weighted: larger nodes absorb proportionally more chunks.
 *  - Rack-aware: replicas spread across failure domains.
 *  - Minimal rebalancing: only affected chunks move when topology changes.
 */
function distributeCRUSH(
  chunks: Omit<FSChunk, "nodeId" | "replicas">[],
  nodes: FSNode[],
): FSChunk[] {
  const result: FSChunk[] = [];
  const totalCapacity = nodes.reduce((sum, n) => sum + n.capacityBytes, 0);
  const replicationFactor = DEFAULT_CONFIG.replicationFactor;

  for (const chunk of chunks) {
    // Score every node that has enough capacity
    const scoredNodes = nodes
      .filter((n) => hasCapacity(n.nodeId, chunk.size))
      .map((node) => {
        const normalized = hashToFloat(
          `${chunk.fileId}:${chunk.index}:${node.nodeId}`,
        );
        const weight = node.capacityBytes / totalCapacity;
        const score = normalized ** (1 / weight);
        return { node, score };
      })
      .sort((a, b) => b.score - a.score);

    if (scoredNodes.length === 0) {
      // Fallback: use highest-capacity node
      const fallback = nodes.reduce((a, b) =>
        a.capacityBytes > b.capacityBytes ? a : b,
      );
      result.push({ ...chunk, nodeId: fallback.nodeId, replicas: [] });
      continue;
    }

    const primary = scoredNodes[0].node;

    // Select replicas from different racks for failure-domain isolation
    const usedRacks = new Set<string>([primary.rackId ?? primary.nodeId]);
    const replicas: string[] = [];

    for (const { node } of scoredNodes.slice(1)) {
      if (replicas.length >= replicationFactor - 1) break;
      const rack = node.rackId ?? node.nodeId;
      if (!usedRacks.has(rack)) {
        replicas.push(node.nodeId);
        usedRacks.add(rack);
      }
    }

    // Fill remaining replica slots if not enough rack-diverse nodes exist
    for (const { node } of scoredNodes.slice(1)) {
      if (replicas.length >= replicationFactor - 1) break;
      if (node.nodeId !== primary.nodeId && !replicas.includes(node.nodeId)) {
        replicas.push(node.nodeId);
      }
    }

    result.push({ ...chunk, nodeId: primary.nodeId, replicas });
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
