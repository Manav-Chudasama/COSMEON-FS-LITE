// ============================================
// COSMEON FS-LITE — Engine Barrel Export
// ============================================

// ── Cache ─────────────────────────────────────
export { chunkCache } from "./cache";
// ── Crypto ────────────────────────────────────
export { decryptFileBuffer, encryptFileBuffer } from "./crypto";
// ── Core Modules ──────────────────────────────
export {
  computeFileChecksum,
  extractChunkData,
  reassembleFile,
  splitFile,
  splitFileCDC,
  splitFileFixed,
} from "./chunker";

// ── Database ──────────────────────────────────────────
export { connectDB, FileModel, isDBConnected, NodeModel, UserModel, OtpModel } from "./db";
export { distributeChunks } from "./distributor";
// ── Docker Control ────────────────────────────
export {
  isDockerMode,
  isNodeContainerRunning,
  startNodeContainer,
  stopNodeContainer,
} from "./docker-control";
// ── Erasure Coding ───────────────────────────
export {
  createParityChunkMetadata,
  decodeDataShards,
  type ErasureGroup,
  encodeParityShards,
  getErasureConfig,
  getErasureGroups,
  isErasureCodingEnabled,
  setErasureCodingEnabled,
} from "./erasure-coding";
// ── Fault Tolerance ──────────────────────────
export {
  computeFaultToleranceScore,
  type FaultToleranceBreakdown,
  type FaultToleranceResult,
} from "./fault-tolerance";
export {
  computeHash,
  scanAllFiles,
  startIntegrityScanner,
  stopIntegrityScanner,
  verifyChunk,
  verifyFile,
} from "./integrity";
// ── Logger ────────────────────────────────────
export { fsLogger } from "./logger";
// ── Merkle Tree ──────────────────────────────
export {
  buildMerkleTree,
  findCorruptedChunks,
  type MerkleTraversalStep,
  verifyMerkleRoot,
} from "./merkle-tree";
export {
  addFile,
  deleteFile,
  getFile,
  getFilesOnNode,
  initMetadataStore,
  listFiles,
  updateFileChunks,
} from "./metadata-store";
export {
  createNode,
  getNode,
  getNodes,
  getOnlineNodes,
  hasCapacity,
  initializeNodes,
  setNodeStatus,
  updateNodeUsage,
} from "./node-manager";
export {
  type RebalanceProgressCallback,
  rebalanceOnFailure,
  rebalanceOnRecovery,
} from "./rebalancer";
export { replicateChunks, replicateChunkToNode } from "./replicator";
// ── Latency Injector ─────────────────────────────────
export { simulateLatency } from "./simulate-latency";
// ── Storage Client ────────────────────────────
export { storageClient } from "./storage-client";
// ── Types ─────────────────────────────────────
export type {
  AuthTokenPayload,
  CacheStats,
  ChunkingStrategy,
  DistributionStrategy,
  EncryptionMeta,
  FSChunk,
  FSConfig,
  FSFile,
  FSLogEntry,
  FSNode,
  IntegrityReport,
  LatencyMode,
  LogEventType,
  NodeStatus,
  OtpType,
  RebalanceReport,
  StorageMode,
  SystemStats,
  UploadResult,
  User,
  UserRole,
  UserSafe,
} from "./types";
export { DEFAULT_CONFIG } from "./types";

// ── Initialization ────────────────────────────
import { connectDB } from "./db";
import { startIntegrityScanner } from "./integrity";
import { fsLogger } from "./logger";
import { initMetadataStore } from "./metadata-store";
import { initializeNodes } from "./node-manager";

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
