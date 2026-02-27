// ============================================
// COSMEON FS-LITE — File Chunker
// ============================================

import { createHash } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import type { FSChunk } from "./types";
import { DEFAULT_CONFIG } from "./types";

/**
 * Split a file buffer into chunks with SHA-256 hashes.
 */
export function splitFile(
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
      size: slice.length,
      hash,
    });
  }

  return chunks;
}

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
 * Get the raw bytes from a Buffer for a specific chunk definition.
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
