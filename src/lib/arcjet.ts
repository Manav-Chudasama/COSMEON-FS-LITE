// ============================================
// COSMEON FS-LITE — Arcjet Security Configuration
// ============================================

import arcjet, { shield, detectBot, tokenBucket } from "@arcjet/next";

// ── Shared Arcjet client ──────────────────────

const aj = arcjet({
  key: process.env.ARCJET_KEY!,
  characteristics: ["ip.src"],
  rules: [],
});

// ── Route-specific configurations ─────────────

/** Upload route: strict rate limiting + bot protection + WAF */
export const uploadProtection = aj
  .withRule(
    tokenBucket({ mode: "LIVE", refillRate: 20, interval: 60, capacity: 20 }),
  )
  .withRule(detectBot({ mode: "LIVE", allow: [] }))
  .withRule(shield({ mode: "LIVE" }));

/** Download route: moderate rate limiting + bot protection */
export const downloadProtection = aj
  .withRule(
    tokenBucket({ mode: "LIVE", refillRate: 60, interval: 60, capacity: 60 }),
  )
  .withRule(detectBot({ mode: "LIVE", allow: [] }));

/** Read routes (files listing, logs): moderate rate limiting */
export const readProtection = aj.withRule(
  tokenBucket({ mode: "LIVE", refillRate: 60, interval: 60, capacity: 60 }),
);

/** Delete route: strict rate limiting + bot + WAF */
export const deleteProtection = aj
  .withRule(
    tokenBucket({ mode: "LIVE", refillRate: 10, interval: 60, capacity: 10 }),
  )
  .withRule(detectBot({ mode: "LIVE", allow: [] }))
  .withRule(shield({ mode: "LIVE" }));

/** Node mutation routes: moderate + WAF */
export const nodeMutationProtection = aj
  .withRule(
    tokenBucket({ mode: "LIVE", refillRate: 20, interval: 60, capacity: 20 }),
  )
  .withRule(shield({ mode: "LIVE" }));

export default aj;
