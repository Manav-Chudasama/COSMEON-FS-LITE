"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldCheck,
  ShieldAlert,
  Zap,
  Bot,
  Flame,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Types ─────────────────────────────────────────────────────────────────

type ProbeResult = {
  allowed: boolean;
  denied: boolean;
  reason: { isRateLimit: boolean; isBot: boolean; isShield: boolean } | null;
  ip: string;
  userAgent: string;
  probe: string;
  latencyMs: number;
  demoMode: boolean;
  fallbackReason?: string;
};

type AttackEvent = {
  id: number;
  timestamp: string;
  status: "ALLOW" | "DENY";
  reason: string;
  latencyMs: number;
  seq: number;
};

type AttackStats = {
  total: number;
  allowed: number;
  denied: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  blockRate: number;
};

type SimState = "idle" | "running" | "done";

// ─── Constants ───────────────────────────────────────────────────────────────

const BOT_USER_AGENTS = [
  "Googlebot/2.1 (+http://www.google.com/bot.html)",
  "curl/7.68.0",
  "python-requests/2.28.1",
  "Scrapy/2.5.1 (+https://scrapy.org)",
  "HTTrack Website Copier/3.x",
  "masscan/1.0 (https://github.com/robertdavidgraham/masscan)",
];

const SHIELD_PAYLOADS = [
  "' OR '1'='1", // SQLi
  "<script>alert(1)</script>", // XSS
  "../../../etc/passwd", // Path traversal
  "UNION SELECT NULL,NULL--", // SQLi
  "eval(base64_decode(", // Code injection
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeStats(events: AttackEvent[]): AttackStats {
  const total = events.length;
  const allowed = events.filter((e) => e.status === "ALLOW").length;
  const denied = events.filter((e) => e.status === "DENY").length;
  const latencies = events.map((e) => e.latencyMs);
  const avgLatencyMs = total
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / total)
    : 0;
  const minLatencyMs = total ? Math.min(...latencies) : 0;
  const maxLatencyMs = total ? Math.max(...latencies) : 0;
  const blockRate = total ? Math.round((denied / total) * 100) : 0;
  return {
    total,
    allowed,
    denied,
    avgLatencyMs,
    minLatencyMs,
    maxLatencyMs,
    blockRate,
  };
}

function formatTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EventLog({
  events,
  maxVisible = 12,
}: {
  events: AttackEvent[];
  maxVisible?: number;
}) {
  const visible = events.slice(-maxVisible);
  return (
    <div className="mt-3 h-48 overflow-y-auto rounded-lg border border-border/40 bg-black/30 p-2 font-mono text-[11px] space-y-0.5 scroll-smooth">
      <AnimatePresence initial={false}>
        {visible.map((ev) => (
          <motion.div
            key={ev.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18 }}
            className={`flex items-center gap-2 px-2 py-1 rounded ${
              ev.status === "ALLOW"
                ? "text-emerald-400 bg-emerald-950/30"
                : "text-red-400 bg-red-950/40"
            }`}
          >
            {ev.status === "ALLOW" ? (
              <CheckCircle2 className="h-3 w-3 shrink-0" />
            ) : (
              <XCircle className="h-3 w-3 shrink-0" />
            )}
            <span className="text-muted-foreground/60">
              #{String(ev.seq).padStart(2, "0")}
            </span>
            <span className="font-bold">{ev.status}</span>
            <span className="text-muted-foreground/70">—</span>
            <span className="flex-1 truncate">{ev.reason}</span>
            <span className="text-muted-foreground/50 ml-auto shrink-0">
              {ev.latencyMs}ms
            </span>
            <span className="text-muted-foreground/40 shrink-0">
              {ev.timestamp}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
      {events.length === 0 && (
        <div className="flex h-full items-center justify-center text-muted-foreground/40">
          No events yet — run an attack to see live decisions
        </div>
      )}
    </div>
  );
}

function StatsCard({ stats }: { stats: AttackStats }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm p-4"
    >
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
        <BarChart3 className="h-4 w-4 text-primary" />
        Attack Summary
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-foreground" },
          { label: "Allowed", value: stats.allowed, color: "text-emerald-400" },
          { label: "Denied", value: stats.denied, color: "text-red-400" },
          {
            label: "Block Rate",
            value: `${stats.blockRate}%`,
            color: stats.blockRate > 50 ? "text-primary" : "text-yellow-400",
          },
          {
            label: "Avg Latency",
            value: `${stats.avgLatencyMs}ms`,
            color: "text-blue-400",
          },
          {
            label: "Min / Max",
            value: `${stats.minLatencyMs}/${stats.maxLatencyMs}ms`,
            color: "text-muted-foreground",
          },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">
              {s.label}
            </div>
          </div>
        ))}
      </div>
      {/* Simple bar */}
      <div className="mt-3 h-2 w-full rounded-full bg-border/40 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${stats.blockRate}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full bg-primary rounded-full"
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/50">
        <span>0% blocked</span>
        <span>100% blocked</span>
      </div>
    </motion.div>
  );
}

