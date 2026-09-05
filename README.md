<div align="center">

<img src="public/cosmeon-logo.svg" alt="COSMEON Logo" width="80" height="80" />

# COSMEON FS-LITE

### A Full-Stack Distributed File System Simulator & Secure Storage Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Bun](https://img.shields.io/badge/Bun-Latest-fbf0df?style=for-the-badge&logo=bun&logoColor=000)](https://bun.sh/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Arcjet](https://img.shields.io/badge/Arcjet-Security-FF6B6B?style=for-the-badge)](https://arcjet.com/)
[![AES-256](https://img.shields.io/badge/AES--256--GCM-Encrypted-00C7B7?style=for-the-badge)](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/features/actions)

> **COSMEON FS-LITE** is an enterprise-grade distributed file system simulator built with Next.js 16 and Bun. It demonstrates core distributed storage architecture — chunking, replication, erasure coding, fault tolerance, Merkle tree integrity verification, AES-256 encryption at rest, secure user-to-user file sharing, and expiring public share links — inside a real-time reactive dashboard. The storage constellation is themed around satellite storage nodes (`ORBIT-1` through `ORBIT-5`).

[View Dashboard →](#-frontend--dashboard) · [Quick Start →](#-quick-start) · [API Reference →](#-api-reference) · [Docker Setup →](#-docker-infrastructure) · [File Sharing →](#-file-sharing--access-control)

</div>

---

## 📖 Table of Contents

- [✨ Features](#-features)
- [🏗️ System Architecture](#️-system-architecture)
- [⚙️ Algorithms & Data Structures](#️-algorithms--data-structures)
- [🔒 Security, Encryption & Access Control](#-security-encryption--access-control)
- [🤝 File Sharing & Collaboration](#-file-sharing--collaboration)
- [🗂️ Core Modules](#️-core-modules)
- [🚀 Quick Start](#-quick-start)
  - [Local Mode](#local-mode-development)
  - [Docker Mode](#docker-mode-production-like)
- [🌐 API Reference](#-api-reference)
  - [Authentication](#authentication-api)
  - [File Operations](#file-operations)
  - [File Sharing & Access](#file-sharing--access)
  - [Public Share Portal](#public-share-portal-api)
  - [Node Operations](#node-operations)
  - [Integrity & Erasure](#integrity--erasure)
  - [Observability & System](#observability--system)
- [📊 Frontend & Dashboard](#-frontend--dashboard)
- [🗄️ Database Schema](#️-database-schema)
- [⚙️ Configuration Reference](#️-configuration-reference)
- [🐳 Docker Infrastructure](#-docker-infrastructure)
- [🧪 Testing](#-testing)
- [🔁 CI/CD Pipeline](#-cicd-pipeline)
- [🛠️ Tech Stack](#️-tech-stack)
- [📚 Glossary](#-glossary)

---

## ✨ Features

| #   | Feature                                 | Description                                                                                                                                          |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **File Upload & Chunking**              | Split files into binary chunks using fixed-size (256 KB) or Content-Defined Chunking (CDC). Each chunk is SHA-256 hashed and distributed.            |
| 2   | **AES-256-GCM Encryption at Rest**      | Zero-knowledge encryption pipeline: files are encrypted on-the-fly before chunking; chunks are stored encrypted at rest with auth tag verification.  |
| 3   | **Chunk Distribution**                  | Pluggable placement strategies: **Round-Robin**, **Weighted** (greedy free capacity), and **CRUSH** (Ceph-inspired rendezvous hashing with racks).   |
| 4   | **Data Replication**                    | Each chunk is replicated to secondary nodes based on a configurable replication factor (default: 2 copies per chunk).                                |
| 5   | **Reconstruction & Streaming Download** | Streamed NDJSON rebuild stepper reassembles chunks across nodes with on-the-fly AES-256 decryption, Merkle verification, and LRU cache acceleration. |
| 6   | **Safe Purge & Deletion**               | Owner-controlled unlinking removes all chunk replicas from disk/Docker volumes and purges metadata from MongoDB with live progress feedback.         |
| 7   | **Collaborator Sharing**                | Share files with other users by email with strictly **Read & Download ONLY** permissions. Deletion actions are strictly locked to file owners.       |
| 8   | **Expiring Public Share Links**         | Generate tokenized public links with customizable expiration (`1h`, `24h`, `7d`, `Never`), public portal UI, and atomic download tracking.           |
| 9   | **Dedicated "Shared with Me" View**     | Dedicated workspace (`/dashboard/shared`) listing files shared with the user, isolated from personal uploads on the main files page.                 |
| 10  | **Erasure Coding**                      | XOR-based parity shards (k=3 data + m=2 parity). Recovers up to 2 missing shards without requiring full replica storage overhead.                    |
| 11  | **Merkle Tree Integrity**               | Binary hash tree over chunk checksums. O(log n) tree traversal pinpointing corrupted chunks down to the specific byte offset.                        |
| 12  | **Integrity Verification**              | On-demand and automatic background integrity scanner that recomputes chunk SHA-256 hashes against stored cryptographic signatures.                   |
| 13  | **Fault Tolerance Scoring**             | Dynamic 0–100 resilience score computed from node health, replication factor, rebalancing success rate, and cluster balance.                         |
| 14  | **Automatic Cluster Rebalancing**       | On node failure, promotes replicas and re-replicates missing copies. On node recovery, migrates excess chunks to re-equalize cluster capacity.       |
| 15  | **Node Failure & Recovery Simulation**  | Manually toggle satellite node status (`online`, `offline`, `degraded`) with interactive live-feed rebalance modals that persist until closed.       |
| 16  | **Node Storage Auto-Reconciliation**    | Automatic self-healing reconciliation (`reconcileNodeStats()`) that recalculates true chunk counts and storage usage against MongoDB file records.   |
| 17  | **LRU Chunk Cache**                     | In-memory LRU cache (20 MB default) with a full-width performance gauge tracking hits, misses, evictions, and byte utilization.                      |
| 18  | **Latency Simulation**                  | Per-node simulated I/O delay: `default` mode uses real node latency (50–300 ms); `high` mode simulates extreme wide-area network latency.            |
| 19  | **Category-Filtered Activity Log**      | Real-time event log with multi-category operational domain filtering: **Files**, **Nodes**, **Integrity**, **Cache**, and **Rebalance**.             |
| 20  | **Two-Step Authentication & RBAC**      | Secure signup and login with 6-digit email OTP verification, password recovery flow, signed session cookies, and role-based access control.          |
| 21  | **Arcjet Defense Shield**               | Token bucket rate limiting, automated bot detection, and Web Application Firewall (WAF) protecting API routes.                                       |
| 22  | **Dual Storage Engine**                 | Seamlessly switch between local disk storage (`.fs-lite-data/nodes/`) and independent Docker container node services (`ORBIT-1` through `ORBIT-5`).  |

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                BROWSER (Next.js Client)                                │
│   Landing Page | Dashboard | Files | Shared with Me | Nodes | Analytics | Logs | Auth  │
│                     Public Share Portal (/share/[token])                               │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTP / NDJSON Streaming
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│                             ORCHESTRATOR (Next.js 16 Server)                           │
│                                                                                        │
│   ┌────────────────────┐   ┌──────────────────────────────┐   ┌─────────────────────┐  │
│   │     API Routes     │   │      FS Engine Orchestrator   │   │   Security & Auth   │  │
│   │  /api/fs/*         │   │   (Chunker, Distributor,     │   │  Arcjet Rate Limit  │  │
│   │  /api/auth/*       │   │    Rebalancer, Replicator,   │   │  + WAF + Bot Shield │  │
│   │  /api/fs/share/*   │   │    Integrity, Merkle Tree)   │   │  + JWT Auth Session │  │
│   └─────────┬──────────┘   └──────────────┬───────────────┘   └─────────────────────┘  │
│             │                             │                                            │
│   ┌─────────▼─────────────────────────────▼────────────────────────────────────────┐   │
│   │                     MongoDB Atlas (Mongoose ODM)                               │   │
│   │   • files: Metadata, Chunks, AES-256 Envelope, Collaborators, Share Links       │   │
│   │   • nodes: Status, Capacity, Used Bytes, Latency, Failure Domains              │   │
│   │   • logs:  Event Stream (Files, Nodes, Integrity, Cache, Rebalance)            │   │
│   │   • users: User Accounts, Password Hashes, Roles (Admin/User)                  │   │
│   │   • otps:  Two-Factor & Password Reset OTP Tokens (TTL Expiring)               │   │
│   └────────────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Filesystem / HTTP
                       ┌────────────────────┴────────────────────┐
                       │             Storage Backend             │
                       ├─────────────────────────────────────────┤
                       │ LOCAL MODE (Development)                │
                       │ .fs-lite-data/nodes/{nodeId}/{chunkId}  │
                       ├─────────────────────────────────────────┤
                       │ DOCKER MODE (Production Simulation)     │
                       │ ORBIT-1 (port 4001, Named Volume)       │
                       │ ORBIT-2 (port 4002, Named Volume)       │
                       │ ORBIT-3 (port 4003, Named Volume)       │
                       │ ORBIT-4 (port 4004, Named Volume)       │
                       │ ORBIT-5 (port 4005, Named Volume)       │
                       │ Each: Isolated Bun HTTP Microservice    │
                       └─────────────────────────────────────────┘
```

---

## ⚙️ Algorithms & Data Structures

### Chunking Strategies

| Strategy                  | Algorithm                                                                                  | Default Chunk Size | Implementation                  |
| ------------------------- | ------------------------------------------------------------------------------------------ | ------------------ | ------------------------------- |
| **Fixed-Size**            | Divides buffer into contiguous segments of exact byte size `chunkSizeBytes`.               | 256 KB             | `chunker.ts → splitFileFixed()` |
| **CDC (Content-Defined)** | Rabin-style rolling hash window; declares boundary when the lower `maskBits` match a mask. | ~256 KB            | `chunker.ts → splitFileCDC()`   |

### Chunk Distribution

| Strategy              | Logic                                                                                                                  | Implementation                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Round-Robin**       | Cycles sequentially across available online nodes (mod count). Skips saturated nodes.                                  | `distributor.ts → distributeRoundRobin()` |
| **Weighted (Greedy)** | Evaluates free capacity across all online nodes and assigns chunks to the node with maximum remaining space.           | `distributor.ts → distributeWeighted()`   |
| **CRUSH**             | Rendezvous hashing: `score = hash(fileId:chunkIndex:nodeId)^(1/weight)`. Rack-aware, capacity-weighted, deterministic. | `distributor.ts → distributeCRUSH()`      |

### Integrity & Fault Tolerance

- **Merkle Tree** — Binary hash tree represented as a flat 1-indexed array padded to the nearest power of 2. Provides $O(\log n)$ recursive descent to isolate corrupted chunks (`merkle-tree.ts`).
- **Erasure Coding (k=3, m=2)** — Bitwise XOR parity: $P_1 = D_0 \oplus D_1 \oplus D_2$, with cyclic bit rotations applied for $P_2$ to guarantee linear independence. Recovers any 2 missing data shards (`erasure-coding.ts`).
- **Fault Tolerance Score (0–100)**:
  $$\text{Score} = 0.40 \times \text{Health} + 0.25 \times \text{Replication} + 0.20 \times \text{Rebalance} + 0.15 \times \text{Balance}$$

---

## 🔒 Security, Encryption & Access Control

### AES-256-GCM Zero-Knowledge Encryption

1. **Envelope Encryption**: Each file upload generates an ephemeral 256-bit cryptographic key.
2. **Authenticated Ciphertext**: Chunks are encrypted using AES-256-GCM with a 12-byte initialization vector (IV). An authentication tag is stored in file metadata for integrity verification.
3. **Decryption on Download**: When reassembled (via authenticated download or public portal), the ciphertext is validated against the authentication tag before stream delivery.

### Arcjet Security Firewall

Configured per route handler in `@/lib/arcjet`:

- **Upload / Mutations**: Token bucket (20 req/min), Bot detection, WAF Shield.
- **Download / Reconstruction**: Token bucket (60 req/min), Bot detection.
- **Delete / Purge**: Token bucket (10 req/min), Bot detection, WAF Shield.
- **Public Share Portal**: Token bucket (30 req/min), Bot detection.

---

## 🤝 File Sharing & Collaboration

FS-Lite supports dual sharing models:

```
                    ┌──────────────────────────────────────────────┐
                    │                  File Owner                  │
                    │   • Upload, Download, and Full Purge Rights  │
                    │   • Grant / Revoke Registered Collaborators  │
                    │   • Create / Configure Expiring Share Links  │
                    └──────────────────────┬───────────────────────┘
                                           │
             ┌─────────────────────────────┴─────────────────────────────┐
             ▼                                                           ▼
┌──────────────────────────────┐                           ┌──────────────────────────────┐
│     Collaborator (User)      │                           │    Public Link Recipient     │
│  • Read & Download ONLY      │                           │  • Stream Rebuild & Download │
│  • Appears in /shared page   │                           │  • Token & Expiration Check  │
│  • STRICTLY NO DELETE RIGHTS │                           │  • Auto AES-256 Decryption   │
│  • Hidden Collaborators List │                           │  • Atomic Download Counter   │
│  • Backend 403 Forbidden     │                           │  • No Account Required       │
└──────────────────────────────┘                           └──────────────────────────────┘
```

1. **User-to-User Email Collaboration**:
   - Owners enter collaborator emails to grant immediate access.
   - Collaborators receive strictly **Read & Download ONLY** access.
   - Collaborators view shared files exclusively on the **Shared with Me** page (`/dashboard/shared`).
   - File deletion controls (`Trash2` icons, purge modals) and backend delete endpoints return `403 Forbidden` for non-owners.
   - Collaborator privacy: non-owners cannot see other collaborators or public share metrics.

2. **Expiring Public Share Links**:
   - Configurable expiration options: `1 Hour`, `24 Hours`, `7 Days`, or `Permanent`.
   - Generates a cryptographically secure 32-character token.
   - External public portal at `/share/[token]` allows unauthenticated users to verify checksums and download decrypted files.
   - Real-time atomic download tracking increments upon download completion.

---

## 🗂️ Core Modules

All distributed file system logic resides in `src/lib/fs-lite/`:

| Module              | File                 | Responsibility                                                                                                    |
| ------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Types**           | `types.ts`           | Core TypeScript types (`FSFile`, `FSChunk`, `FSNode`, `SharedUser`, `ShareLink`, `LogCategory`, `DEFAULT_CONFIG`) |
| **Chunker**         | `chunker.ts`         | Fixed-size and Content-Defined Chunking; SHA-256 chunk hashing; binary reassembly                                 |
| **Distributor**     | `distributor.ts`     | Round-Robin, Weighted, and CRUSH chunk distribution algorithms                                                    |
| **Replicator**      | `replicator.ts`      | Secondary chunk replication pipeline to maintain target replication factor                                        |
| **Rebalancer**      | `rebalancer.ts`      | Automatic chunk migration and promotion during node failures and recovery                                         |
| **Node Manager**    | `node-manager.ts`    | Satellite node management, health checks, latency simulation, and `reconcileNodeStats()` self-healing             |
| **Metadata Store**  | `metadata-store.ts`  | In-memory caching and MongoDB persistence for file metadata, chunks, and ownership                                |
| **Storage Client**  | `storage-client.ts`  | Unified I/O adapter: switches transparently between local disk and Docker container HTTP endpoints                |
| **Erasure Coding**  | `erasure-coding.ts`  | Bitwise XOR parity generation and data shard recovery math                                                        |
| **Merkle Tree**     | `merkle-tree.ts`     | Merkle tree generation, root verification, and O(log n) corrupted chunk pinpointing                               |
| **Integrity**       | `integrity.ts`       | Active and background chunk integrity verification against stored SHA-256 hashes                                  |
| **Fault Tolerance** | `fault-tolerance.ts` | Multi-factor system resilience and health scoring engine                                                          |
| **Cache**           | `cache.ts`           | Least Recently Used (LRU) chunk cache singleton (`chunkCache`) with eviction and hit tracking                     |
| **Logger**          | `logger.ts`          | Ring buffer and MongoDB-persisted event logger supporting domain category queries (`getFiltered`)                 |
| **Database**        | `db.ts`              | Mongoose singleton and models (`FileModel`, `NodeModel`, `LogModel`, `UserModel`, `OtpModel`)                     |
| **Docker Control**  | `docker-control.ts`  | Programmatic Docker container lifecycle control via Dockerode                                                     |
| **Index**           | `index.ts`           | Public engine entry point: `initEngine`, `uploadFile`, `downloadFile`, `deleteFile`, `reconcileNodeStats`         |

---

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (v1.2+)
- [Node.js](https://nodejs.org/) ≥ 20
- [MongoDB Atlas](https://www.mongodb.com/atlas) cluster or local MongoDB instance
- [Docker](https://www.docker.com/) & Docker Compose (optional, for Docker container mode)

### Environment Configuration

Create a `.env.local` file in the project root:

```bash
# MongoDB Atlas Connection String
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/fslite?retryWrites=true&w=majority

# Arcjet API Key (https://arcjet.com)
ARCJET_KEY=ajkey_...

# Storage Mode: "local" (default) or "docker"
STORAGE_MODE=local

# Docker Mode node endpoints (used when STORAGE_MODE=docker)
NODE_HOSTS=localhost:4001,localhost:4002,localhost:4003,localhost:4004,localhost:4005

# JWT Secret for Session Cookies
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# SMTP Email Configuration (for 2FA & Password Reset OTPs)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="COSMEON FS-LITE <no-reply@cosmeon.io>"
```

---

### Local Mode (Development)

In Local Mode, chunks are saved directly into `.fs-lite-data/nodes/{nodeId}/{chunkId}`:

```bash
# 1. Clone repository
git clone https://github.com/Manav-Chudasama/fs-lite.git
cd fs-lite

# 2. Install dependencies
bun install

# 3. Start development server
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Docker Mode (Production-like)

In Docker Mode, each satellite storage node runs as an independent container with its own HTTP microservice and named volume:

```bash
# Build and launch orchestrator, MongoDB, and 5 storage node containers
docker compose up --build

# Stop all containers
docker compose down
```

The orchestrator dashboard is accessible at [http://localhost:3000](http://localhost:3000).

---

## 🌐 API Reference

### Authentication API

| Method | Endpoint                    | Description                                          |
| ------ | --------------------------- | ---------------------------------------------------- |
| `POST` | `/api/auth/register`        | Register user; sends 6-digit verification OTP email. |
| `POST` | `/api/auth/login`           | Verify credentials; issues 2FA challenge OTP.        |
| `GET`  | `/api/auth/me`              | Get authenticated user profile and session info.     |
| `POST` | `/api/auth/logout`          | Invalidate session cookie.                           |
| `POST` | `/api/auth/forgot-password` | Dispatch password reset OTP to user email.           |
| `POST` | `/api/auth/reset-password`  | Verify OTP and set new account password.             |

### File Operations

| Method   | Endpoint                                 | Description                                                                              |
| -------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST`   | `/api/fs/upload`                         | Multipart upload (`file`, `strategy`, `replicationFactor`). Returns `UploadResult`.      |
| `POST`   | `/api/fs/upload/progress`                | NDJSON streaming upload pipeline with live stage milestones and chunk distribution feed. |
| `GET`    | `/api/fs/files`                          | List files owned by the authenticated user.                                              |
| `GET`    | `/api/fs/files/{fileId}`                 | Inspect file metadata (sanitized for collaborators; owner info only).                    |
| `DELETE` | `/api/fs/files/{fileId}`                 | Owner-only file deletion from database and physical node disks (returns 403 for others). |
| `POST`   | `/api/fs/files/{fileId}/delete-progress` | Owner-only streamed NDJSON file purge with chunk unlinking milestones.                   |
| `GET`    | `/api/fs/download/{fileId}`              | Reassembles chunks across nodes and streams binary file payload.                         |
| `POST`   | `/api/fs/download/{fileId}/progress`     | Streamed NDJSON download with live stage stepper, cache retrieval, and base64 payload.   |

### File Sharing & Access

| Method | Endpoint                            | Description                                                                           |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------- |
| `GET`  | `/api/fs/files/shared`              | List files shared with the current authenticated user (Read & Download only).         |
| `POST` | `/api/fs/files/{fileId}/share`      | Owner-only: grant access to collaborator by email (`action: "add" \| "remove"`).      |
| `POST` | `/api/fs/files/{fileId}/share-link` | Owner-only: toggle public share link and set expiration (`1h`, `24h`, `7d`, `never`). |

### Public Share Portal API

| Method | Endpoint                         | Description                                                                          |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------ |
| `GET`  | `/api/fs/share/{token}`          | Public metadata lookup for share link. Enforces expiry (410) and revocation (403).   |
| `POST` | `/api/fs/share/{token}/progress` | Public NDJSON streamed reassembly with AES-256 decryption and atomic download tally. |

### Node Operations

| Method  | Endpoint                 | Description                                                                        |
| ------- | ------------------------ | ---------------------------------------------------------------------------------- |
| `GET`   | `/api/fs/nodes`          | List cluster nodes with auto-reconciled capacity, used bytes, and latency.         |
| `POST`  | `/api/fs/nodes`          | Provision a new satellite node.                                                    |
| `PATCH` | `/api/fs/nodes/{nodeId}` | Update status (`online`, `offline`, `degraded`); triggers NDJSON rebalance stream. |

### Integrity & Erasure

| Method | Endpoint            | Description                                                                             |
| ------ | ------------------- | --------------------------------------------------------------------------------------- |
| `POST` | `/api/fs/integrity` | Run integrity audit on a file; returns `IntegrityReport` with per-chunk Merkle results. |
| `GET`  | `/api/fs/erasure`   | Fetch current erasure coding configuration and status.                                  |
| `POST` | `/api/fs/erasure`   | Enable or disable cluster erasure coding.                                               |

### Observability & System

| Method     | Endpoint            | Description                                                                          |
| ---------- | ------------------- | ------------------------------------------------------------------------------------ |
| `GET`      | `/api/fs/logs`      | Query activity logs. Supports `?category=files\|nodes\|integrity\|cache\|rebalance`. |
| `GET`      | `/api/fs/stats`     | Return system metrics: total files, storage used, cluster health score.              |
| `GET`      | `/api/fs/analytics` | Detailed analytics: per-node storage bars, chunk distributions, cache gauge.         |
| `GET`      | `/api/fs/security`  | Current Arcjet rate limiting status and rules overview.                              |
| `GET/POST` | `/api/fs/latency`   | Query or update cluster-wide latency simulation mode (`default` vs `high`).          |

---

## 📊 Frontend & Dashboard

Built with **Next.js 16 (App Router)**, **shadcn/ui**, **Tailwind CSS v4**, and **Recharts**. Follows strict monospace typography (IBM Plex Mono) and sharp border corners (`rounded-none`).

| Route                       | Page Description                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/`                         | Landing page — WebGL ripple grid background, feature deep dive, interactive terminal, and documentation links.  |
| `/login`                    | Sign in page with email credentials and 2FA OTP verification modal.                                             |
| `/register`                 | Account registration with email OTP verification.                                                               |
| `/forgot-password`          | Password recovery dispatching 6-digit reset OTP.                                                                |
| `/reset-password`           | Password reset form validating OTP and updating password hash.                                                  |
| `/dashboard`                | System overview: storage capacity, online node status, quick metrics, and cluster health score.                 |
| `/dashboard/files`          | Personal file manager: upload to constellation, chunk breakdown, file details, share modal, and safe purge.     |
| `/dashboard/files/[fileId]` | File details view: Merkle root, chunk distribution table, collaborator list (owner only), download rebuild.     |
| `/dashboard/shared`         | **Shared with Me** view: files shared with current user (Read & Download only, zero delete triggers).           |
| `/share/[token]`            | **Public Share Portal**: unauthenticated recipient portal with live NDJSON streamed reconstruction.             |
| `/dashboard/nodes`          | Satellite node management: storage usage, capacity progress, simulation modals (Failure & Recovery).            |
| `/dashboard/analytics`      | System analytics: node utilization bars, chunk distribution charts, and full-width cache performance card.      |
| `/dashboard/logs`           | Activity log viewer: domain category filtering (**Files**, **Nodes**, **Integrity**, **Cache**, **Rebalance**). |
| `/dashboard/security`       | Arcjet security console: rate limiting policy, bot detection rules, and shield status.                          |

---

## 🗄️ Database Schema

Backed by **MongoDB Atlas** using **Mongoose ODM**.

### `files` Collection

```typescript
{
  fileId: string;              // UUID v4 (Unique, Indexed)
  originalName: string;        // Original filename
  mimeType: string;            // MIME type
  totalSize: number;           // Total byte size
  chunkCount: number;          // Number of data chunks
  chunkSize: number;           // Standard chunk size (256 KB)
  checksum: string;            // SHA-256 of original file
  uploadedAt: string;          // ISO timestamp
  version: number;             // Metadata version
  chunks: [{
    chunkId: string;           // UUID v4
    fileId: string;
    index: number;
    offset: number;
    size: number;
    hash: string;              // SHA-256 checksum of chunk
    nodeId: string;            // Primary satellite node ID
    replicas: string[];        // Array of replica node IDs
  }];
  // Ownership & Sharing
  ownerId: string;             // User ID of file uploader (Indexed)
  ownerEmail: string;          // Email of uploader
  ownerName: string;           // Display name of uploader
  sharedWith: string[];        // Array of collaborator user IDs
  sharedUsers: [{              // Collaborator access records
    userId: string;
    email: string;
    name: string;
    sharedAt: string;
    permission: "read";        // Strictly read-only
  }];
  shareLink?: {                // Public share link configuration
    enabled: boolean;
    token?: string;            // 32-char URL-safe token (Indexed, Sparse)
    expiresAt?: Date;          // Expiration timestamp (null = permanent)
    downloads: number;         // Atomic download counter
    createdAt: string;
  };
  // Encryption
  encrypted: boolean;          // AES-256-GCM status
  encryptionMeta?: {
    algorithm: string;         // "aes-256-gcm"
    iv: string;                // Base64 Initialization Vector
    authTag: string;           // Base64 GCM authentication tag
    keyEnvelope: string;       // Encrypted key envelope
    originalChecksum: string;  // Plaintext SHA-256
  };
}
```

### `nodes` Collection

```typescript
{
  nodeId: string; // UUID v4 (Unique, Indexed)
  name: string; // Human-readable identifier (ORBIT-1 … ORBIT-5)
  status: "online" | "offline" | "degraded";
  rackId: string; // Failure domain ("rack-alpha", "rack-beta", "rack-gamma")
  capacityBytes: number; // Storage capacity (e.g. 100 MB)
  usedBytes: number; // Currently utilized storage
  chunkCount: number; // Number of primary + replica chunks stored
  latencyMs: number; // Simulated I/O latency (ms)
}
```

### `users` Collection

```typescript
{
  userId: string; // UUID v4 (Unique, Indexed)
  name: string; // User display name
  email: string; // Unique, lowercase, indexed
  passwordHash: string; // bcrypt hash
  role: "user" | "admin"; // Role-based access level
  twoFactorEnabled: boolean; // 2FA status (defaults to true)
  createdAt: string; // ISO timestamp
}
```

### `otps` Collection

```typescript
{
  otpId: string; // UUID v4 (Unique, Indexed)
  email: string; // Target email address
  codeHash: string; // bcrypt hash of 6-digit OTP code
  type: "2fa" | "forgot_password" | "registration";
  expiresAt: Date; // MongoDB TTL index (automatically cleaned up)
  used: boolean; // One-time usage flag
}
```

### `logs` Collection

```typescript
{
  id: string;                  // UUID v4 (Unique, Indexed)
  timestamp: string;           // ISO timestamp
  type: LogEventType;          // Event enum (Indexed)
  message: string;             // Human-readable description
  metadata?: object;           // Structured event payload
}
```

---

## ⚙️ Configuration Reference

Default settings from `src/lib/fs-lite/types.ts`:

| Key                          | Default Value | Description                                                        |
| ---------------------------- | ------------- | ------------------------------------------------------------------ |
| `chunkSizeBytes`             | 256 KB        | Default chunk size for fixed chunking                              |
| `replicationFactor`          | 2             | Number of chunk copies across cluster (1 primary + 1 replica)      |
| `defaultNodeCount`           | 5             | Number of satellite nodes initialized at startup                   |
| `cacheMaxSizeBytes`          | 20 MB         | Maximum LRU memory cache allocation                                |
| `maxLogEntries`              | 500           | Maximum in-memory circular log buffer length                       |
| `distributionStrategy`       | `round-robin` | Default distribution strategy (`round-robin`, `weighted`, `crush`) |
| `integrityScanIntervalMs`    | 60,000 ms     | Automated background integrity verification period                 |
| `erasureCoding.enabled`      | `false`       | Whether erasure coding is active                                   |
| `erasureCoding.dataShards`   | 3             | Data shards (k)                                                    |
| `erasureCoding.parityShards` | 2             | Parity shards (m)                                                  |

---

## 🐳 Docker Infrastructure

The multi-container cluster is declared in `docker-compose.yml`:

```yaml
services:
  mongo:
    image: mongo:7
    volumes: [mongo_data:/data/db]

  orchestrator:
    build: .
    ports: ["3000:3000"]
    environment:
      - STORAGE_MODE=docker
      - NODE_HOSTS=node-1:4000,node-2:4000,node-3:4000,node-4:4000,node-5:4000

  node-1 ... node-5:
    build: ./node-service
    ports: ["4001..4005:4000"]
    volumes: [node1_data ... node5_data:/data/chunks]
```

---

## 🧪 Testing

The test suite is powered by **Bun's built-in test runner**:

```bash
# Run all unit test suites
bun test

# Run unit tests with verbose output
bun test tests/unit/
```

### Test Coverage (42 Tests Passing)

```
tests/unit/
├── chunker.test.ts          # 10 tests: Fixed & CDC chunking, SHA-256, boundaries
├── erasure-coding.test.ts   # 7 tests:  XOR parity encoding, 2-shard loss recovery
├── integrity.test.ts        # 7 tests:  SHA-256 hash generation, corruption detection
├── logging.test.ts          # 2 tests:  Category definitions, multi-event filtering
├── merkle-tree.test.ts      # 12 tests: Merkle tree construction, root check, traversal
└── sharing.test.ts          # 4 tests:  Collaborator read-only, owner delete guard, expiry
```

---

## 🔁 CI/CD Pipeline

Defined in `.github/workflows/ci.yml`:

- **Triggers**: Pushes and Pull Requests on `main`.
- **Pipeline Stages**:
  1. **Checkout & Bun Setup**: Installs Bun runtime in GitHub Actions.
  2. **Dependencies**: `bun install --frozen-lockfile`.
  3. **Linting**: `bun run lint` (Biome).
  4. **Type Check**: `bun x --bun tsc --noEmit`.
  5. **Automated Tests**: `bun test`.

---

## 🛠️ Tech Stack

| Layer                  | Technology                                                                               | Description                                             |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Runtime & Tooling**  | [Bun](https://bun.sh/)                                                                   | Ultra-fast JavaScript runtime, bundler, test runner     |
| **Framework**          | [Next.js 16](https://nextjs.org/)                                                        | App Router, React Server Components, Route Handlers     |
| **UI Library**         | [React 19](https://react.dev/)                                                           | Modern concurrent React UI components                   |
| **Styling & Theme**    | [Tailwind CSS v4](https://tailwindcss.com)                                               | Modern CSS variables, sharp corners, monospace theme    |
| **Components**         | [shadcn/ui](https://ui.shadcn.com/)                                                      | Radix UI primitives with Tailwind styling               |
| **Data Visualization** | [Recharts](https://recharts.org/)                                                        | Storage utilization, chunk counts, radial gauges        |
| **Database**           | [MongoDB Atlas](https://www.mongodb.com/)                                                | Distributed document store with Mongoose ODM            |
| **Security & WAF**     | [Arcjet](https://arcjet.com/)                                                            | Rate limiting, bot protection, Web App Firewall         |
| **Cryptography**       | Node `crypto`                                                                            | Native AES-256-GCM, SHA-256 hashing, crypto random      |
| **Authentication**     | [bcryptjs](https://github.com/dcodeIO/bcrypt.js) + [jose](https://github.com/panva/jose) | Password hashing & signed JWT session tokens            |
| **Email Service**      | [Nodemailer](https://nodemailer.com/)                                                    | SMTP email dispatch for 2FA and password reset OTPs     |
| **Animation**          | [Motion](https://motion.dev/) + [GSAP](https://greensock.com/)                           | Micro-interactions and interactive timeline visualizers |
| **Container Engine**   | [Docker](https://www.docker.com/)                                                        | Docker Compose, isolated Bun node microservices         |

---

## 📚 Glossary

- **Chunk**: A binary slice of a file (typically 256 KB) assigned a unique `chunkId` and verified via SHA-256.
- **Envelope Encryption**: Two-layer encryption where file data is encrypted with a unique data key, which is protected in metadata.
- **Collaborator**: A registered user granted strictly read-only and download privileges on a shared file.
- **Public Share Link**: An expiring, tokenized URL allowing external unauthenticated users to rebuild and download a file.
- **CRUSH**: Controlled Replication Under Scalable Hashing — Ceph's algorithm for deterministic, rack-aware data placement.
- **Erasure Coding**: Mathematical recovery technique using XOR parity shards ($k=3, m=2$) to tolerate data loss without full replicas.
- **Merkle Tree**: Cryptographic binary hash tree enabling $O(\log n)$ pinpointing of corrupted data blocks.
- **Rebalancer**: Automated cluster task that migrates chunks when storage nodes fail or recover.
- **LRU Cache**: Least Recently Used chunk cache held in RAM to accelerate repeated read requests.

---

<div align="center">

_COSMEON FS-LITE — Built with ❤️ using Next.js 16, Bun, TypeScript, and MongoDB_

</div>
