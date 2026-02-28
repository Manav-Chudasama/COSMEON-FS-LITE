// ============================================
// POST /api/fs/nodes/[nodeId]/rebalance
// Streams NDJSON progress events during node failure/recovery rebalancing.
// In Docker mode, physically stops/starts the container before rebalancing.
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import {
  initEngine,
  setNodeStatus,
  getNode,
  rebalanceOnFailure,
  rebalanceOnRecovery,
  stopNodeContainer,
  startNodeContainer,
  isDockerMode,
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
          // Step 0: In Docker mode, physically stop/start the container
          if (isDockerMode()) {
            if (status === "offline") {
              emit({
                stage: "docker_control",
                message: `Stopping Docker container for "${currentNode.name}"...`,
              });
              await stopNodeContainer(currentNode.name);
              emit({
                stage: "docker_control",
                message: `Docker container for "${currentNode.name}" has been stopped`,
              });
            } else if (status === "online") {
              emit({
                stage: "docker_control",
                message: `Starting Docker container for "${currentNode.name}"...`,
              });
              await startNodeContainer(currentNode.name);
              // Give the container a moment to boot up
              await new Promise((resolve) => setTimeout(resolve, 2000));
              emit({
                stage: "docker_control",
                message: `Docker container for "${currentNode.name}" is now running`,
              });
            }
          }

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
            const report = await rebalanceOnFailure(nodeId, (event) =>
              emit(event),
            );
            emit({
              stage: "report",
              report,
            });
          } else if (status === "online" && previousStatus === "offline") {
            const report = await rebalanceOnRecovery(nodeId, (event) =>
              emit(event),
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
