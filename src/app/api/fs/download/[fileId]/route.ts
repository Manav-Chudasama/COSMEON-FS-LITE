// ============================================
// GET /api/fs/download/[fileId] — Reconstruct and download
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import {
  chunkCache,
  computeHash,
  decodeDataShards,
  decryptFileBuffer,
  fsLogger,
  getErasureGroups,
  getFile,
  initEngine,
  reassembleFile,
  simulateLatency,
  storageClient,
} from "@/lib/fs-lite";
import { consumeDownload } from "@/lib/fs-lite/download-store";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    await initEngine();
    const { fileId } = await params;

    // Check for a pre-assembled download token
    const token = new URL(request.url).searchParams.get("token");
    if (token) {
      const pending = consumeDownload(token);
      if (pending) {
        return new NextResponse(new Uint8Array(pending.buffer), {
          status: 200,
          headers: {
            "Content-Type": pending.mimeType,
            "Content-Disposition": `attachment; filename="${encodeURIComponent(pending.fileName)}"`,
            "Content-Length": pending.buffer.length.toString(),
          },
        });
      }
      // Token expired or invalid — fall through to full reconstruction
    }

    const file = await getFile(fileId);
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Sort data chunks by index (skip parity for normal assembly)
    const dataChunks = file.chunks.filter((c) => !c.isParity);
    const sortedChunks = [...dataChunks].sort((a, b) => a.index - b.index);

    // Fetch each chunk (from cache or disk)
    const chunkBuffers: (Buffer | null)[] = [];
    const failedIndices: number[] = [];

    for (let ci = 0; ci < sortedChunks.length; ci++) {
      const chunk = sortedChunks[ci];
      // Try cache first
      const cached = chunkCache.get(chunk.chunkId);
      if (cached) {
        chunkBuffers.push(cached);
        continue;
      }

      // Read from disk — try primary node first, then replicas
      let data: Buffer | null = null;
      const nodesToTry = [chunk.nodeId, ...chunk.replicas];

      for (const nodeId of nodesToTry) {
        try {
          await simulateLatency(nodeId);
          data = await storageClient.readChunk(nodeId, chunk.chunkId);

          // Verify integrity on-the-fly
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

          break;
        } catch {}
      }

      if (data) {
        chunkCache.set(chunk.chunkId, data);
        chunkBuffers.push(data);
      } else {
        // Mark as failed — might be recoverable via erasure coding
        chunkBuffers.push(null);
        failedIndices.push(ci);
      }
    }

    // ── Erasure recovery if needed ──
    if (failedIndices.length > 0) {
      if (file.erasureCoded) {
        const groups = getErasureGroups(file.chunks);

        for (const group of groups) {
          // Find which data chunks in this group are missing
          const groupDataSorted = group.dataChunks.sort(
            (a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0),
          );

          const groupShards: (Buffer | null)[] = [];
          let hasMissing = false;

          for (const gChunk of groupDataSorted) {
            const idx = sortedChunks.findIndex(
              (c) => c.chunkId === gChunk.chunkId,
            );
            if (idx >= 0 && chunkBuffers[idx] !== null) {
              groupShards.push(chunkBuffers[idx]);
            } else {
              groupShards.push(null);
              hasMissing = true;
            }
          }

          if (!hasMissing) continue;

          // Read parity chunks
          const parityBuffers: Buffer[] = [];
          for (const pChunk of group.parityChunks) {
            try {
              const pData = await storageClient.readChunk(
                pChunk.nodeId,
                pChunk.chunkId,
              );
              parityBuffers.push(pData);
            } catch {
              parityBuffers.push(Buffer.alloc(0));
            }
          }

          if (parityBuffers.some((p) => p.length > 0)) {
            // Decode missing shards
            const recovered = decodeDataShards(groupShards, parityBuffers);

            fsLogger.log(
              "ERASURE_DECODE",
              `Recovered ${groupShards.filter((s) => s === null).length} missing chunks via erasure coding`,
              { groupId: group.groupId },
            );

            // Fill recovered data back into chunkBuffers
            for (let gi = 0; gi < groupDataSorted.length; gi++) {
              const idx = sortedChunks.findIndex(
                (c) => c.chunkId === groupDataSorted[gi].chunkId,
              );
              if (idx >= 0 && chunkBuffers[idx] === null) {
                // Trim recovered buffer to original chunk size
                const originalSize = groupDataSorted[gi].size;
                chunkBuffers[idx] = recovered[gi].subarray(0, originalSize);
              }
            }
          }
        }
      }

      // Check if any chunks are still missing after erasure recovery
      const stillMissing = chunkBuffers
        .map((b, i) => (b === null ? i : -1))
        .filter((i) => i >= 0);

      if (stillMissing.length > 0) {
        return NextResponse.json(
          {
            error: `Failed to retrieve ${stillMissing.length} chunk(s) — data unrecoverable`,
          },
          { status: 500 },
        );
      }
    }

    // Reassemble
    let fullFile = reassembleFile(
      chunkBuffers.filter((b) => b !== null) as Buffer[],
    );

    // Decrypt if the file is encrypted
    if (file.encrypted && file.encryptionMeta) {
      fullFile = decryptFileBuffer(fullFile, file.encryptionMeta);
    }

    fsLogger.log("FILE_DOWNLOAD", `File "${file.originalName}" downloaded`, {
      fileId: file.fileId,
      size: fullFile.length,
    });

    // Return as downloadable response
    return new NextResponse(new Uint8Array(fullFile), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.originalName)}"`,
        "Content-Length": fullFile.length.toString(),
      },
    });
  } catch (error) {
    console.error("[FS-LITE] Download error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Download failed" },
      { status: 500 },
    );
  }
}
