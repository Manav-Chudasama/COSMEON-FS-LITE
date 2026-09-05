// ============================================
// GET/POST /api/fs/nodes — List all nodes / Create node
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import { createNode, getNodes, initEngine, reconcileNodeStats } from "@/lib/fs-lite";
import { nodeMutationProtection } from "@/lib/arcjet";

export const dynamic = "force-dynamic";

/** GET — List all satellite nodes */
export async function GET() {
  try {
    await initEngine();
    await reconcileNodeStats();
    const nodes = getNodes();

    const summary = {
      total: nodes.length,
      online: nodes.filter((n) => n.status === "online").length,
      offline: nodes.filter((n) => n.status === "offline").length,
      degraded: nodes.filter((n) => n.status === "degraded").length,
    };

    return NextResponse.json({ nodes, summary });
  } catch (error) {
    console.error("[FS-LITE] List nodes error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list nodes",
      },
      { status: 500 },
    );
  }
}

/** POST — Create a new satellite node */
export async function POST(request: NextRequest) {
  try {
    // ── Arcjet Protection ───────────────────────────────────
    if (process.env.ARCJET_KEY) {
      const decision = await nodeMutationProtection.protect(request, {
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
    const { name, capacityBytes, latencyMs } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Node name is required" },
        { status: 400 },
      );
    }

    const node = await createNode(name, {
      capacityBytes: capacityBytes || 100 * 1024 * 1024,
      latencyMs: latencyMs || 100,
    });

    return NextResponse.json(node, { status: 201 });
  } catch (error) {
    console.error("[FS-LITE] Create node error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create node",
      },
      { status: 500 },
    );
  }
}
