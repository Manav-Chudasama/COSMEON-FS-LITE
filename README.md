<div align="center">

<img src="public/cosmeon-logo.svg" alt="COSMEON Logo" width="80" height="80" />

# COSMEON FS-LITE

### A Full-Stack Distributed File System Simulator

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Bun](https://img.shields.io/badge/Bun-Latest-fbf0df?style=for-the-badge&logo=bun&logoColor=000)](https://bun.sh/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Arcjet](https://img.shields.io/badge/Arcjet-Security-FF6B6B?style=for-the-badge)](https://arcjet.com/)
[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/features/actions)

> **COSMEON FS-LITE** is a production-grade distributed file system simulator built with Next.js 16. It demonstrates core distributed storage concepts — chunking, replication, erasure coding, fault tolerance, and integrity verification — in an interactive, real-time dashboard. The storage nodes are themed as the fictional satellite network **COSMEON ORBIT** (`ORBIT-1` through `ORBIT-5`).

[View Dashboard →](#-frontend--dashboard) · [Quick Start →](#-quick-start) · [API Reference →](#-api-reference) · [Docker Setup →](#-docker-infrastructure)

</div>

---

## 📖 Table of Contents

- [✨ Features](#-features)
- [🏗️ System Architecture](#️-system-architecture)
- [⚙️ Algorithms & Data Structures](#️-algorithms--data-structures)
- [🗂️ Core Modules](#️-core-modules)
- [🚀 Quick Start](#-quick-start)
  - [Local Mode](#local-mode-development)
  - [Docker Mode](#docker-mode-production-like)
- [🌐 API Reference](#-api-reference)
- [📊 Frontend & Dashboard](#-frontend--dashboard)
- [🔒 Security Layer](#-security-layer)
- [🗄️ Database Schema](#️-database-schema)
- [⚙️ Configuration Reference](#️-configuration-reference)
- [🧪 Testing](#-testing)
- [🔁 CI/CD Pipeline](#-cicd-pipeline)
- [🛠️ Tech Stack](#️-tech-stack)
- [📚 Glossary](#-glossary)

---

## ✨ Features

| #   | Feature                              | Description                                                                                                                      |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **File Upload & Chunking**           | Split files into binary chunks using fixed-size or content-defined chunking (CDC). Each chunk is SHA-256 hashed and distributed. |
| 2   | **Chunk Distribution**               | Three pluggable strategies: **Round-Robin**, **Weighted** (greedy capacity), or **CRUSH** (Ceph-inspired rendezvous hashing).    |
| 3   | **Data Replication**                 | Each chunk is replicated to additional nodes based on a configurable replication factor (default: 2).                            |
| 4   | **File Download & Reassembly**       | Reconstruct the original file by ordering all chunks with LRU cache acceleration for repeated reads.                             |
| 5   | **File Deletion**                    | Remove all chunk data from primary and replica nodes and purge file metadata from the database.                                  |
| 6   | **Erasure Coding**                   | XOR-based parity shards (k=3 data + m=2 parity). Recover up to 2 lost shards without full replication overhead.                  |
| 7   | **Merkle Tree Integrity**            | Binary hash tree over all chunk hashes. O(log n) descent to pinpoint exactly which chunks are corrupted.                         |
| 8   | **Integrity Verification**           | On-demand and background integrity scanning: reads every chunk, recomputes SHA-256, and compares against the stored hash.        |
| 9   | **Fault Tolerance Score**            | Composite 0–100 score from node health, replication factor, rebalancing success rate, and distribution balance.                  |
| 10  | **Automatic Rebalancing (Failure)**  | When a node goes offline, the rebalancer promotes replicas to primary and re-replicates missing copies to healthy nodes.         |
| 11  | **Automatic Rebalancing (Recovery)** | When an offline node comes back online, excess chunks are migrated from overloaded nodes to re-equalize the cluster.             |
| 12  | **Node Simulation**                  | Manually set any node to `online`, `offline`, or `degraded` via the UI, triggering realistic rebalance workflows.                |
| 13  | **Node Management**                  | Create new satellite nodes with configurable capacity (bytes) and simulated latency (ms).                                        |
| 14  | **LRU Chunk Cache**                  | In-memory LRU cache (default: 20 MB). Tracks hits, misses, evictions, and current item count.                                    |
| 15  | **Latency Simulation**               | Per-node simulated I/O delay. Two modes: `default` (real node latency) and `high` (configurable uniform delay).                  |
| 16  | **System-Wide Analytics**            | Live statistics: files, chunks, storage per node, cache hit rate, online/offline/degraded node counts.                           |
| 17  | **Event Logging**                    | Structured event log for every system action (upload, download, delete, rebalance, cache, integrity, erasure).                   |
| 18  | **Docker Control**                   | Start and stop storage node Docker containers from the UI using the Dockerode API.                                               |
| 19  | **Security / Rate Limiting**         | Arcjet-powered token bucket rate limiting, bot detection, and WAF shield per endpoint.                                           |
| 20  | **Dual Storage Mode**                | Seamlessly switch between local disk (development) and Docker container storage (production demos).                              |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BROWSER (Next.js Client)                   │
│  Landing Page | Dashboard | Nodes | Files | Logs | Security     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP (Next.js App Router)
┌──────────────────────────▼──────────────────────────────────────┐
│                      ORCHESTRATOR (Next.js Server)              │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  API Routes │  │  FS Engine   │  │   Security (Arcjet)  │   │
│  │  /api/fs/*  │  │  (lib/fs-    │  │  Rate Limit + WAF    │   │
│  │             │  │   lite/)     │  │  + Bot Detection     │   │
│  └──────┬──────┘  └──────┬───────┘  └──────────────────────┘   │
│         │                │                                       │
│  ┌──────▼────────────────▼────────────────────────────────┐     │
│  │               MongoDB (Mongoose ODM)                    │     │
│  │   Files | Nodes | Logs collections                     │     │
│  └─────────────────────────────────────────────────────────┘    │
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

## ⚙️ Algorithms & Data Structures

### Chunking

| Strategy                  | Algorithm                                                                             | Avg Size | File                            |
| ------------------------- | ------------------------------------------------------------------------------------- | -------- | ------------------------------- |
| **Fixed-Size**            | Divide buffer into equal segments of `chunkSizeBytes`                                 | 256 KB   | `chunker.ts → splitFileFixed()` |
| **CDC (Content-Defined)** | Rabin-inspired rolling hash — boundary declared when lower `maskBits` bits equal zero | ~256 KB  | `chunker.ts → splitFileCDC()`   |

### Chunk Distribution

| Strategy              | Description                                                                                                            | File                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Round-Robin**       | Cycles through nodes sequentially (mod node count). Skips nodes without sufficient capacity.                           | `distributor.ts → distributeRoundRobin()` |
| **Weighted (Greedy)** | For each chunk, select the node with the highest available free space.                                                 | `distributor.ts → distributeWeighted()`   |
| **CRUSH**             | Rendezvous hashing: `score = hash(fileId:chunkIndex:nodeId)^(1/weight)`. Rack-aware, capacity-weighted, deterministic. | `distributor.ts → distributeCRUSH()`      |

### Fault Tolerance Score (0–100)

| Component                 | Weight | Formula                                         |
| ------------------------- | ------ | ----------------------------------------------- |
| **Node Health**           | 40%    | `(onlineNodes / totalNodes) × 40`               |
| **Replication / Erasure** | 25%    | `min(replicationFactor / 3, 1) × 25`            |
| **Rebalancing Success**   | 20%    | `(successfulRebalances / totalRebalances) × 20` |
| **Distribution Balance**  | 15%    | `15 × (1 − deviationFactor)`                    |

### Other Algorithms

- **Merkle Tree** — Binary hash tree stored as a flat 1-indexed array. Leaf slots padded to next power-of-2. O(log n) corruption detection. (`merkle-tree.ts`)
- **Erasure Coding** — XOR parity: `P1 = D0 ⊕ D1 ⊕ D2`, `P2` uses cyclic byte rotation for linear independence. Recovers up to 2 missing shards. (`erasure-coding.ts`)
- **LRU Cache** — JavaScript `Map` used as an ordered list. Move-to-end on access, evict-from-front on overflow. (`cache.ts`)
- **Token Bucket Rate Limiting** — Arcjet-powered; tokens refill at a fixed rate per minute per source IP. (`arcjet.ts`)

---

## 🗂️ Core Modules

All engine modules live in `src/lib/fs-lite/`:

| Module              | File                 | Responsibility                                                                             |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| **Types**           | `types.ts`           | All TypeScript interfaces (`FSFile`, `FSChunk`, `FSNode`, `FSConfig`) and `DEFAULT_CONFIG` |
| **Chunker**         | `chunker.ts`         | Fixed-size and CDC file splitting; SHA-256 hashing; file reassembly                        |
| **Distributor**     | `distributor.ts`     | Round-robin, weighted, and CRUSH chunk placement                                           |
| **Replicator**      | `replicator.ts`      | Copy a chunk from primary to a replica node                                                |
| **Rebalancer**      | `rebalancer.ts`      | Automatic chunk migration on node failure and recovery                                     |
| **Erasure Coding**  | `erasure-coding.ts`  | XOR parity encode/decode; parity chunk metadata                                            |
| **Merkle Tree**     | `merkle-tree.ts`     | Build, verify, and traverse Merkle trees                                                   |
| **Integrity**       | `integrity.ts`       | Per-file and system-wide chunk hash verification; background scanner                       |
| **Fault Tolerance** | `fault-tolerance.ts` | Composite fault tolerance score computation                                                |
| **Node Manager**    | `node-manager.ts`    | CRUD for satellite nodes; Docker vs. local mode init                                       |
| **Metadata Store**  | `metadata-store.ts`  | In-memory + MongoDB-backed file metadata store                                             |
| **Storage Client**  | `storage-client.ts`  | Unified chunk I/O: local filesystem ↔ Docker container HTTP                                |
| **Cache**           | `cache.ts`           | LRU chunk cache singleton `chunkCache`                                                     |
| **DB**              | `db.ts`              | Mongoose connection singleton; `FileModel`, `NodeModel`, `LogModel`                        |
| **Logger**          | `logger.ts`          | In-memory ring-buffer event log with MongoDB persistence                                   |
| **Docker Control**  | `docker-control.ts`  | Dockerode-based container start/stop                                                       |
| **Index**           | `index.ts`           | Top-level orchestration: `uploadFile`, `downloadFile`, `deleteFile`                        |

---

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (latest)
- [Node.js](https://nodejs.org/) ≥ 20
- [MongoDB Atlas](https://www.mongodb.com/atlas) or local MongoDB instance
- [Docker](https://www.docker.com/) (for Docker mode only)

### Environment Variables

Copy `.env.local` and fill in your values:

```bash
# MongoDB connection string
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/fslite

# Arcjet API key (https://arcjet.com)
ARCJET_KEY=ajkey_...

# Storage mode: "local" or "docker"
STORAGE_MODE=local

# Docker mode — comma-separated host:port list for each node
NODE_HOSTS=localhost:4001,localhost:4002,localhost:4003,localhost:4004,localhost:4005
```

---

### Local Mode (Development)

```bash
# 1. Clone the repo
git clone https://github.com/Manav-Chudasama/fs-lite.git
cd fs-lite

# 2. Install dependencies
bun install

# 3. Start the dev server
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Chunks are stored in `.fs-lite-data/nodes/{nodeId}/{chunkId}` on your local disk — no Docker required.

---

### Docker Mode (Production-like)

```bash
# Build and start all services (mongo + orchestrator + 5 node containers)
docker compose up --build

# Stop all services
docker compose down
```

The orchestrator is available at [http://localhost:3000](http://localhost:3000).

Each `ORBIT-N` node runs as an isolated Bun HTTP server container (`fs-lite-node-N`) with its own named volume for persistence.

---

## 🌐 API Reference

All routes are Next.js App Router Route Handlers under `src/app/api/fs/`.

### File Operations

| Method   | Route                       | Description                                                                                                   |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/fs/upload`            | Upload a file (`multipart/form-data`). Chunks, distributes, replicates, and persists. Returns `UploadResult`. |
| `GET`    | `/api/fs/files`             | List all uploaded files with metadata.                                                                        |
| `DELETE` | `/api/fs/files/{fileId}`    | Delete a file and all its chunks from disk and database.                                                      |
| `GET`    | `/api/fs/download/{fileId}` | Reassemble chunks from nodes and stream the binary response. Uses LRU cache.                                  |

### Node Operations

| Method  | Route                    | Description                                                                          |
| ------- | ------------------------ | ------------------------------------------------------------------------------------ |
| `GET`   | `/api/fs/nodes`          | List all nodes with status, capacity, usage, and latency.                            |
| `POST`  | `/api/fs/nodes`          | Create a new storage node.                                                           |
| `PATCH` | `/api/fs/nodes/{nodeId}` | Set node status (`online` / `offline` / `degraded`). Triggers automatic rebalancing. |

### Integrity & Erasure

| Method | Route               | Description                                                                                 |
| ------ | ------------------- | ------------------------------------------------------------------------------------------- |
| `POST` | `/api/fs/integrity` | Run integrity check on a specific file. Returns `IntegrityReport` with per-chunk pass/fail. |
| `GET`  | `/api/fs/erasure`   | Get current erasure coding config.                                                          |
| `POST` | `/api/fs/erasure`   | Toggle erasure coding on/off.                                                               |

### Observability & Config

| Method     | Route               | Description                                                               |
| ---------- | ------------------- | ------------------------------------------------------------------------- |
| `GET`      | `/api/fs/logs`      | Fetch all system log entries.                                             |
| `GET`      | `/api/fs/stats`     | Get system-wide statistics (`SystemStats`).                               |
| `GET`      | `/api/fs/analytics` | Detailed analytics: node utilization, cache stats, per-node chunk counts. |
| `GET`      | `/api/fs/security`  | Current rate limit configuration and request metadata.                    |
| `GET/POST` | `/api/fs/latency`   | Get or set global latency simulation mode.                                |

---

## 📊 Frontend & Dashboard

Built with **Next.js 16 App Router**, **shadcn/ui**, **Tailwind CSS v4**, and **Recharts**.

| Route                  | Description                                                                   |
| ---------------------- | ----------------------------------------------------------------------------- |
| `/`                    | Landing page — animated introduction with feature overview and live demo CTAs |
| `/dashboard`           | Main overview: system stats, node health, quick actions                       |
| `/dashboard/files`     | File manager: upload, list, download, delete                                  |
| `/dashboard/nodes`     | Node manager: view, create, simulate failure/recovery                         |
| `/dashboard/analytics` | Real-time charts: storage utilization, chunk distribution, cache metrics      |
| `/dashboard/logs`      | Structured event log viewer with filtering and pagination                     |
| `/dashboard/security`  | Security config view: rate limit rules, endpoint protection status            |

**Animation Libraries:**

| Library             | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| **GSAP** `^3.14`    | Complex timeline animations on the landing page             |
| **Motion** `^12.34` | React-based declarative animation for dashboard transitions |
| **OGL** `^1.0`      | WebGL abstraction for the ripple grid background            |

---

## 🔒 Security Layer

Powered by **Arcjet** (`@arcjet/next`).

| Endpoint           | Rules                                                |
| ------------------ | ---------------------------------------------------- |
| **Upload**         | Token bucket (20 req/min), Bot detection, WAF Shield |
| **Download**       | Token bucket (60 req/min), Bot detection             |
| **Read / List**    | Token bucket (60 req/min)                            |
| **Delete**         | Token bucket (10 req/min), Bot detection, WAF Shield |
| **Node Mutations** | Token bucket (20 req/min), WAF Shield                |

- **Rate limit key**: Per source IP (`ip.src`)
- **Mode**: `LIVE` (enforced). Can be switched to `DRY_RUN`.
- **WAF Shield**: Protects against SQLi, XSS, path traversal, and more.

---

## 🗄️ Database Schema

Backed by **MongoDB** via the **Mongoose** ODM.

### `files` Collection

| Field          | Type            | Description                      |
| -------------- | --------------- | -------------------------------- |
| `fileId`       | String (unique) | UUID v4 identifier               |
| `originalName` | String          | Original filename                |
| `mimeType`     | String          | MIME type                        |
| `totalSize`    | Number          | Total file size in bytes         |
| `chunkCount`   | Number          | Number of data chunks            |
| `checksum`     | String          | SHA-256 of the entire file       |
| `uploadedAt`   | String          | ISO timestamp                    |
| `chunks`       | Chunk[]         | Embedded array of chunk metadata |

### `nodes` Collection

| Field           | Type            | Description                             |
| --------------- | --------------- | --------------------------------------- |
| `nodeId`        | String (unique) | UUID v4 identifier                      |
| `name`          | String          | Human-readable name (e.g., `ORBIT-1`)   |
| `status`        | Enum            | `"online"` / `"offline"` / `"degraded"` |
| `rackId`        | String          | Failure domain for CRUSH algorithm      |
| `capacityBytes` | Number          | Maximum storage capacity                |
| `usedBytes`     | Number          | Currently used storage                  |
| `latencyMs`     | Number          | Simulated I/O delay                     |

### `logs` Collection

| Field       | Type            | Description                |
| ----------- | --------------- | -------------------------- |
| `id`        | String (unique) | UUID v4 identifier         |
| `timestamp` | String          | ISO timestamp              |
| `type`      | String          | `LogEventType` enum value  |
| `message`   | String          | Human-readable log message |
| `metadata`  | Mixed           | Arbitrary structured data  |

---

## ⚙️ Configuration Reference

Default values from `src/lib/fs-lite/types.ts → DEFAULT_CONFIG`:

| Parameter                    | Default       | Description                                 |
| ---------------------------- | ------------- | ------------------------------------------- |
| `chunkSizeBytes`             | 256 KB        | Fixed chunk size                            |
| `replicationFactor`          | 2             | Total copies per chunk (primary + replicas) |
| `defaultNodeCount`           | 5             | Initial node count on first startup         |
| `cacheMaxSizeBytes`          | 20 MB         | Maximum LRU cache size                      |
| `maxLogEntries`              | 500           | Max in-memory log ring buffer size          |
| `distributionStrategy`       | `round-robin` | Default chunk placement algorithm           |
| `integrityScanIntervalMs`    | 60,000 ms     | Background integrity scanner interval       |
| `chunking.strategy`          | `fixed`       | `fixed` or `cdc`                            |
| `latency.mode`               | `default`     | `default` (per-node ms) or `high`           |
| `latency.highDelayMs`        | 400 ms        | Delay per chunk in `high` latency mode      |
| `storageMode`                | `local`       | `local` or `docker`                         |
| `erasureCoding.enabled`      | `false`       | Whether erasure coding is active            |
| `erasureCoding.dataShards`   | 3             | k (data shard count)                        |
| `erasureCoding.parityShards` | 2             | m (parity shard count)                      |

**Default 5-Node Cluster:**

| Node    | Capacity | Latency | Rack       |
| ------- | -------- | ------- | ---------- |
| ORBIT-1 | 100 MB   | 50 ms   | rack-alpha |
| ORBIT-2 | 150 MB   | 120 ms  | rack-alpha |
| ORBIT-3 | 80 MB    | 300 ms  | rack-beta  |
| ORBIT-4 | 200 MB   | 80 ms   | rack-beta  |
| ORBIT-5 | 120 MB   | 200 ms  | rack-gamma |

---

## 🐳 Docker Infrastructure

Defined in `docker-compose.yml`:

| Service             | Image                             | Role                                 |
| ------------------- | --------------------------------- | ------------------------------------ |
| `mongo`             | `mongo:7`                         | MongoDB database with a named volume |
| `orchestrator`      | `./Dockerfile` (Next.js)          | Dashboard + FS engine                |
| `node-1` … `node-5` | `./node-service/Dockerfile` (Bun) | 5 chunk storage servers              |

- All services communicate over a custom bridge network `fs-net`.
- The orchestrator mounts `/var/run/docker.sock` to control containers from within.
- Named volumes for persistence: `mongo_data`, `node1_data` – `node5_data`.

**Node Service HTTP API** (each `ORBIT-N` container):

| Method   | Path          | Description                             |
| -------- | ------------- | --------------------------------------- |
| `GET`    | `/health`     | Status, chunk count, used bytes, uptime |
| `GET`    | `/chunks`     | List all stored chunk IDs               |
| `PUT`    | `/chunk/{id}` | Store a binary chunk                    |
| `GET`    | `/chunk/{id}` | Retrieve a binary chunk                 |
| `DELETE` | `/chunk/{id}` | Delete a chunk                          |

---

## 🧪 Testing

```bash
# Run all tests
bun test

# Run unit tests only
bun test tests/unit/
```

```
tests/
└── unit/
    ├── chunker.test.ts       # Fixed-size & CDC boundary math
    ├── distributor.test.ts   # CRUSH scoring & round-robin logic
    ├── erasure.test.ts       # XOR parity encode / decode
    └── merkle.test.ts        # Merkle tree construction & traversal
```

---

## 🔁 CI/CD Pipeline

Defined in `.github/workflows/ci.yml`.

- **Trigger**: Push or Pull Request to `main`
- **Runtime**: GitHub Actions with Bun
- **Steps**: Install → Lint (Biome) → Type-check (`tsc`) → Tests (`bun test`)

---

## 🛠️ Tech Stack

| Tool             | Version  | Purpose                                            |
| ---------------- | -------- | -------------------------------------------------- |
| **Bun**          | Latest   | Package manager, test runner, node-service runtime |
| **Node.js**      | ^20      | Orchestrator runtime                               |
| **TypeScript**   | ^5       | Entire codebase                                    |
| **Next.js**      | 16.1.6   | Full-stack React framework (App Router)            |
| **React**        | 19.2.3   | UI                                                 |
| **Tailwind CSS** | ^4       | Utility CSS                                        |
| **shadcn/ui**    | ^3.8.5   | Component library                                  |
| **Recharts**     | 2.15.4   | Analytics charts                                   |
| **MongoDB**      | 7        | Database                                           |
| **Mongoose**     | ^9.2.3   | ODM                                                |
| **Arcjet**       | ^1.1.0   | Security middleware                                |
| **Dockerode**    | ^4.0.9   | Docker Engine API client                           |
| **GSAP**         | ^3.14.2  | Landing page animations                            |
| **Motion**       | ^12.34.3 | UI animations                                      |
| **OGL**          | ^1.0.11  | WebGL ripple background                            |
| **Biome**        | 2.2.0    | Linter and formatter                               |

---

## 📚 Glossary

| Term                   | Definition                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| **Chunk**              | A fixed-size or variable-size binary segment of a file, uniquely identified by `chunkId`.      |
| **Primary node**       | The node responsible for serving a chunk (`FSChunk.nodeId`).                                   |
| **Replica**            | A copy of a chunk on a secondary node (`FSChunk.replicas[]`).                                  |
| **Replication factor** | Total number of chunk copies including primary and replicas. Default: 2.                       |
| **Erasure coding**     | Technique to recover data from fewer than all shards without full replication, using parity.   |
| **Parity shard**       | A derived chunk computed from XOR operations on data shards.                                   |
| **Merkle tree**        | A binary hash tree allowing O(log n) integrity verification.                                   |
| **Rolling hash**       | A hash function updated incrementally as a window slides over data (used in CDC).              |
| **CRUSH**              | Controlled Replication Under Scalable Hashing — deterministic, weighted, rack-aware placement. |
| **Rendezvous hashing** | Assigns items to nodes using `hash(item, node)^(1/weight)`.                                    |
| **Rack**               | A failure domain. Replicas are placed on different racks for resilience.                       |
| **Orchestrator**       | The central controller (Next.js server) that manages metadata and coordinates nodes.           |
| **LRU**                | Least Recently Used — eviction policy that removes the least recently accessed item.           |
| **WAF**                | Web Application Firewall — filters malicious HTTP requests.                                    |
| **Token bucket**       | Rate limiting: tokens accumulate at a fixed rate; each request costs a token.                  |
| **CDC**                | Content-Defined Chunking — chunk boundaries defined by content, not fixed positions.           |
| **SSE**                | Server-Sent Events — HTTP streaming for real-time progress updates.                            |
| **Dockerode**          | Node.js Docker Engine API client used to control containers programmatically.                  |
| **djb2**               | A fast non-cryptographic hash function used in the CRUSH implementation.                       |

---

<div align="center">

_COSMEON FS-LITE v0.1.0 — Built with ❤️ using Next.js, Bun, and TypeScript_

</div>
