// ============================================
// COSMEON FS-LITE — Engine Barrel Export
// ============================================

// ── Types ─────────────────────────────────────
export type {
  FSFile,
  FSChunk,
  FSNode,
  FSLogEntry,
  FSConfig,
  NodeStatus,
  DistributionStrategy,
  ChunkingStrategy,
  LatencyMode,
  StorageMode,
  LogEventType,
  IntegrityReport,
  RebalanceReport,
  CacheStats,
  SystemStats,
  UploadResult,
} from "./types";

export { DEFAULT_CONFIG } from "./types";

// ── Database ──────────────────────────────────
export { connectDB, isDBConnected, FileModel, NodeModel } from "./db";

// ── Core Modules ──────────────────────────────
export {
  splitFile,
  splitFileFixed,
  splitFileCDC,
  computeFileChecksum,
  reassembleFile,
  extractChunkData,
} from "./chunker";

export {
  computeHash,
  verifyChunk,
  verifyFile,
  scanAllFiles,
  startIntegrityScanner,
  stopIntegrityScanner,
} from "./integrity";

export {
  initializeNodes,
  createNode,
  setNodeStatus,
  getNodes,
  getOnlineNodes,
  getNode,
  updateNodeUsage,
  hasCapacity,
} from "./node-manager";

export {
  initMetadataStore,
  addFile,
  getFile,
  listFiles,
  deleteFile,
  updateFileChunks,
  getFilesOnNode,
} from "./metadata-store";

export { distributeChunks } from "./distributor";
export { replicateChunks, replicateChunkToNode } from "./replicator";
export {
  rebalanceOnFailure,
  rebalanceOnRecovery,
  type RebalanceProgressCallback,
} from "./rebalancer";

// ── Latency Injector ─────────────────────────────────
export { simulateLatency } from "./simulate-latency";

// ── Cache ─────────────────────────────────────
export { chunkCache } from "./cache";

// ── Storage Client ────────────────────────────
export { storageClient } from "./storage-client";

// ── Logger ────────────────────────────────────
export { fsLogger } from "./logger";

// ── Docker Control ────────────────────────────
export {
  stopNodeContainer,
  startNodeContainer,
  isNodeContainerRunning,
  isDockerMode,
} from "./docker-control";

// ── Fault Tolerance ──────────────────────────
export {
  computeFaultToleranceScore,
  type FaultToleranceResult,
  type FaultToleranceBreakdown,
} from "./fault-tolerance";

// ── Erasure Coding ───────────────────────────
export {
  isErasureCodingEnabled,
  setErasureCodingEnabled,
  getErasureConfig,
  encodeParityShards,
  decodeDataShards,
  getErasureGroups,
  createParityChunkMetadata,
  type ErasureGroup,
} from "./erasure-coding";

// ── Merkle Tree ──────────────────────────────
export {
  buildMerkleTree,
  verifyMerkleRoot,
  findCorruptedChunks,
  type MerkleTraversalStep,
} from "./merkle-tree";

// ── Initialization ────────────────────────────
import { connectDB } from "./db";
import { initializeNodes } from "./node-manager";
import { initMetadataStore } from "./metadata-store";
import { fsLogger } from "./logger";
import { startIntegrityScanner } from "./integrity";

let engineInitialized = false;

/**
 * Initialize the FS-Lite engine.
 * Connects to MongoDB, creates default nodes, loads metadata,
 * and starts the background integrity scanner.
 */
export async function initEngine(): Promise<void> {
  if (engineInitialized) return;

  try {
    await connectDB();
  } catch (error) {
    console.warn("[FS-LITE] Running without MongoDB persistence:", error);
  }

  await initializeNodes();
  await initMetadataStore();
  await fsLogger.init();
  startIntegrityScanner();
  engineInitialized = true;

  console.log("[FS-LITE] Engine initialized");
}
