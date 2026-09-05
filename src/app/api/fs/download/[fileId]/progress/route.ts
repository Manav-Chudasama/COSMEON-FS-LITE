// ============================================
// POST /api/fs/download/[fileId]/progress
// Streams NDJSON reconstruction progress, then stores
// the assembled binary and emits a one-time download token.
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import {
  chunkCache,
  computeHash,
  decodeDataShards,
  decryptFileBuffer,
  DEFAULT_CONFIG,
  fsLogger,
  getFile,
  getNode,
  initEngine,
  reassembleFile,
  storageClient,
} from "@/lib/fs-lite";
import { simulateLatency } from "@/lib/fs-lite/simulate-latency";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    await initEngine();
    const { fileId } = await params;

    const file = await getFile(fileId);
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Read latency mode from DEFAULT_CONFIG (set via PATCH /api/fs/latency)
    const latencyMode = DEFAULT_CONFIG.latency.mode;

    const dataChunks = file.chunks.filter((c) => !c.isParity);
    const sortedChunks = [...dataChunks].sort((a, b) => a.index - b.index);
    const totalChunks = sortedChunks.length;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
        };

        try {
          emit({
            stage: "start",
            message: `Reconstructing "${file.originalName}" (${totalChunks} chunks, latency: ${latencyMode})...`,
            fileName: file.originalName,
            totalChunks,
            encrypted: !!file.encrypted,
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
                // Inject global latency delay before each chunk read
                await simulateLatency();
                data = await storageClient.readChunk(nodeId, chunk.chunkId);

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
              } catch {}
            }

            // Fallback: Erasure recovery if primary and replicas unavailable
            if (!data && file.erasureCoded && chunk.groupId) {
              const groupDataChunks = file.chunks
                .filter((c) => !c.isParity && c.groupId === chunk.groupId)
                .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0));
              const groupParityChunks = file.chunks
                .filter((c) => c.isParity && c.groupId === chunk.groupId)
                .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0));

              const groupShards: (Buffer | null)[] = [];
              for (const gChunk of groupDataChunks) {
                if (gChunk.chunkId === chunk.chunkId) {
                  groupShards.push(null);
                } else {
                  const gCached = chunkCache.get(gChunk.chunkId);
                  if (gCached) {
                    groupShards.push(gCached);
                  } else {
                    let gData: Buffer | null = null;
                    for (const nid of [gChunk.nodeId, ...gChunk.replicas]) {
                      try {
                        gData = await storageClient.readChunk(nid, gChunk.chunkId);
                        if (computeHash(gData) === gChunk.hash) break;
                        gData = null;
                      } catch {}
                    }
                    groupShards.push(gData);
                  }
                }
              }

              const parityBuffers: Buffer[] = [];
              for (const pChunk of groupParityChunks) {
                try {
                  const pData = await storageClient.readChunk(pChunk.nodeId, pChunk.chunkId);
                  if (computeHash(pData) === pChunk.hash) {
                    parityBuffers.push(pData);
                  } else {
                    parityBuffers.push(Buffer.alloc(0));
                  }
                } catch {
                  parityBuffers.push(Buffer.alloc(0));
                }
              }

              const missingCount = groupShards.filter((s) => s === null).length;
              const availableParityCount = parityBuffers.filter((p) => p.length > 0).length;

              if (missingCount <= availableParityCount && availableParityCount > 0) {
                const recovered = decodeDataShards(groupShards, parityBuffers);
                const myIndexInGroup = groupDataChunks.findIndex((c) => c.chunkId === chunk.chunkId);
                if (myIndexInGroup >= 0 && recovered[myIndexInGroup]) {
                  data = recovered[myIndexInGroup].subarray(0, chunk.size);
                  usedNodeId = "erasure_recovery";
                  fsLogger.log(
                    "ERASURE_DECODE",
                    `Recovered chunk #${chunk.index} via erasure coding`,
                    { chunkId: chunk.chunkId, fileId: file.fileId },
                  );
                  emit({
                    stage: "read",
                    message: `Chunk #${chunk.index} recovered via erasure parity (offline node bypassed)`,
                    chunkIndex: chunk.index,
                    totalChunks,
                    nodeName: "Erasure Recovery",
                    cacheHit: false,
                  });
                }
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

            if (usedNodeId !== "erasure_recovery") {
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
          }

          // Reassemble
          emit({
            stage: "reassemble",
            message: `Reassembling ${totalChunks} chunks...`,
          });
          let fullFile = reassembleFile(chunkBuffers);

          // Decrypt if file is encrypted
          if (file.encrypted && file.encryptionMeta) {
            emit({
              stage: "decrypt",
              message: "Decrypting file with AES-256-GCM & verifying auth tag...",
            });
            await simulateLatency();
            fullFile = decryptFileBuffer(fullFile, file.encryptionMeta);
            emit({
              stage: "decrypt_done",
              message: "Decryption verified ✓",
            });
          }

          // Verify the full file checksum on plaintext
          emit({
            stage: "verify",
            message: "Verifying file integrity (SHA-256)...",
          });
          await simulateLatency();

          const fullHash = computeHash(fullFile);
          const checksumMatch = fullHash === file.checksum;
          if (!checksumMatch) {
            fsLogger.log(
              "INTEGRITY_FAIL",
              `File checksum mismatch for ${file.fileId}: expected ${file.checksum.slice(0, 12)}..., got ${fullHash.slice(0, 12)}...`,
              { fileId: file.fileId, expected: file.checksum, actual: fullHash },
            );
          }
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
