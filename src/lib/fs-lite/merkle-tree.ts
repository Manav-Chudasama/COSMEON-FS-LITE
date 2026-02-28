// ============================================
// COSMEON FS-LITE — Merkle Tree Integrity
// ============================================
//
// Binary hash tree for O(log n) corruption detection.
//
// Tree layout (stored as flat array, 1-indexed):
//   Index 1       = root
//   Index 2i      = left child of i
//   Index 2i + 1  = right child of i
//   Leaves start at index n (where n = next power of 2 >= chunk count)
//
// Each node = SHA-256( leftChild || rightChild )
// Leaf node = chunk hash (SHA-256 of chunk data)
// ============================================

import { createHash } from "node:crypto";

// ── Build ──

/**
 * Hash two child hashes together to form a parent node.
 */
function hashPair(left: string, right: string): string {
  return createHash("sha256")
    .update(left + right)
    .digest("hex");
}

/**
 * Next power of 2 >= n.
 */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Build a Merkle tree from chunk hashes.
 *
 * Returns:
 * - `root`: the root hash (single integrity fingerprint for the whole file)
 * - `tree`: flat array representation (1-indexed, index 0 unused)
 * - `leafCount`: number of leaf slots (padded to power of 2)
 *
 * Empty hash slots (when chunk count isn't a power of 2) are filled with
 * a zeroed hash so the tree is always complete.
 */
export function buildMerkleTree(chunkHashes: string[]): {
  root: string;
  tree: string[];
  leafCount: number;
  depth: number;
} {
  const n = chunkHashes.length;
  if (n === 0) {
    return { root: "", tree: [], leafCount: 0, depth: 0 };
  }

  const leafCount = nextPow2(n);
  const treeSize = 2 * leafCount; // 1-indexed, so we need 2*leafCount slots
  const tree: string[] = new Array(treeSize).fill("");

  // Fill leaves (starting at index leafCount)
  const emptyHash = createHash("sha256").update("EMPTY").digest("hex");
  for (let i = 0; i < leafCount; i++) {
    tree[leafCount + i] = i < n ? chunkHashes[i] : emptyHash;
  }

  // Build tree bottom-up
  for (let i = leafCount - 1; i >= 1; i--) {
    tree[i] = hashPair(tree[2 * i], tree[2 * i + 1]);
  }

  const depth = Math.ceil(Math.log2(leafCount)) + 1;

  return {
    root: tree[1],
    tree,
    leafCount,
    depth,
  };
}

// ── Verify ──

/**
 * Quick root-level check: does the stored root match a freshly computed one?
 */
export function verifyMerkleRoot(
  storedRoot: string,
  currentChunkHashes: string[],
): boolean {
  const { root } = buildMerkleTree(currentChunkHashes);
  return root === storedRoot;
}

// ── Find Corrupted Chunks (O(log n) descent) ──

export interface MerkleTraversalStep {
  level: number;
  depth: number;
  nodeIndex: number;
  side: "root" | "left" | "right";
  match: boolean;
  /** Range of chunk indices covered by this subtree */
  chunkRange: [number, number];
  message: string;
}

/**
 * Walk the Merkle tree to find corrupted chunks.
 *
 * Yields traversal steps for streaming to the UI.
 * Only descends into subtrees whose hashes don't match —
 * healthy subtrees are skipped entirely (O(log n)).
 */
export function findCorruptedChunks(
  storedTree: string[],
  currentChunkHashes: string[],
  totalRealChunks: number,
): { steps: MerkleTraversalStep[]; corruptedIndices: number[] } {
  const { tree: currentTree, leafCount } = buildMerkleTree(currentChunkHashes);

  const steps: MerkleTraversalStep[] = [];
  const corruptedIndices: number[] = [];
  const depth = Math.ceil(Math.log2(leafCount)) + 1;

  // BFS / recursive descent
  function descend(
    nodeIndex: number,
    level: number,
    rangeStart: number,
    rangeEnd: number,
  ) {
    const side: "root" | "left" | "right" =
      nodeIndex === 1 ? "root" : nodeIndex % 2 === 0 ? "left" : "right";

    const storedHash = storedTree[nodeIndex] || "";
    const currentHash = currentTree[nodeIndex] || "";
    const match = storedHash === currentHash;

    // Clamp range to real chunk count
    const clampedEnd = Math.min(rangeEnd, totalRealChunks - 1);

    steps.push({
      level,
      depth,
      nodeIndex,
      side,
      match,
      chunkRange: [rangeStart, clampedEnd],
      message: match
        ? `Level ${level}: Chunks ${rangeStart}–${clampedEnd} ✓ intact`
        : nodeIndex >= leafCount
          ? `Level ${level}: Chunk #${rangeStart} ✗ CORRUPTED`
          : `Level ${level}: Chunks ${rangeStart}–${clampedEnd} ✗ mismatch — descending...`,
    });

    if (match) return; // Subtree healthy — skip

    // Leaf node = corrupted chunk found
    if (nodeIndex >= leafCount) {
      const chunkIdx = nodeIndex - leafCount;
      if (chunkIdx < totalRealChunks) {
        corruptedIndices.push(chunkIdx);
      }
      return;
    }

    // Recurse into children
    const mid = Math.floor((rangeStart + rangeEnd) / 2);
    descend(2 * nodeIndex, level + 1, rangeStart, mid);
    descend(2 * nodeIndex + 1, level + 1, mid + 1, rangeEnd);
  }

  descend(1, 0, 0, leafCount - 1);

  return { steps, corruptedIndices };
}

// ── Serialization helpers ──

/**
 * Serialize tree for JSON storage (just the string array).
 */
export function serializeMerkleTree(tree: string[]): string[] {
  return tree;
}

/**
 * Deserialize tree from stored JSON.
 */
export function deserializeMerkleTree(stored: string[]): string[] {
  return stored;
}
