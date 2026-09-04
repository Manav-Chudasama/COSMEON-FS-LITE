// ============================================
// COSMEON FS-LITE — AES-256-GCM File Encryption
// ============================================

import crypto from "node:crypto";
import type { EncryptionMeta } from "./types";

// ── Master Key Derivation ───────────────────────────────

/**
 * Derive a 256-bit master key from the environment secret using HKDF.
 * Falls back to AUTH_SECRET if ENCRYPTION_MASTER_KEY is not set.
 */
function getMasterKey(): Buffer {
  const secret =
    process.env.ENCRYPTION_MASTER_KEY || process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error(
      "[FS-LITE] ENCRYPTION_MASTER_KEY or AUTH_SECRET must be set for file encryption",
    );
  }

  // Derive a fixed 256-bit key via HKDF (SHA-256)
  return crypto.hkdfSync(
    "sha256",
    secret,
    "cosmeon-fs-lite-encryption-salt", // static salt
    "cosmeon-fs-lite-dek-wrapping", // info/context
    32, // 256 bits
  ) as unknown as Buffer;
}

// ── Key Wrapping (AES-256-KW via AES-256-ECB + manual padding) ──

/**
 * Wrap (encrypt) a Data Encryption Key using the master key.
 * Uses AES-256-GCM for key wrapping to keep things consistent.
 * Returns base64-encoded wrapped key (IV + ciphertext + authTag).
 */
function wrapKey(dek: Buffer): string {
  const mk = getMasterKey();
  const wrapIv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", mk, wrapIv);
  const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Pack: [12-byte IV][16-byte tag][encrypted DEK]
  return Buffer.concat([wrapIv, tag, encrypted]).toString("base64");
}

/**
 * Unwrap (decrypt) a Data Encryption Key using the master key.
 */
function unwrapKey(envelope: string): Buffer {
  const mk = getMasterKey();
  const packed = Buffer.from(envelope, "base64");

  const wrapIv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", mk, wrapIv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// ── File Encryption ─────────────────────────────────────

export interface EncryptResult {
  /** Ciphertext buffer (to be chunked and distributed) */
  ciphertext: Buffer;
  /** Encryption metadata to store alongside the file document */
  meta: EncryptionMeta;
}

/**
 * Encrypt a file buffer using AES-256-GCM.
 *
 * - Generates a unique 256-bit DEK and 96-bit IV per file.
 * - Wraps the DEK under the master key for safe storage.
 * - Computes an original plaintext checksum for post-decryption verification.
 *
 * Works on arbitrary binary data (images, video, audio, etc.).
 */
export function encryptFileBuffer(buffer: Buffer): EncryptResult {
  // Generate per-file DEK (32 bytes) and IV (12 bytes)
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // Compute plaintext checksum before encryption
  const originalChecksum = crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");

  // Encrypt
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes

  // Wrap the DEK
  const keyEnvelope = wrapKey(dek);

  return {
    ciphertext,
    meta: {
      algorithm: "aes-256-gcm",
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
      keyEnvelope,
      originalChecksum,
    },
  };
}

// ── File Decryption ─────────────────────────────────────

/**
 * Decrypt a file buffer using AES-256-GCM.
 *
 * - Unwraps the DEK from the key envelope.
 * - Decrypts using the stored IV and verifies the authentication tag.
 * - Validates the decrypted plaintext against the original checksum.
 *
 * @throws Error if auth tag verification fails (tampered ciphertext).
 * @throws Error if post-decryption checksum does not match.
 */
export function decryptFileBuffer(
  ciphertext: Buffer,
  meta: EncryptionMeta,
): Buffer {
  // Unwrap the DEK
  const dek = unwrapKey(meta.keyEnvelope);

  // Reconstruct IV and auth tag
  const iv = Buffer.from(meta.iv, "hex");
  const authTag = Buffer.from(meta.authTag, "hex");

  // Decrypt + authenticate
  const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAuthTag(authTag);

  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new Error(
      `[FS-LITE] Decryption failed — authentication tag verification failed. Data may be tampered. ${error instanceof Error ? error.message : ""}`,
    );
  }

  // Verify plaintext integrity
  const decryptedChecksum = crypto
    .createHash("sha256")
    .update(plaintext)
    .digest("hex");

  if (decryptedChecksum !== meta.originalChecksum) {
    throw new Error(
      `[FS-LITE] Post-decryption checksum mismatch. Expected ${meta.originalChecksum.slice(0, 12)}..., got ${decryptedChecksum.slice(0, 12)}...`,
    );
  }

  return plaintext;
}
