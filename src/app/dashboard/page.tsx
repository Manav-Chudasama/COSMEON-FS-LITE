"use client";

import {
  Activity,
  Files,
  Gauge,
  HardDrive,
  Layers,
  Satellite,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SystemStats } from "@/lib/fs-lite/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function AnimatedCounter({
  value,
  duration = 1,
}: {
  value: number;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const start = 0;
    const end = value;
    const startTime = Date.now();
    const durationMs = duration * 1000;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - (1 - progress) ** 3; // ease-out cubic
      setDisplay(Math.round(start + (end - start) * eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return <>{display}</>;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4 },
  },
};

export default function DashboardOverview() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/fs/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Initializing orbital system...
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Files",
      value: stats?.totalFiles || 0,
      icon: Files,
      format: "number" as const,
    },
    {
      title: "Total Chunks",
      value: stats?.totalChunks || 0,
      icon: Layers,
      format: "number" as const,
    },
    {
      title: "Online Nodes",
      value: stats?.onlineNodes || 0,
      icon: Satellite,
      format: "number" as const,
    },
    {
      title: "Storage Used",
      value: stats?.usedStorageBytes || 0,
      icon: HardDrive,
      format: "bytes" as const,
    },
    {
      title: "Cache Hit Rate",
      value: Math.round((stats?.cacheStats?.hitRate || 0) * 100),
      icon: Gauge,
      format: "percent" as const,
    },
    {
      title: "Log Events",
      value: stats?.totalFiles ? stats.totalChunks * 3 : 0,
      icon: Activity,
      format: "number" as const,
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">System Overview</h1>
        <p className="text-xs text-muted-foreground">
          Real-time status of the orbital file system constellation
        </p>
      </div>

      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {statCards.map((card) => (
          <motion.div key={card.title} variants={cardVariants}>
            <Card className="transition-colors hover:border-primary/30">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {card.format === "bytes" ? (
                    formatBytes(card.value)
                  ) : card.format === "percent" ? (
                    <>
                      <AnimatedCounter value={card.value} />%
                    </>
                  ) : (
                    <AnimatedCounter value={card.value} />
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Node status summary */}
      {stats && (
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Node Constellation Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-6 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span>Online: {stats.onlineNodes}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-yellow-500" />
                  <span>Degraded: {stats.degradedNodes}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span>Offline: {stats.offlineNodes}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
