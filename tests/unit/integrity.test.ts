// ============================================
// Unit Tests — Integrity (Hash & Verify)
// ============================================

import { describe, it, expect } from "bun:test";
import { computeHash, verifyChunk } from "../../src/lib/fs-lite/integrity";

describe("computeHash", () => {
  it("returns a 64-char hex string (SHA-256)", () => {
    const hash = computeHash(Buffer.from("hello world"));
    expect(hash.length).toBe(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });

  it("produces consistent output", () => {
    const buf = Buffer.from("test data");
    expect(computeHash(buf)).toBe(computeHash(buf));
  });

  it("produces different hashes for different data", () => {
    const h1 = computeHash(Buffer.from("data-a"));
    const h2 = computeHash(Buffer.from("data-b"));
    expect(h1).not.toBe(h2);
  });

  it("handles empty buffer", () => {
    const hash = computeHash(Buffer.alloc(0));
    expect(hash.length).toBe(64);
  });
});

describe("verifyChunk", () => {
  it("passes for matching data", () => {
    const data = Buffer.from("my chunk data");
    const hash = computeHash(data);
    expect(verifyChunk(data, hash)).toBe(true);
  });

  it("fails for tampered data", () => {
    const original = Buffer.from("original data");
    const hash = computeHash(original);
    const tampered = Buffer.from("tampered data");
    expect(verifyChunk(tampered, hash)).toBe(false);
  });

  it("fails for truncated data", () => {
    const full = Buffer.from("full content here");
    const hash = computeHash(full);
    const partial = Buffer.from("full");
    expect(verifyChunk(partial, hash)).toBe(false);
  });
});
