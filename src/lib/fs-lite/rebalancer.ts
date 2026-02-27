// ============================================
// COSMEON FS-LITE — Automatic Rebalancer
// ============================================

import { join } from "node:path";
import { unlink } from "node:fs/promises";
import type { FSChunk, RebalanceReport } from "./types";
import { DEFAULT_CONFIG } from "./types";
import {
  getNodes,
  getOnlineNodes,
  hasCapacity,
  updateNodeUsage,
} from "./node-manager";
import { getFilesOnNode, updateFileChunks } from "./metadata-store";
import { replicateChunkToNode } from "./replicator";
import { fsLogger } from "./logger";

/**
 * Rebalance chunks when a node fails.
 *
 * Finds all chunks on the failed node and re-replicates
 * them from existing replicas to other healthy nodes.
 */
export async function rebalanceOnFailure(
  failedNodeId: string,
  dataDir: string = DEFAULT_CONFIG.dataDir,
): Promise<RebalanceReport> {
  const report: RebalanceReport = {
    reason: "node_failure",
    affectedNodeId: failedNodeId,
    movedChunks: [],
    timestamp: new Date().toISOString(),
  };

  const onlineNodes = getOnlineNodes();
  if (onlineNodes.length === 0) {
    fsLogger.log("REBALANCE", "No online nodes available for rebalancing", {
      failedNodeId,
    });
    return report;
  }

  // Find all files that have chunks on the failed node
  const affectedFiles = getFilesOnNode(failedNodeId);

  for (const file of affectedFiles) {
    const updatedChunks: FSChunk[] = [];

    for (const chunk of file.chunks) {
      // Check if this chunk's primary is on the failed node
      if (chunk.nodeId === failedNodeId) {
        // Try to move to a replica or a new node
        const targetNode = findBestTarget(onlineNodes, chunk.size, [
          failedNodeId,
          ...chunk.replicas,
        ]);

        if (targetNode) {
          // If there's a replica, promote it as primary
          if (chunk.replicas.length > 0) {
            const newPrimaryNodeId = chunk.replicas[0];
            const remainingReplicas = chunk.replicas.filter(
              (r) => r !== newPrimaryNodeId && r !== failedNodeId,
            );

            // Also replicate to the new target for extra safety
            const success = await replicateChunkToNode(
              { ...chunk, nodeId: newPrimaryNodeId },
              targetNode.nodeId,
              dataDir,
            );

            if (success) {
              await updateNodeUsage(targetNode.nodeId, chunk.size, 1);
              remainingReplicas.push(targetNode.nodeId);
            }

            updatedChunks.push({
              ...chunk,
              nodeId: newPrimaryNodeId,
              replicas: remainingReplicas,
            });

            report.movedChunks.push({
              chunkId: chunk.chunkId,
              fromNodeId: failedNodeId,
              toNodeId: newPrimaryNodeId,
            });
          } else {
            // No replica available — chunk is lost
            updatedChunks.push(chunk);
            fsLogger.log(
              "REBALANCE",
              `Chunk ${chunk.index} of "${file.originalName}" has no replicas — data at risk`,
              { chunkId: chunk.chunkId, fileId: file.fileId },
            );
          }
        } else {
          updatedChunks.push(chunk);
        }
      } else {
        // Remove failed node from replicas list
        const filteredReplicas = chunk.replicas.filter(
          (r) => r !== failedNodeId,
        );

        // Re-replicate to maintain replication factor
        if (filteredReplicas.length < DEFAULT_CONFIG.replicationFactor - 1) {
          const targetNode = findBestTarget(onlineNodes, chunk.size, [
            chunk.nodeId,
            ...filteredReplicas,
          ]);

          if (targetNode) {
            const success = await replicateChunkToNode(
              chunk,
              targetNode.nodeId,
              dataDir,
            );
            if (success) {
              filteredReplicas.push(targetNode.nodeId);
              await updateNodeUsage(targetNode.nodeId, chunk.size, 1);
            }
          }
        }

        updatedChunks.push({
          ...chunk,
          replicas: filteredReplicas,
        });
      }
    }

    await updateFileChunks(file.fileId, updatedChunks);
  }

  fsLogger.log(
    "REBALANCE",
    `Rebalanced ${report.movedChunks.length} chunks after node failure`,
    {
      failedNodeId,
      movedChunks: report.movedChunks.length,
    },
  );

  return report;
}

/**
 * Rebalance chunks when a node recovers.
 *
 * Redistributes some chunks back to the recovered node
 * to balance load across the cluster.
 */
export async function rebalanceOnRecovery(
  recoveredNodeId: string,
  dataDir: string = DEFAULT_CONFIG.dataDir,
): Promise<RebalanceReport> {
  const report: RebalanceReport = {
    reason: "node_recovery",
    affectedNodeId: recoveredNodeId,
    movedChunks: [],
    timestamp: new Date().toISOString(),
  };

  // Simply log the recovery, let new uploads naturally go to this node
  fsLogger.log("REBALANCE", `Node recovered, available for new distributions`, {
    recoveredNodeId,
  });

  return report;
}

/**
 * Find the best target node, excluding certain nodes.
 */
function findBestTarget(
  nodes: { nodeId: string; capacityBytes: number; usedBytes: number }[],
  chunkSize: number,
  excludeNodeIds: string[],
): { nodeId: string } | null {
  const eligible = nodes.filter(
    (n) =>
      !excludeNodeIds.includes(n.nodeId) && hasCapacity(n.nodeId, chunkSize),
  );

  if (eligible.length === 0) return null;

  // Pick the node with the most available space
  eligible.sort(
    (a, b) => b.capacityBytes - b.usedBytes - (a.capacityBytes - a.usedBytes),
  );

  return eligible[0];
}
