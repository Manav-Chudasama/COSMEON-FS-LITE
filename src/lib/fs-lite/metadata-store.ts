// ============================================
// COSMEON FS-LITE — Metadata Store (MongoDB-backed)
// ============================================

import { connectDB, FileModel } from "./db";
import { fsLogger } from "./logger";
import type { EncryptionMeta, FSChunk, FSFile } from "./types";

// In-memory fallback cache
let filesCache: Map<string, FSFile> = new Map();

/**
 * Sync the in-memory cache from MongoDB.
 */
async function syncFromDB(): Promise<void> {
  try {
    await connectDB();
    const docs = await FileModel.find({}).lean();
    for (const doc of docs) {
      const file = docToFSFile(doc);
      filesCache.set(file.fileId, file);
    }
  } catch {
    // Continue with in-memory cache
  }
}

/**
 * Convert a MongoDB document to FSFile.
 */
function docToFSFile(doc: Record<string, unknown>): FSFile {
  return {
    fileId: doc.fileId as string,
    originalName: doc.originalName as string,
    mimeType: (doc.mimeType as string) || "application/octet-stream",
    totalSize: doc.totalSize as number,
    chunkCount: doc.chunkCount as number,
    chunkSize: doc.chunkSize as number,
    checksum: doc.checksum as string,
    uploadedAt: doc.uploadedAt as string,
    version: (doc.version as number) || 1,
    chunks: (doc.chunks as FSChunk[]) || [],
    ownerId: (doc.ownerId as string) || undefined,
    sharedWith: (doc.sharedWith as string[]) || [],
    encrypted: (doc.encrypted as boolean) || false,
    encryptionMeta: (doc.encryptionMeta as EncryptionMeta) || undefined,
  };
}

/**
 * Ensure metadata store is initialized.
 */
export async function initMetadataStore(): Promise<void> {
  await syncFromDB();
}

/**
 * Add a new file to the store.
 */
export async function addFile(file: FSFile): Promise<FSFile> {
  filesCache.set(file.fileId, file);

  try {
    await connectDB();
    await FileModel.create(file);
  } catch (err) {
    console.error("[FS-LITE] Failed to persist file to MongoDB:", err);
  }

  fsLogger.log(
    "FILE_UPLOAD",
    `File "${file.originalName}" stored (${file.chunkCount} chunks)`,
    {
      fileId: file.fileId,
      size: file.totalSize,
      chunkCount: file.chunkCount,
    },
  );

  return file;
}

/**
 * Get a file by ID.
 */
export async function getFile(fileId: string): Promise<FSFile | null> {
  // Check in-memory first
  const cached = filesCache.get(fileId);
  if (cached) return cached;

  // Try MongoDB
  try {
    await connectDB();
    const doc = await FileModel.findOne({ fileId }).lean();
    if (doc) {
      const file = docToFSFile(doc as Record<string, unknown>);
      filesCache.set(file.fileId, file);
      return file;
    }
  } catch {
    // Continue without persistence
  }

  return null;
}

/**
 * List all files.
 */
export async function listFiles(): Promise<FSFile[]> {
  // Sync from DB to ensure we have latest
  try {
    await connectDB();
    const docs = await FileModel.find({}).sort({ uploadedAt: -1 }).lean();
    const files: FSFile[] = [];
    for (const doc of docs) {
      const file = docToFSFile(doc as Record<string, unknown>);
      filesCache.set(file.fileId, file);
      files.push(file);
    }
    return files;
  } catch {
    // Fall back to in-memory cache
    return Array.from(filesCache.values()).sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );
  }
}

/**
 * Delete a file from the store.
 */
export async function deleteFile(fileId: string): Promise<FSFile | null> {
  const file = filesCache.get(fileId);
  if (!file) return null;

  filesCache.delete(fileId);

  try {
    await connectDB();
    await FileModel.deleteOne({ fileId });
  } catch {
    // Continue without persistence
  }

  fsLogger.log("FILE_DELETE", `File "${file.originalName}" deleted`, {
    fileId,
    chunkCount: file.chunkCount,
  });

  return file;
}

/**
 * Update chunk information for a file (e.g., after replication/rebalancing).
 */
export async function updateFileChunks(
  fileId: string,
  chunks: FSChunk[],
): Promise<void> {
  const file = filesCache.get(fileId);
  if (!file) return;

  file.chunks = chunks;
  filesCache.set(fileId, file);

  try {
    await connectDB();
    await FileModel.updateOne({ fileId }, { chunks });
  } catch {
    // Continue without persistence
  }
}

/**
 * Get files whose chunks exist on a specific node.
 */
export function getFilesOnNode(nodeId: string): FSFile[] {
  return Array.from(filesCache.values()).filter((file) =>
    file.chunks.some(
      (chunk) => chunk.nodeId === nodeId || chunk.replicas.includes(nodeId),
    ),
  );
}

/**
 * Reset the store (for testing).
 */
export function resetMetadataStore(): void {
  filesCache = new Map();
}
