// ============================================
// POST /api/fs/share/[token]/progress
// Public streaming rebuild endpoint for shared files.
// Streams NDJSON reconstruction progress, decrypts AES-256,
// and delivers base64 binary without requiring authentication.
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import {
  chunkCache,
  computeHash,
  connectDB,
  decryptFileBuffer,
  DEFAULT_CONFIG,
  docToFSFile,
  FileModel,
  fsLogger,
  getFile,
  getNode,
  initEngine,
  reassembleFile,
  storageClient,
  updateFileInCache,
} from "@/lib/fs-lite";
import { simulateLatency } from "@/lib/fs-lite/simulate-latency";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    await initEngine();
    await connectDB();
    const { token } = await params;

    const doc = await FileModel.findOne({ "shareLink.token": token }).lean();
    if (!doc) {
      return NextResponse.json(
        { error: "Shared file not found or invalid token" },
        { status: 404 },
      );
    }

    const shareLink = doc.shareLink as {
      enabled?: boolean;
      expiresAt?: Date | string | null;
      downloads?: number;
    };

    if (!shareLink?.enabled) {
      return NextResponse.json(
        { error: "This share link has been deactivated" },
        { status: 403 },
      );
    }

    if (shareLink.expiresAt && new Date(shareLink.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: "This share link has expired" },
        { status: 410 },
      );
    }

    const file = await getFile(doc.fileId as string);
    if (!file) {
      return NextResponse.json({ error: "File data not found" }, { status: 404 });
    }

    // Increment download counter and update cache immediately
    const updatedDoc = await FileModel.findOneAndUpdate(
      { "shareLink.token": token },
      { $inc: { "shareLink.downloads": 1 } },
      { returnDocument: "after" },
    ).lean();

    if (updatedDoc) {
      updateFileInCache(docToFSFile(updatedDoc as Record<string, unknown>));
    }

    const latencyMode = DEFAULT_CONFIG.latency.mode;
    const sortedChunks = [...file.chunks].sort((a, b) => a.index - b.index);
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
            message: `Reconstructing shared file "${file.originalName}" (${totalChunks} chunks)...`,
            fileName: file.originalName,
            totalChunks,
            latencyMode,
            encrypted: !!file.encrypted,
          });

          const chunkBuffers: Buffer[] = [];

          for (const chunk of sortedChunks) {
            // Check cache
            const cached = chunkCache.get(chunk.chunkId);
            if (cached) {
              chunkBuffers.push(cached);
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

            // Read from storage node
            let data: Buffer | null = null;
            const nodesToTry = [chunk.nodeId, ...chunk.replicas];
            let usedNodeId = chunk.nodeId;

            for (const nodeId of nodesToTry) {
              try {
                await simulateLatency();
                data = await storageClient.readChunk(nodeId, chunk.chunkId);

                const hash = computeHash(data);
                if (hash !== chunk.hash) {
                  data = null;
                  continue;
                }

                usedNodeId = nodeId;
                break;
              } catch {}
            }

            if (!data) {
              emit({
                stage: "error",
                message: `Failed to retrieve chunk ${chunk.index} — nodes unavailable`,
              });
              controller.close();
              return;
            }

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

          // Verify full file checksum on plaintext
          emit({
            stage: "verify",
            message: "Verifying file integrity (SHA-256)...",
          });
          await simulateLatency();

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
            "FILE_SHARE_DOWNLOAD",
            `Shared file "${file.originalName}" downloaded via link`,
            {
              fileId: file.fileId,
              size: fullFile.length,
              token,
            },
          );

          // Emit complete with base64 binary payload
          emit({
            stage: "complete",
            message: "Ready to download",
            fileData: fullFile.toString("base64"),
            mimeType: file.mimeType,
            fileName: file.originalName,
          });
        } catch (error) {
          emit({
            stage: "error",
            message: error instanceof Error ? error.message : "Rebuild failed",
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
    console.error("[FS-LITE] Public share download error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Download failed" },
      { status: 500 },
    );
  }
}
