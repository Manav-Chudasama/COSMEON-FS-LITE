// ============================================
// POST /api/fs/upload — Upload, chunk, and distribute a file
// Streams NDJSON progress events in real-time.
// ============================================

import { type NextRequest, NextResponse } from "next/server";
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
  storageClient,
} from "@/lib/fs-lite";
import type {
  FSFile,
  FSChunk,
  UploadResult,
  ChunkingStrategy,
} from "@/lib/fs-lite";
import {
  isErasureCodingEnabled,
  encodeParityShards,
  createParityChunkMetadata,
  getErasureConfig,
} from "@/lib/fs-lite";
import { v4 as groupUuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    await initEngine();

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const strategy =
      (formData.get("strategy") as any) || DEFAULT_CONFIG.distributionStrategy;
    const chunkingStrategy =
      (formData.get("chunkingStrategy") as ChunkingStrategy | null) ??
      DEFAULT_CONFIG.chunking.strategy;

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
          emit({
            stage: "split",
            message: `Splitting file into chunks (${chunkingStrategy.toUpperCase()})...`,
          });
          const rawChunks = splitFile(buffer, fileId, chunkingStrategy);
          const totalChunks = rawChunks.length;
          const avgKB = Math.round(buffer.length / totalChunks / 1024);
          emit({
            stage: "split_done",
            message: `Split into ${totalChunks} chunks (~${avgKB} KB avg, ${chunkingStrategy.toUpperCase()})`,
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
              chunk.offset,
              chunk.offset + chunk.size,
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

            await storageClient.writeChunk(
              chunk.nodeId,
              chunk.chunkId,
              Buffer.from(chunkData),
            );
            await updateNodeUsage(chunk.nodeId, chunkData.length, 1);
          }

          // Stage 5: Erasure coding OR replication
          if (isErasureCodingEnabled()) {
            // ── Erasure coding path ──
            const ec = getErasureConfig();
            const k = ec.dataShards;
            emit({
              stage: "erasure_encode",
              message: `Generating erasure parity (k=${k}, m=${ec.parityShards})...`,
            });

            // Group chunks into sets of k
            const groups: FSChunk[][] = [];
            for (let g = 0; g < chunks.length; g += k) {
              groups.push(chunks.slice(g, g + k));
            }

            const allParityChunks: FSChunk[] = [];

            for (let gi = 0; gi < groups.length; gi++) {
              const group = groups[gi];
              const groupId = groupUuidv4();

              // Tag data chunks with group info
              for (let di = 0; di < group.length; di++) {
                group[di].groupId = groupId;
                group[di].groupIndex = di;
                group[di].isParity = false;
              }

              // Read data buffers for this group
              const dataBuffers: Buffer[] = [];
              for (const chunk of group) {
                const chunkData = buffer.subarray(
                  chunk.offset,
                  chunk.offset + chunk.size,
                );
                dataBuffers.push(Buffer.from(chunkData));
              }

              // Generate parity shards
              const parityBuffers = encodeParityShards(dataBuffers);
              const parityMeta = createParityChunkMetadata(
                group,
                groupId,
                parityBuffers,
              );

              // Distribute parity chunks to nodes that don't already hold data from this group
              const usedNodeIds = new Set(group.map((c) => c.nodeId));
              const parityTargets = onlineNodes.filter(
                (n) => !usedNodeIds.has(n.nodeId),
              );

              for (let pi = 0; pi < parityMeta.length; pi++) {
                const targetNode =
                  parityTargets[pi % parityTargets.length] ||
                  onlineNodes[pi % onlineNodes.length];
                const pChunk: FSChunk = {
                  ...parityMeta[pi],
                  nodeId: targetNode.nodeId,
                };

                emit({
                  stage: "write",
                  message: `Writing parity P${pi + 1} (group ${gi + 1}) → ${nodeMap.get(targetNode.nodeId) || targetNode.nodeId}`,
                  chunkIndex: `P${pi + 1}`,
                  totalChunks,
                  nodeName: nodeMap.get(targetNode.nodeId) || targetNode.nodeId,
                  chunkSize: parityBuffers[pi].length,
                });

                await simulateLatency(targetNode.nodeId);
                await storageClient.writeChunk(
                  targetNode.nodeId,
                  pChunk.chunkId,
                  parityBuffers[pi],
                );
                await updateNodeUsage(
                  targetNode.nodeId,
                  parityBuffers[pi].length,
                  1,
                );

                allParityChunks.push(pChunk);
              }

              emit({
                stage: "erasure_group_done",
                message: `Erasure group ${gi + 1}/${groups.length} encoded (${group.length} data + ${parityBuffers.length} parity)`,
              });
            }

            // Add parity chunks to the chunks array
            chunks = [...chunks, ...allParityChunks];

            emit({
              stage: "erasure_done",
              message: `Erasure coding complete: ${allParityChunks.length} parity chunks generated`,
            });
          } else {
            // ── Legacy replication path ──
            emit({
              stage: "replicate",
              message: "Replicating chunks for fault tolerance...",
            });
            chunks = await replicateChunks(chunks);
            emit({ stage: "replicate_done", message: "Replication complete" });
          }

          // Stage 6: Save metadata
          const fsFile: FSFile = {
            fileId,
            originalName: fileName,
            mimeType: fileMime,
            totalSize: buffer.length,
            chunkCount: chunks.filter((c) => !c.isParity).length,
            chunkSize:
              chunkingStrategy === "cdc"
                ? Math.round(
                    buffer.length / chunks.filter((c) => !c.isParity).length,
                  )
                : DEFAULT_CONFIG.chunkSizeBytes,
            checksum,
            uploadedAt: new Date().toISOString(),
            version: 1,
            chunks,
            erasureCoded: isErasureCodingEnabled(),
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
