// ============================================
// GET/POST /api/fs/erasure — Get/Set erasure coding mode
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import {
  getErasureConfig,
  initEngine,
  setErasureCodingEnabled,
} from "@/lib/fs-lite";
import { deleteProtection } from "@/lib/arcjet";

export const dynamic = "force-dynamic";

/** GET — Current erasure coding config */
export async function GET() {
  try {
    await initEngine();
    return NextResponse.json(getErasureConfig());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to get config",
      },
      { status: 500 },
    );
  }
}

/** POST — Toggle erasure coding on/off */
export async function POST(request: NextRequest) {
  try {
    // ── Arcjet Protection ───────────────────────────────────
    if (process.env.ARCJET_KEY) {
      const decision = await deleteProtection.protect(request, {
        requested: 1,
      });
      if (decision.isDenied()) {
        return NextResponse.json(
          {
            error: decision.reason.isRateLimit()
              ? "Rate limit exceeded"
              : "Request blocked by security policy",
            arcjet: true,
          },
          {
            status: decision.reason.isRateLimit() ? 429 : 403,
            headers: {
              "x-arcjet-decision": "DENY",
              "x-arcjet-reason": decision.reason.isRateLimit()
                ? "RATE_LIMIT"
                : "SHIELD",
            },
          },
        );
      }
    }
    // ────────────────────────────────────────────────────────

    await initEngine();
    const body = await request.json();
    const { enabled } = body as { enabled: boolean };

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled must be a boolean" },
        { status: 400 },
      );
    }

    setErasureCodingEnabled(enabled);

    return NextResponse.json({
      ...getErasureConfig(),
      message: `Erasure coding ${enabled ? "enabled" : "disabled"}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to set config",
      },
      { status: 500 },
    );
  }
}
