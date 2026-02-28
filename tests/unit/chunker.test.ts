// ============================================
// Unit Tests — Chunker
// ============================================

import { describe, expect, it } from "bun:test";
import {
  splitFile,
  splitFileCDC,
  splitFileFixed,
} from "../../src/lib/fs-lite/chunker";

describe("splitFileFixed", () => {
  it("splits buffer into correct number of chunks", () => {
    const buf = Buffer.alloc(1024 * 5); // 5 KB
    const chunks = splitFileFixed(buf, "test-file-id", 1024);

    expect(chunks.length).toBe(5);
    expect(chunks[0].index).toBe(0);
    expect(chunks[4].index).toBe(4);
  });

  it("handles non-even split (last chunk smaller)", () => {
    const buf = Buffer.alloc(2500);
    const chunks = splitFileFixed(buf, "test-id", 1024);

    expect(chunks.length).toBe(3);
    expect(chunks[0].size).toBe(1024);
    expect(chunks[1].size).toBe(1024);
    expect(chunks[2].size).toBe(452); // 2500 - 2048
  });

  it("produces unique chunk IDs", () => {
    const buf = Buffer.alloc(4096);
    const chunks = splitFileFixed(buf, "test-id", 1024);
    const ids = new Set(chunks.map((c) => c.chunkId));
    expect(ids.size).toBe(chunks.length);
  });

  it("generates valid SHA-256 hashes", () => {
    const buf = Buffer.from("test data for hashing");
    const chunks = splitFileFixed(buf, "test-id", 10);

    for (const chunk of chunks) {
      expect(chunk.hash.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(chunk.hash)).toBe(true);
    }
  });

  it("sets correct offsets", () => {
    const buf = Buffer.alloc(3000);
    const chunks = splitFileFixed(buf, "test-id", 1024);

    expect(chunks[0].offset).toBe(0);
    expect(chunks[1].offset).toBe(1024);
    expect(chunks[2].offset).toBe(2048);
  });

  it("handles single chunk file", () => {
    const buf = Buffer.from("small");
    const chunks = splitFileFixed(buf, "test-id", 1024);

    expect(chunks.length).toBe(1);
    expect(chunks[0].size).toBe(5);
    expect(chunks[0].offset).toBe(0);
  });
});

describe("splitFileCDC", () => {
  it("splits buffer into chunks", () => {
    // Create a buffer with some variance to test CDC
    const buf = Buffer.alloc(10000);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
    const chunks = splitFileCDC(buf, "test-cdc");

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.hash.length).toBe(64);
      expect(chunk.size).toBeGreaterThan(0);
    }
  });
});

describe("splitFile", () => {
  it("defaults to fixed strategy", () => {
    const buf = Buffer.alloc(2048);
    const chunks = splitFile(buf, "test-id");
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("supports CDC strategy", () => {
    const buf = Buffer.alloc(5000);
    const chunks = splitFile(buf, "test-id", "cdc");
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("supports fixed strategy explicitly", () => {
    const buf = Buffer.alloc(2048);
    const chunks = splitFile(buf, "test-id", "fixed");
    expect(chunks.length).toBeGreaterThan(0);
  });
});
