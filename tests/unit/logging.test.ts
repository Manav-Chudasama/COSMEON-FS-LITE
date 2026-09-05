import { describe, expect, it } from "bun:test";
import { fsLogger, LOG_CATEGORIES, type LogCategory, type LogEventType } from "../../src/lib/fs-lite";

describe("Activity Logging & Category Filtering", () => {
  it("defines comprehensive log categories covering all key events", () => {
    const categories: LogCategory[] = ["files", "nodes", "integrity", "cache", "rebalance"];
    for (const cat of categories) {
      expect(LOG_CATEGORIES[cat]).toBeDefined();
      expect(LOG_CATEGORIES[cat].length).toBeGreaterThan(0);
    }

    // Check files category contains sharing and transfer events
    expect(LOG_CATEGORIES.files).toContain("FILE_UPLOAD");
    expect(LOG_CATEGORIES.files).toContain("FILE_DOWNLOAD");
    expect(LOG_CATEGORIES.files).toContain("FILE_DELETE");
    expect(LOG_CATEGORIES.files).toContain("CHUNK_DISTRIBUTE");
    expect(LOG_CATEGORIES.files).toContain("CHUNK_REPLICATE");
    expect(LOG_CATEGORIES.files).toContain("FILE_SHARE");
    expect(LOG_CATEGORIES.files).toContain("FILE_SHARE_DOWNLOAD");

    // Check nodes category contains all lifecycle events
    expect(LOG_CATEGORIES.nodes).toContain("NODE_CREATE");
    expect(LOG_CATEGORIES.nodes).toContain("NODE_FAILURE");
    expect(LOG_CATEGORIES.nodes).toContain("NODE_RECOVERY");
    expect(LOG_CATEGORIES.nodes).toContain("NODE_DEGRADED");

    // Check integrity category
    expect(LOG_CATEGORIES.integrity).toContain("INTEGRITY_CHECK");
    expect(LOG_CATEGORIES.integrity).toContain("INTEGRITY_PASS");
    expect(LOG_CATEGORIES.integrity).toContain("INTEGRITY_FAIL");
    expect(LOG_CATEGORIES.integrity).toContain("ERASURE_DECODE");

    // Check cache category
    expect(LOG_CATEGORIES.cache).toContain("CACHE_HIT");
    expect(LOG_CATEGORIES.cache).toContain("CACHE_MISS");
    expect(LOG_CATEGORIES.cache).toContain("CACHE_EVICT");
  });

  it("filters in-memory entries by category correctly", async () => {
    // Log several events across categories
    fsLogger.log("FILE_UPLOAD", "Uploaded test file", { test: true });
    fsLogger.log("CHUNK_REPLICATE", "Replicated chunk to node", { test: true });
    fsLogger.log("NODE_FAILURE", "ORBIT-2 went offline", { test: true });
    fsLogger.log("CACHE_MISS", "Chunk cache miss", { test: true });
    fsLogger.log("REBALANCE", "Rebalancing completed", { test: true });
    fsLogger.log("INTEGRITY_PASS", "All chunks verified", { test: true });

    // Category: files
    const fileLogs = await fsLogger.getFiltered({ category: "files", limit: 50 });
    expect(fileLogs.some((l) => l.type === "FILE_UPLOAD")).toBe(true);
    expect(fileLogs.some((l) => l.type === "CHUNK_REPLICATE")).toBe(true);
    expect(fileLogs.every((l) => LOG_CATEGORIES.files.includes(l.type))).toBe(true);

    // Category: nodes
    const nodeLogs = await fsLogger.getFiltered({ category: "nodes", limit: 50 });
    expect(nodeLogs.some((l) => l.type === "NODE_FAILURE")).toBe(true);
    expect(nodeLogs.every((l) => LOG_CATEGORIES.nodes.includes(l.type))).toBe(true);

    // Category: cache
    const cacheLogs = await fsLogger.getFiltered({ category: "cache", limit: 50 });
    expect(cacheLogs.some((l) => l.type === "CACHE_MISS")).toBe(true);
    expect(cacheLogs.every((l) => LOG_CATEGORIES.cache.includes(l.type))).toBe(true);

    // Specific type filtering
    const uploadOnly = await fsLogger.getFiltered({ type: "FILE_UPLOAD", limit: 50 });
    expect(uploadOnly.every((l) => l.type === "FILE_UPLOAD")).toBe(true);
  });
});