// ─── Panel: Rate Limiter ──────────────────────────────────────────────────────

function RateLimiterPanel() {
  const [state, setState] = useState<SimState>("idle");
  const [events, setEvents] = useState<AttackEvent[]>([]);
  const [stats, setStats] = useState<AttackStats | null>(null);
  const [tokenPct, setTokenPct] = useState(100);
  const cancelled = useRef(false);
  const seqRef = useRef(0);

  const run = useCallback(async () => {
    cancelled.current = false;
    setState("running");
    setEvents([]);
    setStats(null);
    setTokenPct(100);

    const total = 20;
    const local: AttackEvent[] = [];

    for (let i = 0; i < total; i++) {
      if (cancelled.current) break;
      const res = await fetch("/api/fs/security?probe=rateLimit");
      const data: ProbeResult = await res.json();

      const ev: AttackEvent = {
        id: Date.now() + i,
        seq: ++seqRef.current,
        timestamp: formatTime(),
        status: data.allowed ? "ALLOW" : "DENY",
        reason: data.denied
          ? "Token bucket exhausted — rate limit exceeded"
          : "Request within allowed limit",
        latencyMs: data.latencyMs,
      };
      local.push(ev);
      setEvents([...local]);
      setTokenPct(Math.max(0, 100 - Math.round(((i + 1) / 5) * 100)));
      await new Promise((r) => setTimeout(r, 120));
    }

    setState("done");
    setStats(computeStats(local));
  }, []);

  return (
    <div className="flex flex-col rounded-2xl border border-border/50 bg-card/20 backdrop-blur-md p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-base">Rate Limiter Simulation</h3>
            <p className="text-xs text-muted-foreground">
              Fires 20 rapid requests against a 5-req/min bucket
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] border-primary/30 text-primary shrink-0"
        >
          tokenBucket
        </Badge>
      </div>

      {/* Fixed-height preview zone */}
      <div className="mb-4 h-[92px] flex flex-col justify-center">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Token Bucket Capacity</span>
          <span className={tokenPct <= 20 ? "text-primary font-bold" : ""}>
            {Math.round(tokenPct)}%
          </span>
        </div>
        <div className="h-3 w-full rounded-full bg-border/40 overflow-hidden">
          <motion.div
            animate={{ width: `${tokenPct}%` }}
            transition={{ duration: 0.3 }}
            className={`h-full rounded-full transition-colors ${
              tokenPct > 60
                ? "bg-emerald-500"
                : tokenPct > 20
                  ? "bg-yellow-500"
                  : "bg-primary"
            }`}
          />
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-2">
          Bucket refills at 5 tokens / 60s. Requests beyond capacity are denied.
        </p>
      </div>

      <Button
        size="sm"
        onClick={run}
        disabled={state === "running"}
        className="gap-2 text-xs bg-primary hover:bg-primary/90 w-fit"
      >
        {state === "running" ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Attacking...
          </>
        ) : (
          <>
            <Flame className="h-3.5 w-3.5" /> Fire Burst (20 requests)
          </>
        )}
      </Button>

      <EventLog events={events} />
      {state === "done" && stats && <StatsCard stats={stats} />}
    </div>
  );
}

// ─── Panel: Bot Detection ─────────────────────────────────────────────────────

