// ============================================
// POST /api/fs/nodes/[nodeId]/rebalance
// Streams NDJSON progress events during node failure/recovery rebalancing.
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

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  try {
    await initEngine();
    const { nodeId } = await params;
    const body = await request.json();
    const { status } = body as { status: NodeStatus };

    if (!status || !["online", "offline"].includes(status)) {
      return NextResponse.json(
        { error: 'Status must be "online" or "offline"' },
        { status: 400 },
      );
    }

    const currentNode = getNode(nodeId);
    if (!currentNode) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const previousStatus = currentNode.status;

    // If same status, no-op
    if (previousStatus === status) {
      return NextResponse.json({
        node: currentNode,
        previousStatus,
        message: `Node already ${status}`,
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        };

        try {
          // Step 1: Update node status
          const updatedNode = await setNodeStatus(nodeId, status);
          const nodeName = updatedNode?.name || nodeId;

          emit({
            stage: "status_changed",
            message: `Node "${nodeName}" is now ${status.toUpperCase()}`,
            nodeId,
            nodeName,
            previousStatus,
            newStatus: status,
          });

          // Step 2: Rebalance with progress callbacks
          if (status === "offline" && previousStatus !== "offline") {
            const report = await rebalanceOnFailure(
              nodeId,
              undefined,
              (event) => emit(event),
            );
            emit({
              stage: "report",
              report,
            });
          } else if (status === "online" && previousStatus === "offline") {
            const report = await rebalanceOnRecovery(
              nodeId,
              undefined,
              (event) => emit(event),
            );
            emit({
              stage: "report",
              report,
            });
          }
        } catch (error) {
          emit({
            stage: "error",
            message:
              error instanceof Error ? error.message : "Rebalance failed",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[FS-LITE] Rebalance stream error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Rebalance stream failed",
      },
      { status: 500 },
    );
  }
}
