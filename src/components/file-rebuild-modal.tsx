"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileRebuildModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string | null;
  fileName: string;
}

interface DownloadEvent {
  message: string;
  stage: string;
}

const dlStages = ["start", "read", "reassemble", "decrypt", "verify", "complete"];

const dlStageLabels: Record<string, string> = {
  start: "Locating Chunks",
  read: "Reading Chunks",
  reassemble: "Reassembling File",
  decrypt: "Decrypting AES-256",
  verify: "Verifying Integrity",
  complete: "Download Ready",
};

export function FileRebuildModal({
  open,
  onOpenChange,
  fileId,
  fileName,
}: FileRebuildModalProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloadStage, setDownloadStage] = useState<string>("");
  const [downloadProgress, setDownloadProgress] = useState({
    current: 0,
    total: 0,
  });
  const [downloadEvents, setDownloadEvents] = useState<DownloadEvent[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [readyBlobUrl, setReadyBlobUrl] = useState<string | null>(null);
  const [isEncrypted, setIsEncrypted] = useState<boolean | null>(null);
  const [checksumMismatch, setChecksumMismatch] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const resetState = () => {
    setDownloading(false);
    setDownloadStage("");
    setDownloadProgress({ current: 0, total: 0 });
    setDownloadEvents([]);
    setDownloadError(null);
    setIsEncrypted(null);
    setChecksumMismatch(false);
    setReadyBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  useEffect(() => {
    if (!open || !fileId) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      resetState();
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    resetState();
    setDownloading(true);

    const startStream = async () => {
      try {
        const res = await fetch(`/api/fs/download/${fileId}/progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error("Failed to start rebuild stream");
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
              setDownloadStage(event.stage);
              setDownloadEvents((prev) => [
                ...prev,
                { message: event.message, stage: event.stage },
              ]);

              if (event.stage === "read") {
                setDownloadProgress({
                  current: (event.chunkIndex as number) + 1,
                  total: event.totalChunks as number,
                });
              } else if (event.stage === "start") {
                setDownloadProgress((prev) => ({
                  ...prev,
                  total: event.totalChunks as number,
                }));
                if (typeof event.encrypted === "boolean") {
                  setIsEncrypted(event.encrypted);
                }
              } else if (event.stage === "verify_done") {
                if (event.checksumMatch === false) {
                  setChecksumMismatch(true);
                }
              } else if (event.stage === "complete") {
                // Decode binary blob and store for manual download
                const base64 = event.fileData as string;
                const mimeType =
                  (event.mimeType as string) || "application/octet-stream";
                const binary = atob(base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                  bytes[i] = binary.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: mimeType });
                const url = URL.createObjectURL(blob);
                setReadyBlobUrl(url);

                toast.success(`"${fileName}" rebuilt and ready for download`);
              } else if (event.stage === "error") {
                setDownloadError(event.message as string);
                toast.error(event.message as string);
              }
            } catch {
              // Ignore malformed NDJSON chunks
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Download failed";
        setDownloadError(msg);
        toast.error(msg);
      } finally {
        setDownloading(false);
      }
    };

    startStream();

    return () => {
      controller.abort();
    };
  }, [open, fileId, fileName]);

  const getDlStageStatus = (stage: string) => {
    if (stage === "verify" && checksumMismatch) return "error";
    if (downloadStage === "complete") return "done";

    const baseStage = downloadStage.replace(/_done$/, "");
    const isDoneEvent = downloadStage.endsWith("_done");
    const currentIndex = dlStages.indexOf(baseStage);
    const stageIndex = dlStages.indexOf(stage);

    if (stageIndex < currentIndex) return "done";
    if (stageIndex === currentIndex) {
      return isDoneEvent ? "done" : "active";
    }
    // Skip decrypt stage for unencrypted files
    if (stage === "decrypt" && isEncrypted === false) return "done";
    return "pending";
  };

  const dlProgressPercent =
    downloadProgress.total > 0
      ? Math.round((downloadProgress.current / downloadProgress.total) * 100)
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold uppercase tracking-wider break-all pr-6">
            Rebuilding &quot;{fileName}&quot;
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Assembling orbital chunks from satellite constellation
          </p>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {/* Stage stepper */}
          <div className="space-y-2">
            {dlStages
              .filter((s) => s !== "complete")
              .filter((s) => s !== "decrypt" || isEncrypted !== false)
              .map((stage) => {
                const status = getDlStageStatus(stage);
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
                      ) : status === "error" ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white"
                        >
                          !
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
                          : status === "error"
                            ? "font-medium text-amber-500"
                            : status === "active"
                              ? "font-medium text-foreground"
                              : "text-muted-foreground/50"
                      }`}
                    >
                      {stage === "verify" && checksumMismatch
                        ? "Integrity Check Failed"
                        : dlStageLabels[stage]}
                      {stage === "read" &&
                        downloadProgress.total > 0 &&
                        status === "active" && (
                          <span className="ml-1.5 font-mono text-primary">
                            {downloadProgress.current}/
                            {downloadProgress.total}
                          </span>
                        )}
                    </span>
                  </motion.div>
                );
              })}
          </div>

          {/* Progress bar */}
          {downloadProgress.total > 0 && (
            <div>
              <Progress value={dlProgressPercent} className="h-2" />
              <p className="mt-1 text-right text-[10px] text-muted-foreground font-mono">
                {dlProgressPercent}% • {downloadProgress.current} of{" "}
                {downloadProgress.total} chunks
              </p>
            </div>
          )}

          {/* Live feed */}
          {downloadEvents.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-medium tracking-wider uppercase text-muted-foreground">
                Rebuild Stream Feed
              </p>
              <ScrollArea className="h-32 border bg-muted/30 p-2 font-mono">
                <AnimatePresence>
                  {downloadEvents
                    .filter(
                      (e) =>
                        e.stage === "read" ||
                        e.stage === "verify" ||
                        e.stage === "verify_done" ||
                        e.stage === "reassemble" ||
                        e.stage === "decrypt" ||
                        e.stage === "decrypt_done" ||
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
                        <span className="text-primary">←</span>
                        {event.message}
                      </motion.div>
                    ))}
                </AnimatePresence>
              </ScrollArea>
            </div>
          )}

          {/* Error Banner */}
          {downloadError && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-2 border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive"
            >
              <span>✗</span> {downloadError}
            </motion.div>
          )}
        </div>

        <DialogFooter className="mt-2 sm:justify-end gap-2">
          {readyBlobUrl && (
            <Button
              size="sm"
              className="gap-2 text-xs"
              onClick={() => {
                const a = document.createElement("a");
                a.href = readyBlobUrl;
                a.download = fileName;
                a.click();
                toast.success(`"${fileName}" downloaded`);
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
