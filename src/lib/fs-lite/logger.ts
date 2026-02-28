// ============================================
// COSMEON FS-LITE — Event Logger
// ============================================

import { v4 as uuidv4 } from "uuid";
import { connectDB, LogModel } from "./db";
import type { FSLogEntry, LogEventType } from "./types";
import { DEFAULT_CONFIG } from "./types";

class FSLogger {
  private entries: FSLogEntry[] = [];
  private maxEntries: number;
  private initialized = false;

  constructor(maxEntries = DEFAULT_CONFIG.maxLogEntries) {
    this.maxEntries = maxEntries;
  }

  /** Initialize logger and load recent events from DB */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await connectDB();
      const recentLogs = await LogModel.find({})
        .sort({ timestamp: -1 })
        .limit(this.maxEntries)
        .lean();

      if (recentLogs.length > 0) {
        this.entries = recentLogs.map((doc) => ({
          id: doc.id as string,
          timestamp: doc.timestamp as string,
          type: doc.type as LogEventType,
          message: doc.message as string,
          metadata: doc.metadata as Record<string, unknown> | undefined,
        }));
      }
      this.initialized = true;
    } catch {
      // Continue with in-memory only
      this.initialized = true;
    }
  }

  /** Log an event */
  log(
    type: LogEventType,
    message: string,
    metadata?: Record<string, unknown>,
  ): FSLogEntry {
    const entry: FSLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type,
      message,
      metadata,
    };

    this.entries.unshift(entry);

    // Maintain circular buffer in memory
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }

    // Persist to MongoDB asynchronously (fire and forget)
    this.persistLog(entry).catch(() => {});

    return entry;
  }

  private async persistLog(entry: FSLogEntry) {
    try {
      await connectDB();
      await LogModel.create({
        id: entry.id,
        timestamp: entry.timestamp,
        type: entry.type,
        message: entry.message,
        metadata: entry.metadata,
      });
      // Optionally clean up old logs in DB
      const count = await LogModel.countDocuments();
      if (count > this.maxEntries * 2) {
        const oldestLogs = await LogModel.find()
          .sort({ timestamp: 1 })
          .limit(count - this.maxEntries);
        const oldestIds = oldestLogs.map((l) => l._id);
        await LogModel.deleteMany({ _id: { $in: oldestIds } });
      }
    } catch {
      // Silently fail if DB is unavailable
    }
  }

  /** Get all log entries */
  getAll(): FSLogEntry[] {
    return [...this.entries];
  }

  /** Get entries filtered by type */
  getByType(type: LogEventType): FSLogEntry[] {
    return this.entries.filter((e) => e.type === type);
  }

  /** Get the most recent N entries */
  getRecent(count: number): FSLogEntry[] {
    return this.entries.slice(0, count);
  }

  /** Clear all entries */
  async clear(): Promise<void> {
    this.entries = [];
    try {
      await connectDB();
      await LogModel.deleteMany({});
    } catch {
      // Ignore
    }
  }

  /** Get total count */
  get count(): number {
    return this.entries.length;
  }
}

// Singleton instance
export const fsLogger = new FSLogger();
