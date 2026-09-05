// ============================================
// POST /api/fs/files/[fileId]/delete-progress
// Streams NDJSON progress while unlinking chunks, updating
// node capacities, and purging metadata from the constellation.
// ============================================

import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  chunkCache,
  DEFAULT_CONFIG,
  deleteFile,
  fsLogger,
  getFile,
  getNode,
  initEngine,
  updateNodeUsage,
} from "@/lib/fs-lite";
import { simulateLatency } from "@/lib/fs-lite/simulate-latency";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    await initEngine();
    const { fileId } = await params;

    const file = await getFile(fileId);
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const session = await getSessionFromRequest(request);
    if (file.ownerId && session?.userId && file.ownerId !== session.userId) {
      return NextResponse.json(
        { error: "Forbidden: Collaborators have read-only access and cannot delete this file" },
        { status: 403 },
      );
    }

    const sortedChunks = [...file.chunks].sort((a, b) => a.index - b.index);
    const totalChunks = sortedChunks.length;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
        };

        try {
          // Stage 1: Start
          emit({
            stage: "start",
            message: `Initiating purge for "${file.originalName}" (${totalChunks} chunks)...`,
            fileName: file.originalName,
            totalChunks,
            totalSize: file.totalSize,
          });

          // Stage 2: Locate
          emit({
            stage: "locate",
            message: `Locating ${totalChunks} chunks across orbital nodes...`,
          });
          await simulateLatency();

          // Stage 3: Purge chunks from storage nodes
          let purgedCount = 0;
          for (const chunk of sortedChunks) {
            // Delete primary
            try {
              const primaryPath = join(
                process.cwd(),
                DEFAULT_CONFIG.dataDir,
                "nodes",
                chunk.nodeId,
                chunk.chunkId,
              );
              await unlink(primaryPath);
              await updateNodeUsage(chunk.nodeId, -chunk.size, -1);
            } catch {
              // File may already be absent
            }

            // Delete replicas
            for (const replicaNodeId of chunk.replicas) {
              try {
                const replicaPath = join(
                  process.cwd(),
                  DEFAULT_CONFIG.dataDir,
                  "nodes",
                  replicaNodeId,
                  chunk.chunkId,
                );
                await unlink(replicaPath);
                await updateNodeUsage(replicaNodeId, -chunk.size, -1);
              } catch {
                // Replica may already be absent
              }
            }

            // Invalidate in-memory chunk cache
            chunkCache.invalidate(chunk.chunkId);

            purgedCount++;
            const node = getNode(chunk.nodeId);
            const nodeName = node?.name || chunk.nodeId;

            emit({
              stage: "purge_chunk",
              message: `Purged chunk #${chunk.index} from ${nodeName}${chunk.replicas.length > 0 ? ` (+${chunk.replicas.length} replicas)` : ""}`,
              chunkIndex: chunk.index,
              purgedCount,
              totalChunks,
              nodeName,
            });

            // Simulate latency so orbital purge animation is perceptible
            await simulateLatency();
          }

          // Stage 4: Purge metadata & encryption keys
          emit({
            stage: "purge_meta",
            message: "Purging metadata, encryption keys & Merkle tree...",
          });
          await simulateLatency();

          await deleteFile(fileId);

          emit({
            stage: "purge_meta_done",
            message: "Metadata & key envelopes purged from store ✓",
          });

          // Stage 5: Rebalance & reclaim capacity
          emit({
            stage: "rebalance",
            message: "Reclaiming orbital node capacities & updating quotas...",
          });
          await simulateLatency();

          emit({
            stage: "rebalance_done",
            message: "Node storage capacities reclaimed ✓",
          });

          fsLogger.log(
            "FILE_DELETE",
            `File "${file.originalName}" purged from constellation (${totalChunks} chunks)`,
            {
              fileId: file.fileId,
              size: file.totalSize,
              chunkCount: totalChunks,
            },
          );

          // Stage 6: Complete
          emit({
            stage: "complete",
            message: `"${file.originalName}" permanently purged from constellation`,
          });
        } catch (error) {
          emit({
            stage: "error",
            message: error instanceof Error ? error.message : "Purge failed",
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
    console.error("[FS-LITE] Delete progress error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
