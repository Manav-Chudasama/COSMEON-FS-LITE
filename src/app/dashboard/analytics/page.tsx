"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Shield,
  Activity,
  HardDrive,
  Layers,
  Zap,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";

// ── Types ──
interface FaultToleranceData {
  score: number;
  breakdown: {
    nodeScore: number;
    replicationScore: number;
    rebalanceScore: number;
    balanceScore: number;
  };
  details: {
    onlineNodes: number;
    totalNodes: number;
    replicationFactor: number;
    totalRebalances: number;
    successfulRebalances: number;
    chunkDeviation: number;
  };
}

interface TimelineEntry {
  hour: string;
  uploads: number;
  downloads: number;
  failures: number;
  rebalances: number;
  integrity: number;
}

interface NodeDistEntry {
  name: string;
  status: string;
  chunks: number;
  usedBytes: number;
  capacityBytes: number;
  latencyMs: number;
}

interface AnalyticsData {
  faultTolerance: FaultToleranceData;
  eventCounts: Record<string, number>;
  timeline: TimelineEntry[];
  nodeDistribution: NodeDistEntry[];
  cacheStats: {
    hits: number;
    misses: number;
    evictions: number;
    hitRate: number;
    currentSizeBytes: number;
    maxSizeBytes: number;
    itemCount: number;
  };
  systemStats: {
    totalFiles: number;
    totalChunks: number;
    totalNodes: number;
    onlineNodes: number;
    offlineNodes: number;
    totalStorage: number;
    usedStorage: number;
  };
}

// ── Dummy data generator ──
function generateDummyTimeline(real: TimelineEntry[]): TimelineEntry[] {
  return real.map((entry, i) => ({
    ...entry,
    uploads: entry.uploads + Math.floor(Math.sin(i * 0.5) * 3 + 4),
    downloads: entry.downloads + Math.floor(Math.cos(i * 0.3) * 2 + 3),
    failures: entry.failures + (i % 8 === 0 ? 1 : 0),
    rebalances: entry.rebalances + (i % 6 === 0 ? 1 : 0),
    integrity: entry.integrity + Math.floor(Math.sin(i * 0.8) * 1 + 2),
  }));
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// ── Chart configs ──
const timelineConfig: ChartConfig = {
  uploads: { label: "Uploads", color: "hsl(25, 95%, 53%)" },
  downloads: { label: "Downloads", color: "hsl(210, 80%, 55%)" },
  failures: { label: "Failures", color: "hsl(0, 84%, 60%)" },
  rebalances: { label: "Rebalances", color: "hsl(280, 70%, 55%)" },
  integrity: { label: "Integrity", color: "hsl(150, 60%, 45%)" },
};

const eventPieConfig: ChartConfig = {
  FILE_UPLOAD: { label: "Uploads", color: "hsl(25, 95%, 53%)" },
  FILE_DOWNLOAD: { label: "Downloads", color: "hsl(210, 80%, 55%)" },
  FILE_DELETE: { label: "Deletes", color: "hsl(0, 84%, 60%)" },
  NODE_FAILURE: { label: "Failures", color: "hsl(350, 80%, 50%)" },
  NODE_RECOVERY: { label: "Recovery", color: "hsl(150, 60%, 45%)" },
  REBALANCE: { label: "Rebalance", color: "hsl(280, 70%, 55%)" },
  CHUNK_DISTRIBUTE: { label: "Distribute", color: "hsl(45, 90%, 50%)" },
  CHUNK_REPLICATE: { label: "Replicate", color: "hsl(180, 60%, 45%)" },
  INTEGRITY_CHECK: { label: "Integrity", color: "hsl(200, 50%, 50%)" },
  OTHER: { label: "Other", color: "hsl(0, 0%, 60%)" },
};

const storageConfig: ChartConfig = {
  used: { label: "Used", color: "hsl(25, 95%, 53%)" },
  free: { label: "Free", color: "hsl(0, 0%, 30%)" },
};

const chunkConfig: ChartConfig = {
  chunks: { label: "Chunks", color: "hsl(25, 95%, 53%)" },
};

const cacheConfig: ChartConfig = {
  hits: { label: "Hits", color: "hsl(150, 60%, 45%)" },
  misses: { label: "Misses", color: "hsl(0, 84%, 60%)" },
  evictions: { label: "Evictions", color: "hsl(45, 90%, 50%)" },
};

// ── Dummy event counts to blend ──
const DUMMY_EVENT_COUNTS: Record<string, number> = {
  FILE_UPLOAD: 24,
  FILE_DOWNLOAD: 38,
  FILE_DELETE: 5,
  CHUNK_DISTRIBUTE: 96,
  CHUNK_REPLICATE: 64,
  NODE_FAILURE: 3,
  NODE_RECOVERY: 3,
  REBALANCE: 8,
  INTEGRITY_CHECK: 12,
  INTEGRITY_PASS: 45,
  CACHE_HIT: 82,
  CACHE_MISS: 18,
};

// ── Score color helper ──
function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "EXCELLENT";
  if (score >= 75) return "GOOD";
  if (score >= 55) return "FAIR";
  if (score >= 35) return "DEGRADED";
  return "CRITICAL";
}

