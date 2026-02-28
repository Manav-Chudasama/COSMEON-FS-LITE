// ============================================
// COSMEON FS-LITE — Automatic Rebalancer
// ============================================

import type { FSChunk, RebalanceReport } from "./types";
import { DEFAULT_CONFIG } from "./types";
import {
  getNodes,
  getOnlineNodes,
  getNode,
  hasCapacity,
  updateNodeUsage,
} from "./node-manager";
import { getFilesOnNode, listFiles, updateFileChunks } from "./metadata-store";
import { replicateChunkToNode } from "./replicator";
import { fsLogger } from "./logger";

// ── Callback type for streaming progress events ───
export type RebalanceProgressCallback = (event: {
  stage: string;
  message: string;
  chunkIndex?: number;
  totalChunks?: number;
  fromNode?: string;
  toNode?: string;
  action?: string;
  [key: string]: unknown;
}) => void;

/**
 * Rebalance chunks when a node fails.
 *
 * Finds all chunks on the failed node and re-replicates
 * them from existing replicas to other healthy nodes.
 */
export async function rebalanceOnFailure(
  failedNodeId: string,
  onProgress?: RebalanceProgressCallback,
): Promise<RebalanceReport> {
  const failedNode = getNode(failedNodeId);
  const failedNodeName = failedNode?.name || failedNodeId;

  const report: RebalanceReport = {
    reason: "node_failure",
    affectedNodeId: failedNodeId,
    affectedNodeName: failedNodeName,
    totalAffectedChunks: 0,
    movedChunks: [],
    timestamp: new Date().toISOString(),
  };

  const onlineNodes = getOnlineNodes();
  if (onlineNodes.length === 0) {
    fsLogger.log("REBALANCE", "No online nodes available for rebalancing", {
      failedNodeId,
    });
    onProgress?.({
      stage: "error",
      message: "No online nodes available for rebalancing",
    });
    return report;
  }

  // Find all files that have chunks on the failed node
  const affectedFiles = getFilesOnNode(failedNodeId);

  // Count total affected chunks for progress
  let totalAffectedChunks = 0;
  for (const file of affectedFiles) {
    for (const chunk of file.chunks) {
      if (
        chunk.nodeId === failedNodeId ||
        chunk.replicas.includes(failedNodeId)
      ) {
        totalAffectedChunks++;
      }
    }
  }
  report.totalAffectedChunks = totalAffectedChunks;

  onProgress?.({
    stage: "start",
    message: `Node "${failedNodeName}" offline — ${totalAffectedChunks} chunks affected across ${affectedFiles.length} files`,
    totalChunks: totalAffectedChunks,
  });

  let processedChunks = 0;

  for (const file of affectedFiles) {
    const updatedChunks: FSChunk[] = [];

    for (const chunk of file.chunks) {
      // Check if this chunk's primary is on the failed node
      if (chunk.nodeId === failedNodeId) {
        const targetNode = findBestTarget(onlineNodes, chunk.size, [
          failedNodeId,
          ...chunk.replicas,
        ]);

        if (targetNode) {
          if (chunk.replicas.length > 0) {
            // Promote the first replica to primary
            const newPrimaryNodeId = chunk.replicas[0];
            const newPrimaryNode = getNode(newPrimaryNodeId);
            const newPrimaryName = newPrimaryNode?.name || newPrimaryNodeId;
            const remainingReplicas = chunk.replicas.filter(
              (r) => r !== newPrimaryNodeId && r !== failedNodeId,
            );

            // Re-replicate to the target for extra safety
            const tNode = getNode(targetNode.nodeId);
            const tName = tNode?.name || targetNode.nodeId;
            const success = await replicateChunkToNode(
              { ...chunk, nodeId: newPrimaryNodeId },
              targetNode.nodeId,
            );

            if (success) {
              await updateNodeUsage(targetNode.nodeId, chunk.size, 1);
              remainingReplicas.push(targetNode.nodeId);
            }

            // Decrement failed node stats
            await updateNodeUsage(failedNodeId, -chunk.size, -1);

            updatedChunks.push({
              ...chunk,
              nodeId: newPrimaryNodeId,
              replicas: remainingReplicas,
            });

            report.movedChunks.push({
              chunkId: chunk.chunkId,
              fromNodeId: failedNodeId,
              fromNodeName: failedNodeName,
              toNodeId: newPrimaryNodeId,
              toNodeName: newPrimaryName,
              chunkSize: chunk.size,
              action: "promoted",
            });

            processedChunks++;
            onProgress?.({
              stage: "migrate",
              message: `Chunk #${chunk.index} → ${newPrimaryName} (promoted from replica)`,
              chunkIndex: processedChunks,
              totalChunks: totalAffectedChunks,
              fromNode: failedNodeName,
              toNode: newPrimaryName,
              action: "promoted",
            });
          } else {
            // No replica available — chunk is at risk
            updatedChunks.push(chunk);
            fsLogger.log(
              "REBALANCE",
              `Chunk ${chunk.index} of "${file.originalName}" has no replicas — data at risk`,
              { chunkId: chunk.chunkId, fileId: file.fileId },
            );
            processedChunks++;
            onProgress?.({
              stage: "warning",
              message: `⚠ Chunk #${chunk.index} of "${file.originalName}" has no replicas — data at risk`,
              chunkIndex: processedChunks,
              totalChunks: totalAffectedChunks,
            });
          }
        } else {
          updatedChunks.push(chunk);
          processedChunks++;
        }
      } else if (chunk.replicas.includes(failedNodeId)) {
        // The failed node was a replica — remove it and re-replicate
        const filteredReplicas = chunk.replicas.filter(
          (r) => r !== failedNodeId,
        );

        // Decrement failed node stats for the replica copy
        await updateNodeUsage(failedNodeId, -chunk.size, -1);

        if (filteredReplicas.length < DEFAULT_CONFIG.replicationFactor - 1) {
          const targetNode = findBestTarget(onlineNodes, chunk.size, [
            chunk.nodeId,
            ...filteredReplicas,
          ]);

          if (targetNode) {
            const tNode = getNode(targetNode.nodeId);
            const tName = tNode?.name || targetNode.nodeId;
            const primaryNode = getNode(chunk.nodeId);
            const primaryName = primaryNode?.name || chunk.nodeId;

            const success = await replicateChunkToNode(
              chunk,
              targetNode.nodeId,
            );
            if (success) {
              filteredReplicas.push(targetNode.nodeId);
              await updateNodeUsage(targetNode.nodeId, chunk.size, 1);

              report.movedChunks.push({
                chunkId: chunk.chunkId,
                fromNodeId: failedNodeId,
                fromNodeName: failedNodeName,
                toNodeId: targetNode.nodeId,
                toNodeName: tName,
                chunkSize: chunk.size,
                action: "re-replicated",
              });

              processedChunks++;
              onProgress?.({
                stage: "migrate",
                message: `Chunk #${chunk.index} re-replicated ${primaryName} → ${tName}`,
                chunkIndex: processedChunks,
                totalChunks: totalAffectedChunks,
                fromNode: primaryName,
                toNode: tName,
                action: "re-replicated",
              });
            }
          }
        }

        updatedChunks.push({
          ...chunk,
          replicas: filteredReplicas,
        });
      } else {
        updatedChunks.push(chunk);
      }
    }

    await updateFileChunks(file.fileId, updatedChunks);
  }

  fsLogger.log(
    "REBALANCE",
    `Rebalanced ${report.movedChunks.length} chunks after node "${failedNodeName}" failure`,
    {
      failedNodeId,
      movedChunks: report.movedChunks.length,
    },
  );

  onProgress?.({
    stage: "complete",
    message: `${report.movedChunks.length} chunks migrated across ${new Set(report.movedChunks.map((m) => m.toNodeId)).size} nodes`,
    totalChunks: totalAffectedChunks,
    chunkIndex: totalAffectedChunks,
  });

  return report;
}

