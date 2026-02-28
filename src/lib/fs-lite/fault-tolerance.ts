// ============================================
// COSMEON FS-LITE — Fault Tolerance Score
// ============================================
//
// Computes a 0–100 score reflecting system resilience.
//
// Weights:
//   40% — Node Health (online / total)
//   25% — Replication Factor
//   20% — Rebalancing Success (successful rebalances)
//   15% — Distribution Balance (chunk spread evenness)
// ============================================

import { getNodes, getOnlineNodes } from "./node-manager";
import { listFiles } from "./metadata-store";
import { fsLogger } from "./logger";
import { DEFAULT_CONFIG } from "./types";
import { isErasureCodingEnabled, getErasureConfig } from "./erasure-coding";

export interface FaultToleranceBreakdown {
  nodeScore: number;
  replicationScore: number;
  rebalanceScore: number;
  balanceScore: number;
}

export interface FaultToleranceResult {
  score: number;
  breakdown: FaultToleranceBreakdown;
  details: {
    onlineNodes: number;
    totalNodes: number;
    replicationFactor: number;
    totalRebalances: number;
    successfulRebalances: number;
    chunkDeviation: number;
    erasureCoding: boolean;
    parityShards: number;
    dataShards: number;
  };
}

/**
 * Compute the Fault Tolerance Score (0–100).
 */
export async function computeFaultToleranceScore(): Promise<FaultToleranceResult> {
  const allNodes = getNodes();
  const onlineNodes = getOnlineNodes();
  const files = await listFiles();

  // ── Step 1: Node Health Score (40%) ──
  const totalNodes = allNodes.length || 1;
  const nodeScore = (onlineNodes.length / totalNodes) * 40;

  // ── Step 2: Replication / Erasure Score (25%) ──
  const replicationFactor = DEFAULT_CONFIG.replicationFactor;
  const ec = getErasureConfig();
  let replicationScore: number;

  if (isErasureCodingEnabled()) {
    // Erasure coding: tolerance = m parity shards out of (k+m) total
    // Higher ratio = better fault tolerance
    const toleranceRatio = ec.parityShards / (ec.dataShards + ec.parityShards);
    replicationScore = Math.min(toleranceRatio / 0.5, 1) * 25; // 0.5 tolerance = full score
  } else {
    replicationScore = Math.min(replicationFactor / 3, 1) * 25;
  }

  // ── Step 3: Rebalancing Score (20%) ──
  // Count total rebalance events and how many completed successfully
  const allLogs = fsLogger.getAll();
  const rebalanceLogs = allLogs.filter((l) => l.type === "REBALANCE");
  const totalRebalances = rebalanceLogs.length;
  const successfulRebalances = rebalanceLogs.filter(
    (l) => !l.message.toLowerCase().includes("failed"),
  ).length;

  let rebalanceScore = 0;
  if (totalRebalances === 0) {
    // No rebalances needed yet — system is stable, give full credit
    rebalanceScore = 20;
  } else {
    rebalanceScore = (successfulRebalances / totalRebalances) * 20;
  }

  // ── Step 4: Distribution Balance Score (15%) ──
  let balanceScore = 15;
  let chunkDeviation = 0;

  if (onlineNodes.length > 1) {
    const chunkCounts = onlineNodes.map((n) => n.chunkCount);
    const totalChunks = chunkCounts.reduce((sum, c) => sum + c, 0);

    if (totalChunks > 0) {
      const idealPerNode = totalChunks / onlineNodes.length;
      const avgDeviation =
        chunkCounts.reduce((sum, c) => sum + Math.abs(c - idealPerNode), 0) /
        onlineNodes.length;

      chunkDeviation = avgDeviation;
      // Normalize: if deviation > idealPerNode, score drops to 0
      const deviationFactor =
        idealPerNode > 0 ? Math.min(avgDeviation / idealPerNode, 1) : 0;
      balanceScore = Math.max(0, 15 * (1 - deviationFactor));
    }
  }

  // ── Final Score ──
  const rawScore = nodeScore + replicationScore + rebalanceScore + balanceScore;
  const score = Math.round(Math.min(100, Math.max(0, rawScore)));

  return {
    score,
    breakdown: {
      nodeScore: Math.round(nodeScore * 10) / 10,
      replicationScore: Math.round(replicationScore * 10) / 10,
      rebalanceScore: Math.round(rebalanceScore * 10) / 10,
      balanceScore: Math.round(balanceScore * 10) / 10,
    },
    details: {
      onlineNodes: onlineNodes.length,
      totalNodes: allNodes.length,
      replicationFactor,
      totalRebalances,
      successfulRebalances,
      chunkDeviation: Math.round(chunkDeviation * 10) / 10,
      erasureCoding: isErasureCodingEnabled(),
      parityShards: ec.parityShards,
      dataShards: ec.dataShards,
    },
  };
}
