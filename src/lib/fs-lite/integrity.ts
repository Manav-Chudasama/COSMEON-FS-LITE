// ============================================
// COSMEON FS-LITE — Integrity Verification
// ============================================

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FSFile, IntegrityReport } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { fsLogger } from "./logger";

/**
 * Compute SHA-256 hash of a buffer.
 */
export function computeHash(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Verify a single chunk's data against its expected hash.
 */
export function verifyChunk(data: Buffer, expectedHash: string): boolean {
  const actualHash = computeHash(data);
  return actualHash === expectedHash;
}

/**
 * Run a full integrity check on a file by reading all its
 * chunks from disk and verifying their hashes.
 */
export async function verifyFile(
  file: FSFile,
  dataDir: string = DEFAULT_CONFIG.dataDir,
): Promise<IntegrityReport> {
  const results: IntegrityReport["results"] = [];
  let passedChunks = 0;
  let failedChunks = 0;

  fsLogger.log(
    "INTEGRITY_CHECK",
    `Starting integrity check for "${file.originalName}"`,
    {
      fileId: file.fileId,
      chunkCount: file.chunkCount,
    },
  );

  for (const chunk of file.chunks) {
    try {
      const chunkPath = join(
        process.cwd(),
        dataDir,
        "nodes",
        chunk.nodeId,
        chunk.chunkId,
      );
      const data = await readFile(chunkPath);
      const actualHash = computeHash(data);
      const passed = actualHash === chunk.hash;

      if (passed) {
        passedChunks++;
      } else {
        failedChunks++;
      }

      results.push({
        chunkId: chunk.chunkId,
        index: chunk.index,
        nodeId: chunk.nodeId,
        expectedHash: chunk.hash,
        actualHash,
        passed,
      });
    } catch (error) {
      failedChunks++;
      results.push({
        chunkId: chunk.chunkId,
        index: chunk.index,
        nodeId: chunk.nodeId,
        expectedHash: chunk.hash,
        actualHash: null,
        passed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const logType = failedChunks > 0 ? "INTEGRITY_FAIL" : "INTEGRITY_PASS";
  fsLogger.log(
    logType,
    `Integrity check complete: ${passedChunks}/${file.chunkCount} passed`,
    {
      fileId: file.fileId,
      passedChunks,
      failedChunks,
    },
  );

  return {
    fileId: file.fileId,
    fileName: file.originalName,
    totalChunks: file.chunkCount,
    checkedChunks: results.length,
    passedChunks,
    failedChunks,
    results,
  };
}
