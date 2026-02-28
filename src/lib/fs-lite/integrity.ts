// ============================================
// COSMEON FS-LITE — Integrity Verification
// ============================================

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FSFile, IntegrityReport } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { fsLogger } from "./logger";
import { listFiles } from "./metadata-store";

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

// ── Background Integrity Scanner ──────────────

let scannerInterval: ReturnType<typeof setInterval> | null = null;
let isScanning = false;

/**
 * Scan all files for integrity issues.
 * Logs INTEGRITY_ALERT for every file that has corrupted or missing chunks.
 */
export async function scanAllFiles(
  dataDir: string = DEFAULT_CONFIG.dataDir,
): Promise<{ scannedFiles: number; alertedFiles: number }> {
  if (isScanning) {
    return { scannedFiles: 0, alertedFiles: 0 };
  }

  isScanning = true;
  let scannedFiles = 0;
  let alertedFiles = 0;

  try {
    const files = await listFiles();

    if (files.length === 0) {
      isScanning = false;
      return { scannedFiles: 0, alertedFiles: 0 };
    }

    for (const file of files) {
      scannedFiles++;

      try {
        const report = await verifyFile(file, dataDir);

        if (report.failedChunks > 0) {
          alertedFiles++;

          const failedDetails = report.results
            .filter((r) => !r.passed)
            .map((r) => ({
              chunkIndex: r.index,
              nodeId: r.nodeId,
              error: r.error || "hash mismatch",
            }));

          fsLogger.log(
            "INTEGRITY_ALERT",
            `⚠ Integrity alert: "${file.originalName}" has ${report.failedChunks} corrupted/missing chunk(s)`,
            {
              fileId: file.fileId,
              fileName: file.originalName,
              totalChunks: report.totalChunks,
              failedChunks: report.failedChunks,
              passedChunks: report.passedChunks,
              details: failedDetails,
            },
          );
        }
      } catch (error) {
        // If verification itself crashes, log it as an alert
        fsLogger.log(
          "INTEGRITY_ALERT",
          `⚠ Integrity scan failed for "${file.originalName}": ${error instanceof Error ? error.message : "Unknown error"}`,
          { fileId: file.fileId },
        );
        alertedFiles++;
      }
    }
  } finally {
    isScanning = false;
  }

  if (alertedFiles > 0) {
    console.warn(
      `[FS-LITE] Integrity scan complete: ${alertedFiles}/${scannedFiles} files have issues`,
    );
  } else if (scannedFiles > 0) {
    console.log(`[FS-LITE] Integrity scan complete: ${scannedFiles} files OK`);
  }

  return { scannedFiles, alertedFiles };
}

/**
 * Start the background integrity scanner.
 */
export function startIntegrityScanner(
  intervalMs: number = DEFAULT_CONFIG.integrityScanIntervalMs,
): void {
  if (scannerInterval) return;

  console.log(
    `[FS-LITE] Integrity scanner started (interval: ${intervalMs / 1000}s)`,
  );

  scannerInterval = setInterval(() => {
    scanAllFiles().catch((err) => {
      console.error("[FS-LITE] Integrity scanner error:", err);
    });
  }, intervalMs);
}

/**
 * Stop the background integrity scanner.
 */
export function stopIntegrityScanner(): void {
  if (scannerInterval) {
    clearInterval(scannerInterval);
    scannerInterval = null;
    console.log("[FS-LITE] Integrity scanner stopped");
  }
}
