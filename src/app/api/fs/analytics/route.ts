// ============================================
// GET /api/fs/analytics — Analytics data endpoint
// ============================================

import { NextResponse } from "next/server";
import {
  initEngine,
  getNodes,
  listFiles,
  chunkCache,
  fsLogger,
  computeFaultToleranceScore,
} from "@/lib/fs-lite";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initEngine();

    const nodes = getNodes();
    const files = await listFiles();
    const cacheStats = chunkCache.stats();
    const faultTolerance = await computeFaultToleranceScore();
    const allLogs = fsLogger.getAll();

    // ── Event counts by type ──
    const eventCounts: Record<string, number> = {};
    for (const log of allLogs) {
      eventCounts[log.type] = (eventCounts[log.type] || 0) + 1;
    }

    // ── Event timeline (group by hour, last 24 hours) ──
    const now = new Date();
    const timeline: {
      hour: string;
      uploads: number;
      downloads: number;
      failures: number;
      rebalances: number;
      integrity: number;
    }[] = [];

    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(now);
      hourStart.setHours(now.getHours() - i, 0, 0, 0);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourStart.getHours() + 1);

      const hourLabel = hourStart.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      const hourLogs = allLogs.filter((l) => {
        const t = new Date(l.timestamp);
        return t >= hourStart && t < hourEnd;
      });

      timeline.push({
        hour: hourLabel,
        uploads: hourLogs.filter((l) => l.type === "FILE_UPLOAD").length,
        downloads: hourLogs.filter((l) => l.type === "FILE_DOWNLOAD").length,
        failures: hourLogs.filter(
          (l) => l.type === "NODE_FAILURE" || l.type === "NODE_DEGRADED",
        ).length,
        rebalances: hourLogs.filter((l) => l.type === "REBALANCE").length,
        integrity: hourLogs.filter(
          (l) =>
            l.type === "INTEGRITY_CHECK" ||
            l.type === "INTEGRITY_PASS" ||
            l.type === "INTEGRITY_FAIL",
        ).length,
      });
    }

    // ── Node distribution ──
    const nodeDistribution = nodes.map((n) => ({
      name: n.name,
      status: n.status,
      chunks: n.chunkCount,
      usedBytes: n.usedBytes,
      capacityBytes: n.capacityBytes,
      latencyMs: n.latencyMs,
    }));

    // ── System summary ──
    const totalChunks = files.reduce((sum, f) => sum + f.chunkCount, 0);
    const totalStorage = nodes.reduce((sum, n) => sum + n.capacityBytes, 0);
    const usedStorage = nodes.reduce((sum, n) => sum + n.usedBytes, 0);

    return NextResponse.json({
      faultTolerance,
      eventCounts,
      timeline,
      nodeDistribution,
      cacheStats,
      systemStats: {
        totalFiles: files.length,
        totalChunks,
        totalNodes: nodes.length,
        onlineNodes: nodes.filter((n) => n.status === "online").length,
        offlineNodes: nodes.filter((n) => n.status === "offline").length,
        totalStorage,
        usedStorage,
      },
    });
  } catch (error) {
    console.error("[FS-LITE] Analytics error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to get analytics",
      },
      { status: 500 },
    );
  }
}
