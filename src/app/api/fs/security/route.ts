// ============================================
// GET /api/fs/security — Arcjet simulation probe
// Accepts ?probe=rateLimit|bot|shield|combined&userAgent=...
// Returns the full Arcjet decision as JSON so the UI can render it.
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import arcjet, { detectBot, shield, tokenBucket } from "@arcjet/next";

export const dynamic = "force-dynamic";

// Dedicated probe client — separate capacity so probing doesn't
// consume rate-limit tokens from real API routes.
const probeClient = arcjet({
  key: process.env.ARCJET_KEY ?? "ajkey_DEMO0000000000000000000000000",
  characteristics: ["ip.src"],
  rules: [],
});

const rateLimitProbe = probeClient.withRule(
  tokenBucket({ mode: "LIVE", refillRate: 5, interval: 60, capacity: 5 }),
);

const botProbe = probeClient.withRule(detectBot({ mode: "LIVE", allow: [] }));

const shieldProbe = probeClient.withRule(shield({ mode: "LIVE" }));

const combinedProbe = probeClient
  .withRule(
    tokenBucket({ mode: "LIVE", refillRate: 10, interval: 60, capacity: 10 }),
  )
  .withRule(detectBot({ mode: "LIVE", allow: [] }))
  .withRule(shield({ mode: "LIVE" }));

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const probe = searchParams.get("probe") ?? "rateLimit";

  const startMs = Date.now();

  try {
    if (!process.env.ARCJET_KEY) {
      // Demo mode — simulate decisions without a real key
      const demo = simulateDemoDecision(probe);
      return NextResponse.json({
        ...demo,
        latencyMs: Math.floor(Math.random() * 40) + 8,
        demoMode: true,
      });
    }

    let decision;
    switch (probe) {
      case "bot":
        decision = await botProbe.protect(request);
        break;
      case "shield":
        decision = await shieldProbe.protect(request);
        break;
      case "combined":
        decision = await combinedProbe.protect(request, { requested: 1 });
        break;
      default:
        decision = await rateLimitProbe.protect(request, { requested: 1 });
    }

    const latencyMs = Date.now() - startMs;

    return NextResponse.json({
      allowed: decision.isAllowed(),
      denied: decision.isDenied(),
      reason: decision.reason
        ? {
            isRateLimit: decision.reason.isRateLimit(),
            isBot: decision.reason.isBot(),
            isShield: decision.reason.isShield(),
          }
        : null,
      ip: request.headers.get("x-forwarded-for") ?? "127.0.0.1",
      userAgent: request.headers.get("user-agent") ?? "unknown",
      probe,
      latencyMs,
      demoMode: false,
    });
  } catch (error) {
    // Arcjet key invalid / network error — fall back to demo
    const demo = simulateDemoDecision(probe);
    return NextResponse.json({
      ...demo,
      latencyMs: Date.now() - startMs,
      demoMode: true,
      fallbackReason:
        error instanceof Error ? error.message : "Arcjet unavailable",
    });
  }
}

// ─── Demo mode helper ──────────────────────────────────────────────────────
type ProbeResult = {
  allowed: boolean;
  denied: boolean;
  reason: { isRateLimit: boolean; isBot: boolean; isShield: boolean } | null;
  ip: string;
  userAgent: string;
  probe: string;
};

const demoRateLimitCount = new Map<string, number>();

function simulateDemoDecision(probe: string): ProbeResult {
  const base: ProbeResult = {
    allowed: true,
    denied: false,
    reason: null,
    ip: "203.0.113.42",
    userAgent: "Mozilla/5.0 (Demo)",
    probe,
  };

  if (probe === "bot") {
    const botAgents = ["Googlebot/2.1", "curl/7.68.0", "python-requests/2.28"];
    const ua = botAgents[Math.floor(Math.random() * botAgents.length)];
    return {
      ...base,
      userAgent: ua,
      denied: true,
      allowed: false,
      reason: { isRateLimit: false, isBot: true, isShield: false },
    };
  }

  if (probe === "shield") {
    return {
      ...base,
      denied: true,
      allowed: false,
      reason: { isRateLimit: false, isBot: false, isShield: true },
    };
  }

  if (probe === "rateLimit" || probe === "combined") {
    const count = (demoRateLimitCount.get(probe) ?? 0) + 1;
    demoRateLimitCount.set(probe, count);
    const capacity = probe === "combined" ? 10 : 5;
    if (count > capacity) {
      return {
        ...base,
        denied: true,
        allowed: false,
        reason: { isRateLimit: true, isBot: false, isShield: false },
      };
    }
  }

  return base;
}
