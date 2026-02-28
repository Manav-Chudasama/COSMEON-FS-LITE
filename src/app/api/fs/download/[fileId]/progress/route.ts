// ============================================
// POST /api/fs/download/[fileId]/progress
// Streams NDJSON reconstruction progress, then stores
// the assembled binary and emits a one-time download token.
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  initEngine,
  getFile,
  getNode,
  reassembleFile,
  simulateLatency as applyLatency,
  chunkCache,
  computeHash,
  DEFAULT_CONFIG,
  fsLogger,
} from "@/lib/fs-lite";

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

    // Read options from POST body
    let enableLatency = true;
    try {
      const body = await request.json();
      if (typeof body.simulateLatency === "boolean") {
        enableLatency = body.simulateLatency;
      }
    } catch {
      // No body or invalid JSON — use defaults
    }

    const sortedChunks = [...file.chunks].sort((a, b) => a.index - b.index);
    const totalChunks = sortedChunks.length;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        };

        try {
          emit({
            stage: "start",
            message: `Reconstructing "${file.originalName}" (${totalChunks} chunks)...`,
            fileName: file.originalName,
            totalChunks,
          });

          const chunkBuffers: Buffer[] = [];

          for (const chunk of sortedChunks) {
            // Try cache first
            const cached = chunkCache.get(chunk.chunkId);
            if (cached) {
              chunkBuffers.push(cached);

              // Resolve node name for display
              const node = getNode(chunk.nodeId);
              const nodeName = node?.name || chunk.nodeId;

              emit({
                stage: "read",
                message: `Chunk #${chunk.index} from ${nodeName} (cache hit)`,
                chunkIndex: chunk.index,
                totalChunks,
                nodeName,
                cacheHit: true,
              });
              continue;
            }

            // Read from disk — try primary node first, then replicas
            let data: Buffer | null = null;
            const nodesToTry = [chunk.nodeId, ...chunk.replicas];
            let usedNodeId = chunk.nodeId;

            for (const nodeId of nodesToTry) {
              try {
                await (enableLatency
                  ? applyLatency(nodeId)
                  : Promise.resolve());
                const chunkPath = join(
                  process.cwd(),
                  DEFAULT_CONFIG.dataDir,
                  "nodes",
                  nodeId,
                  chunk.chunkId,
                );
                data = await readFile(chunkPath);

                // Verify on-the-fly
                const hash = computeHash(data);
                if (hash !== chunk.hash) {
                  fsLogger.log(
                    "INTEGRITY_FAIL",
                    `Chunk ${chunk.index} hash mismatch on node ${nodeId}`,
                    { chunkId: chunk.chunkId, nodeId },
                  );
                  data = null;
                  continue;
                }

                usedNodeId = nodeId;
                break;
              } catch {
                continue;
              }
            }

            if (!data) {
              emit({
                stage: "error",
                message: `Failed to retrieve chunk ${chunk.index} — all nodes unavailable or data corrupted`,
              });
              controller.close();
              return;
            }

            // Cache for future use
            chunkCache.set(chunk.chunkId, data);
            chunkBuffers.push(data);

            const node = getNode(usedNodeId);
            const nodeName = node?.name || usedNodeId;

            emit({
              stage: "read",
              message: `Chunk #${chunk.index} from ${nodeName} (cache miss)`,
              chunkIndex: chunk.index,
              totalChunks,
              nodeName,
              cacheHit: false,
            });
          }

          // Verify
          emit({
            stage: "verify",
            message: "Verifying chunk integrity...",
          });

          // Reassemble
          emit({
            stage: "reassemble",
            message: `Reassembling ${totalChunks} chunks...`,
          });
          const fullFile = reassembleFile(chunkBuffers);

          // Verify the full file checksum
          const fullHash = computeHash(fullFile);
          const checksumMatch = fullHash === file.checksum;
          emit({
            stage: "verify_done",
            message: checksumMatch
              ? "File integrity verified ✓"
              : "⚠ Checksum mismatch — file may be corrupted",
            checksumMatch,
          });

          fsLogger.log(
            "FILE_DOWNLOAD",
            `File "${file.originalName}" downloaded`,
            {
              fileId: file.fileId,
              size: fullFile.length,
            },
          );

          // Encode file as base64 for inline delivery
          const fileBase64 = fullFile.toString("base64");

          emit({
            stage: "complete",
            message: "Ready to download",
            fileData: fileBase64,
            mimeType: file.mimeType,
          });
        } catch (error) {
          emit({
            stage: "error",
            message: error instanceof Error ? error.message : "Download failed",
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
    console.error("[FS-LITE] Download progress error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Download failed" },
      { status: 500 },
    );
  }
}
