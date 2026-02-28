// ============================================
// GET / PATCH /api/fs/latency
// In-memory toggle for global latency simulation mode.
// No database write -- the mode lives in DEFAULT_CONFIG at runtime.
// ============================================

import { NextResponse } from "next/server";
import type { LatencyMode } from "@/lib/fs-lite";
import { DEFAULT_CONFIG } from "@/lib/fs-lite";

/** GET -- return the current latency mode */
export function GET() {
  return NextResponse.json({
    mode: DEFAULT_CONFIG.latency.mode,
    highDelayMs: DEFAULT_CONFIG.latency.highDelayMs,
  });
}

/** PATCH { mode: "default" | "high" } -- update the mode in memory */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const mode: LatencyMode = body.mode;

    if (mode !== "default" && mode !== "high") {
      return NextResponse.json(
        { error: 'mode must be "default" or "high"' },
        { status: 400 },
      );
    }

    DEFAULT_CONFIG.latency.mode = mode;

    return NextResponse.json({
      mode: DEFAULT_CONFIG.latency.mode,
      highDelayMs: DEFAULT_CONFIG.latency.highDelayMs,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}
