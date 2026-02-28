// ============================================
// COSMEON FS-LITE -- File Chunker
// Supports fixed-size and CDC (Content-Defined Chunking)
// ============================================

import { createHash } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import type { FSChunk } from "./types";
import { DEFAULT_CONFIG } from "./types";

// ────────────────────────────────────────────────────────────
// Fixed-size chunking
// ────────────────────────────────────────────────────────────

/**
 * Split a buffer into equal-sized chunks.
 * Each chunk carries its byte offset in the original file.
 */
export function splitFileFixed(
  buffer: Buffer,
  fileId: string,
  chunkSizeBytes: number = DEFAULT_CONFIG.chunkSizeBytes,
): Omit<FSChunk, "nodeId" | "replicas">[] {
  const chunks: Omit<FSChunk, "nodeId" | "replicas">[] = [];
  const totalChunks = Math.ceil(buffer.length / chunkSizeBytes);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSizeBytes;
    const end = Math.min(start + chunkSizeBytes, buffer.length);
    const slice = buffer.subarray(start, end);
    const hash = createHash("sha256").update(slice).digest("hex");

    chunks.push({
      chunkId: uuidv4(),
      fileId,
      index: i,
      offset: start,
      size: slice.length,
      hash,
    });
  }

  return chunks;
}

// ────────────────────────────────────────────────────────────
// Content-Defined Chunking (CDC) -- Rabin-inspired rolling hash
// ────────────────────────────────────────────────────────────

/**
 * Compute a simple polynomial rolling hash over a window of bytes.
 * Uses: hash = sum(buf[i] * 31^(windowSize-1-i)) mod 2^32
 * Pure JS -- no crypto module needed.
 */
function rollingHash(buf: Buffer, start: number, windowSize: number): number {
  let h = 0;
  const end = Math.min(start + windowSize, buf.length);
  for (let i = start; i < end; i++) {
    h = ((h * 31) + buf[i]) >>> 0; // keep 32-bit unsigned
  }
  return h;
}

/**
 * Split a buffer using Content-Defined Chunking.
 *
 * A chunk boundary is declared when the lower `maskBits` bits of the
 * rolling hash equal zero, subject to [minSize, maxSize] constraints.
 *
 * @param buffer    - File data
 * @param fileId    - Parent file ID
 * @param config    - CDC tuning parameters (defaults to DEFAULT_CONFIG.chunking)
 */
export function splitFileCDC(
  buffer: Buffer,
  fileId: string,
  config?: {
    minSize: number;
    avgSize: number;
    maxSize: number;
    windowSize: number;
    maskBits: number;
  },
): Omit<FSChunk, "nodeId" | "replicas">[] {
  const cfg = config ?? DEFAULT_CONFIG.chunking;
  const { minSize, maxSize, windowSize, maskBits } = cfg;
  const mask = (1 << maskBits) - 1;

  const chunks: Omit<FSChunk, "nodeId" | "replicas">[] = [];
  let chunkStart = 0;
  let index = 0;

  while (chunkStart < buffer.length) {
    let pos = chunkStart + minSize;

    if (pos >= buffer.length) {
      // Remaining data is smaller than minSize -- emit as final chunk
      pos = buffer.length;
    } else {
      // Slide the window until we hit a boundary or maxSize
      const hardStop = Math.min(chunkStart + maxSize, buffer.length);

      while (pos < hardStop) {
        const h = rollingHash(buffer, pos, windowSize);
        if ((h & mask) === 0) {
          pos++; // include the boundary byte in this chunk
          break;
        }
        pos++;
      }
      // If we hit hardStop without a natural boundary, force a cut
      if (pos > hardStop) pos = hardStop;
    }

    const slice = buffer.subarray(chunkStart, pos);
    const hash = createHash("sha256").update(slice).digest("hex");

    chunks.push({
      chunkId: uuidv4(),
      fileId,
      index: index++,
      offset: chunkStart,
      size: slice.length,
      hash,
    });

    chunkStart = pos;
  }

  return chunks;
}

// ────────────────────────────────────────────────────────────
// Unified entry point
// ────────────────────────────────────────────────────────────

/**
 * Split a file buffer into chunks using the requested strategy.
 *
 * @param buffer   - File data
 * @param fileId   - Parent file ID
 * @param strategy - "fixed" (default) or "cdc"
 */
export function splitFile(
  buffer: Buffer,
  fileId: string,
  strategy: "fixed" | "cdc" = DEFAULT_CONFIG.chunking.strategy,
): Omit<FSChunk, "nodeId" | "replicas">[] {
  if (strategy === "cdc") {
    return splitFileCDC(buffer, fileId);
  }
  return splitFileFixed(buffer, fileId);
}

// ────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of the entire file.
 */
export function computeFileChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Reassemble chunks into the original file buffer.
 * Chunks MUST be provided in order (by index).
 */
export function reassembleFile(chunkBuffers: Buffer[]): Buffer {
  return Buffer.concat(chunkBuffers);
}

/**
 * Get the raw bytes for a specific fixed-size chunk by index.
 * Use chunk.offset + chunk.size for variable-size (CDC) chunks instead.
 */
export function extractChunkData(
  buffer: Buffer,
  index: number,
  chunkSizeBytes: number = DEFAULT_CONFIG.chunkSizeBytes,
): Buffer {
  const start = index * chunkSizeBytes;
  const end = Math.min(start + chunkSizeBytes, buffer.length);
  return buffer.subarray(start, end);
}