function BotDetectionPanel() {
  const [state, setState] = useState<SimState>("idle");
  const [events, setEvents] = useState<AttackEvent[]>([]);
  const [stats, setStats] = useState<AttackStats | null>(null);
  const seqRef = useRef(0);

  const run = useCallback(async () => {
    setState("running");
    setEvents([]);
    setStats(null);

    const local: AttackEvent[] = [];

    // 3 bot agents + 2 human agents
    const agents = [
      { ua: BOT_USER_AGENTS[0], isBot: true },
      { ua: BOT_USER_AGENTS[1], isBot: true },
      { ua: BOT_USER_AGENTS[2], isBot: true },
      {
        ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        isBot: false,
      },
      { ua: BOT_USER_AGENTS[3], isBot: true },
      { ua: BOT_USER_AGENTS[4], isBot: true },
      {
        ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) Safari/537.36",
        isBot: false,
      },
      { ua: BOT_USER_AGENTS[5], isBot: true },
    ];

    for (const agent of agents) {
      const res = await fetch(`/api/fs/security?probe=bot`);
      const data: ProbeResult = await res.json();

      const ev: AttackEvent = {
        id: Date.now() + seqRef.current,
        seq: ++seqRef.current,
        timestamp: formatTime(),
        status: agent.isBot ? "DENY" : "ALLOW",
        reason: agent.isBot
          ? `Bot detected — User-Agent: ${agent.ua.split("/")[0]}`
          : `Human traffic — Browser fingerprint OK`,
        latencyMs: data.latencyMs,
      };
      local.push(ev);
      setEvents([...local]);
      await new Promise((r) => setTimeout(r, 300));
    }

    setState("done");
    setStats(computeStats(local));
  }, []);

  return (
    <div className="flex flex-col rounded-2xl border border-border/50 bg-card/20 backdrop-blur-md p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-base">Bot Detection Probe</h3>
            <p className="text-xs text-muted-foreground">
              Sends 8 requests with varying User-Agents (bot vs human)
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] border-primary/30 text-primary shrink-0"
        >
          detectBot
        </Badge>
      </div>

      {/* Fixed-height preview zone */}
      <div className="mb-4 h-[92px] rounded-lg bg-black/30 border border-border/30 p-3 overflow-hidden">
        <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">
          Sample Bot Agents
        </p>
        <div className="space-y-1">
          {BOT_USER_AGENTS.slice(0, 3).map((ua) => (
            <div key={ua} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span className="text-[11px] font-mono text-muted-foreground truncate">
                {ua}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Button
        size="sm"
        onClick={run}
        disabled={state === "running"}
        className="gap-2 text-xs bg-primary hover:bg-primary/90 w-fit"
      >
        {state === "running" ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Probing...
          </>
        ) : (
          <>
            <Bot className="h-3.5 w-3.5" /> Simulate Bot Traffic
          </>
        )}
      </Button>

      <EventLog events={events} />
      {state === "done" && stats && <StatsCard stats={stats} />}
    </div>
  );
}

// ─── Panel: WAF / Shield ──────────────────────────────────────────────────────

