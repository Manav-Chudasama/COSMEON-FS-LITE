// ============================================
// GET /api/fs/download/[fileId] — Reconstruct and download
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  initEngine,
  getFile,
  reassembleFile,
  simulateLatency,
  chunkCache,
  computeHash,
  DEFAULT_CONFIG,
  fsLogger,
} from "@/lib/fs-lite";

export async function GET(
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

    // Sort chunks by index to ensure correct order
    const sortedChunks = [...file.chunks].sort((a, b) => a.index - b.index);

    // Fetch each chunk (from cache or disk)
    const chunkBuffers: Buffer[] = [];

    for (const chunk of sortedChunks) {
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
          const chunkPath = join(
            process.cwd(),
            DEFAULT_CONFIG.dataDir,
            "nodes",
            nodeId,
            chunk.chunkId,
          );
          data = await readFile(chunkPath);

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
        } catch {
          continue;
        }
      }

      if (!data) {
        return NextResponse.json(
          {
            error: `Failed to retrieve chunk ${chunk.index} — all nodes unavailable or data corrupted`,
          },
          { status: 500 },
        );
      }

      // Cache for future use
      chunkCache.set(chunk.chunkId, data);
      chunkBuffers.push(data);
    }

    // Reassemble
    const fullFile = reassembleFile(chunkBuffers);

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
