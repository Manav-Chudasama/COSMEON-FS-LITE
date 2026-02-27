"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import {
  Satellite,
  Power,
  PowerOff,
  AlertTriangle,
  HardDrive,
  Clock,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { FSNode, NodeStatus } from "@/lib/fs-lite/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

const statusColors: Record<NodeStatus, string> = {
  online: "bg-green-500",
  degraded: "bg-yellow-500",
  offline: "bg-red-500",
};

const statusGlow: Record<NodeStatus, string> = {
  online: "shadow-green-500/20",
  degraded: "shadow-yellow-500/20",
  offline: "shadow-red-500/20",
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1 },
};

export default function NodesPage() {
  const [nodes, setNodes] = useState<FSNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");

  const fetchNodes = useCallback(() => {
    fetch("/api/fs/nodes")
      .then((res) => res.json())
      .then((data) => {
        setNodes(data.nodes || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  const toggleStatus = async (nodeId: string, currentStatus: NodeStatus) => {
    const newStatus: NodeStatus =
      currentStatus === "online" ? "offline" : "online";

    try {
      const res = await fetch(`/api/fs/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error();
      const data = await res.json();

      toast.success(`Node ${data.node.name} is now ${newStatus}`, {
        description:
          data.rebalanceReport?.movedChunks?.length > 0
            ? `${data.rebalanceReport.movedChunks.length} chunks rebalanced`
            : undefined,
      });

      fetchNodes();
    } catch {
      toast.error("Failed to update node status");
    }
  };

  const createNode = async () => {
    if (!newNodeName.trim()) return;

    try {
      const res = await fetch("/api/fs/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newNodeName.trim() }),
      });

      if (!res.ok) throw new Error();
      toast.success(`Node "${newNodeName}" created`);
      setNewNodeName("");
      setCreateOpen(false);
      fetchNodes();
    } catch {
      toast.error("Failed to create node");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Scanning constellation...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Node Constellation
          </h1>
          <p className="text-xs text-muted-foreground">
            {nodes.filter((n) => n.status === "online").length}/{nodes.length}{" "}
            nodes online · Simulate failures to test fault tolerance
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Add Node
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-sm">
                Launch New Satellite
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div>
                <Label className="text-xs">Node Name</Label>
                <Input
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  placeholder="e.g. ORBIT-6"
                  className="mt-1 text-xs"
                />
              </div>
              <Button
                size="sm"
                className="w-full text-xs"
                onClick={createNode}
                disabled={!newNodeName.trim()}
              >
                Deploy Node
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.08 } },
        }}
      >
        {nodes.map((node) => {
          const usagePercent =
            node.capacityBytes > 0
              ? Math.round((node.usedBytes / node.capacityBytes) * 100)
              : 0;

          return (
            <motion.div key={node.nodeId} variants={cardVariants}>
              <Card
                className={`relative overflow-hidden transition-all hover:shadow-lg ${statusGlow[node.status]}`}
              >
                {/* Status pulse indicator */}
                <motion.div
                  className={`absolute right-4 top-4 h-2.5 w-2.5 rounded-full ${statusColors[node.status]}`}
                  animate={
                    node.status === "online"
                      ? { scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }
                      : node.status === "offline"
                        ? { opacity: [1, 0.3, 1] }
                        : { scale: [1, 1.1, 1] }
                  }
                  transition={{
                    duration: 2,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                  }}
                />

                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Satellite className="h-4 w-4 text-primary" />
                    {node.name}
                  </CardTitle>
                  <Badge
                    variant={
                      node.status === "online"
                        ? "default"
                        : node.status === "degraded"
                          ? "secondary"
                          : "destructive"
                    }
                    className="w-fit text-[10px]"
                  >
                    {node.status.toUpperCase()}
                  </Badge>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Storage */}
                  <div>
                    <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />
                        Storage
                      </span>
                      <span>
                        {formatBytes(node.usedBytes)} /{" "}
                        {formatBytes(node.capacityBytes)}
                      </span>
                    </div>
                    <Progress value={usagePercent} className="h-1.5" />
                  </div>

                  {/* Stats */}
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Chunks: {node.chunkCount}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {node.latencyMs}ms
                    </span>
                  </div>

                  {/* Actions */}
                  <Button
                    variant={
                      node.status === "online" ? "destructive" : "default"
                    }
                    size="sm"
                    className="w-full gap-2 text-xs"
                    onClick={() => toggleStatus(node.nodeId, node.status)}
                  >
                    {node.status === "online" ? (
                      <>
                        <PowerOff className="h-3.5 w-3.5" />
                        Simulate Failure
                      </>
                    ) : (
                      <>
                        <Power className="h-3.5 w-3.5" />
                        Bring Online
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
