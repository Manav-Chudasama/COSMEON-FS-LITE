"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileDeleteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string | null;
  fileName: string;
  chunkCount?: number;
  totalSize?: number;
  onDeleted?: () => void;
}

interface DeleteEvent {
  message: string;
  stage: string;
}

const deleteStages = [
  "locate",
  "purge_chunk",
  "purge_meta",
  "rebalance",
  "complete",
];

const deleteStageLabels: Record<string, string> = {
  locate: "Locating Chunks",
  purge_chunk: "Purging Orbital Chunks",
  purge_meta: "Purging Metadata & Keys",
  rebalance: "Reclaiming Capacity",
  complete: "Purge Complete",
};

export function FileDeleteModal({
  open,
  onOpenChange,
  fileId,
  fileName,
  chunkCount,
  onDeleted,
}: FileDeleteModalProps) {
  const [phase, setPhase] = useState<"confirm" | "purging" | "done">("confirm");
  const [deleteStage, setDeleteStage] = useState<string>("");
  const [deleteProgress, setDeleteProgress] = useState({
    current: 0,
    total: chunkCount || 0,
  });
  const [deleteEvents, setDeleteEvents] = useState<DeleteEvent[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const resetState = () => {
    setPhase("confirm");
    setDeleteStage("");
    setDeleteProgress({ current: 0, total: chunkCount || 0 });
    setDeleteEvents([]);
    setDeleteError(null);
  };

  useEffect(() => {
    if (!open) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      resetState();
    }
  }, [open]);

  const startPurge = async () => {
    if (!fileId) return;

    setPhase("purging");
    setDeleteError(null);
    setDeleteEvents([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/fs/files/${fileId}/delete-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error("Failed to connect to constellation purge stream");
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
            setDeleteStage(event.stage);
            setDeleteEvents((prev) => [
              ...prev,
              { message: event.message, stage: event.stage },
            ]);

            if (event.stage === "start") {
              setDeleteProgress((prev) => ({
                ...prev,
                total: (event.totalChunks as number) || prev.total,
              }));
            } else if (event.stage === "purge_chunk") {
              setDeleteProgress({
                current: event.purgedCount as number,
                total: event.totalChunks as number,
              });
            } else if (event.stage === "complete") {
              setPhase("done");
              toast.success(`"${fileName}" purged from constellation`);
            } else if (event.stage === "error") {
              setDeleteError(event.message as string);
              toast.error(event.message as string);
            }
          } catch {
            // Ignore malformed NDJSON lines
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Purge operation failed";
      setDeleteError(msg);
      toast.error(msg);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    if (phase === "done" && onDeleted) {
      onDeleted();
    }
  };

  const getStageStatus = (stage: string) => {
    if (deleteStage === "complete" || phase === "done") return "done";

    const baseStage = deleteStage.replace(/_done$/, "");
    const isDoneEvent = deleteStage.endsWith("_done");
    const currentIndex = deleteStages.indexOf(baseStage);
    const stageIndex = deleteStages.indexOf(stage);

    if (stageIndex < currentIndex) return "done";
    if (stageIndex === currentIndex) {
      return isDoneEvent ? "done" : "active";
    }
    return "pending";
  };

  const progressPercent =
    deleteProgress.total > 0
      ? Math.round((deleteProgress.current / deleteProgress.total) * 100)
      : phase === "done"
        ? 100
        : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (phase === "purging") return; // Prevent closing while in-flight
        if (!next) {
          handleClose();
        } else {
          onOpenChange(true);
        }
      }}
    >
      <DialogContent className="max-w-md">
        {phase === "confirm" ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <DialogTitle className="text-sm font-bold uppercase tracking-wider break-all">
                  Purge &quot;{fileName}&quot;?
                </DialogTitle>
              </div>
              <DialogDescription className="text-[11px] text-muted-foreground">
                Irreversible constellation decommissioning action
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="border border-destructive/30 bg-destructive/10 p-3.5 space-y-2">
                <p className="font-semibold text-destructive">
                  Warning: Immediate Permanent Deletion
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  This action will locate and permanently purge all{" "}
                  <strong className="text-foreground font-mono">
                    {chunkCount ? `${chunkCount} ` : ""}chunks
                  </strong>
                  , replicas, and parity shards distributed across orbital
                  satellite nodes.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Encryption keys, auth envelopes, and Merkle tree roots will be
                  irreversibly purged.
                </p>
              </div>
            </div>

            <DialogFooter className="mt-2 sm:justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 text-xs font-semibold"
                onClick={startPurge}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Confirm & Purge File
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-sm font-bold uppercase tracking-wider break-all pr-6">
                {phase === "done" ? "Purge Complete — " : "Purging "}
                &quot;{fileName}&quot;
              </DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground">
                Decommissioning orbital chunks from satellite constellation
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 space-y-4">
              {/* Stage stepper */}
              <div className="space-y-2">
                {deleteStages
                  .filter((s) => s !== "complete")
                  .map((stage) => {
                    const status = getStageStatus(stage);
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
                              className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[8px] text-white"
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
                              className="h-4 w-4 rounded-full border-2 border-destructive border-t-transparent"
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
                                ? "font-medium text-destructive"
                                : "text-muted-foreground/50"
                          }`}
                        >
                          {deleteStageLabels[stage]}
                          {stage === "purge_chunk" &&
                            deleteProgress.total > 0 &&
                            status === "active" && (
                              <span className="ml-1.5 font-mono text-destructive">
                                {deleteProgress.current}/{deleteProgress.total}
                              </span>
                            )}
                        </span>
                      </motion.div>
                    );
                  })}
              </div>

              {/* Progress bar */}
              {deleteProgress.total > 0 && (
                <div>
                  <Progress value={progressPercent} className="h-2" />
                  <p className="mt-1 text-right text-[10px] text-muted-foreground font-mono">
                    {progressPercent}% • {deleteProgress.current} of{" "}
                    {deleteProgress.total} chunks purged
                  </p>
                </div>
              )}

              {/* Live feed */}
              {deleteEvents.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium tracking-wider uppercase text-muted-foreground">
                    Purge Stream Feed
                  </p>
                  <ScrollArea className="h-32 border bg-muted/30 p-2 font-mono">
                    <AnimatePresence>
                      {deleteEvents
                        .filter(
                          (e) =>
                            e.stage === "locate" ||
                            e.stage === "purge_chunk" ||
                            e.stage === "purge_meta" ||
                            e.stage === "purge_meta_done" ||
                            e.stage === "rebalance" ||
                            e.stage === "rebalance_done" ||
                            e.stage === "complete" ||
                            e.stage === "error",
                        )
                        .slice(-20)
                        .map((event, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            <span className="text-destructive">←</span>
                            {event.message}
                          </motion.div>
                        ))}
                    </AnimatePresence>
                  </ScrollArea>
                </div>
              )}

              {/* Error Banner */}
              {deleteError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-center gap-2 border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive"
                >
                  <span>✗</span> {deleteError}
                </motion.div>
              )}
            </div>

            <DialogFooter className="mt-2 sm:justify-end gap-2">
              {phase === "purging" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Purging Constellation...
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={handleClose}
                >
                  Close
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
