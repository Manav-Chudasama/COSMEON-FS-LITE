// ============================================
// COSMEON FS-LITE — Event Logger
// ============================================

import { v4 as uuidv4 } from "uuid";
import type { FSLogEntry, LogEventType } from "./types";
import { DEFAULT_CONFIG } from "./types";

class FSLogger {
  private entries: FSLogEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = DEFAULT_CONFIG.maxLogEntries) {
    this.maxEntries = maxEntries;
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

    // Maintain circular buffer
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }

    return entry;
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
  clear(): void {
    this.entries = [];
  }

  /** Get total count */
  get count(): number {
    return this.entries.length;
  }
}

// Singleton instance
export const fsLogger = new FSLogger();