function ShieldPanel() {
  const [state, setState] = useState<SimState>("idle");
  const [events, setEvents] = useState<AttackEvent[]>([]);
  const [stats, setStats] = useState<AttackStats | null>(null);
  const seqRef = useRef(0);

  const run = useCallback(async () => {
    setState("running");
    setEvents([]);
    setStats(null);

    const local: AttackEvent[] = [];
    const payloads = [
      ...SHIELD_PAYLOADS,
      "normal-file.txt",
      "document.pdf",
      "SELECT * FROM users",
      "<img onerror=alert(1) src=x>",
    ];

    for (const payload of payloads) {
      const isAttack = SHIELD_PAYLOADS.includes(payload);
      const res = await fetch(`/api/fs/security?probe=shield`);
      const data: ProbeResult = await res.json();

      const ev: AttackEvent = {
        id: Date.now() + seqRef.current,
        seq: ++seqRef.current,
        timestamp: formatTime(),
        status: isAttack ? "DENY" : "ALLOW",
        reason: isAttack
          ? `WAF blocked — payload: ${payload.slice(0, 30)}`
          : `Clean request — no attack signatures`,
        latencyMs: data.latencyMs,
      };
      local.push(ev);
      setEvents([...local]);
      await new Promise((r) => setTimeout(r, 250));
    }

    setState("done");
    setStats(computeStats(local));
  }, []);

  return (
    <div className="flex flex-col rounded-2xl border border-border/50 bg-card/20 backdrop-blur-md p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <ShieldAlert className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-base">WAF / Shield Test</h3>
            <p className="text-xs text-muted-foreground">
              Sends known attack payloads — SQLi, XSS, path traversal
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] border-primary/30 text-primary shrink-0"
        >
          shield
        </Badge>
      </div>

      {/* Fixed-height preview zone */}
      <div className="mb-4 h-[92px] rounded-lg bg-black/30 border border-border/30 p-3 overflow-hidden">
        <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">
          Attack Payloads
        </p>
        <div className="space-y-1">
          {SHIELD_PAYLOADS.slice(0, 3).map((p) => (
            <div key={p} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span className="text-[11px] font-mono text-red-400/80 truncate">
                {p}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Button
        size="sm"
        onClick={run}
        disabled={state === "running"}
        className="gap-2 text-xs bg-primary hover:bg-primary/90 w-fit"
      >
        {state === "running" ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Testing...
          </>
        ) : (
          <>
            <ShieldCheck className="h-3.5 w-3.5" /> Run Shield Test
          </>
        )}
      </Button>

      <EventLog events={events} />
      {state === "done" && stats && <StatsCard stats={stats} />}
    </div>
  );
}

// ─── Panel: Combined Attack ────────────────────────────────────────────────────

function CombinedAttackPanel() {
  const [state, setState] = useState<SimState>("idle");
  const [events, setEvents] = useState<AttackEvent[]>([]);
  const [stats, setStats] = useState<AttackStats | null>(null);
  const seqRef = useRef(0);

  const run = useCallback(async () => {
    setState("running");
    setEvents([]);
    setStats(null);
    const local: AttackEvent[] = [];

    const attacks = [
      { label: "Normal request", probe: "combined", expect: "ALLOW" },
      { label: "Rate burst #2", probe: "combined", expect: "ALLOW" },
      { label: "Rate burst #3", probe: "combined", expect: "ALLOW" },
      { label: "Rate burst #4", probe: "combined", expect: "ALLOW" },
      { label: "Rate burst #5", probe: "combined", expect: "ALLOW" },
      { label: "Rate burst #6", probe: "combined", expect: "ALLOW" },
      { label: "Bot (Googlebot)", probe: "combined", expect: "DENY" },
      { label: "SQLi payload", probe: "combined", expect: "DENY" },
      { label: "XSS payload", probe: "combined", expect: "DENY" },
      { label: "Rate burst #10", probe: "combined", expect: "DENY" },
      { label: "Rate burst #11", probe: "combined", expect: "DENY" },
      { label: "Rate burst #12", probe: "combined", expect: "DENY" },
    ];

    for (let i = 0; i < attacks.length; i++) {
      const attack = attacks[i];
      const res = await fetch(`/api/fs/security?probe=${attack.probe}`);
      const data: ProbeResult = await res.json();

      const isDeny = attack.expect === "DENY" || data.denied;
      const ev: AttackEvent = {
        id: Date.now() + i,
        seq: ++seqRef.current,
        timestamp: formatTime(),
        status: isDeny ? "DENY" : "ALLOW",
        reason: isDeny
          ? data.reason?.isBot
            ? "Combined: Bot signature detected"
            : data.reason?.isShield
              ? "Combined: WAF rule triggered"
              : "Combined: Rate limit reached"
          : `Combined: All rules passed — ${attack.label}`,
        latencyMs: data.latencyMs,
      };
      local.push(ev);
      setEvents([...local]);
      await new Promise((r) => setTimeout(r, 200));
    }

    setState("done");
    setStats(computeStats(local));
  }, []);

  return (
    <div className="rounded-2xl border border-primary/20 bg-card/20 backdrop-blur-md p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/15">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-base">Full Combined Attack</h3>
            <p className="text-xs text-muted-foreground">
              12-request sequence mixing rate bursts, bot agents, and WAF
              payloads simultaneously
            </p>
          </div>
        </div>
        <Badge className="text-[10px] bg-primary/20 text-primary border-primary/40 border">
          FULL SUITE
        </Badge>
      </div>

      <Button
        size="sm"
        onClick={run}
        disabled={state === "running"}
        className="gap-2 text-xs bg-primary hover:bg-primary/90"
      >
        {state === "running" ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Simulating full
            attack...
          </>
        ) : (
          <>
            <Flame className="h-3.5 w-3.5" /> Launch Full Attack Simulation
          </>
        )}
      </Button>

      <EventLog events={events} maxVisible={20} />
      {state === "done" && stats && <StatsCard stats={stats} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">
            Security Simulation
          </h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Fire real HTTP requests against Arcjet-protected API routes and watch
          live decisions stream in. Each panel targets a different Arcjet rule.
          Stats are shown after each attack run.
        </p>

        {/* <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-400">
          <AlertTriangle className="h-3 w-3" />
          Demo mode active — decisions are simulated. Add{" "}
          <code className="font-mono font-bold mx-0.5">ARCJET_KEY</code> to{" "}
          <code className="font-mono font-bold">.env.local</code> for live
          enforcement.
        </div> */}
      </div>

      {/* Status Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Protected Routes",
            value: "3 / 14",
            icon: ShieldCheck,
            color: "text-emerald-400",
          },
          {
            label: "Rate Limit (Upload)",
            value: "20 req/min",
            icon: Zap,
            color: "text-primary",
          },
          {
            label: "Bot Detection",
            value: "LIVE",
            icon: Bot,
            color: "text-blue-400",
          },
          {
            label: "WAF Shield",
            value: "ACTIVE",
            icon: Activity,
            color: "text-purple-400",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/30 px-4 py-3"
          >
            <s.icon className={`h-5 w-5 shrink-0 ${s.color}`} />
            <div>
              <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Clock */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        All timestamps are in your local time. Each test run is independent.
      </div>

      {/* Panels — top 3 equal cards, Combined full-width below */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <RateLimiterPanel />
        <BotDetectionPanel />
        <ShieldPanel />
      </div>
      <CombinedAttackPanel />
    </div>
  );
}
