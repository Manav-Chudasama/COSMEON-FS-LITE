// ============================================
// GET /api/fs/files — List files for the authenticated user
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { initEngine } from "@/lib/fs-lite";
import { connectDB, FileModel } from "@/lib/fs-lite/db";
import { getSessionFromRequest } from "@/lib/auth/session";
import type { FSFile } from "@/lib/fs-lite/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await initEngine();
    await connectDB();

    const session = await getSessionFromRequest(request);

    let query: Record<string, unknown> = {};

    if (session?.userId) {
      // Authenticated: show own files + files shared with this user + legacy files without an owner
      query = {
        $or: [
          { ownerId: session.userId },
          { sharedWith: session.userId },
          { ownerId: { $exists: false } },
          { ownerId: null },
        ],
      };
    }
    // Unauthenticated (no cookie): return all files — middleware handles protection for dashboard

    const docs = await FileModel.find(query)
      .sort({ uploadedAt: -1 })
      .lean();

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
      sharedWith: (doc.sharedWith as string[]) || [],
    }));

    return NextResponse.json({
      files,
      total: files.length,
    });
  } catch (error) {
    console.error("[FS-LITE] List files error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list files",
      },
      { status: 500 },
    );
  }
}
