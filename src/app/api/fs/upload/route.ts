// ============================================
// POST /api/fs/upload — Upload, chunk, and distribute a file
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  initEngine,
  splitFile,
  computeFileChecksum,
  distributeChunks,
  replicateChunks,
  getOnlineNodes,
  updateNodeUsage,
  addFile,
  simulateLatency,
  DEFAULT_CONFIG,
} from "@/lib/fs-lite";
import type { FSFile, UploadResult } from "@/lib/fs-lite";

export const config = {
  api: { bodyParser: false },
};

export async function POST(request: NextRequest) {
  try {
    await initEngine();

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    // Generate file ID and compute checksum
    const fileId = uuidv4();
    const checksum = computeFileChecksum(buffer);

    // Split into chunks
    const rawChunks = splitFile(buffer, fileId);

    // Get online nodes
    const onlineNodes = getOnlineNodes();
    if (onlineNodes.length === 0) {
      return NextResponse.json(
        { error: "No online nodes available" },
        { status: 503 },
      );
    }

    // Distribute chunks across nodes
    let chunks = distributeChunks(rawChunks, onlineNodes);

    // Write chunk data to node directories
    for (const chunk of chunks) {
      const chunkData = buffer.subarray(
        chunk.index * DEFAULT_CONFIG.chunkSizeBytes,
        Math.min(
          (chunk.index + 1) * DEFAULT_CONFIG.chunkSizeBytes,
          buffer.length,
        ),
      );

      // Simulate node latency
      await simulateLatency(chunk.nodeId);

      const chunkPath = join(
        process.cwd(),
        DEFAULT_CONFIG.dataDir,
        "nodes",
        chunk.nodeId,
        chunk.chunkId,
      );

      await writeFile(chunkPath, chunkData);
      await updateNodeUsage(chunk.nodeId, chunkData.length, 1);
    }

    // Replicate chunks for fault tolerance
    chunks = await replicateChunks(chunks);

    // Build file metadata
    const fsFile: FSFile = {
      fileId,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      totalSize: buffer.length,
      chunkCount: chunks.length,
      chunkSize: DEFAULT_CONFIG.chunkSizeBytes,
      checksum,
      uploadedAt: new Date().toISOString(),
      version: 1,
      chunks,
    };

    // Store metadata
    await addFile(fsFile);

    // Build response with distribution info
    const nodeMap = new Map(onlineNodes.map((n) => [n.nodeId, n.name]));
    const result: UploadResult = {
      file: fsFile,
      distribution: chunks.map((c) => ({
        chunkId: c.chunkId,
        nodeId: c.nodeId,
        nodeName: nodeMap.get(c.nodeId) || c.nodeId,
      })),
    };

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[FS-LITE] Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}
