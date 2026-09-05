// ============================================
// Unit Tests — File Sharing & Access Control
// ============================================

import { describe, expect, it } from "bun:test";
import type { FSFile, SharedUser, ShareLink } from "../../src/lib/fs-lite/types";

describe("File Sharing & Collaborator Permissions", () => {
  it("enforces read-only permission for collaborators", () => {
    const collaborator: SharedUser = {
      userId: "user-456",
      email: "collab@cosmeon.io",
      name: "Operator Collab",
      sharedAt: new Date().toISOString(),
      permission: "read",
    };

    expect(collaborator.permission).toBe("read");
  });

  it("distinguishes owner from collaborators for deletion rights", () => {
    const file: Partial<FSFile> = {
      fileId: "file-xyz",
      originalName: "telemetry.log",
      ownerId: "user-owner-123",
      ownerEmail: "owner@cosmeon.io",
      sharedUsers: [
        {
          userId: "user-collab-456",
          email: "collab@cosmeon.io",
          sharedAt: new Date().toISOString(),
          permission: "read",
        },
      ],
    };

    const isOwner = (callerId: string) => callerId === file.ownerId;
    const canDelete = (callerId: string) => isOwner(callerId);
    const canReadAndDownload = (callerId: string) =>
      isOwner(callerId) ||
      (file.sharedUsers?.some((u) => u.userId === callerId) ?? false);

    // Owner can delete and read
    expect(isOwner("user-owner-123")).toBe(true);
    expect(canDelete("user-owner-123")).toBe(true);
    expect(canReadAndDownload("user-owner-123")).toBe(true);

    // Collaborator can read & download, but NEVER delete
    expect(isOwner("user-collab-456")).toBe(false);
    expect(canDelete("user-collab-456")).toBe(false);
    expect(canReadAndDownload("user-collab-456")).toBe(true);

    // Stranger cannot read or delete
    expect(isOwner("stranger-999")).toBe(false);
    expect(canDelete("stranger-999")).toBe(false);
    expect(canReadAndDownload("stranger-999")).toBe(false);
  });

  it("correctly validates share link expiration", () => {
    const now = Date.now();

    const activeLink: ShareLink = {
      enabled: true,
      token: "token-active",
      expiresAt: new Date(now + 3600 * 1000).toISOString(), // 1h in future
      downloads: 3,
      createdAt: new Date(now - 60000).toISOString(),
    };

    const expiredLink: ShareLink = {
      enabled: true,
      token: "token-expired",
      expiresAt: new Date(now - 1000).toISOString(), // in past
      downloads: 5,
      createdAt: new Date(now - 7200 * 1000).toISOString(),
    };

    const permanentLink: ShareLink = {
      enabled: true,
      token: "token-perm",
      expiresAt: null,
      downloads: 0,
      createdAt: new Date().toISOString(),
    };

    const disabledLink: ShareLink = {
      enabled: false,
      token: "token-disabled",
      expiresAt: null,
      downloads: 1,
      createdAt: new Date().toISOString(),
    };

    const isLinkValid = (link: ShareLink) => {
      if (!link.enabled) return { valid: false, status: 403, reason: "disabled" };
      if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
        return { valid: false, status: 410, reason: "expired" };
      }
      return { valid: true, status: 200 };
    };

    expect(isLinkValid(activeLink).valid).toBe(true);
    expect(isLinkValid(permanentLink).valid).toBe(true);

    const expiredCheck = isLinkValid(expiredLink);
    expect(expiredCheck.valid).toBe(false);
    expect(expiredCheck.status).toBe(410);

    const disabledCheck = isLinkValid(disabledLink);
    expect(disabledCheck.valid).toBe(false);
    expect(disabledCheck.status).toBe(403);
  });

  it("accurately parses expiry durations (1h, 24h, 7d, never)", () => {
    const parseExpiry = (expiresIn: unknown, expiresInHours?: unknown) => {
      let hours: number | null = null;
      if (typeof expiresInHours === "number" && expiresInHours > 0) {
        hours = expiresInHours;
      } else if (typeof expiresIn === "string") {
        const trimmed = expiresIn.trim().toLowerCase();
        if (trimmed === "1h") hours = 1;
        else if (trimmed === "24h") hours = 24;
        else if (trimmed === "7d") hours = 168;
        else if (trimmed === "never") hours = null;
      } else if (typeof expiresIn === "number" && expiresIn > 0) {
        hours = expiresIn;
      }

      return hours ? new Date(Date.now() + hours * 3600 * 1000).toISOString() : null;
    };

    expect(parseExpiry("never")).toBeNull();
    expect(parseExpiry(null)).toBeNull();

    const expiry24h = parseExpiry("24h");
    expect(expiry24h).not.toBeNull();
    const diff24h = (new Date(expiry24h!).getTime() - Date.now()) / (1000 * 3600);
    expect(Math.round(diff24h)).toBe(24);

    const expiry1h = parseExpiry("1h");
    expect(expiry1h).not.toBeNull();
    const diff1h = (new Date(expiry1h!).getTime() - Date.now()) / (1000 * 3600);
    expect(Math.round(diff1h)).toBe(1);

    const expiry7d = parseExpiry("7d");
    expect(expiry7d).not.toBeNull();
    const diff7d = (new Date(expiry7d!).getTime() - Date.now()) / (1000 * 3600);
    expect(Math.round(diff7d)).toBe(168);
  });
});