/**
 * Rebalance chunks when a node recovers.
 *
 * Redistributes chunks from overloaded nodes back to the recovered
 * node to balance load across the cluster.
 */
export async function rebalanceOnRecovery(
  recoveredNodeId: string,
  onProgress?: RebalanceProgressCallback,
): Promise<RebalanceReport> {
  const recoveredNode = getNode(recoveredNodeId);
  const recoveredName = recoveredNode?.name || recoveredNodeId;

  const report: RebalanceReport = {
    reason: "node_recovery",
    affectedNodeId: recoveredNodeId,
    affectedNodeName: recoveredName,
    totalAffectedChunks: 0,
    movedChunks: [],
    timestamp: new Date().toISOString(),
  };

  const allOnlineNodes = getOnlineNodes();
  if (allOnlineNodes.length <= 1) {
    fsLogger.log("REBALANCE", "Only one node online, nothing to rebalance", {
      recoveredNodeId,
    });
    onProgress?.({
      stage: "complete",
      message: "Only one node online — nothing to redistribute",
      totalChunks: 0,
      chunkIndex: 0,
    });
    return report;
  }

  // Calculate average chunk count across online nodes
  const totalChunks = allOnlineNodes.reduce((sum, n) => sum + n.chunkCount, 0);
  const avgChunks = Math.ceil(totalChunks / allOnlineNodes.length);

  // Find overloaded nodes (those with more than average)
  const overloadedNodes = allOnlineNodes.filter(
    (n) => n.nodeId !== recoveredNodeId && n.chunkCount > avgChunks,
  );

  if (overloadedNodes.length === 0) {
    fsLogger.log("REBALANCE", "Cluster already balanced, no migration needed", {
      recoveredNodeId,
    });
    onProgress?.({
      stage: "complete",
      message: "Cluster already balanced — no migration needed",
      totalChunks: 0,
      chunkIndex: 0,
    });
    return report;
  }

  // Calculate how many chunks to drain from each overloaded node
  let chunksToMigrate = 0;
  for (const node of overloadedNodes) {
    chunksToMigrate += node.chunkCount - avgChunks;
  }
  report.totalAffectedChunks = chunksToMigrate;

  onProgress?.({
    stage: "start",
    message: `Node "${recoveredName}" online — redistributing ~${chunksToMigrate} chunks for balance`,
    totalChunks: chunksToMigrate,
  });

  let processedChunks = 0;

  for (const overloadedNode of overloadedNodes) {
    const excessCount = overloadedNode.chunkCount - avgChunks;
    if (excessCount <= 0) continue;

    const overloadedName = overloadedNode.name || overloadedNode.nodeId;
    const files = getFilesOnNode(overloadedNode.nodeId);
    let migrated = 0;

    for (const file of files) {
      if (migrated >= excessCount) break;

      const updatedChunks: FSChunk[] = [];
      let fileModified = false;

      for (const chunk of file.chunks) {
        if (migrated >= excessCount) {
          updatedChunks.push(chunk);
          continue;
        }

        // Only migrate chunks where the overloaded node is a replica (safer)
        if (chunk.replicas.includes(overloadedNode.nodeId)) {
          // Replicate to the recovered node
          if (hasCapacity(recoveredNodeId, chunk.size)) {
            const success = await replicateChunkToNode(chunk, recoveredNodeId);

            if (success) {
              const newReplicas = chunk.replicas
                .filter((r) => r !== overloadedNode.nodeId)
                .concat(recoveredNodeId);

              await updateNodeUsage(recoveredNodeId, chunk.size, 1);
              await updateNodeUsage(overloadedNode.nodeId, -chunk.size, -1);

              updatedChunks.push({ ...chunk, replicas: newReplicas });
              fileModified = true;

              report.movedChunks.push({
                chunkId: chunk.chunkId,
                fromNodeId: overloadedNode.nodeId,
                fromNodeName: overloadedName,
                toNodeId: recoveredNodeId,
                toNodeName: recoveredName,
                chunkSize: chunk.size,
                action: "migrated",
              });

              migrated++;
              processedChunks++;
              onProgress?.({
                stage: "migrate",
                message: `Chunk #${chunk.index} ${overloadedName} → ${recoveredName}`,
                chunkIndex: processedChunks,
                totalChunks: chunksToMigrate,
                fromNode: overloadedName,
                toNode: recoveredName,
                action: "migrated",
              });
            } else {
              updatedChunks.push(chunk);
            }
          } else {
            updatedChunks.push(chunk);
          }
        } else {
          updatedChunks.push(chunk);
        }
      }

      if (fileModified) {
        await updateFileChunks(file.fileId, updatedChunks);
      }
    }
  }

  fsLogger.log(
    "REBALANCE",
    `Rebalanced ${report.movedChunks.length} chunks after node "${recoveredName}" recovery`,
    {
      recoveredNodeId,
      movedChunks: report.movedChunks.length,
    },
  );

  onProgress?.({
    stage: "complete",
    message: `${report.movedChunks.length} chunks migrated to ${recoveredName}`,
    totalChunks: chunksToMigrate,
    chunkIndex: chunksToMigrate,
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
