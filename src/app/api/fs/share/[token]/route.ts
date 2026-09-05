// ============================================
// GET /api/fs/share/[token]
// Public endpoint to retrieve metadata for a shared file.
// Validates token and expiration timestamp.
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import { connectDB, FileModel, initEngine } from "@/lib/fs-lite";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    await initEngine();
    await connectDB();

    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const doc = await FileModel.findOne({ "shareLink.token": token }).lean();
    if (!doc) {
      return NextResponse.json(
        { error: "Shared file not found or invalid link" },
        { status: 404 },
      );
    }

    const shareLink = doc.shareLink as {
      enabled?: boolean;
      expiresAt?: Date | string | null;
      downloads?: number;
    };

    if (!shareLink?.enabled) {
      return NextResponse.json(
        { error: "This share link has been deactivated by the owner" },
        { status: 403 },
      );
    }

    if (shareLink.expiresAt && new Date(shareLink.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: "This share link has expired" },
        { status: 410 },
      );
    }

    return NextResponse.json({
      fileId: doc.fileId,
      originalName: doc.originalName,
      mimeType: doc.mimeType || "application/octet-stream",
      totalSize: doc.totalSize,
      chunkCount: doc.chunkCount,
      uploadedAt: doc.uploadedAt,
      encrypted: !!doc.encrypted,
      ownerName: doc.ownerName || "Orbital Station",
      ownerEmail: doc.ownerEmail,
      expiresAt: shareLink.expiresAt || null,
      downloads: shareLink.downloads || 0,
    });
  } catch (error) {
    console.error("[FS-LITE] Public share metadata error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load shared file" },
      { status: 500 },
    );
  }
}