// ── Page Component ──
export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch("/api/fs/analytics")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading analytics...
      </div>
    );
  }

  const { faultTolerance, timeline, nodeDistribution, cacheStats } = data;

  // Blend real + dummy event counts
  const blendedCounts: Record<string, number> = { ...DUMMY_EVENT_COUNTS };
  for (const [k, v] of Object.entries(data.eventCounts)) {
    blendedCounts[k] = (blendedCounts[k] || 0) + v;
  }

  // Prepare pie chart data
  const pieData = Object.entries(blendedCounts)
    .filter(([k]) =>
      [
        "FILE_UPLOAD",
        "FILE_DOWNLOAD",
        "FILE_DELETE",
        "NODE_FAILURE",
        "NODE_RECOVERY",
        "REBALANCE",
        "CHUNK_DISTRIBUTE",
        "CHUNK_REPLICATE",
        "INTEGRITY_CHECK",
      ].includes(k),
    )
    .map(([name, value]) => ({
      name,
      value,
      fill:
        eventPieConfig[name]?.color ||
        eventPieConfig.OTHER?.color ||
        "hsl(0, 0%, 60%)",
    }));

  // Timeline with dummy blend
  const blendedTimeline = generateDummyTimeline(timeline);

  // Storage bar data
  const storageData = nodeDistribution.map((n) => ({
    name: n.name,
    used: n.usedBytes,
    free: Math.max(0, n.capacityBytes - n.usedBytes),
    status: n.status,
  }));

  // Chunk bar data
  const chunkData = nodeDistribution.map((n) => ({
    name: n.name,
    chunks: n.chunks,
    status: n.status,
  }));

  // Cache radial data
  const cacheTotal = Math.max(
    1,
    cacheStats.hits + cacheStats.misses + cacheStats.evictions,
  );
  const dummyCacheHits = cacheStats.hits + 82;
  const dummyCacheMisses = cacheStats.misses + 18;
  const dummyCacheEvictions = cacheStats.evictions + 6;
  const dummyCacheTotal =
    dummyCacheHits + dummyCacheMisses + dummyCacheEvictions;

  const cacheRadialData = [
    {
      name: "hits",
      value: Math.round((dummyCacheHits / dummyCacheTotal) * 100),
      fill: "hsl(150, 60%, 45%)",
    },
    {
      name: "misses",
      value: Math.round((dummyCacheMisses / dummyCacheTotal) * 100),
      fill: "hsl(0, 84%, 60%)",
    },
    {
      name: "evictions",
      value: Math.round((dummyCacheEvictions / dummyCacheTotal) * 100),
      fill: "hsl(45, 90%, 50%)",
    },
  ];

  // Breakdown bars
  const breakdownItems = [
    {
      label: "Node Health",
      value: faultTolerance.breakdown.nodeScore,
      max: 40,
      color: "bg-green-500",
    },
    {
      label: "Replication",
      value: faultTolerance.breakdown.replicationScore,
      max: 25,
      color: "bg-blue-500",
    },
    {
      label: "Rebalancing",
      value: faultTolerance.breakdown.rebalanceScore,
      max: 20,
      color: "bg-purple-500",
    },
    {
      label: "Distribution",
      value: faultTolerance.breakdown.balanceScore,
      max: 15,
      color: "bg-amber-500",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Analytics</h1>
          <p className="text-xs text-muted-foreground">
            System health, events, and performance metrics
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs"
          onClick={fetchData}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Row 1: Score + Timeline + Event Pie */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* ── Panel 1: Fault Tolerance Score ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-primary" />
                Fault Tolerance
              </CardTitle>
              <CardDescription className="text-[10px]">
                System resilience score
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Big score */}
              <div className="flex flex-col items-center gap-1">
                <div className="relative flex h-28 w-28 items-center justify-center">
                  {/* Background ring */}
                  <svg
                    className="absolute h-full w-full -rotate-90"
                    viewBox="0 0 100 100"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-muted/30"
                    />
                    <motion.circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeLinecap="round"
                      className={getScoreColor(faultTolerance.score)}
                      strokeDasharray={`${(faultTolerance.score / 100) * 264} 264`}
                      initial={{ strokeDasharray: "0 264" }}
                      animate={{
                        strokeDasharray: `${(faultTolerance.score / 100) * 264} 264`,
                      }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                    />
                  </svg>
                  <div className="flex flex-col items-center">
                    <span
                      className={`text-2xl font-bold tabular-nums ${getScoreColor(faultTolerance.score)}`}
                    >
                      {faultTolerance.score}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      / 100
                    </span>
                  </div>
                </div>
                <Badge
                  variant={
                    faultTolerance.score >= 75 ? "default" : "destructive"
                  }
                  className="text-[9px]"
                >
                  {getScoreLabel(faultTolerance.score)}
                </Badge>
              </div>

              {/* Breakdown bars */}
              <div className="space-y-2.5">
                {breakdownItems.map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">
                        {item.label}
                      </span>
                      <span className="font-medium tabular-nums">
                        {item.value}/{item.max}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted/30">
                      <motion.div
                        className={`h-full rounded-full ${item.color}`}
                        initial={{ width: 0 }}
                        animate={{
                          width: `${(item.value / item.max) * 100}%`,
                        }}
                        transition={{
                          duration: 1,
                          ease: "easeOut",
                          delay: 0.3,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-2 pt-1 text-[10px] text-muted-foreground">
                <span>
                  Nodes: {faultTolerance.details.onlineNodes}/
                  {faultTolerance.details.totalNodes}
                </span>
                <span>
                  Replication: {faultTolerance.details.replicationFactor}x
                </span>
                <span>
                  Rebalances: {faultTolerance.details.totalRebalances}
                </span>
                <span>Deviation: {faultTolerance.details.chunkDeviation}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Panel 2: Event Timeline ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="md:col-span-2"
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-primary" />
                Event Timeline
              </CardTitle>
              <CardDescription className="text-[10px]">
                System activity over the last 24 hours
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={timelineConfig}
                className="h-[280px] w-full"
              >
                <AreaChart
                  data={blendedTimeline}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tickLine={false}
                    axisLine={false}
                    fontSize={9}
                    interval={3}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={9}
                    width={25}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area
                    type="monotone"
                    dataKey="uploads"
                    stackId="1"
                    stroke="var(--color-uploads)"
                    fill="var(--color-uploads)"
                    fillOpacity={0.4}
                  />
                  <Area
                    type="monotone"
                    dataKey="downloads"
                    stackId="1"
                    stroke="var(--color-downloads)"
                    fill="var(--color-downloads)"
                    fillOpacity={0.3}
                  />
                  <Area
                    type="monotone"
                    dataKey="integrity"
                    stackId="1"
                    stroke="var(--color-integrity)"
                    fill="var(--color-integrity)"
                    fillOpacity={0.3}
                  />
                  <Area
                    type="monotone"
                    dataKey="rebalances"
                    stackId="1"
                    stroke="var(--color-rebalances)"
                    fill="var(--color-rebalances)"
                    fillOpacity={0.3}
                  />
                  <Area
                    type="monotone"
                    dataKey="failures"
                    stackId="1"
                    stroke="var(--color-failures)"
                    fill="var(--color-failures)"
                    fillOpacity={0.5}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Row 2: Event Distribution + Node Storage + Chunk Distribution */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* ── Panel 3: Event Distribution ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Layers className="h-4 w-4 text-primary" />
                Event Distribution
              </CardTitle>
              <CardDescription className="text-[10px]">
                Breakdown by event type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={eventPieConfig}
                className="mx-auto h-[240px] w-full"
              >
                <PieChart>
                  <ChartTooltip
                    content={<ChartTooltipContent nameKey="name" />}
                  />
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    strokeWidth={2}
                    stroke="hsl(var(--background))"
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              {/* Legend */}
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {pieData.slice(0, 6).map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5">
                    <div
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: entry.fill }}
                    />
                    <span className="truncate text-[9px] text-muted-foreground">
                      {eventPieConfig[entry.name]?.label || entry.name}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Panel 4: Node Storage ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <HardDrive className="h-4 w-4 text-primary" />
                Node Storage
              </CardTitle>
              <CardDescription className="text-[10px]">
                Used vs capacity per node
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={storageConfig}
                className="h-[260px] w-full"
              >
                <BarChart
                  data={storageData}
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    fontSize={9}
                    tickFormatter={(v) => formatBytes(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    fontSize={9}
                    width={55}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatBytes(value as number)}
                      />
                    }
                  />
                  <Bar
                    dataKey="used"
                    stackId="storage"
                    fill="var(--color-used)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="free"
                    stackId="storage"
                    fill="var(--color-free)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Panel 5: Chunk Distribution ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Layers className="h-4 w-4 text-primary" />
                Chunk Distribution
              </CardTitle>
              <CardDescription className="text-[10px]">
                Chunks per node
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chunkConfig} className="h-[260px] w-full">
                <BarChart
                  data={chunkData}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    fontSize={9}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={9}
                    width={30}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="chunks"
                    fill="var(--color-chunks)"
                    radius={[4, 4, 0, 0]}
                  >
                    {chunkData.map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={
                          entry.status === "offline"
                            ? "hsl(0, 84%, 60%)"
                            : entry.status === "degraded"
                              ? "hsl(45, 90%, 50%)"
                              : "hsl(25, 95%, 53%)"
                        }
                        fillOpacity={entry.status === "offline" ? 0.4 : 0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Row 3: Cache Performance + System Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* ── Panel 6: Cache Performance ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Zap className="h-4 w-4 text-primary" />
                Cache Performance
              </CardTitle>
              <CardDescription className="text-[10px]">
                Hit rate and cache efficiency
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <ChartContainer
                  config={cacheConfig}
                  className="h-[180px] w-[180px]"
                >
                  <RadialBarChart
                    data={cacheRadialData}
                    innerRadius={30}
                    outerRadius={80}
                    barSize={12}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar dataKey="value" background cornerRadius={5} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => `${value}%`}
                          nameKey="name"
                        />
                      }
                    />
                  </RadialBarChart>
                </ChartContainer>

                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">
                      Hit Rate
                    </p>
                    <p className="text-xl font-bold text-green-500 tabular-nums">
                      {Math.round((dummyCacheHits / dummyCacheTotal) * 100)}%
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      {
                        label: "Hits",
                        value: dummyCacheHits,
                        color: "bg-green-500",
                      },
                      {
                        label: "Misses",
                        value: dummyCacheMisses,
                        color: "bg-red-500",
                      },
                      {
                        label: "Evictions",
                        value: dummyCacheEvictions,
                        color: "bg-yellow-500",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center gap-2 text-[10px]"
                      >
                        <div className={`h-2 w-2 rounded-full ${item.color}`} />
                        <span className="text-muted-foreground">
                          {item.label}
                        </span>
                        <span className="ml-auto font-medium tabular-nums">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-1">
                    <p className="text-[10px] text-muted-foreground">
                      Cache Size: {formatBytes(cacheStats.currentSizeBytes)} /{" "}
                      {formatBytes(cacheStats.maxSizeBytes)}
                    </p>
                    <Progress
                      value={
                        cacheStats.maxSizeBytes > 0
                          ? (cacheStats.currentSizeBytes /
                              cacheStats.maxSizeBytes) *
                            100
                          : 0
                      }
                      className="mt-1 h-1.5"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
