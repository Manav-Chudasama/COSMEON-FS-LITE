"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  RefreshCw,
  Upload,
  Download,
  Trash2,
  Satellite,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Activity,
  Database,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FSLogEntry, LogEventType } from "@/lib/fs-lite/types";

const typeIcons: Record<string, React.ElementType> = {
  FILE_UPLOAD: Upload,
  FILE_DOWNLOAD: Download,
  FILE_DELETE: Trash2,
  CHUNK_DISTRIBUTE: Layers,
  CHUNK_REPLICATE: Database,
  NODE_CREATE: Satellite,
  NODE_FAILURE: ShieldAlert,
  NODE_RECOVERY: Satellite,
  NODE_DEGRADED: ShieldAlert,
  REBALANCE: RefreshCw,
  INTEGRITY_CHECK: ShieldCheck,
  INTEGRITY_PASS: ShieldCheck,
  INTEGRITY_FAIL: ShieldAlert,
  INTEGRITY_ALERT: ShieldAlert,
  CACHE_HIT: Zap,
  CACHE_MISS: Zap,
  CACHE_EVICT: Zap,
};

const typeColors: Record<string, string> = {
  FILE_UPLOAD: "text-green-500",
  FILE_DOWNLOAD: "text-blue-500",
  FILE_DELETE: "text-red-500",
  CHUNK_DISTRIBUTE: "text-primary",
  CHUNK_REPLICATE: "text-purple-500",
  NODE_CREATE: "text-green-500",
  NODE_FAILURE: "text-red-500",
  NODE_RECOVERY: "text-green-500",
  NODE_DEGRADED: "text-yellow-500",
  REBALANCE: "text-yellow-500",
  INTEGRITY_CHECK: "text-blue-500",
  INTEGRITY_PASS: "text-green-500",
  INTEGRITY_FAIL: "text-red-500",
  INTEGRITY_ALERT: "text-red-500",
  CACHE_HIT: "text-green-500",
  CACHE_MISS: "text-muted-foreground",
  CACHE_EVICT: "text-yellow-500",
};

const logVariants = {
  hidden: { opacity: 0, x: -20, height: 0 },
  visible: { opacity: 1, x: 0, height: "auto" },
  exit: { opacity: 0, x: 20, height: 0 },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function LogsPage() {
  const [entries, setEntries] = useState<FSLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  const fetchLogs = useCallback(() => {
    const url = filter
      ? `/api/fs/logs?type=${filter}`
      : "/api/fs/logs?limit=200";

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setEntries(data.entries || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    fetchLogs();
    // Auto-refresh every 3 seconds
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const filterTypes: { label: string; value: string | null }[] = [
    { label: "All", value: null },
    { label: "Files", value: "FILE_UPLOAD" },
    { label: "Nodes", value: "NODE_FAILURE" },
    { label: "Integrity", value: "INTEGRITY_CHECK" },
    { label: "Cache", value: "CACHE_HIT" },
    { label: "Rebalance", value: "REBALANCE" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Activity Log</h1>
          <p className="text-xs text-muted-foreground">
            <Activity className="mr-1 inline h-3 w-3" />
            Real-time system events · Auto-refreshing
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs"
          onClick={fetchLogs}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {filterTypes.map((ft) => (
          <Button
            key={ft.label}
            variant={filter === ft.value ? "default" : "outline"}
            size="sm"
            className="text-[10px]"
            onClick={() => setFilter(ft.value)}
          >
            {ft.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            {entries.length} events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Loading events...
            </p>
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No events yet. Upload a file or toggle a node to generate
              activity.
            </p>
          ) : (
            <ScrollArea className="h-[500px]">
              <AnimatePresence mode="popLayout">
                {entries.map((entry) => {
                  const Icon = typeIcons[entry.type] || Activity;
                  const color =
                    typeColors[entry.type] || "text-muted-foreground";

                  return (
                    <motion.div
                      key={entry.id}
                      variants={logVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={{ duration: 0.3 }}
                      className="flex items-start gap-3 border-b border-border/50 py-3 last:border-0"
                    >
                      <div className={`mt-0.5 ${color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[9px] font-mono"
                          >
                            {entry.type}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {formatTime(entry.timestamp)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs">{entry.message}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
