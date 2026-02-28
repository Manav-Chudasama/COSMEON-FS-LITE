// ============================================
// GET /api/fs/stats — System statistics
// ============================================

import { NextResponse } from "next/server";
import { initEngine, getNodes, listFiles, chunkCache } from "@/lib/fs-lite";
import type { SystemStats } from "@/lib/fs-lite";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initEngine();

    const nodes = getNodes();
    const files = await listFiles();
    const cacheStats = chunkCache.stats();

    const totalChunks = files.reduce((sum, f) => sum + f.chunkCount, 0);
    const totalStorageBytes = nodes.reduce(
      (sum, n) => sum + n.capacityBytes,
      0,
    );
    const usedStorageBytes = nodes.reduce((sum, n) => sum + n.usedBytes, 0);

    const stats: SystemStats = {
      totalFiles: files.length,
      totalChunks,
      totalNodes: nodes.length,
      onlineNodes: nodes.filter((n) => n.status === "online").length,
      offlineNodes: nodes.filter((n) => n.status === "offline").length,
      degradedNodes: nodes.filter((n) => n.status === "degraded").length,
      totalStorageBytes,
      usedStorageBytes,
      cacheStats,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("[FS-LITE] Stats error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get stats" },
      { status: 500 },
    );
  }
}
