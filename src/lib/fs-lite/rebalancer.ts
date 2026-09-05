// ============================================
// COSMEON FS-LITE — Automatic Rebalancer
// ============================================

import { fsLogger } from "./logger";
import { getFilesOnNode, updateFileChunks } from "./metadata-store";
import {
  getNode,
  getOnlineNodes,
  hasCapacity,
  updateNodeUsage,
} from "./node-manager";
import { replicateChunkToNode } from "./replicator";
import { storageClient } from "./storage-client";
import { computeHash } from "./integrity";
import { decodeDataShards, encodeParityShards } from "./erasure-coding";
import type { FSChunk, RebalanceReport } from "./types";
import { DEFAULT_CONFIG } from "./types";

/** Formats chunk label human-readably, avoiding negative indices for parity shards */
function formatChunkLabel(chunk: FSChunk): string {
  if (chunk.isParity || chunk.index < 0) {
    const parityNum = Math.abs(chunk.index);
    return `Parity P${parityNum}`;
  }
  return `Chunk #${chunk.index}`;
}

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
  let totalMovedBytes = 0;
  let totalMovedCount = 0;

  for (const file of affectedFiles) {
    const updatedChunks: FSChunk[] = [];
    const isEC = !!file.erasureCoded;

    for (const chunk of file.chunks) {
      // Check if this chunk's primary is on the failed node
      if (chunk.nodeId === failedNodeId) {
        // Exclude nodes already holding chunks from the same erasure group if EC
        const usedInGroup = isEC && chunk.groupId
          ? file.chunks.filter((c) => c.groupId === chunk.groupId).map((c) => c.nodeId)
          : [failedNodeId, ...chunk.replicas];

        let targetNode = findBestTarget(onlineNodes, chunk.size, usedInGroup);
        // Fallback if all online nodes hold a shard from this group: allow any online node
        if (!targetNode && isEC) {
          targetNode = findBestTarget(onlineNodes, chunk.size, [failedNodeId]);
        }

        if (!targetNode) {
          // Capacity exhausted across online nodes
          updatedChunks.push(chunk);
          processedChunks++;
          fsLogger.log(
            "REBALANCE",
            `Cluster capacity exhausted: unable to relocate ${formatChunkLabel(chunk)} of "${file.originalName}"`,
            { chunkId: chunk.chunkId, fileId: file.fileId },
          );
          onProgress?.({
            stage: "warning",
            message: `⚠ Storage Cluster Full: Cannot relocate ${formatChunkLabel(chunk)} — no online node has space`,
            chunkIndex: processedChunks,
            totalChunks: totalAffectedChunks,
          });
          continue;
        }

        const tNode = getNode(targetNode.nodeId);
        const tName = tNode?.name || targetNode.nodeId;

        if (isEC) {
          const groupChunks = file.chunks.filter((c) => c.groupId === chunk.groupId);
          const groupDataChunks = groupChunks
            .filter((c) => !c.isParity)
            .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0));
          const groupParityChunks = groupChunks
            .filter((c) => c.isParity)
            .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0));

          if (chunk.isParity || chunk.index < 0) {
            // Parity shard lost: recompute parity from surviving data shards
            const dataBuffers: Buffer[] = [];
            let allDataAvailable = true;

            for (const gDataChunk of groupDataChunks) {
              if (gDataChunk.nodeId === failedNodeId) {
                allDataAvailable = false;
                break;
              }
              try {
                const dBuf = await storageClient.readChunk(gDataChunk.nodeId, gDataChunk.chunkId);
                if (computeHash(dBuf) === gDataChunk.hash) {
                  dataBuffers.push(dBuf);
                } else {
                  allDataAvailable = false;
                  break;
                }
              } catch {
                allDataAvailable = false;
                break;
              }
            }

            if (allDataAvailable && dataBuffers.length > 0) {
              const parityBuffers = encodeParityShards(dataBuffers);
              const pIdx =
                chunk.groupIndex !== undefined && chunk.groupIndex >= groupDataChunks.length
                  ? chunk.groupIndex - groupDataChunks.length
                  : Math.max(0, Math.abs(chunk.index) - 1);
              const pBuf = parityBuffers[pIdx] || parityBuffers[0];

              await storageClient.writeChunk(targetNode.nodeId, chunk.chunkId, pBuf);
              await updateNodeUsage(targetNode.nodeId, chunk.size, 1);
              totalMovedBytes += chunk.size;
              totalMovedCount += 1;

              updatedChunks.push({ ...chunk, nodeId: targetNode.nodeId });
              report.movedChunks.push({
                chunkId: chunk.chunkId,
                fromNodeId: failedNodeId,
                fromNodeName: failedNodeName,
                toNodeId: targetNode.nodeId,
                toNodeName: tName,
                chunkSize: chunk.size,
                action: "recomputed",
              });

              processedChunks++;
              onProgress?.({
                stage: "migrate",
                message: `${formatChunkLabel(chunk)} recomputed → ${tName}`,
                chunkIndex: processedChunks,
                totalChunks: totalAffectedChunks,
                fromNode: failedNodeName,
                toNode: tName,
                action: "recomputed",
              });
            } else {
              updatedChunks.push(chunk);
              processedChunks++;
              onProgress?.({
                stage: "warning",
                message: `⚠ ${formatChunkLabel(chunk)} cannot be recomputed — missing data shards`,
                chunkIndex: processedChunks,
                totalChunks: totalAffectedChunks,
              });
            }
          } else {
            // Data shard lost: reconstruct via decodeDataShards
            const groupShards: (Buffer | null)[] = [];
            for (const gChunk of groupDataChunks) {
              if (gChunk.chunkId === chunk.chunkId || gChunk.nodeId === failedNodeId) {
                groupShards.push(null);
              } else {
                try {
                  const buf = await storageClient.readChunk(gChunk.nodeId, gChunk.chunkId);
                  if (computeHash(buf) === gChunk.hash) {
                    groupShards.push(buf);
                  } else {
                    groupShards.push(null);
                  }
                } catch {
                  groupShards.push(null);
                }
              }
            }

            const parityBuffers: Buffer[] = [];
            for (const pChunk of groupParityChunks) {
              if (pChunk.nodeId === failedNodeId) {
                parityBuffers.push(Buffer.alloc(0));
              } else {
                try {
                  const pBuf = await storageClient.readChunk(pChunk.nodeId, pChunk.chunkId);
                  if (computeHash(pBuf) === pChunk.hash) {
                    parityBuffers.push(pBuf);
                  } else {
                    parityBuffers.push(Buffer.alloc(0));
                  }
                } catch {
                  parityBuffers.push(Buffer.alloc(0));
                }
              }
            }

            const missingCount = groupShards.filter((s) => s === null).length;
            const availableParityCount = parityBuffers.filter((p) => p.length > 0).length;

            if (missingCount <= availableParityCount && availableParityCount > 0) {
              const recovered = decodeDataShards(groupShards, parityBuffers);
              const myIdx = groupDataChunks.findIndex((c) => c.chunkId === chunk.chunkId);
              const recBuf = recovered[myIdx]?.subarray(0, chunk.size);

              if (recBuf && computeHash(recBuf) === chunk.hash) {
                await storageClient.writeChunk(targetNode.nodeId, chunk.chunkId, recBuf);
                await updateNodeUsage(targetNode.nodeId, chunk.size, 1);
                totalMovedBytes += chunk.size;
                totalMovedCount += 1;

                updatedChunks.push({ ...chunk, nodeId: targetNode.nodeId });
                report.movedChunks.push({
                  chunkId: chunk.chunkId,
                  fromNodeId: failedNodeId,
                  fromNodeName: failedNodeName,
                  toNodeId: targetNode.nodeId,
                  toNodeName: tName,
                  chunkSize: chunk.size,
                  action: "reconstructed",
                });

                processedChunks++;
                onProgress?.({
                  stage: "migrate",
                  message: `Chunk #${chunk.index} reconstructed via parity → ${tName}`,
                  chunkIndex: processedChunks,
                  totalChunks: totalAffectedChunks,
                  fromNode: failedNodeName,
                  toNode: tName,
                  action: "reconstructed",
                });
              } else {
                updatedChunks.push(chunk);
                processedChunks++;
                onProgress?.({
                  stage: "warning",
                  message: `⚠ Chunk #${chunk.index} erasure decoding hash check failed`,
                  chunkIndex: processedChunks,
                  totalChunks: totalAffectedChunks,
                });
              }
            } else {
              updatedChunks.push(chunk);
              processedChunks++;
              onProgress?.({
                stage: "warning",
                message: `⚠ Chunk #${chunk.index} has ${missingCount} missing shards (exceeds parity capacity) — data at risk`,
                chunkIndex: processedChunks,
                totalChunks: totalAffectedChunks,
              });
            }
          }
        } else {
          // Standard replication path
          if (chunk.replicas.length > 0) {
            const newPrimaryNodeId = chunk.replicas[0];
            const newPrimaryNode = getNode(newPrimaryNodeId);
            const newPrimaryName = newPrimaryNode?.name || newPrimaryNodeId;
            const remainingReplicas = chunk.replicas.filter(
              (r) => r !== newPrimaryNodeId && r !== failedNodeId,
            );

            const success = await replicateChunkToNode(
              { ...chunk, nodeId: newPrimaryNodeId },
              targetNode.nodeId,
            );

            if (success) {
              await updateNodeUsage(targetNode.nodeId, chunk.size, 1);
              remainingReplicas.push(targetNode.nodeId);
            }

            totalMovedBytes += chunk.size;
            totalMovedCount += 1;

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
            updatedChunks.push(chunk);
            fsLogger.log(
              "REBALANCE",
              `Chunk ${chunk.index} of "${file.originalName}" has no replicas — data at risk`,
              { chunkId: chunk.chunkId, fileId: file.fileId },
            );
            processedChunks++;
            onProgress?.({
              stage: "warning",
              message: `⚠ ${formatChunkLabel(chunk)} of "${file.originalName}" has no replicas — data at risk`,
              chunkIndex: processedChunks,
              totalChunks: totalAffectedChunks,
            });
          }
        }
      } else if (chunk.replicas.includes(failedNodeId)) {
        // Failed node was a replica
        const filteredReplicas = chunk.replicas.filter(
          (r) => r !== failedNodeId,
        );

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
              totalMovedBytes += chunk.size;
              totalMovedCount += 1;

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
                message: `${formatChunkLabel(chunk)} re-replicated ${primaryName} → ${tName}`,
                chunkIndex: processedChunks,
                totalChunks: totalAffectedChunks,
                fromNode: primaryName,
                toNode: tName,
                action: "re-replicated",
              });
            } else {
              processedChunks++;
            }
          } else {
            processedChunks++;
            onProgress?.({
              stage: "warning",
              message: `⚠ Storage Cluster Full: Cannot re-replicate replica of ${formatChunkLabel(chunk)} — online nodes full`,
              chunkIndex: processedChunks,
              totalChunks: totalAffectedChunks,
            });
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

  // Deduct only chunks that were actually moved/reconstructed away from the failed node
  if (failedNode && totalMovedCount > 0) {
    await updateNodeUsage(
      failedNodeId,
      -totalMovedBytes,
      -totalMovedCount,
    );
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

        // Migrate replicas OR erasure-coded chunks for balance
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
                message: `${formatChunkLabel(chunk)} ${overloadedName} → ${recoveredName}`,
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
        } else if (file.erasureCoded && chunk.nodeId === overloadedNode.nodeId) {
          // Check that recovered node does not already hold another shard in this erasure group
          const groupNodeIds = file.chunks
            .filter((c) => c.groupId === chunk.groupId)
            .map((c) => c.nodeId);
          if (!groupNodeIds.includes(recoveredNodeId) && hasCapacity(recoveredNodeId, chunk.size)) {
            try {
              const chunkData = await storageClient.readChunk(overloadedNode.nodeId, chunk.chunkId);
              await storageClient.writeChunk(recoveredNodeId, chunk.chunkId, chunkData);
              await storageClient.deleteChunk(overloadedNode.nodeId, chunk.chunkId);
              await updateNodeUsage(recoveredNodeId, chunk.size, 1);
              await updateNodeUsage(overloadedNode.nodeId, -chunk.size, -1);

              updatedChunks.push({ ...chunk, nodeId: recoveredNodeId });
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
                message: `${formatChunkLabel(chunk)} ${overloadedName} → ${recoveredName}`,
                chunkIndex: processedChunks,
                totalChunks: chunksToMigrate,
                fromNode: overloadedName,
                toNode: recoveredName,
                action: "migrated",
              });
            } catch {
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
