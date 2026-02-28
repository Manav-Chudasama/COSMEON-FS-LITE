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
  simulateLatency,
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
export { simulateLatency as injectLatency } from "./simulate-latency";

// ── Latency Injector ─────────────────────────────────
export { simulateLatency as injectLatency } from "./simulate-latency";

// ── Cache ─────────────────────────────────────
export { chunkCache } from "./cache";

// ── Logger ────────────────────────────────────
export { fsLogger } from "./logger";

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
