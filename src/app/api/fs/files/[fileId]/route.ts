// ============================================
// GET/DELETE /api/fs/files/[fileId] — File detail & deletion
// ============================================

import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import {
  chunkCache,
  DEFAULT_CONFIG,
  deleteFile,
  getFile,
  getNode,
  initEngine,
  updateNodeUsage,
} from "@/lib/fs-lite";

/** GET — File detail with chunk distribution */
export async function GET(
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

    // Enrich chunks with node names
    const enrichedChunks = file.chunks.map((chunk) => {
      const node = getNode(chunk.nodeId);
      const replicaNodes = chunk.replicas.map((rid) => {
        const rNode = getNode(rid);
        return { nodeId: rid, nodeName: rNode?.name || rid };
      });

      return {
        ...chunk,
        nodeName: node?.name || chunk.nodeId,
        nodeStatus: node?.status || "unknown",
        replicaNodes,
      };
    });

    return NextResponse.json({
      ...file,
      chunks: enrichedChunks,
    });
  } catch (error) {
    console.error("[FS-LITE] File detail error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get file" },
      { status: 500 },
    );
  }
}

/** DELETE — Delete file and all chunks */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    await initEngine();
    const { fileId } = await params;

    const file = await deleteFile(fileId);
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Delete chunk files from nodes
    for (const chunk of file.chunks) {
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
        // File may already be gone
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
          // File may already be gone
        }
      }

      // Invalidate cache
      chunkCache.invalidate(chunk.chunkId);
    }

    return NextResponse.json({
      message: `File "${file.originalName}" deleted`,
      fileId: file.fileId,
    });
  } catch (error) {
    console.error("[FS-LITE] Delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 },
    );
  }
}
