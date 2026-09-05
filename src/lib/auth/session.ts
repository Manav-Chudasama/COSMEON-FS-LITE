// ============================================
// COSMEON FS-LITE — Session Management
// ============================================

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { verifyAuthToken } from "./jwt";
import type { AuthTokenPayload, UserRole, UserSafe } from "@/lib/fs-lite/types";
import { connectDB, UserModel } from "@/lib/fs-lite/db";

const COOKIE_NAME = "auth_token";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

/**
 * Get the authenticated user from the request cookie (for API routes).
 * Returns null if unauthenticated or token is invalid.
 */
export async function getSessionFromRequest(
  request: NextRequest,
): Promise<AuthTokenPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyAuthToken(token);
}

/**
 * Get the authenticated user from server-side cookies (for Server Components / API routes).
 * Returns null if unauthenticated or token is invalid.
 */
export async function getSession(): Promise<AuthTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyAuthToken(token);
}

/**
 * Get the authenticated user record from the database (for Server Components / API routes).
 * Verifies both the JWT signature and that the user actually exists in the active database.
 * Returns null if unauthenticated, token is invalid, or user does not exist in DB.
 */
export async function getAuthenticatedUser(): Promise<UserSafe | null> {
  const session = await getSession();
  if (!session) return null;

  try {
    await connectDB();
    const user = (await UserModel.findOne({ userId: session.userId })
      .select("-passwordHash -__v")
      .lean()) as Record<string, unknown> | null;

    if (!user) return null;

    return {
      userId: user.userId as string,
      name: user.name as string,
      email: user.email as string,
      role: user.role as UserRole,
      twoFactorEnabled: user.twoFactorEnabled !== false,
      createdAt: user.createdAt as string,
    };
  } catch {
    return null;
  }
}

/**
 * Create the Set-Cookie header string for the auth token.
 */
export function makeAuthCookieHeader(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

/**
 * Create the Set-Cookie header string to clear the auth token.
 */
export function clearAuthCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
