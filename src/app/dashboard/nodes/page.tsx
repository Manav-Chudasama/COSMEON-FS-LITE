"use client";

import {
  Clock,
  HardDrive,
  Loader2,
  Plus,
  Power,
  PowerOff,
  Satellite,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  // Rebalance dialog state
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceOpen, setRebalanceOpen] = useState(false);
  const [rebalanceNodeName, setRebalanceNodeName] = useState("");
  const [rebalanceAction, setRebalanceAction] = useState<
    "failure" | "recovery"
  >("failure");
  const [rebalanceStage, setRebalanceStage] = useState("");
  const [rebalanceProgress, setRebalanceProgress] = useState({
    current: 0,
    total: 0,
  });
  const [rebalanceEvents, setRebalanceEvents] = useState<
    { message: string; stage: string }[]
  >([]);

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

  const resetRebalanceState = () => {
    setRebalanceStage("");
    setRebalanceProgress({ current: 0, total: 0 });
    setRebalanceEvents([]);
    setRebalanceNodeName("");
  };

  const toggleStatus = async (
    nodeId: string,
    currentStatus: NodeStatus,
    nodeName: string,
  ) => {
    const newStatus: NodeStatus =
      currentStatus === "online" ? "offline" : "online";

    setRebalancing(true);
    resetRebalanceState();
    setRebalanceNodeName(nodeName);
    setRebalanceAction(newStatus === "offline" ? "failure" : "recovery");
    setRebalanceOpen(true);

    try {
      const res = await fetch(`/api/fs/nodes/${nodeId}/rebalance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Rebalance failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            setRebalanceStage(event.stage);

            if (event.message) {
              setRebalanceEvents((prev) => [
                ...prev,
                { message: event.message, stage: event.stage },
              ]);
            }

            // Optimistically update node status in UI immediately
            if (
              event.stage === "status_changed" &&
              event.nodeId &&
              event.newStatus
            ) {
              setNodes((prev) =>
                prev.map((n) =>
                  n.nodeId === event.nodeId
                    ? { ...n, status: event.newStatus as NodeStatus }
                    : n,
                ),
              );
            }

            if (event.stage === "migrate") {
              setRebalanceProgress({
                current: event.chunkIndex as number,
                total: event.totalChunks as number,
              });
            } else if (event.stage === "start") {
              setRebalanceProgress((prev) => ({
                ...prev,
                total: event.totalChunks as number,
              }));
            } else if (event.stage === "complete") {
              setRebalanceProgress((prev) => ({
                ...prev,
                current: prev.total,
              }));

              // Refresh nodes after completion
              fetchNodes();

              toast.success(
                `${newStatus === "offline" ? "Failure" : "Recovery"} simulation complete`,
                { description: event.message as string },
              );
            } else if (event.stage === "error") {
              toast.error(event.message as string);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rebalance failed");
    } finally {
      setRebalancing(false);
      // Delay refresh to let backend finish post-rebalance cleanup
      setTimeout(() => fetchNodes(), 500);
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

  // Rebalance stepper stages
  const rbStages = ["status_changed", "migrate", "complete"];
  const rbStageLabels: Record<string, string> = {
    status_changed:
      rebalanceAction === "failure" ? "Taking Offline" : "Bringing Online",
    migrate:
      rebalanceAction === "failure"
        ? "Migrating Chunks"
        : "Redistributing Chunks",
    complete: "Rebalance Complete",
  };

  const getRbStageStatus = (stage: string) => {
    const stageIndex = rbStages.indexOf(stage);
    const currentIndex = rbStages.indexOf(rebalanceStage);

    // "report" stage means complete is done
    if (rebalanceStage === "report" || rebalanceStage === "complete")
      return "done";
    if (rebalanceStage === "warning") {
      // warnings come during migrate phase
      return stageIndex <= 1 ? "active" : "pending";
    }
    if (stageIndex < currentIndex) return "done";
    if (stageIndex === currentIndex) return "active";
    return "pending";
  };

  const rbProgressPercent =
    rebalanceProgress.total > 0
      ? Math.round((rebalanceProgress.current / rebalanceProgress.total) * 100)
      : 0;

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

        <div className="flex items-center gap-3">
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
      </div>

      {/* Rebalance progress dialog */}
      <Dialog
        open={rebalanceOpen}
        onOpenChange={(open) => {
          if (rebalancing && rebalanceStage !== "complete" && rebalanceStage !== "report") return;
          setRebalanceOpen(open);
          if (!open) resetRebalanceState();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {rebalanceAction === "failure"
                ? `Simulating Failure — "${rebalanceNodeName}"`
                : `Recovering — "${rebalanceNodeName}"`}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-4">
            {/* Stage stepper */}
            <div className="space-y-2">
              {rbStages
                .filter((s) => s !== "complete")
                .map((stage) => {
                  const status = getRbStageStatus(stage);
                  return (
                    <motion.div
                      key={stage}
                      className="flex items-center gap-3"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex h-5 w-5 items-center justify-center">
                        {status === "done" ? (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[8px] text-white"
                          >
                            ✓
                          </motion.div>
                        ) : status === "active" ? (
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                            className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent"
                          />
                        ) : (
                          <div className="h-3 w-3 rounded-full border border-muted-foreground/30" />
                        )}
                      </div>
                      <span
                        className={`text-xs ${
                          status === "done"
                            ? "text-muted-foreground"
                            : status === "active"
                              ? "font-medium text-foreground"
                              : "text-muted-foreground/50"
                        }`}
                      >
                        {rbStageLabels[stage]}
                        {stage === "migrate" &&
                          rebalanceProgress.total > 0 &&
                          status === "active" && (
                            <span className="ml-1.5 font-mono text-primary">
                              {rebalanceProgress.current}/
                              {rebalanceProgress.total}
                            </span>
                          )}
                      </span>
                    </motion.div>
                  );
                })}
            </div>

            {/* Progress bar */}
            {rebalanceProgress.total > 0 && (
              <div>
                <Progress value={rbProgressPercent} className="h-2" />
                <p className="mt-1 text-right text-[10px] text-muted-foreground">
                  {rbProgressPercent}% • {rebalanceProgress.current} of{" "}
                  {rebalanceProgress.total} chunks
                </p>
              </div>
            )}

            {/* Live feed */}
            {rebalanceEvents.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
                  LIVE FEED
                </p>
                <ScrollArea className="h-36 rounded-none border bg-muted/30 p-2">
                  <AnimatePresence>
                    {rebalanceEvents
                      .filter(
                        (e) =>
                          e.stage === "migrate" ||
                          e.stage === "warning" ||
                          e.stage === "complete" ||
                          e.stage === "status_changed",
                      )
                      .slice(-30)
                      .map((event, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex items-center gap-1.5 py-0.5 text-[10px] font-mono ${
                            event.stage === "warning"
                              ? "text-yellow-500"
                              : "text-muted-foreground"
                          }`}
                        >
                          <span className="text-primary">
                            {event.stage === "warning" ? "⚠" : "↔"}
                          </span>
                          {event.message}
                        </motion.div>
                      ))}
                  </AnimatePresence>
                </ScrollArea>
              </div>
            )}

            {/* Complete */}
            {(rebalanceStage === "complete" || rebalanceStage === "report") && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`flex items-center justify-center gap-2 rounded-none border py-3 text-xs font-medium ${
                  rebalanceAction === "failure"
                    ? "border-orange-500/30 bg-orange-500/10 text-orange-500"
                    : "border-green-500/30 bg-green-500/10 text-green-500"
                }`}
              >
                <span className="text-base">✓</span>
                {rebalanceAction === "failure"
                  ? "Failure Simulation Complete"
                  : "Recovery Complete"}
              </motion.div>
            )}

            {/* Dialog Footer */}
            <DialogFooter className="mt-4 sm:justify-end gap-2">
              {rebalanceStage === "complete" || rebalanceStage === "report" ? (
                <Button
                  size="sm"
                  className="cursor-pointer text-xs rounded-none"
                  onClick={() => {
                    setRebalanceOpen(false);
                    resetRebalanceState();
                  }}
                >
                  Close
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs rounded-none"
                  disabled
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  {rebalanceAction === "failure"
                    ? "Rebalancing Constellation..."
                    : "Synchronizing Node..."}
                </Button>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

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
                    disabled={rebalancing}
                    onClick={() =>
                      toggleStatus(node.nodeId, node.status, node.name)
                    }
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
