// ============================================
// PATCH /api/fs/nodes/[nodeId] — Simulate failure/recovery
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import {
  initEngine,
  setNodeStatus,
  getNode,
  rebalanceOnFailure,
  rebalanceOnRecovery,
} from "@/lib/fs-lite";
import type { NodeStatus } from "@/lib/fs-lite";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  try {
    await initEngine();
    const { nodeId } = await params;
    const body = await request.json();
    const { status } = body as { status: NodeStatus };

    if (!status || !["online", "offline", "degraded"].includes(status)) {
      return NextResponse.json(
        { error: 'Status must be "online", "offline", or "degraded"' },
        { status: 400 },
      );
    }

    const currentNode = getNode(nodeId);
    if (!currentNode) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const previousStatus = currentNode.status;

    // Update node status
    const updatedNode = await setNodeStatus(nodeId, status);

    // Trigger rebalancing based on status change
    let rebalanceReport = null;

    if (status === "offline" && previousStatus !== "offline") {
      // Node went down — rebalance chunks away from it
      rebalanceReport = await rebalanceOnFailure(nodeId);
    } else if (status === "online" && previousStatus === "offline") {
      // Node recovered — optionally rebalance
      rebalanceReport = await rebalanceOnRecovery(nodeId);
    }

    return NextResponse.json({
      node: updatedNode,
      previousStatus,
      rebalanceReport,
    });
  } catch (error) {
    console.error("[FS-LITE] Node status update error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update node",
      },
      { status: 500 },
    );
  }
}
