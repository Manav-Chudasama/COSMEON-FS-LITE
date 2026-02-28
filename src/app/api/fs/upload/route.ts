// ============================================
// POST /api/fs/upload — Upload, chunk, and distribute a file
// Streams NDJSON progress events in real-time.
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
import type { FSFile, FSChunk, UploadResult } from "@/lib/fs-lite";

export async function POST(request: NextRequest) {
  try {
    await initEngine();

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const strategy =
      (formData.get("strategy") as any) || DEFAULT_CONFIG.distributionStrategy;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    const fileName = file.name;
    const fileMime = file.type || "application/octet-stream";

    // Create a streaming NDJSON response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        };

        try {
          // Stage 1: Checksum
          emit({ stage: "checksum", message: "Computing SHA-256 checksum..." });
          const fileId = uuidv4();
          const checksum = computeFileChecksum(buffer);
          emit({
            stage: "checksum_done",
            message: `Checksum: ${checksum.slice(0, 12)}...`,
          });

          // Stage 2: Split
          emit({ stage: "split", message: "Splitting file into chunks..." });
          const rawChunks = splitFile(buffer, fileId);
          const totalChunks = rawChunks.length;
          emit({
            stage: "split_done",
            message: `Split into ${totalChunks} chunks (${(DEFAULT_CONFIG.chunkSizeBytes / 1024).toFixed(0)} KB each)`,
            totalChunks,
          });

          // Stage 3: Distribute
          const onlineNodes = getOnlineNodes();
          if (onlineNodes.length === 0) {
            emit({ stage: "error", message: "No online nodes available" });
            controller.close();
            return;
          }

          emit({
            stage: "distribute",
            message: `Assigning chunks to ${onlineNodes.length} nodes (${strategy})...`,
          });
          let chunks = distributeChunks(rawChunks, onlineNodes, strategy);
          emit({
            stage: "distribute_done",
            message: `Chunks assigned across ${onlineNodes.length} nodes`,
          });

          // Stage 4: Write chunks (one event per chunk)
          const nodeMap = new Map(onlineNodes.map((n) => [n.nodeId, n.name]));

          for (const chunk of chunks) {
            const chunkData = buffer.subarray(
              chunk.index * DEFAULT_CONFIG.chunkSizeBytes,
              Math.min(
                (chunk.index + 1) * DEFAULT_CONFIG.chunkSizeBytes,
                buffer.length,
              ),
            );

            const nodeName = nodeMap.get(chunk.nodeId) || chunk.nodeId;

            emit({
              stage: "write",
              message: `Writing chunk #${chunk.index} → ${nodeName}`,
              chunkIndex: chunk.index,
              totalChunks,
              nodeName,
              chunkSize: chunkData.length,
            });

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

          // Stage 5: Replicate
          emit({
            stage: "replicate",
            message: "Replicating chunks for fault tolerance...",
          });
          chunks = await replicateChunks(chunks);
          emit({ stage: "replicate_done", message: "Replication complete" });

          // Stage 6: Save metadata
          const fsFile: FSFile = {
            fileId,
            originalName: fileName,
            mimeType: fileMime,
            totalSize: buffer.length,
            chunkCount: chunks.length,
            chunkSize: DEFAULT_CONFIG.chunkSizeBytes,
            checksum,
            uploadedAt: new Date().toISOString(),
            version: 1,
            chunks,
          };

          await addFile(fsFile);

          const result: UploadResult = {
            file: fsFile,
            distribution: chunks.map((c) => ({
              chunkId: c.chunkId,
              nodeId: c.nodeId,
              nodeName: nodeMap.get(c.nodeId) || c.nodeId,
            })),
          };

          emit({ stage: "complete", message: "Upload complete!", result });
        } catch (error) {
          emit({
            stage: "error",
            message: error instanceof Error ? error.message : "Upload failed",
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
    console.error("[FS-LITE] Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}
