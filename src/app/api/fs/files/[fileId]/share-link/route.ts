// ============================================
// POST /api/fs/files/[fileId]/share-link
// Generate, configure expiration, or revoke a public share link.
// Only the file owner can manage public share links.
// ============================================

import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  connectDB,
  FileModel,
  fsLogger,
  getFile,
  initEngine,
  updateFileInCache,
} from "@/lib/fs-lite";
import type { ShareLink } from "@/lib/fs-lite/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    await initEngine();
    await connectDB();

    const session = await getSessionFromRequest(request);
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = await params;
    const file = await getFile(fileId);
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.ownerId && file.ownerId !== session.userId) {
      return NextResponse.json(
        { error: "Forbidden: Only the file owner can manage share links" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const enabled = !!body.enabled;

    // Fetch latest downloads count directly from DB to prevent overwriting
    const existingDoc = await FileModel.findOne({ fileId }).lean();
    const existingDownloads =
      (existingDoc?.shareLink as { downloads?: number } | undefined)?.downloads ??
      file.shareLink?.downloads ??
      0;

    if (!enabled) {
      // Disable the link
      const updatedShareLink: ShareLink = {
        enabled: false,
        token: file.shareLink?.token || "",
        expiresAt: null,
        downloads: existingDownloads,
        createdAt: file.shareLink?.createdAt || new Date().toISOString(),
      };

      await FileModel.updateOne(
        { fileId },
        { $set: { shareLink: updatedShareLink } },
      );

      file.shareLink = updatedShareLink;
      updateFileInCache(file);

      fsLogger.log(
        "FILE_SHARE_LINK_REVOKE",
        `Public share link disabled for "${file.originalName}"`,
        { fileId },
      );

      return NextResponse.json({
        message: "Public share link disabled",
        shareLink: updatedShareLink,
      });
    }

    // Parse expiration duration (supports '1h', '24h', '7d', 'never', or number of hours)
    let expiresInHours: number | null = null;
    if (typeof body.expiresInHours === "number" && body.expiresInHours > 0) {
      expiresInHours = body.expiresInHours;
    } else if (typeof body.expiresIn === "string") {
      const trimmed = body.expiresIn.trim().toLowerCase();
      if (trimmed === "1h") expiresInHours = 1;
      else if (trimmed === "24h") expiresInHours = 24;
      else if (trimmed === "7d") expiresInHours = 168;
      else if (trimmed === "never") expiresInHours = null;
    } else if (typeof body.expiresIn === "number" && body.expiresIn > 0) {
      expiresInHours = body.expiresIn;
    }

    const expiresAt = expiresInHours
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
      : null;

    // Use existing token if active, or generate a fresh 32-char hex token
    const token = file.shareLink?.token || crypto.randomBytes(16).toString("hex");

    const newShareLink: ShareLink = {
      enabled: true,
      token,
      expiresAt,
      downloads: existingDownloads,
      createdAt: file.shareLink?.createdAt || new Date().toISOString(),
    };

    await FileModel.updateOne(
      { fileId },
      {
        $set: {
          shareLink: newShareLink,
          ...(file.ownerId ? {} : { ownerId: session.userId, ownerEmail: session.email, ownerName: session.name }),
        },
      },
    );

    file.shareLink = newShareLink;
    if (!file.ownerId) {
      file.ownerId = session.userId;
      file.ownerEmail = session.email;
      file.ownerName = session.name;
    }
    updateFileInCache(file);

    fsLogger.log(
      "FILE_SHARE_LINK_CREATE",
      `Public share link generated for "${file.originalName}" (${expiresInHours ? `${expiresInHours}h expiry` : "permanent"})`,
      { fileId, token, expiresAt },
    );

    return NextResponse.json({
      message: "Public share link generated",
      shareLink: newShareLink,
    });
  } catch (error) {
    console.error("[FS-LITE] Share link error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update share link" },
      { status: 500 },
    );
  }
}
