// ============================================
// COSMEON FS-LITE — JWT Signing & Verification
// ============================================

import { SignJWT, jwtVerify } from "jose";
import type { AuthTokenPayload } from "@/lib/fs-lite/types";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ||
    "cosmeon-fs-lite-super-secret-jwt-key-change-in-production",
);

const ALGORITHM = "HS256";
const EXPIRY = "7d";

/**
 * Sign a JWT token with the user payload.
 */
export async function signAuthToken(
  payload: AuthTokenPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(SECRET);
}

/**
 * Verify a JWT token and return the decoded payload.
 * Returns null if the token is invalid or expired.
 */
export async function verifyAuthToken(
  token: string,
): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, {
      algorithms: [ALGORITHM],
    });
    return payload as unknown as AuthTokenPayload;
  } catch {
    return null;
  }
}
