// ============================================
// POST /api/fs/files/[fileId]/share
// Add or remove user collaborators (read & download permissions only).
// Only the file owner can manage collaborators.
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  connectDB,
  FileModel,
  fsLogger,
  getFile,
  initEngine,
  UserModel,
} from "@/lib/fs-lite";
import type { SharedUser } from "@/lib/fs-lite/types";

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

    // Only owner can manage collaborators (or legacy files without owner can be claimed)
    if (file.ownerId && file.ownerId !== session.userId) {
      return NextResponse.json(
        { error: "Forbidden: Only the file owner can manage sharing" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const action = body.action as "add" | "remove";

    if (action === "add") {
      const email = (body.email as string)?.trim().toLowerCase();
      if (!email) {
        return NextResponse.json(
          { error: "Recipient email is required" },
          { status: 400 },
        );
      }

      // Look up recipient in UserModel
      const targetUser = await UserModel.findOne({ email }).lean();
      if (!targetUser) {
        return NextResponse.json(
          { error: `No registered user found with email "${email}"` },
          { status: 404 },
        );
      }

      if (targetUser.userId === session.userId) {
        return NextResponse.json(
          { error: "You cannot share a file with yourself" },
          { status: 400 },
        );
      }

      // Check if already shared
      const currentShared = (file.sharedUsers as SharedUser[]) || [];
      const alreadyShared =
        currentShared.some((u) => u.userId === targetUser.userId) ||
        file.sharedWith?.includes(targetUser.userId);

      if (alreadyShared) {
        return NextResponse.json(
          { error: `"${email}" already has collaborator access to this file` },
          { status: 400 },
        );
      }

      const newCollaborator: SharedUser = {
        userId: targetUser.userId,
        email: targetUser.email,
        name: targetUser.name,
        sharedAt: new Date().toISOString(),
        permission: "read", // Read & download only
      };

      const updatedSharedUsers = [...currentShared, newCollaborator];
      const updatedSharedWith = Array.from(
        new Set([...(file.sharedWith || []), targetUser.userId]),
      );

      await FileModel.updateOne(
        { fileId },
        {
          $set: {
            sharedUsers: updatedSharedUsers,
            sharedWith: updatedSharedWith,
            // If file had no owner, set current user as owner
            ...(file.ownerId ? {} : { ownerId: session.userId, ownerEmail: session.email, ownerName: session.name }),
          },
        },
      );

      // Update in-memory file
      file.sharedUsers = updatedSharedUsers;
      file.sharedWith = updatedSharedWith;
      if (!file.ownerId) {
        file.ownerId = session.userId;
        file.ownerEmail = session.email;
        file.ownerName = session.name;
      }

      fsLogger.log(
        "FILE_SHARE",
        `Shared file "${file.originalName}" with ${targetUser.email}`,
        { fileId, recipientId: targetUser.userId, recipientEmail: targetUser.email },
      );

      return NextResponse.json({
        message: `Collaborator access granted to ${targetUser.email}`,
        sharedUsers: updatedSharedUsers,
      });
    }

    if (action === "remove") {
      const targetUserId = body.targetUserId as string;
      if (!targetUserId) {
        return NextResponse.json(
          { error: "Target userId is required to remove access" },
          { status: 400 },
        );
      }

      const currentShared = (file.sharedUsers as SharedUser[]) || [];
      const updatedSharedUsers = currentShared.filter((u) => u.userId !== targetUserId);
      const updatedSharedWith = (file.sharedWith || []).filter((id) => id !== targetUserId);

      await FileModel.updateOne(
        { fileId },
        {
          $set: {
            sharedUsers: updatedSharedUsers,
            sharedWith: updatedSharedWith,
          },
        },
      );

      file.sharedUsers = updatedSharedUsers;
      file.sharedWith = updatedSharedWith;

      fsLogger.log(
        "FILE_SHARE_REVOKE",
        `Revoked sharing access for user ${targetUserId} on "${file.originalName}"`,
        { fileId, revokedUserId: targetUserId },
      );

      return NextResponse.json({
        message: "Collaborator access revoked",
        sharedUsers: updatedSharedUsers,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[FS-LITE] Share error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update sharing" },
      { status: 500 },
    );
  }
}
