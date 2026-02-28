// ============================================
// COSMEON FS-LITE -- Global Latency Injector
// ============================================
// Injects an artificial delay per chunk operation when
// DEFAULT_CONFIG.latency.mode is set to "high".
// This is intentionally simple -- no randomness, no per-node
// variance -- just a clean global slow-mode for demo visualization.
// ============================================

import { DEFAULT_CONFIG } from "./types";

/**
 * Inject a fixed delay if high-latency mode is active.
 * Call this before any per-chunk read / verify / reassemble step.
 *
 * - "default" mode: returns immediately (no delay)
 * - "high"    mode: waits DEFAULT_CONFIG.latency.highDelayMs
 */
export async function simulateLatency(_nodeId?: string): Promise<void> {
  if (DEFAULT_CONFIG.latency.mode === "high") {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, DEFAULT_CONFIG.latency.highDelayMs),
    );
  }
}
