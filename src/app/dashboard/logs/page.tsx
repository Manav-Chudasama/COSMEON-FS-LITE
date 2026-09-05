"use client";

import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Layers,
  Link2,
  RefreshCw,
  Satellite,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FSLogEntry } from "@/lib/fs-lite/types";

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
  ERASURE_ENCODE: ShieldCheck,
  ERASURE_DECODE: ShieldCheck,
  CACHE_HIT: Zap,
  CACHE_MISS: Zap,
  CACHE_EVICT: Zap,
  FILE_SHARE: Share2,
  FILE_SHARE_REVOKE: ShieldAlert,
  FILE_SHARE_LINK_CREATE: Link2,
  FILE_SHARE_LINK_REVOKE: ShieldAlert,
  FILE_SHARE_DOWNLOAD: Download,
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
  ERASURE_ENCODE: "text-purple-500",
  ERASURE_DECODE: "text-purple-500",
  CACHE_HIT: "text-green-500",
  CACHE_MISS: "text-muted-foreground",
  CACHE_EVICT: "text-yellow-500",
  FILE_SHARE: "text-primary",
  FILE_SHARE_REVOKE: "text-yellow-500",
  FILE_SHARE_LINK_CREATE: "text-primary",
  FILE_SHARE_LINK_REVOKE: "text-yellow-500",
  FILE_SHARE_DOWNLOAD: "text-blue-500",
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

const PAGE_SIZE = 20;

export default function LogsPage() {
  const [entries, setEntries] = useState<FSLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(() => {
    const url = filter
      ? `/api/fs/logs?category=${filter}&limit=500`
      : "/api/fs/logs?limit=500";

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setEntries(data.entries || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filter]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const filterTypes: { label: string; value: string | null }[] = [
    { label: "All", value: null },
    { label: "Files", value: "files" },
    { label: "Nodes", value: "nodes" },
    { label: "Integrity", value: "integrity" },
    { label: "Cache", value: "cache" },
    { label: "Rebalance", value: "rebalance" },
  ];

  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const paginated = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Activity Log</h1>
          <p className="text-xs text-muted-foreground">
            <Activity className="mr-1 inline h-3 w-3" />
            Real-time system events · Auto-refreshing every 3s
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs rounded-none cursor-pointer"
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
            className="text-xs font-mono rounded-none cursor-pointer"
            onClick={() => setFilter(ft.value)}
          >
            {ft.label}
          </Button>
        ))}
      </div>

      <Card className="rounded-none">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {entries.length} events
            </CardTitle>
            {entries.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
            )}
          </div>
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
            <>
              <AnimatePresence mode="popLayout">
                {paginated.map((entry) => {
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
                      transition={{ duration: 0.2 }}
                      className="flex items-start gap-3 border-b border-border/50 py-3 last:border-0"
                    >
                      <div className={`mt-0.5 ${color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[9px] font-mono rounded-none"
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

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <span className="text-xs text-muted-foreground">
                    Showing {(page - 1) * PAGE_SIZE + 1}–
                    {Math.min(page * PAGE_SIZE, entries.length)} of{" "}
                    {entries.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0 rounded-none cursor-pointer"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => {
                        return (
                          p === 1 || p === totalPages || Math.abs(p - page) <= 1
                        );
                      })
                      .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                        if (
                          idx > 0 &&
                          (p as number) - (arr[idx - 1] as number) > 1
                        ) {
                          acc.push("...");
                        }
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, idx) =>
                        p === "..." ? (
                          <span
                            key={`ellipsis-${idx}`}
                            className="px-1 text-xs text-muted-foreground"
                          >
                            ...
                          </span>
                        ) : (
                          <Button
                            key={p}
                            variant={page === p ? "default" : "outline"}
                            size="sm"
                            className="h-7 min-w-7 px-2 text-xs rounded-none cursor-pointer font-mono"
                            onClick={() => setPage(p as number)}
                          >
                            {p}
                          </Button>
                        ),
                      )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0 rounded-none cursor-pointer"
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
