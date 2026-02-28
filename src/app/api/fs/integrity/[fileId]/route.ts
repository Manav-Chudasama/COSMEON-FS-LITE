// ============================================
// GET /api/fs/integrity/[fileId] — Merkle Tree Integrity Check
// Streams NDJSON progress events showing tree traversal.
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import {
  buildMerkleTree,
  computeHash,
  findCorruptedChunks,
  getFile,
  initEngine,
  storageClient,
} from "@/lib/fs-lite";

export const dynamic = "force-dynamic";

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

    // Stream NDJSON events
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
        };

        try {
          const dataChunks = file.chunks
            .filter((c) => !c.isParity)
            .sort((a, b) => a.index - b.index);

          const totalChunks = dataChunks.length;
          const hasMerkle = !!file.merkleRoot && !!file.merkleTree;

          emit({
            stage: "init",
            message: hasMerkle
              ? `Starting Merkle integrity check for "${file.originalName}" (${totalChunks} chunks)`
              : `Starting flat integrity check for "${file.originalName}" (${totalChunks} chunks)`,
            totalChunks,
            hasMerkle,
          });

          // Step 1: Read all chunk hashes from disk
          emit({
            stage: "hashing",
            message: "Reading and hashing chunks from nodes...",
          });

          const currentHashes: string[] = [];
          const chunkResults: {
            chunkId: string;
            index: number;
            nodeId: string;
            expectedHash: string;
            actualHash: string | null;
            passed: boolean;
            error?: string;
          }[] = [];

          for (let i = 0; i < dataChunks.length; i++) {
            const chunk = dataChunks[i];
            let actualHash: string | null = null;
            let passed = false;
            let error: string | undefined;

            try {
              const data = await storageClient.readChunk(
                chunk.nodeId,
                chunk.chunkId,
              );
              actualHash = computeHash(data);
              passed = actualHash === chunk.hash;
            } catch (e) {
              error = e instanceof Error ? e.message : "Read failed";
              passed = false;
            }

            currentHashes.push(actualHash || "MISSING");

            chunkResults.push({
              chunkId: chunk.chunkId,
              index: chunk.index,
              nodeId: chunk.nodeId,
              expectedHash: chunk.hash,
              actualHash,
              passed,
              error,
            });

            // Emit progress every few chunks
            if (
              i % Math.max(1, Math.floor(totalChunks / 10)) === 0 ||
              i === totalChunks - 1
            ) {
              emit({
                stage: "hashing_progress",
                message: `Hashed chunk ${i + 1}/${totalChunks}`,
                current: i + 1,
                total: totalChunks,
              });
            }
          }

          emit({
            stage: "hashing_done",
            message: `All ${totalChunks} chunks hashed`,
          });

          // Step 2: Merkle tree verification (or flat fallback)
          if (hasMerkle) {
            // Build current tree from freshly computed hashes
            emit({
              stage: "build_tree",
              message: "Building Merkle tree from current chunk hashes...",
            });

            const currentTree = buildMerkleTree(currentHashes);

            emit({
              stage: "build_tree_done",
              message: `Tree built (depth ${currentTree.depth})`,
              depth: currentTree.depth,
            });

            // Step 3: Root hash check
            const rootMatch = file.merkleRoot === currentTree.root;

            emit({
              stage: "root_check",
              message: rootMatch
                ? "✓ Root hash matches — file is intact!"
                : "✗ Root hash MISMATCH — scanning tree for corrupted chunks...",
              match: rootMatch,
              storedRoot: `${file.merkleRoot?.slice(0, 16)}...`,
              currentRoot: `${currentTree.root.slice(0, 16)}...`,
            });

            let corruptedIndices: number[] = [];

            if (!rootMatch) {
              // Step 4: Tree descent — O(log n)
              emit({
                stage: "descend_start",
                message: `Descending tree (${currentTree.depth} levels) to locate corruption...`,
                depth: currentTree.depth,
              });

              const result = findCorruptedChunks(
                file.merkleTree ?? [],
                currentHashes,
                totalChunks,
              );

              // Stream each traversal step
              for (const step of result.steps) {
                emit({
                  stage: "descend",
                  level: step.level,
                  depth: step.depth,
                  side: step.side,
                  match: step.match,
                  chunkRange: step.chunkRange,
                  message: step.message,
                });
              }

              corruptedIndices = result.corruptedIndices;

              // Report found chunks
              for (const idx of corruptedIndices) {
                emit({
                  stage: "leaf",
                  message: `Corrupted chunk found: #${idx}`,
                  chunkIndex: idx,
                });
              }
            }

            // Final report
            const passedChunks = totalChunks - corruptedIndices.length;
            const failedChunks = corruptedIndices.length;

            emit({
              stage: "complete",
              message:
                failedChunks === 0
                  ? `✓ All ${totalChunks} chunks passed Merkle verification`
                  : `✗ ${failedChunks} corrupted chunk(s) found via Merkle tree`,
              report: {
                fileId: file.fileId,
                fileName: file.originalName,
                totalChunks,
                checkedChunks: totalChunks,
                passedChunks,
                failedChunks,
                results: chunkResults,
                merkleVerified: true,
                corruptedIndices,
              },
            });
          } else {
            // ── Flat fallback (old files without Merkle tree) ──
            const passedChunks = chunkResults.filter((r) => r.passed).length;
            const failedChunks = chunkResults.filter((r) => !r.passed).length;

            emit({
              stage: "flat_scan",
              message: "No Merkle tree stored — using flat verification",
            });

            emit({
              stage: "complete",
              message:
                failedChunks === 0
                  ? `✓ All ${totalChunks} chunks passed flat verification`
                  : `✗ ${failedChunks} chunk(s) failed verification`,
              report: {
                fileId: file.fileId,
                fileName: file.originalName,
                totalChunks,
                checkedChunks: chunkResults.length,
                passedChunks,
                failedChunks,
                results: chunkResults,
                merkleVerified: false,
              },
            });
          }
        } catch (error) {
          emit({
            stage: "error",
            message:
              error instanceof Error ? error.message : "Verification failed",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[FS-LITE] Integrity check error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Integrity check failed",
      },
      { status: 500 },
    );
  }
}
