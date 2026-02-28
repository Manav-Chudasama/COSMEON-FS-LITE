// ============================================
// Temporary Download Store
// Holds pre-assembled file buffers keyed by one-time download tokens.
// Tokens auto-expire after 60 seconds.
// ============================================

interface PendingDownload {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  expiresAt: number;
}

const store = new Map<string, PendingDownload>();

/** Store a pre-assembled download and return the token. */
export function storeDownload(
  token: string,
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): void {
  store.set(token, {
    buffer,
    mimeType,
    fileName,
    expiresAt: Date.now() + 60_000, // 60 second TTL
  });
}

/** Retrieve and consume a pending download (one-time use). */
export function consumeDownload(token: string): PendingDownload | null {
  const entry = store.get(token);
  if (!entry) return null;

  store.delete(token);

  if (Date.now() > entry.expiresAt) return null;

  return entry;
}

// Periodic cleanup of expired tokens (every 30 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of store) {
    if (now > entry.expiresAt) {
      store.delete(token);
    }
  }
}, 30_000);
