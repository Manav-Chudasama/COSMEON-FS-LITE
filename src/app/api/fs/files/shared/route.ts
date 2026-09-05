// ============================================
// GET /api/fs/files/shared — Files shared with the current user
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { connectDB, FileModel, initEngine } from "@/lib/fs-lite";
import type { FSFile, SharedUser, ShareLink } from "@/lib/fs-lite/types";

export async function GET(request: NextRequest) {
  try {
    await initEngine();
    await connectDB();

    const session = await getSessionFromRequest(request);
    if (!session?.userId) {
      return NextResponse.json({ files: [], total: 0 });
    }

    // Query files where the user is listed in sharedWith, sharedUsers.userId, or sharedUsers.email
    const query = {
      $and: [
        { ownerId: { $ne: session.userId } }, // Don't return owned files here
        {
          $or: [
            { sharedWith: session.userId },
            { "sharedUsers.userId": session.userId },
            { "sharedUsers.email": session.email?.toLowerCase() },
          ],
        },
      ],
    };

    const docs = await FileModel.find(query).sort({ updatedAt: -1, uploadedAt: -1 }).lean();

    const files: FSFile[] = docs.map((doc) => ({
      fileId: doc.fileId as string,
      originalName: doc.originalName as string,
      mimeType: (doc.mimeType as string) || "application/octet-stream",
      totalSize: doc.totalSize as number,
      chunkCount: doc.chunkCount as number,
      chunkSize: doc.chunkSize as number,
      checksum: doc.checksum as string,
      uploadedAt: doc.uploadedAt as string,
      version: (doc.version as number) || 1,
      chunks: [],
      ownerId: (doc.ownerId as string) || undefined,
      ownerEmail: (doc.ownerEmail as string) || undefined,
      ownerName: (doc.ownerName as string) || undefined,
      sharedWith: (doc.sharedWith as string[]) || [],
      sharedUsers: (doc.sharedUsers as SharedUser[]) || [],
      shareLink: (doc.shareLink as ShareLink) || undefined,
      encrypted: (doc.encrypted as boolean) || false,
    }));

    return NextResponse.json({
      files,
      total: files.length,
    });
  } catch (error) {
    console.error("[FS-LITE] List shared files error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch shared files" },
      { status: 500 },
    );
  }
}
