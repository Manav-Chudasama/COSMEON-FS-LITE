// ============================================
// Unit Tests — Erasure Coding
// ============================================

import { describe, expect, it } from "bun:test";
import {
  decodeDataShards,
  encodeParityShards,
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

  it("successfully decrypts an erasure-coded encrypted file when parity chunks are excluded", () => {
    process.env.ENCRYPTION_MASTER_KEY = "test-encryption-key-for-cosmeon-tests";
    const { encryptFileBuffer, decryptFileBuffer } = require("../../src/lib/fs-lite/crypto");
    const { reassembleFile } = require("../../src/lib/fs-lite/chunker");

    const plainText = Buffer.from("Cosmeon FS-Lite orbital distributed storage system secret payload!");
    const { ciphertext, meta } = encryptFileBuffer(plainText);

    // Split ciphertext into 3 data chunks
    const c1 = ciphertext.subarray(0, 20);
    const c2 = ciphertext.subarray(20, 40);
    const c3 = ciphertext.subarray(40);
    const dataShards = [c1, c2, c3];

    // Generate parity shards from ciphertext
    const parityShards = encodeParityShards(dataShards);

    // Simulated chunk list containing BOTH data and parity chunks
    const chunks = [
      { index: 0, isParity: false, buffer: c1 },
      { index: 1, isParity: false, buffer: c2 },
      { index: 2, isParity: false, buffer: c3 },
      { index: -1, isParity: true, buffer: parityShards[0] },
      { index: -2, isParity: true, buffer: parityShards[1] },
    ];

    // Reassembling ONLY non-parity chunks
    const dataChunksOnly = chunks.filter((c) => !c.isParity).sort((a, b) => a.index - b.index);
    const reassembled = reassembleFile(dataChunksOnly.map((c) => c.buffer));

    // Decryption must succeed without tag verification error
    const decrypted = decryptFileBuffer(reassembled, meta);
    expect(decrypted.toString("utf8")).toBe(plainText.toString("utf8"));
  });

  it("recovers missing data shard from parity during simulated node failure and decrypts successfully", () => {
    const { encryptFileBuffer, decryptFileBuffer } = require("../../src/lib/fs-lite/crypto");
    const { reassembleFile } = require("../../src/lib/fs-lite/chunker");

    const plainText = Buffer.from("Mission Critical Satellite Orbit Telemetry Stream 2026");
    const { ciphertext, meta } = encryptFileBuffer(plainText);

    const c1 = ciphertext.subarray(0, 18);
    const c2 = ciphertext.subarray(18, 36);
    const c3 = ciphertext.subarray(36);
    const originalShards = [c1, c2, c3];
    const parity = encodeParityShards(originalShards);

    // Simulate node 2 offline: c2 is missing
    const availableShards: (Buffer | null)[] = [c1, null, c3];
    const recovered = decodeDataShards(availableShards, parity);

    expect(Buffer.compare(recovered[1].subarray(0, c2.length), c2)).toBe(0);

    // Reassemble with the recovered shard
    const fullRecovered = reassembleFile([
      c1,
      recovered[1].subarray(0, c2.length),
      c3,
    ]);

    const decrypted = decryptFileBuffer(fullRecovered, meta);
    expect(decrypted.toString("utf8")).toBe(plainText.toString("utf8"));
  });
});
