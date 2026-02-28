// ============================================
// Unit Tests — Merkle Tree
// ============================================

import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  buildMerkleTree,
  findCorruptedChunks,
  verifyMerkleRoot,
} from "../../src/lib/fs-lite/merkle-tree";

/** Generate a deterministic hash string for test data. */
function testHash(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("buildMerkleTree", () => {
  it("builds a tree from 4 chunk hashes", () => {
    const hashes = [
      testHash("c0"),
      testHash("c1"),
      testHash("c2"),
      testHash("c3"),
    ];
    const { root, tree, leafCount, depth } = buildMerkleTree(hashes);

    expect(root).toBeTruthy();
    expect(root.length).toBe(64); // SHA-256 hex
    expect(leafCount).toBe(4);
    expect(depth).toBeGreaterThan(1);
    expect(tree[1]).toBe(root); // index 1 = root
  });

  it("pads to next power of 2 for non-power-of-2 counts", () => {
    const hashes = [testHash("a"), testHash("b"), testHash("c")];
    const { leafCount } = buildMerkleTree(hashes);
    expect(leafCount).toBe(4);
  });

  it("handles single chunk", () => {
    const hashes = [testHash("only")];
    const { root, leafCount } = buildMerkleTree(hashes);
    expect(root).toBeTruthy();
    expect(leafCount).toBe(1);
  });

  it("returns empty for no chunks", () => {
    const { root, tree, leafCount } = buildMerkleTree([]);
    expect(root).toBe("");
    expect(tree).toEqual([]);
    expect(leafCount).toBe(0);
  });

  it("produces deterministic output", () => {
    const hashes = [testHash("x"), testHash("y")];
    const r1 = buildMerkleTree(hashes);
    const r2 = buildMerkleTree(hashes);
    expect(r1.root).toBe(r2.root);
  });
});

describe("verifyMerkleRoot", () => {
  it("returns true for unchanged hashes", () => {
    const hashes = [testHash("a"), testHash("b"), testHash("c"), testHash("d")];
    const { root } = buildMerkleTree(hashes);
    expect(verifyMerkleRoot(root, hashes)).toBe(true);
  });

  it("returns false when one hash changes", () => {
    const hashes = [testHash("a"), testHash("b"), testHash("c"), testHash("d")];
    const { root } = buildMerkleTree(hashes);
    const corrupted = [
      testHash("a"),
      testHash("CORRUPTED"),
      testHash("c"),
      testHash("d"),
    ];
    expect(verifyMerkleRoot(root, corrupted)).toBe(false);
  });

  it("returns false when all hashes change", () => {
    const hashes = [testHash("a"), testHash("b")];
    const { root } = buildMerkleTree(hashes);
    expect(verifyMerkleRoot(root, [testHash("x"), testHash("y")])).toBe(false);
  });
});

describe("findCorruptedChunks", () => {
  it("finds a single corrupted chunk", () => {
    const original = [
      testHash("a"),
      testHash("b"),
      testHash("c"),
      testHash("d"),
    ];
    const { tree } = buildMerkleTree(original);

    const corrupted = [
      testHash("a"),
      testHash("b"),
      testHash("CORRUPT"),
      testHash("d"),
    ];
    const { corruptedIndices, steps } = findCorruptedChunks(tree, corrupted, 4);

    expect(corruptedIndices).toEqual([2]);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0].level).toBe(0); // starts at root
  });

  it("finds multiple corrupted chunks", () => {
    const original = [
      testHash("a"),
      testHash("b"),
      testHash("c"),
      testHash("d"),
    ];
    const { tree } = buildMerkleTree(original);

    const corrupted = [
      testHash("X"),
      testHash("b"),
      testHash("c"),
      testHash("Y"),
    ];
    const { corruptedIndices } = findCorruptedChunks(tree, corrupted, 4);

    expect(corruptedIndices).toContain(0);
    expect(corruptedIndices).toContain(3);
  });

  it("returns empty when no corruption", () => {
    const hashes = [testHash("a"), testHash("b")];
    const { tree } = buildMerkleTree(hashes);

    const { corruptedIndices, steps } = findCorruptedChunks(tree, hashes, 2);
    expect(corruptedIndices).toEqual([]);
    // Root matches, so only root step
    expect(steps.every((s) => s.match)).toBe(true);
  });

  it("generates traversal steps for UI streaming", () => {
    const original = [
      testHash("a"),
      testHash("b"),
      testHash("c"),
      testHash("d"),
    ];
    const { tree } = buildMerkleTree(original);

    const corrupted = [
      testHash("a"),
      testHash("CORRUPT"),
      testHash("c"),
      testHash("d"),
    ];
    const { steps } = findCorruptedChunks(tree, corrupted, 4);

    // Should have steps with level, depth, side, match fields
    for (const step of steps) {
      expect(step).toHaveProperty("level");
      expect(step).toHaveProperty("depth");
      expect(step).toHaveProperty("side");
      expect(step).toHaveProperty("match");
      expect(step).toHaveProperty("message");
      expect(step).toHaveProperty("chunkRange");
    }
  });
});
