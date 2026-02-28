// ============================================
// COSMEON FS-LITE — Node Storage Service
// ============================================
// A lightweight HTTP server that stores and retrieves binary chunks.
// Each instance runs inside a Docker container with a persistent volume.
// ============================================

import {
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

const PORT = parseInt(process.env.PORT || "4000", 10);
const DATA_DIR = process.env.DATA_DIR || "/data/chunks";
const NODE_NAME = process.env.NODE_NAME || "unknown";

// Ensure data directory exists on startup
await mkdir(DATA_DIR, { recursive: true });

const _server = Bun.serve({
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;

    // ── Health check ──────────────────────────
    if (path === "/health" && req.method === "GET") {
      try {
        const files = await readdir(DATA_DIR);
        let totalBytes = 0;
        for (const file of files) {
          const info = await stat(join(DATA_DIR, file));
          totalBytes += info.size;
        }
        return Response.json({
          status: "ok",
          nodeName: NODE_NAME,
          chunkCount: files.length,
          usedBytes: totalBytes,
          uptime: process.uptime(),
        });
      } catch {
        return Response.json({ status: "error" }, { status: 500 });
      }
    }

    // ── List all chunks ──────────────────────
    if (path === "/chunks" && req.method === "GET") {
      try {
        const files = await readdir(DATA_DIR);
        return Response.json({ chunks: files, count: files.length });
      } catch {
        return Response.json({ chunks: [], count: 0 });
      }
    }

    // ── Chunk operations ─────────────────────
    const chunkMatch = path.match(/^\/chunk\/([a-f0-9-]+)$/);
    if (chunkMatch) {
      const chunkId = chunkMatch[1];
      const chunkPath = join(DATA_DIR, chunkId);

      // PUT — Store a chunk
      if (req.method === "PUT") {
        try {
          const body = await req.arrayBuffer();
          await writeFile(chunkPath, Buffer.from(body));
          return Response.json({ ok: true, chunkId, size: body.byteLength });
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : "Write failed" },
            { status: 500 },
          );
        }
      }

      // GET — Retrieve a chunk
      if (req.method === "GET") {
        try {
          const data = await readFile(chunkPath);
          return new Response(data, {
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Length": data.length.toString(),
            },
          });
        } catch {
          return Response.json(
            { error: `Chunk ${chunkId} not found` },
            { status: 404 },
          );
        }
      }

      // DELETE — Remove a chunk
      if (req.method === "DELETE") {
        try {
          await unlink(chunkPath);
          return Response.json({ ok: true, chunkId });
        } catch {
          return Response.json(
            { error: `Chunk ${chunkId} not found` },
            { status: 404 },
          );
        }
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`[NODE-SERVICE] ${NODE_NAME} listening on port ${PORT}`);
