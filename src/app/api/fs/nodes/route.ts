// ============================================
// GET/POST /api/fs/nodes — List all nodes / Create node
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import { initEngine, getNodes, createNode } from "@/lib/fs-lite";

export const dynamic = "force-dynamic";

/** GET — List all satellite nodes */
export async function GET() {
  try {
    await initEngine();
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
