// ============================================
// GET /api/fs/logs — Operation log entries
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import type { LogCategory, LogEventType } from "@/lib/fs-lite";
import { fsLogger, initEngine } from "@/lib/fs-lite";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await initEngine();

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") as LogCategory | null;
    const type = searchParams.get("type") as LogEventType | null;
    const limit = parseInt(searchParams.get("limit") || "500", 10);

    const entries = await fsLogger.getFiltered({
      category: category || undefined,
      type: type || undefined,
      limit,
    });

    return NextResponse.json({
      entries,
      total: entries.length,
      allCount: fsLogger.count,
    });
  } catch (error) {
    console.error("[FS-LITE] Logs error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get logs" },
      { status: 500 },
    );
  }
}
