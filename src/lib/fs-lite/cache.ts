// ============================================
// COSMEON FS-LITE — LRU Chunk Cache
// ============================================

import type { CacheStats } from "./types";
import { DEFAULT_CONFIG } from "./types";
import { fsLogger } from "./logger";

interface CacheEntry {
  chunkId: string;
  data: Buffer;
  size: number;
  lastAccessed: number;
}

class LRUCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSizeBytes: number;
  private currentSizeBytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(maxSizeBytes: number = DEFAULT_CONFIG.cacheMaxSizeBytes) {
    this.maxSizeBytes = maxSizeBytes;
  }

  /**
   * Get a chunk from cache.
   */
  get(chunkId: string): Buffer | null {
    const entry = this.cache.get(chunkId);

    if (entry) {
      // Move to front (most recently used)
      entry.lastAccessed = Date.now();
      this.cache.delete(chunkId);
      this.cache.set(chunkId, entry);

      this.hits++;
      fsLogger.log(
        "CACHE_HIT",
        `Cache hit for chunk ${chunkId.slice(0, 8)}...`,
        {
          chunkId,
        },
      );
      return entry.data;
    }

    this.misses++;
    fsLogger.log(
      "CACHE_MISS",
      `Cache miss for chunk ${chunkId.slice(0, 8)}...`,
      {
        chunkId,
      },
    );
    return null;
  }

  /**
   * Add a chunk to cache.
   */
  set(chunkId: string, data: Buffer): void {
    // Don't cache if the chunk is larger than max cache size
    if (data.length > this.maxSizeBytes) return;

    // Remove existing entry if present
    if (this.cache.has(chunkId)) {
      const existing = this.cache.get(chunkId)!;
      this.currentSizeBytes -= existing.size;
      this.cache.delete(chunkId);
    }

    // Evict entries until we have enough space
    while (this.currentSizeBytes + data.length > this.maxSizeBytes) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      chunkId,
      data,
      size: data.length,
      lastAccessed: Date.now(),
    };

    this.cache.set(chunkId, entry);
    this.currentSizeBytes += data.length;
  }

  /**
   * Invalidate a specific chunk from cache.
   */
  invalidate(chunkId: string): boolean {
    const entry = this.cache.get(chunkId);
    if (entry) {
      this.currentSizeBytes -= entry.size;
      this.cache.delete(chunkId);
      return true;
    }
    return false;
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
  }

  /**
   * Get cache statistics.
   */
  stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      currentSizeBytes: this.currentSizeBytes,
      maxSizeBytes: this.maxSizeBytes,
      itemCount: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Evict the least recently used entry.
   */
  private evictLRU(): void {
    // Map preserves insertion order — first entry is the LRU
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      const entry = this.cache.get(firstKey)!;
      this.currentSizeBytes -= entry.size;
      this.cache.delete(firstKey);
      this.evictions++;

      fsLogger.log("CACHE_EVICT", `Evicted chunk ${firstKey.slice(0, 8)}...`, {
        chunkId: firstKey,
        freedBytes: entry.size,
      });
    }
  }
}

// Singleton instance
export const chunkCache = new LRUCache();
