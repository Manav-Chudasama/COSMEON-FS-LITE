// ============================================
// COSMEON FS-LITE — Core Type Definitions
// ============================================

/** Status of a satellite node */
export type NodeStatus = "online" | "offline" | "degraded";

/** Distribution strategy for chunk assignment */
export type DistributionStrategy = "round-robin" | "weighted" | "crush";

/** Types of events logged by the system */
export type LogEventType =
  | "FILE_UPLOAD"
  | "FILE_DOWNLOAD"
  | "FILE_DELETE"
  | "CHUNK_DISTRIBUTE"
  | "CHUNK_REPLICATE"
  | "NODE_CREATE"
  | "NODE_FAILURE"
  | "NODE_RECOVERY"
  | "NODE_DEGRADED"
  | "REBALANCE"
  | "INTEGRITY_CHECK"
  | "INTEGRITY_PASS"
  | "INTEGRITY_FAIL"
  | "INTEGRITY_ALERT"
  | "CACHE_HIT"
  | "CACHE_MISS"
  | "CACHE_EVICT"
  | "ERASURE_ENCODE"
  | "ERASURE_DECODE";

/** Chunking strategy */
export type ChunkingStrategy = "fixed" | "cdc";

/** Latency simulation mode */
export type LatencyMode = "default" | "high";

/** Storage mode: local disk or Docker containers */
export type StorageMode = "local" | "docker";

/** Configuration for the FS-Lite engine */
export interface FSConfig {
  chunkSizeBytes: number;
  replicationFactor: number;
  defaultNodeCount: number;
  cacheMaxSizeBytes: number;
  maxLogEntries: number;
  dataDir: string;
  distributionStrategy: DistributionStrategy;
  integrityScanIntervalMs: number;
  chunking: {
    strategy: ChunkingStrategy;
    minSize: number;
    avgSize: number;
    maxSize: number;
    windowSize: number;
    maskBits: number;
  };
  latency: {
    mode: LatencyMode;
    /** Artificial delay per chunk in high-latency mode (ms) */
    highDelayMs: number;
  };
  /** Storage mode — local disk or Docker containers */
  storageMode: StorageMode;
  /** Erasure coding configuration */
  erasureCoding: {
    enabled: boolean;
    /** Number of data shards (k) */
    dataShards: number;
    /** Number of parity shards (m) */
    parityShards: number;
  };
}

/** Represents a single chunk of a file */
export interface FSChunk {
  chunkId: string;
  fileId: string;
  index: number;
  /** Byte offset of this chunk in the original file */
  offset: number;
  size: number;
  hash: string;
  nodeId: string;
  /** Replica locations (nodeIds where copies exist) */
  replicas: string[];
  /** Whether this is a parity chunk (erasure coding) */
  isParity?: boolean;
  /** Erasure group ID — chunks in the same group can recover each other */
  groupId?: string;
  /** Index within the erasure group (0..k-1 = data, k..k+m-1 = parity) */
  groupIndex?: number;
}

/** Represents a file stored in the system */
export interface FSFile {
  fileId: string;
  originalName: string;
  mimeType: string;
  totalSize: number;
  chunkCount: number;
  chunkSize: number;
  checksum: string;
  uploadedAt: string;
  version: number;
  chunks: FSChunk[];
  /** Whether this file uses erasure coding */
  erasureCoded?: boolean;
  /** Merkle tree root hash (single integrity fingerprint) */
  merkleRoot?: string;
  /** Serialized Merkle tree (flat array, 1-indexed) */
  merkleTree?: string[];
}

/** Represents a satellite node */
export interface FSNode {
  nodeId: string;
  name: string;
  status: NodeStatus;
  createdAt: string;
  /** Rack / failure-domain identifier used by CRUSH placement */
  rackId?: string;
  /** Max storage capacity in bytes */
  capacityBytes: number;
  /** Currently used storage in bytes */
  usedBytes: number;
  /** Number of chunks stored */
  chunkCount: number;
  /** Simulated latency in milliseconds */
  latencyMs: number;
  /** Docker container host (docker mode only) */
  host?: string;
  /** Docker container port (docker mode only) */
  port?: number;
}

/** A single log entry */
export interface FSLogEntry {
  id: string;
  timestamp: string;
  type: LogEventType;
  message: string;
  metadata?: Record<string, unknown>;
}

/** Result of an integrity check */
export interface IntegrityReport {
  fileId: string;
  fileName: string;
  totalChunks: number;
  checkedChunks: number;
  passedChunks: number;
  failedChunks: number;
  results: {
    chunkId: string;
    index: number;
    nodeId: string;
    expectedHash: string;
    actualHash: string | null;
    passed: boolean;
    error?: string;
  }[];
  /** Whether Merkle tree verification was used */
  merkleVerified?: boolean;
  /** Indices of chunks identified as corrupted via Merkle descent */
  corruptedIndices?: number[];
}

/** Result of a rebalancing operation */
export interface RebalanceReport {
  reason: "node_failure" | "node_recovery";
  affectedNodeId: string;
  affectedNodeName?: string;
  totalAffectedChunks?: number;
  movedChunks: {
    chunkId: string;
    fromNodeId: string;
    fromNodeName: string;
    toNodeId: string;
    toNodeName: string;
    chunkSize: number;
    action: "promoted" | "re-replicated" | "migrated";
  }[];
  timestamp: string;
}

/** Stats for the cache */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  currentSizeBytes: number;
  maxSizeBytes: number;
  itemCount: number;
  hitRate: number;
}

/** Overall system statistics */
export interface SystemStats {
  totalFiles: number;
  totalChunks: number;
  totalNodes: number;
  onlineNodes: number;
  offlineNodes: number;
  degradedNodes: number;
  totalStorageBytes: number;
  usedStorageBytes: number;
  cacheStats: CacheStats;
}

/** Upload result returned to the client */
export interface UploadResult {
  file: FSFile;
  distribution: { chunkId: string; nodeId: string; nodeName: string }[];
}

/** Default configuration */
export const DEFAULT_CONFIG: FSConfig = {
  chunkSizeBytes: 256 * 1024, // 256 KB
  replicationFactor: 2,
  defaultNodeCount: 5,
  cacheMaxSizeBytes: 20 * 1024 * 1024, // 20 MB
  maxLogEntries: 500,
  dataDir: ".fs-lite-data",
  distributionStrategy: "round-robin",
  integrityScanIntervalMs: 60 * 1000, // 60 seconds
  chunking: {
    strategy: "fixed",
    minSize: 128 * 1024, // 128 KB min
    avgSize: 256 * 1024, // 256 KB target
    maxSize: 512 * 1024, // 512 KB max
    windowSize: 48, // rolling hash window
    maskBits: 18, // ~256 KB average (2^18 = 262144)
  },
  latency: {
    mode: "default" as LatencyMode,
    highDelayMs: 400, // 400 ms per chunk in high-latency mode
  },
  storageMode: "local" as StorageMode,
  erasureCoding: {
    enabled: false,
    dataShards: 3, // k=3
    parityShards: 2, // m=2  →  total = 5 shards per group
  },
};
