// ============================================
// Unit Tests — Erasure Coding
// ============================================

import { describe, it, expect } from "bun:test";
import {
  encodeParityShards,
  decodeDataShards,
} from "../../src/lib/fs-lite/erasure-coding";

describe("encodeParityShards", () => {
  it("generates 2 parity shards from 3 data shards", () => {
    const data = [
      Buffer.from("chunk-zero-data!"),
      Buffer.from("chunk-one--data!"),
      Buffer.from("chunk-two--data!"),
    ];
    const parity = encodeParityShards(data);

    expect(parity.length).toBe(2); // m=2
    expect(parity[0].length).toBeGreaterThan(0);
    expect(parity[1].length).toBeGreaterThan(0);
  });

  it("produces deterministic parity", () => {
    const data = [Buffer.from("aaa"), Buffer.from("bbb"), Buffer.from("ccc")];
    const p1 = encodeParityShards(data);
    const p2 = encodeParityShards(data);

    expect(Buffer.compare(p1[0], p2[0])).toBe(0);
    expect(Buffer.compare(p1[1], p2[1])).toBe(0);
  });

  it("handles buffers of different lengths", () => {
    const data = [
      Buffer.from("short"),
      Buffer.from("a medium length buffer"),
      Buffer.from("x"),
    ];
    const parity = encodeParityShards(data);
    expect(parity.length).toBe(2);
    // All parity shards should be padded to max length
    expect(parity[0].length).toBe(22); // length of longest
  });
});

describe("decodeDataShards", () => {
  it("recovers 1 missing shard using P1", () => {
    const original = [
      Buffer.from("aaaa"),
      Buffer.from("bbbb"),
      Buffer.from("cccc"),
    ];
    const parity = encodeParityShards(original);

    // Lose chunk 1
    const shards: (Buffer | null)[] = [original[0], null, original[2]];
    const recovered = decodeDataShards(shards, parity);

    expect(recovered.length).toBe(3);
    expect(Buffer.compare(recovered[1], original[1])).toBe(0);
  });

  it("recovers chunk 0 when missing", () => {
    const original = [
      Buffer.from("first"),
      Buffer.from("secnd"),
      Buffer.from("third"),
    ];
    const parity = encodeParityShards(original);

    const shards: (Buffer | null)[] = [null, original[1], original[2]];
    const recovered = decodeDataShards(shards, parity);

    expect(Buffer.compare(recovered[0], original[0])).toBe(0);
  });

  it("recovers last chunk when missing", () => {
    const original = [
      Buffer.from("1111"),
      Buffer.from("2222"),
      Buffer.from("3333"),
    ];
    const parity = encodeParityShards(original);

    const shards: (Buffer | null)[] = [original[0], original[1], null];
    const recovered = decodeDataShards(shards, parity);

    expect(Buffer.compare(recovered[2], original[2])).toBe(0);
  });

  it("returns all shards when none are missing", () => {
    const original = [Buffer.from("aa"), Buffer.from("bb"), Buffer.from("cc")];
    const parity = encodeParityShards(original);
    const recovered = decodeDataShards(original, parity);

    expect(recovered.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(Buffer.compare(recovered[i], original[i])).toBe(0);
    }
  });
});
