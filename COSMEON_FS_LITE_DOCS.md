# COSMEON FS-LITE — Complete Project Documentation

> **COSMEON FS-LITE** is a full-stack, educational distributed file system simulator built with Next.js 16. It demonstrates core distributed storage concepts — chunking, replication, erasure coding, fault tolerance, and integrity verification — in an interactive, real-time dashboard. The system is named after the fictional satellite network "COSMEON ORBIT," reflected in node names like `ORBIT-1` through `ORBIT-5`.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features](#2-features)
3. [Algorithms & Data Structures](#3-algorithms--data-structures)
4. [System Architecture](#4-system-architecture)
5. [Core Modules](#5-core-modules)
6. [API Reference](#6-api-reference)
7. [Storage Modes](#7-storage-modes)
8. [Security Layer](#8-security-layer)
9. [Database Schema](#9-database-schema)
10. [Docker Infrastructure](#10-docker-infrastructure)
11. [Frontend & Dashboard](#11-frontend--dashboard)
12. [Configuration Reference](#12-configuration-reference)
13. [Tech Stack](#13-tech-stack)
14. [Use Cases](#14-use-cases)
15. [Business Model](#15-business-model)
16. [Event System & Observability](#16-event-system--observability)
17. [Testing](#17-testing)
18. [CI/CD Pipeline](#18-cicd-pipeline)
19. [Key Technical Terms Glossary](#19-key-technical-terms-glossary)

---

## 1. Project Overview

**FS-Lite** simulates how a production-grade distributed file system (like HDFS, Ceph, or Amazon S3) works under the hood. It runs entirely in process (no external distributed runtime required) and provides:

- A **Next.js 16 orchestrator** that acts as the master node
- **5 simulated satellite storage nodes** (`ORBIT-1` – `ORBIT-5`) that each store raw binary chunks
- Real-time observability via a **dashboard** with analytics, logs, integrity reports, and node health visualization
- Two storage backends: **local disk** (development) and **Docker containers** (production-like)

The project name **COSMEON** is a fictional satellite network brand, making the storage nodes thematic ("orbit" the cluster).

---

## 2. Features

| #   | Feature                                | Description                                                                                                                                                                  |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **File Upload & Chunking**             | Split uploaded files into binary chunks using fixed-size or content-defined chunking (CDC). Each chunk is hashed with SHA-256 and distributed across nodes.                  |
| 2   | **Chunk Distribution**                 | Assign chunks to storage nodes using one of three pluggable strategies: Round-Robin, Weighted (greedy capacity), or CRUSH (Ceph-inspired rendezvous hashing).                |
| 3   | **Data Replication**                   | Each chunk is replicated to one or more additional nodes based on a configurable replication factor (default: 2). Replicas ensure data availability during node failure.     |
| 4   | **File Download & Reassembly**         | Reconstruct the original file by reading all chunks (ordered by index) from their respective nodes, with LRU cache acceleration for repeated reads.                          |
| 5   | **File Deletion**                      | Remove all chunk data from primary and replica nodes and purge file metadata from the database.                                                                              |
| 6   | **Erasure Coding**                     | Encode data chunks into XOR-based parity shards (k=3 data + m=2 parity by default). Allows recovery of up to 2 simultaneously lost shards without full replication overhead. |
| 7   | **Merkle Tree Integrity**              | Build a binary hash tree over all chunk hashes. O(log n) descent to pinpoint exactly which chunks are corrupted — far more efficient than checking all chunks sequentially.  |
| 8   | **Integrity Verification**             | On-demand and background integrity scanning: reads every chunk, recomputes its SHA-256 hash, and compares against the stored hash.                                           |
| 9   | **Fault Tolerance Score**              | Composite 0–100 score computed from node health, replication factor, rebalancing success rate, and chunk distribution balance. Supports erasure coding mode too.             |
| 10  | **Automatic Rebalancing (Failure)**    | When a node goes offline, the rebalancer promotes existing replicas to primary and re-replicates missing copies to healthy nodes.                                            |
| 11  | **Automatic Rebalancing (Recovery)**   | When an offline node comes back online, excess chunks are migrated from overloaded nodes to re-equalize the cluster.                                                         |
| 12  | **Node Simulation (Failure/Recovery)** | Manually set any node to `online`, `offline`, or `degraded` status via the UI, triggering realistic rebalance workflows.                                                     |
| 13  | **Node Management**                    | Create new satellite nodes dynamically, each with configurable capacity (bytes) and simulated latency (ms).                                                                  |
| 14  | **LRU Chunk Cache**                    | In-memory Least-Recently-Used cache with a configurable max size (default: 20 MB). Tracks hits, misses, evictions, and current item count.                                   |
| 15  | **Latency Simulation**                 | Per-node simulated I/O delay in milliseconds. Two modes: `default` (real node latency) and `high` (configurable, e.g., 400 ms per chunk) for demos.                          |
| 16  | **System-Wide Analytics**              | Live statistics including total files, chunks, storage utilization per node, cache hit rate, online/offline/degraded node counts.                                            |
| 17  | **Event Logging**                      | Structured event log for every system action (upload, download, delete, chunk distribute, replicate, node events, cache events, integrity events, erasure encode/decode).    |
| 18  | **Docker Control**                     | Start and stop specific storage node Docker containers from the frontend UI using the Dockerode API.                                                                         |
| 19  | **Security / Rate Limiting**           | Arcjet-powered protection: token bucket rate limiting per route, bot detection, WAF (Web Application Firewall) shield per endpoint.                                          |
| 20  | **Dual Storage Mode**                  | Seamlessly switch between local disk storage (for development/testing) and HTTP-based Docker container storage (for production demos).                                       |

---

## 3. Algorithms & Data Structures

### 3.1 Fixed-Size Chunking

- **Algorithm**: Divide file buffer into equal-size segments of `chunkSizeBytes` (default: 256 KB).
- **Boundary handling**: If the last segment is smaller than `chunkSizeBytes`, it is emitted as-is.
- **Per-chunk SHA-256**: `createHash("sha256").update(slice).digest("hex")` gives the chunk's hash.
- **Complexity**: O(n) time, O(1) space per chunk.
- **File**: `src/lib/fs-lite/chunker.ts` → `splitFileFixed()`

### 3.2 Content-Defined Chunking (CDC) — Rabin-Inspired Rolling Hash

- **Algorithm**: A polynomial rolling hash slides over the file byte-by-byte. A chunk boundary is declared when the lower `maskBits` bits of the hash equal zero.
- **Rolling hash formula**: `h = (h * 31 + buf[i]) >>> 0` (32-bit unsigned).
- **Constraints**: `[minSize=128KB, avgSize=256KB, maxSize=512KB]` prevent degenerate tiny or huge chunks. `maskBits=18` targets ~256KB average.
- **This is a simplified Rabin fingerprinting variant**: inspired by Rabin polynomial rolling hash but uses a simple polynomial base-31 instead of a true Galois field polynomial.
- **Why CDC over fixed**: CDC produces stable chunk boundaries even when bytes are inserted mid-file (deduplication-friendly).
- **File**: `src/lib/fs-lite/chunker.ts` → `splitFileCDC()`

### 3.3 SHA-256 Hashing

- Used for:
  - **Per-chunk integrity verification**: expected hash stored at upload, recomputed at read time.
  - **File-level checksum**: SHA-256 of the entire buffer stored as `FSFile.checksum`.
  - **Merkle tree nodes**: `SHA-256(leftHash + rightHash)` to combine children.
  - **Parity chunk hashing**: each erasure parity buffer is hashed similarly.
- **Library**: Node.js built-in `node:crypto`.

### 3.4 Round-Robin Distribution

- **Algorithm**: Cycles through nodes sequentially (modulo node count). Skips nodes without sufficient capacity.
- **Fallback**: If no node has capacity, assigns to the first node regardless.
- **Complexity**: O(n × m) where n = chunks, m = nodes.
- **File**: `src/lib/fs-lite/distributor.ts` → `distributeRoundRobin()`

### 3.5 Weighted (Greedy) Distribution

- **Algorithm**: For each chunk, select the node with the highest available free space. Uses a temporary in-memory usage map tracking provisional allocations within the current upload batch.
- **Complexity**: O(n × m) time.
- **File**: `src/lib/fs-lite/distributor.ts` → `distributeWeighted()`

### 3.6 CRUSH — Controlled Replication Under Scalable Hashing

- **Inspired by**: Ceph's CRUSH algorithm.
- **Algorithm**:
  1. For each chunk, score every eligible node using **rendezvous hashing**: `score = hash(fileId:chunkIndex:nodeId)^(1/weight)`.
  2. The node weight is `capacityBytes / totalCapacity` (normalized to [0,1]).
  3. Sort nodes by score descending. Primary = top scorer.
  4. Replicas chosen from next-highest scorers in **different racks** (failure domains) for isolation.
- **Hash function**: `djb2` variant — `h = ((h << 5) + h) ^ charCode` — deterministic, no crypto module needed.
- **Properties**: Deterministic, rack-aware, capacity-weighted, minimal rebalancing on topology changes.
- **File**: `src/lib/fs-lite/distributor.ts` → `distributeCRUSH()`

### 3.7 Merkle Tree (Binary Hash Tree)

- **Structure**: Complete binary tree stored as a flat 1-indexed array. Leaf slots padded to the next power-of-2 using `SHA-256("EMPTY")` for missing leaves.
- **Leaf nodes**: chunk hashes (SHA-256 of raw chunk data).
- **Internal nodes**: `SHA-256(leftChild || rightChild)` concatenated.
- **Root hash** (`merkleRoot`): single fingerprint for the entire file, stored in `FSFile`.
- **Corruption detection**: BFS/recursive descent only into subtrees whose hashes changed — O(log n) to find all corrupted leaves.
- **Traversal step metadata**: emitted in real-time to the UI for visualization.
- **File**: `src/lib/fs-lite/merkle-tree.ts`

### 3.8 Erasure Coding (XOR Parity — Simplified Reed-Solomon-like)

- **Parameters**: `k=3` data shards, `m=2` parity shards (configurable).
- **Encoding**:
  - `P1 = D0 ⊕ D1 ⊕ D2 ⊕ ... ⊕ D(k-1)` (simple XOR of all data shards)
  - `P2 = D0 ⊕ rotate(D1, 1) ⊕ rotate(D2, 2) ⊕ ...` (weighted XOR using cyclic byte rotation for linear independence)
- **Decoding (recovery)**:
  - **1 missing shard**: `D_missing = P1 ⊕ (all other data shards)` — direct XOR recovery.
  - **2 missing shards**: Solve using both P1 and P2 simultaneously via substitution + iterative approximation (3-iteration convergence loop).
- **XOR operation**: `xorBuffers()` zero-pads the shorter buffer.
- **Rotation**: `rotateLeft(buf, shift)` and `rotateRight(buf, shift)` for cyclic byte rotation.
- **Parity chunks** are stored as real `FSChunk` entries with `isParity: true` and a shared `groupId`.
- **File**: `src/lib/fs-lite/erasure-coding.ts`

### 3.9 LRU Cache (Least Recently Used)

- **Data structure**: JavaScript `Map` (insertion-order preserving) used as an ordered list. The first entry is always the least-recently-used.
- **Eviction**: Moves accessed entries to the end on read (delete + re-insert). Evicts from the front when capacity is exceeded.
- **Max size**: 20 MB (byte-accurate tracking via `currentSizeBytes`).
- **Statistics tracked**: hits, misses, evictions, current size, item count, hit rate.
- **File**: `src/lib/fs-lite/cache.ts` → `class LRUCache`

### 3.10 Automatic Rebalancer — Failure Path

- **Trigger**: Node set to `offline`.
- **Algorithm**:
  1. Find all files with chunks on the failed node.
  2. For each affected chunk where the failed node is the **primary**: promote replica[0] to primary, re-replicate to a new target.
  3. For each affected chunk where the failed node is a **replica**: remove it from replica list, re-replicate from primary to a new target if below `replicationFactor - 1`.
  4. `findBestTarget()`: picks eligible node (not already holding this chunk) with the most available free space.
- **File**: `src/lib/fs-lite/rebalancer.ts` → `rebalanceOnFailure()`

### 3.11 Automatic Rebalancer — Recovery Path

- **Trigger**: Node set back to `online`.
- **Algorithm**:
  1. Calculate average chunk count across all online nodes.
  2. Identify overloaded nodes (above average).
  3. Migrate the excess-count chunks from overloaded nodes (replica slots only, safer) to the recovered node until cluster is balanced.
- **File**: `src/lib/fs-lite/rebalancer.ts` → `rebalanceOnRecovery()`

### 3.12 Fault Tolerance Score Algorithm

- **Composite weighted score (0–100)**:
  | Component | Weight | Formula |
  |-----------|--------|---------|
  | **Node Health** | 40% | `(onlineNodes / totalNodes) * 40` |
  | **Replication/Erasure** | 25% | `min(replicationFactor / 3, 1) * 25` or `min(parity/(k+m) / 0.5, 1) * 25` if erasure enabled |
  | **Rebalancing Success** | 20% | `(successfulRebalances / totalRebalances) * 20`; full credit if no rebalances needed |
  | **Distribution Balance** | 15% | `15 * (1 - deviationFactor)` where `deviationFactor = avgDeviation / idealPerNode` |
- **File**: `src/lib/fs-lite/fault-tolerance.ts` → `computeFaultToleranceScore()`

### 3.13 Token Bucket Rate Limiting (Arcjet)

- **Algorithm**: Token bucket refills at a fixed rate per minute. Requests consume tokens. If bucket is empty, requests are rejected (429).
- **Per-endpoint rates**:
  - Upload: 20/min
  - Download: 60/min
  - Read/List: 60/min
  - Delete: 10/min
  - Node mutations: 20/min
- **File**: `src/lib/arcjet.ts`

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BROWSER (Next.js Client)                   │
│  Landing Page | Dashboard | Nodes | Files | Logs | Security     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (Next.js App Router)
┌──────────────────────────▼──────────────────────────────────────┐
│                      ORCHESTRATOR (Next.js Server)              │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  API Routes │  │  FS Engine   │  │   Security (Arcjet)  │  │
│  │  /api/fs/*  │  │  (lib/fs-    │  │  Rate Limit + WAF    │  │
│  │             │  │   lite/)     │  │  + Bot Detection     │  │
│  └──────┬──────┘  └──────┬───────┘  └──────────────────────┘  │
│         │                │                                      │
│  ┌──────▼────────────────▼────────────────────────────────┐    │
│  │               MongoDB (Mongoose ODM)                    │    │
│  │   Files | Nodes | Logs collections                     │    │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP / Filesystem
              ┌────────────┴────────────┐
              │    Storage Backend      │
              ├─────────────────────────┤
              │ LOCAL MODE              │
              │ .fs-lite-data/nodes/    │
              │ {nodeId}/{chunkId}      │
              ├─────────────────────────┤
              │ DOCKER MODE             │
              │ ORBIT-1 (port 4000)     │
              │ ORBIT-2 (port 4000)     │
              │ ORBIT-3 (port 4000)     │
              │ ORBIT-4 (port 4000)     │
              │ ORBIT-5 (port 4000)     │
              │ Each: Bun HTTP server   │
              │       /data/chunks/     │
              └─────────────────────────┘
```

---

## 5. Core Modules

All engine modules live in `src/lib/fs-lite/`:

| Module               | File                  | Responsibility                                                                                   |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| **Types**            | `types.ts`            | All TypeScript interfaces (`FSFile`, `FSChunk`, `FSNode`, `FSConfig`, etc.) and `DEFAULT_CONFIG` |
| **Chunker**          | `chunker.ts`          | Fixed-size and CDC file splitting; SHA-256 hashing; file reassembly                              |
| **Distributor**      | `distributor.ts`      | Round-robin, weighted, and CRUSH chunk placement across nodes                                    |
| **Replicator**       | `replicator.ts`       | Copy a chunk from its primary node to a replica node                                             |
| **Rebalancer**       | `rebalancer.ts`       | Automatic chunk migration on node failure and recovery                                           |
| **Erasure Coding**   | `erasure-coding.ts`   | XOR parity encode/decode; erasure group management; parity chunk metadata                        |
| **Merkle Tree**      | `merkle-tree.ts`      | Build, verify, and traverse Merkle trees; serialize/deserialize                                  |
| **Integrity**        | `integrity.ts`        | Per-file and system-wide chunk hash verification; background scanner                             |
| **Fault Tolerance**  | `fault-tolerance.ts`  | Composite fault tolerance score computation                                                      |
| **Node Manager**     | `node-manager.ts`     | CRUD for satellite nodes; Docker vs. local mode initialization; latency simulation               |
| **Metadata Store**   | `metadata-store.ts`   | In-memory + MongoDB-backed file metadata store                                                   |
| **Storage Client**   | `storage-client.ts`   | Unified chunk I/O abstraction: local filesystem ↔ Docker container HTTP API                      |
| **Cache**            | `cache.ts`            | LRU chunk cache (singleton `chunkCache`)                                                         |
| **DB**               | `db.ts`               | Mongoose connection singleton; `FileModel`, `NodeModel`, `LogModel` schemas                      |
| **Logger**           | `logger.ts`           | In-memory ring-buffer event log with MongoDB persistence; structured event types                 |
| **Download Store**   | `download-store.ts`   | Tracks in-progress download streams (SSE progress)                                               |
| **Docker Control**   | `docker-control.ts`   | Dockerode-based container start/stop for simulating node failures in Docker mode                 |
| **Simulate Latency** | `simulate-latency.ts` | Toggle the global latency mode between `default` and `high`                                      |
| **Index**            | `index.ts`            | Top-level orchestration: uploadFile, downloadFile, deleteFile                                    |

---

## 6. API Reference

All routes are Next.js App Router Route Handlers under `src/app/api/fs/`.

### File Operations

| Method   | Route                       | Description                                                                                                                   |
| -------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/fs/upload`            | Upload a file. Accepts `multipart/form-data`. Chunks, distributes, replicates, and persists the file. Returns `UploadResult`. |
| `GET`    | `/api/fs/files`             | List all uploaded files with metadata.                                                                                        |
| `DELETE` | `/api/fs/files/{fileId}`    | Delete a file and all its chunks from disk and database.                                                                      |
| `GET`    | `/api/fs/download/{fileId}` | Download a file. Reassembles chunks from nodes, streams the binary response. Uses LRU cache.                                  |

### Node Operations

| Method  | Route                    | Description                                                                              |
| ------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `GET`   | `/api/fs/nodes`          | List all nodes with status, capacity, usage, and latency.                                |
| `POST`  | `/api/fs/nodes`          | Create a new storage node (name, capacity, latency).                                     |
| `PATCH` | `/api/fs/nodes/{nodeId}` | Set node status (`online` / `offline` / `degraded`). Triggers rebalancing automatically. |

### Integrity & Erasure

| Method | Route               | Description                                                                                 |
| ------ | ------------------- | ------------------------------------------------------------------------------------------- |
| `POST` | `/api/fs/integrity` | Run integrity check on a specific file. Returns `IntegrityReport` with per-chunk pass/fail. |
| `GET`  | `/api/fs/erasure`   | Get current erasure coding config (enabled, dataShards, parityShards).                      |
| `POST` | `/api/fs/erasure`   | Toggle erasure coding on/off.                                                               |

### Observability & Config

| Method     | Route               | Description                                                                              |
| ---------- | ------------------- | ---------------------------------------------------------------------------------------- |
| `GET`      | `/api/fs/logs`      | Fetch all system log entries.                                                            |
| `GET`      | `/api/fs/stats`     | Get system-wide statistics (`SystemStats`).                                              |
| `GET`      | `/api/fs/analytics` | Get detailed analytics breakdown (node utilization, cache stats, per-node chunk counts). |
| `GET`      | `/api/fs/security`  | Get current rate limit configuration and request metadata.                               |
| `GET/POST` | `/api/fs/latency`   | Get or set global latency simulation mode.                                               |

---

## 7. Storage Modes

### Local Mode (`STORAGE_MODE=local`)

- Default for development.
- Chunks stored as binary files in `.fs-lite-data/nodes/{nodeId}/{chunkId}`.
- Fast, no Docker overhead.
- Node directories auto-created on first write.

### Docker Mode (`STORAGE_MODE=docker`)

- Each node runs as a Docker container (`fs-lite-node-1` … `fs-lite-node-5`).
- The orchestrator talks to each node over HTTP (`http://{host}:{port}/chunk/{chunkId}`).
- Storage paths: Docker named volumes (`/data/chunks/`).
- Node service (`node-service/server.ts`): a tiny Bun HTTP server exposing:
  - `GET /health` — status, chunk count, used bytes, uptime
  - `GET /chunks` — list all stored chunk IDs
  - `PUT /chunk/{id}` — store a binary chunk
  - `GET /chunk/{id}` — retrieve a binary chunk
  - `DELETE /chunk/{id}` — delete a chunk
- The `docker-control.ts` module uses **Dockerode** to start/stop containers directly via the Docker socket (`/var/run/docker.sock`).

### Toggling

Set environment variable `STORAGE_MODE` to `local` or `docker` before starting the orchestrator. The `StorageClient` abstraction routes all I/O accordingly — no other file needs to change.

---

## 8. Security Layer

Powered by **Arcjet** (`@arcjet/next`).

| Scope              | Rules                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| **Upload**         | Token bucket (20 req/min), Bot detection (block all bots), WAF Shield |
| **Download**       | Token bucket (60 req/min), Bot detection                              |
| **Read/List**      | Token bucket (60 req/min)                                             |
| **Delete**         | Token bucket (10 req/min), Bot detection, WAF Shield                  |
| **Node Mutations** | Token bucket (20 req/min), WAF Shield                                 |

- **Characteristic**: Rate limit keys are per source IP (`ip.src`).
- **Mode**: `LIVE` (enforced, rejecting requests). Can be switched to `DRY_RUN`.
- **WAF Shield**: Protects against common web attacks (SQLi, XSS, path traversal, etc.).
- **Bot detection**: Blocks automated clients accessing storage mutation routes.
- **File**: `src/lib/arcjet.ts`

---

## 9. Database Schema

Backed by **MongoDB** via **Mongoose** ODM (singleton connection at `src/lib/fs-lite/db.ts`).

### `files` Collection (`FileModel`)

| Field          | Type                     | Description                      |
| -------------- | ------------------------ | -------------------------------- |
| `fileId`       | String (unique, indexed) | UUID v4 identifier               |
| `originalName` | String                   | Original filename                |
| `mimeType`     | String                   | MIME type                        |
| `totalSize`    | Number                   | Total file size in bytes         |
| `chunkCount`   | Number                   | Number of data chunks            |
| `chunkSize`    | Number                   | The fixed chunk size used        |
| `checksum`     | String                   | SHA-256 of the entire file       |
| `uploadedAt`   | String                   | ISO timestamp                    |
| `version`      | Number                   | File version counter             |
| `chunks`       | Chunk[]                  | Embedded array of chunk metadata |

**Chunk sub-schema** fields: `chunkId`, `fileId`, `index`, `offset`, `size`, `hash`, `nodeId`, `replicas[]`

### `nodes` Collection (`NodeModel`)

| Field           | Type                     | Description                             |
| --------------- | ------------------------ | --------------------------------------- |
| `nodeId`        | String (unique, indexed) | UUID v4 identifier                      |
| `name`          | String                   | Human-readable name (e.g., `ORBIT-1`)   |
| `status`        | Enum                     | `"online"` / `"offline"` / `"degraded"` |
| `rackId`        | String (optional)        | Failure domain identifier for CRUSH     |
| `capacityBytes` | Number                   | Maximum storage capacity                |
| `usedBytes`     | Number                   | Currently used storage                  |
| `chunkCount`    | Number                   | Number of chunks stored                 |
| `latencyMs`     | Number                   | Simulated I/O delay                     |

### `logs` Collection (`LogModel`)

| Field       | Type                     | Description                |
| ----------- | ------------------------ | -------------------------- |
| `id`        | String (unique, indexed) | UUID v4 identifier         |
| `timestamp` | String                   | ISO timestamp              |
| `type`      | String (indexed)         | `LogEventType` enum value  |
| `message`   | String                   | Human-readable log message |
| `metadata`  | Mixed                    | Arbitrary structured data  |

---

## 10. Docker Infrastructure

Defined in `docker-compose.yml`:

| Service             | Image / Build                     | Role                                |
| ------------------- | --------------------------------- | ----------------------------------- |
| `mongo`             | `mongo:7`                         | MongoDB database, persisted volume  |
| `orchestrator`      | `./Dockerfile` (Next.js)          | Dashboard + FS engine orchestrator  |
| `node-1` … `node-5` | `./node-service/Dockerfile` (Bun) | 5 independent chunk storage servers |

### Network

- Custom bridge network `fs-net` — all services communicate by service name (e.g., `mongo`, `node-1`).
- Orchestrator mounts `/var/run/docker.sock` to control containers from within.

### Health Checks

- MongoDB: `mongosh --eval db.adminCommand('ping')`
- Node services: `wget --spider http://localhost:4000/health`
- Orchestrator waits for all 5 nodes and mongo to be healthy before starting.

### Volumes

Named volumes for persistence: `mongo_data`, `node1_data` – `node5_data`.

---

## 11. Frontend & Dashboard

Built with **Next.js 16 App Router**, **shadcn/ui** components, **Tailwind CSS v4**, and **Recharts**.

### Pages

| Route                  | Description                                                                |
| ---------------------- | -------------------------------------------------------------------------- |
| `/`                    | Landing page — animated introduction with feature overview, live demo CTAs |
| `/dashboard`           | Main overview: system stats, node health, quick actions                    |
| `/dashboard/files`     | File manager: upload, list, download, delete files                         |
| `/dashboard/nodes`     | Node manager: view/create/simulate failure/recovery on storage nodes       |
| `/dashboard/analytics` | Real-time charts: storage utilization, chunk distribution, cache metrics   |
| `/dashboard/logs`      | Structured event log viewer with filtering and pagination                  |
| `/dashboard/security`  | Security configuration view: rate limit rules, endpoint protection status  |

### Notable UI Components

| Component            | Description                                                      |
| -------------------- | ---------------------------------------------------------------- |
| `RippleGrid.tsx`     | WebGL ripple-on-cursor animation (via `ogl`) on the landing page |
| `TargetCursor.tsx`   | Custom animated cursor with targeting effect                     |
| `ClientCursor.tsx`   | Client-only cursor wrapper                                       |
| `app-sidebar.tsx`    | Dashboard sidebar navigation                                     |
| `theme-provider.tsx` | Dark/light theme toggle via `next-themes`                        |

### Animation Libraries

- **GSAP** (`gsap ^3.14`): Complex timeline animations on landing page
- **Motion** (`motion ^12.34`): React-based declarative animation for dashboard transitions
- **OGL** (`ogl ^1.0`): WebGL abstraction for the ripple grid background

---

## 12. Configuration Reference

Defined in `src/lib/fs-lite/types.ts` → `DEFAULT_CONFIG`:

| Parameter                    | Default         | Description                                       |
| ---------------------------- | --------------- | ------------------------------------------------- |
| `chunkSizeBytes`             | 256 KB          | Fixed chunk size for `fixed` strategy             |
| `replicationFactor`          | 2               | Total copies per chunk (primary + replicas)       |
| `defaultNodeCount`           | 5               | Initial node count on first startup               |
| `cacheMaxSizeBytes`          | 20 MB           | Maximum LRU cache size                            |
| `maxLogEntries`              | 500             | Max in-memory log ring buffer size                |
| `dataDir`                    | `.fs-lite-data` | Root data directory for local mode                |
| `distributionStrategy`       | `round-robin`   | Default chunk placement algorithm                 |
| `integrityScanIntervalMs`    | 60,000 ms       | Background integrity scanner interval             |
| `chunking.strategy`          | `fixed`         | `fixed` or `cdc`                                  |
| `chunking.minSize`           | 128 KB          | CDC minimum chunk size                            |
| `chunking.avgSize`           | 256 KB          | CDC target chunk size                             |
| `chunking.maxSize`           | 512 KB          | CDC maximum chunk size                            |
| `chunking.windowSize`        | 48 bytes        | Rolling hash window size                          |
| `chunking.maskBits`          | 18              | Boundary mask (2^18 ≈ 256 KB average)             |
| `latency.mode`               | `default`       | `default` (per-node ms) or `high` (uniform delay) |
| `latency.highDelayMs`        | 400 ms          | Delay per chunk in `high` latency mode            |
| `storageMode`                | `local`         | `local` or `docker`                               |
| `erasureCoding.enabled`      | `false`         | Whether erasure coding is active                  |
| `erasureCoding.dataShards`   | 3               | k (data shard count)                              |
| `erasureCoding.parityShards` | 2               | m (parity shard count)                            |

**Node defaults** (5-node cluster):

| Node    | Capacity | Latency | Rack       |
| ------- | -------- | ------- | ---------- |
| ORBIT-1 | 100 MB   | 50 ms   | rack-alpha |
| ORBIT-2 | 150 MB   | 120 ms  | rack-alpha |
| ORBIT-3 | 80 MB    | 300 ms  | rack-beta  |
| ORBIT-4 | 200 MB   | 80 ms   | rack-beta  |
| ORBIT-5 | 120 MB   | 200 ms  | rack-gamma |

---

## 13. Tech Stack

### Runtime & Build

| Tool           | Version | Purpose                                                                |
| -------------- | ------- | ---------------------------------------------------------------------- |
| **Bun**        | Latest  | Primary package manager, test runner, Node-service HTTP server runtime |
| **Node.js**    | ^20     | Orchestrator runtime (Next.js)                                         |
| **TypeScript** | ^5      | Entire codebase is strictly typed                                      |
| **Next.js**    | 16.1.6  | Full-stack React framework (App Router)                                |
| **Biome**      | 2.2.0   | Linter and formatter (replaces ESLint + Prettier)                      |

### Core Dependencies

| Package        | Version  | Purpose                    |
| -------------- | -------- | -------------------------- |
| `mongoose`     | ^9.2.3   | MongoDB ODM                |
| `@arcjet/next` | ^1.1.0   | Security middleware        |
| `dockerode`    | ^4.0.9   | Docker Engine API client   |
| `uuid`         | ^13.0.0  | UUID v4 generation for IDs |
| `winston`      | ^3.19.0  | Structured logging         |
| `recharts`     | 2.15.4   | Analytics charts           |
| `gsap`         | ^3.14.2  | Landing page animations    |
| `motion`       | ^12.34.3 | UI component animations    |
| `ogl`          | ^1.0.11  | WebGL ripple grid          |
| `sonner`       | ^2.0.7   | Toast notifications        |
| `lucide-react` | ^0.575.0 | Icons                      |
| `next-themes`  | ^0.4.6   | Dark/light theme           |
| `radix-ui`     | ^1.4.3   | Accessible UI primitives   |
| `shadcn`       | ^3.8.5   | Component library CLI      |
| `tailwindcss`  | ^4       | Utility CSS                |

---

## 14. Use Cases

### Academic / Educational

- **Computer Science students** studying distributed systems, storage algorithms, and fault tolerance.
- **University labs** requiring a hands-on demo of HDFS/Ceph/S3 concepts without cloud infra.
- **Instructors** demonstrating chunk placement, LRU eviction, Merkle tree traversal, and erasure coding live in the classroom.

### Developer / Engineering

- **Prototyping** a custom distributed storage layer before investing in a full solution.
- **Benchmarking** distribution strategies (round-robin vs. weighted vs. CRUSH) on a specific workload.
- **Testing fault tolerance** scenarios: inject node failures, observe automatic rebalancing, measure recovery time.
- **Learning infrastructure** for junior engineers joining a storage team.

### Product / Demo

- **Technical demos** at conferences or client meetings showcasing distributed storage concepts visually.
- **Technical interviews**: challenge candidates to reason about the rebalancer, erasure coding, or CRUSH placement.
- **Portfolio project** demonstrating full-stack TypeScript, distributed systems theory, and DevOps (Docker, CI/CD).

### Simulation / Research

- **Algorithm comparison**: swap between round-robin, weighted, and CRUSH and observe real chunk distribution.
- **Fault tolerance analysis**: adjust replication factors, enable/disable erasure coding, measure the composite score.
- **CDC vs fixed chunking**: observe how chunk boundaries differ for near-identical files.

---

## 15. Business Model

FS-Lite is currently an **open-source educational tool**. Potential business models if commercialized:

### 1. SaaS / Hosted Demo Platform

- **Freemium**: Free tier with limited storage/nodes; paid tiers unlock more nodes, analytics, persistence.
- **Team subscriptions**: Shared dashboards for engineering teams running distributed systems workshops.

### 2. Educational Licensing

- Sell access to the simulator to universities and coding bootcamps as part of a distributed systems curriculum.
- Include lab exercises, assessments, and instructor dashboards.

### 3. Enterprise Training

- White-label the simulator for large tech companies running internal distributed systems training.
- Custom branding, custom algorithm plug-ins, and support tiers.

### 4. Consulting / Professional Services

- Use the simulator as a consulting tool to benchmark storage strategies for a client's specific workload before committing to infrastructure.

### 5. Open Source + Commercial Extensions

- Keep core OSS; sell premium modules (e.g., real S3-compatible API, advanced erasure coding variants, multi-region simulation).

---

## 16. Event System & Observability

Every significant system action emits a structured log entry via `fsLogger` (`src/lib/fs-lite/logger.ts`).

### Event Types (`LogEventType`)

| Category      | Events                                                                   |
| ------------- | ------------------------------------------------------------------------ |
| **File I/O**  | `FILE_UPLOAD`, `FILE_DOWNLOAD`, `FILE_DELETE`                            |
| **Chunk**     | `CHUNK_DISTRIBUTE`, `CHUNK_REPLICATE`                                    |
| **Node**      | `NODE_CREATE`, `NODE_FAILURE`, `NODE_RECOVERY`, `NODE_DEGRADED`          |
| **Rebalance** | `REBALANCE`                                                              |
| **Integrity** | `INTEGRITY_CHECK`, `INTEGRITY_PASS`, `INTEGRITY_FAIL`, `INTEGRITY_ALERT` |
| **Cache**     | `CACHE_HIT`, `CACHE_MISS`, `CACHE_EVICT`                                 |
| **Erasure**   | `ERASURE_ENCODE`, `ERASURE_DECODE`                                       |

### Storage

- **In-memory ring buffer**: max 500 entries (configurable via `maxLogEntries`).
- **MongoDB persistence**: each log entry is written to the `logs` collection.
- **Dashboard**: `/dashboard/logs` renders all events with timestamps, types, and metadata.

### Real-Time Progress (SSE / Streaming)

- Rebalancer emits progress events via the `RebalanceProgressCallback` interface.
- The download and rebalance API routes (via `ReadableStream` or SSE) stream progress stages: `start`, `migrate`, `warning`, `complete`, `error`.

---

## 17. Testing

Test files live in `tests/`:

```
tests/
├── unit/
│   ├── chunker.test.ts
│   ├── distributor.test.ts
│   ├── erasure.test.ts
│   └── merkle.test.ts
```

Run with:

```bash
bun test               # All tests
bun test tests/unit/   # Unit tests only
```

Tests cover all core algorithms: chunking boundary math, CRUSH scoring, XOR parity encode/decode, and Merkle tree construction and traversal.

---

## 18. CI/CD Pipeline

Defined in `.github/workflows/ci.yml`.

- **Trigger**: Push / PR to main branch.
- **Steps**: Install dependencies → Lint (Biome) → Type-check (tsc) → Unit tests (bun test).
- **Runtime**: GitHub Actions with Bun.

---

## 19. Key Technical Terms Glossary

| Term                   | Definition                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| **Chunk**              | A fixed-size or variable-size binary segment of a file, uniquely identified by `chunkId`.               |
| **Primary node**       | The node responsible for serving a chunk (stored in `FSChunk.nodeId`).                                  |
| **Replica**            | A copy of a chunk on a secondary node (listed in `FSChunk.replicas[]`).                                 |
| **Replication factor** | Total number of chunk copies including both primary and replicas. Default: 2.                           |
| **Erasure coding**     | Technique to recover data from fewer than all shards without full replication. Uses parity.             |
| **Parity shard**       | A derived chunk computed from XOR operations on data shards; enables recovery.                          |
| **Merkle tree**        | A binary hash tree allowing O(log n) integrity verification of any subset of data.                      |
| **Rolling hash**       | A hash function updated incrementally as a sliding window moves over data (used in CDC).                |
| **CRUSH**              | Controlled Replication Under Scalable Hashing — deterministic, weighted, rack-aware placement.          |
| **Rendezvous hashing** | Assigns items to nodes using `hash(item, node)^(1/weight)` — consistent and minimal-redistribution.     |
| **Rack**               | A failure domain. Replicas are placed on different racks for resilience.                                |
| **Orchestrator**       | The central controller (Next.js server) that manages metadata, coordinates nodes, and serves the UI.    |
| **LRU**                | Least Recently Used — eviction policy that removes the least recently accessed item when cache is full. |
| **WAF**                | Web Application Firewall — filters malicious HTTP requests.                                             |
| **Token bucket**       | Rate limiting algorithm: tokens accumulate at a fixed rate; each request costs a token.                 |
| **djb2**               | A fast non-cryptographic hash function used in the CRUSH implementation.                                |
| **CDC**                | Content-Defined Chunking — chunk boundaries defined by content, not fixed positions.                    |
| **SSE**                | Server-Sent Events — HTTP streaming for real-time progress updates from server to browser.              |
| **Dockerode**          | Node.js Docker Engine API client library used to control containers programmatically.                   |
| **Mongoose**           | MongoDB ODM (Object Document Mapper) for Node.js.                                                       |
| **Arcjet**             | Security-as-a-middleware platform for rate limiting, bot detection, and WAF.                            |

---

_Documentation generated from codebase analysis of COSMEON FS-LITE v0.1.0 — March 2026._
