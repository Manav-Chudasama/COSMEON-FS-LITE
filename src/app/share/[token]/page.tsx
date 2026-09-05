"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileIcon,
  Globe,
  Lock,
  Satellite,
  ShieldCheck,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "Permanent";
  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();
  if (isNaN(expiryTime)) return "Permanent";
  if (expiryTime <= now) return "Expired";

  const diffHours = Math.round((expiryTime - now) / (1000 * 60 * 60));
  if (diffHours < 1) {
    const diffMins = Math.max(1, Math.round((expiryTime - now) / (1000 * 60)));
    return `~${diffMins}m left`;
  }
  if (diffHours < 24) {
    return `~${diffHours}h left`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d left (${new Date(expiresAt).toLocaleDateString()})`;
}

interface SharedFileInfo {
  fileId: string;
  originalName: string;
  mimeType: string;
  totalSize: number;
  chunkCount: number;
  uploadedAt: string;
  encrypted: boolean;
  ownerName: string;
  ownerEmail?: string;
  expiresAt: string | null;
  downloads: number;
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

export default function PublicSharePage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [fileInfo, setFileInfo] = useState<SharedFileInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Streaming download state
  const [downloading, setDownloading] = useState(false);
  const [downloadStage, setDownloadStage] = useState("");
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [downloadEvents, setDownloadEvents] = useState<{ message: string; stage: string }[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [readyBlobUrl, setReadyBlobUrl] = useState<string | null>(null);
  const [checksumMismatch, setChecksumMismatch] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/fs/share/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load shared file");
        }
        setFileInfo(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Invalid or expired share link");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleStartDownload = async () => {
    if (!token || !fileInfo) return;

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setDownloading(true);
    setDownloadStage("");
    setDownloadProgress({ current: 0, total: fileInfo.chunkCount });
    setDownloadEvents([]);
    setStreamError(null);
    setChecksumMismatch(false);
    if (readyBlobUrl) {
      URL.revokeObjectURL(readyBlobUrl);
      setReadyBlobUrl(null);
    }

    try {
      const res = await fetch(`/api/fs/share/${token}/progress`, {
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
            } else if (event.stage === "verify_done") {
              if (event.checksumMatch === false) {
                setChecksumMismatch(true);
              }
            } else if (event.stage === "complete") {
              const base64 = event.fileData as string;
              const mimeType = (event.mimeType as string) || "application/octet-stream";
              const binary = atob(base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              const blob = new Blob([bytes], { type: mimeType });
              const url = URL.createObjectURL(blob);
              setReadyBlobUrl(url);

              // Optimistically increment download counter on page
              setFileInfo((prev) =>
                prev ? { ...prev, downloads: prev.downloads + 1 } : null,
              );

              // Trigger automatic download
              const a = document.createElement("a");
              a.href = url;
              a.download = fileInfo.originalName;
              a.click();
              toast.success(`"${fileInfo.originalName}" downloaded successfully`);
            } else if (event.stage === "error") {
              setStreamError(event.message as string);
              toast.error(event.message as string);
            }
          } catch {
            // Ignore malformed line
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Download failed";
      setStreamError(msg);
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  };

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
    if (stage === "decrypt" && !fileInfo?.encrypted) return "done";
    return "pending";
  };

  const dlProgressPercent =
    downloadProgress.total > 0
      ? Math.round((downloadProgress.current / downloadProgress.total) * 100)
      : 0;

  return (
    <div className="min-h-screen flex flex-col justify-between bg-background p-4 md:p-8 font-mono">
      {/* Top Bar */}
      <header className="flex items-center justify-between border-b border-border pb-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-bold tracking-wider">
          <Satellite className="h-4 w-4 text-primary" />
          <span>
            FS-<span className="text-primary">LITE</span>
          </span>
        </Link>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Orbital Transfer Portal
        </span>
      </header>

      {/* Main Content */}
      <main className="my-auto flex flex-col items-center justify-center py-12">
        {loading ? (
          <div className="text-center space-y-2">
            <div className="h-6 w-6 mx-auto animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs text-muted-foreground">Resolving orbital share link...</p>
          </div>
        ) : error ? (
          <Card className="max-w-md w-full rounded-none border-border">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-none border border-destructive/30 bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <CardTitle className="text-sm font-bold uppercase tracking-wider">
                Access Unavailable
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button asChild size="sm" variant="outline" className="rounded-none text-xs">
                <Link href="/">Return to Dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        ) : fileInfo ? (
          <Card className="max-w-xl w-full rounded-none border-border">
            <CardHeader className="space-y-1 pb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-primary flex items-center gap-1.5">
                  <Globe className="h-3 w-3" /> Secure Orbital Share
                </span>
                {fileInfo.encrypted && (
                  <Badge variant="outline" className="rounded-none border-primary/30 text-primary text-[9px] gap-1">
                    <Lock className="h-2.5 w-2.5" />
                    AES-256-GCM
                  </Badge>
                )}
              </div>
              <CardTitle className="text-base font-bold break-all flex items-center gap-2 pt-1">
                <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{fileInfo.originalName}</span>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* File Specs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-border p-3 text-xs bg-muted/10">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Size</p>
                  <p className="font-semibold">{formatBytes(fileInfo.totalSize)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Chunks</p>
                  <p className="font-semibold">{fileInfo.chunkCount} parts</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Shared By</p>
                  <p className="font-semibold truncate" title={fileInfo.ownerName}>
                    {fileInfo.ownerName}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Link Expiry</p>
                  <p
                    className="font-semibold text-[11px] truncate"
                    title={
                      fileInfo.expiresAt
                        ? new Date(fileInfo.expiresAt).toLocaleString()
                        : "Permanent"
                    }
                  >
                    {formatExpiry(fileInfo.expiresAt)}
                  </p>
                </div>
              </div>

              {/* Streaming Rebuild Progress */}
              {downloadEvents.length > 0 && (
                <div className="space-y-4 border-t border-border pt-4">
                  {/* Stepper */}
                  <div className="space-y-2">
                    {dlStages
                      .filter((s) => s !== "complete")
                      .filter((s) => s !== "decrypt" || fileInfo.encrypted)
                      .map((stage) => {
                        const status = getDlStageStatus(stage);
                        return (
                          <div key={stage} className="flex items-center gap-3">
                            <div className="flex h-5 w-5 items-center justify-center">
                              {status === "done" ? (
                                <div className="flex h-4 w-4 items-center justify-center rounded-none bg-green-500 text-[8px] text-white">
                                  ✓
                                </div>
                              ) : status === "error" ? (
                                <div className="flex h-4 w-4 items-center justify-center rounded-none bg-amber-500 text-[10px] font-bold text-white">
                                  !
                                </div>
                              ) : status === "active" ? (
                                <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                              ) : (
                                <div className="h-3 w-3 rounded-none border border-muted-foreground/30" />
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
                                ? "Integrity Check Mismatch"
                                : dlStageLabels[stage]}
                              {stage === "read" && downloadProgress.total > 0 && status === "active" && (
                                <span className="ml-1.5 font-mono text-primary">
                                  {downloadProgress.current}/{downloadProgress.total}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                  </div>

                  {/* Progress bar */}
                  {downloadProgress.total > 0 && (
                    <div>
                      <Progress value={dlProgressPercent} className="h-2 rounded-none" />
                      <p className="mt-1 text-right text-[10px] text-muted-foreground font-mono">
                        {dlProgressPercent}% • {downloadProgress.current} of {downloadProgress.total} chunks
                      </p>
                    </div>
                  )}

                  {/* Live feed */}
                  <ScrollArea className="h-28 border border-border bg-muted/20 p-2 font-mono text-[10px]">
                    <AnimatePresence>
                      {downloadEvents.slice(-15).map((ev, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-1.5 py-0.5 text-muted-foreground"
                        >
                          <span className="text-primary">←</span>
                          {ev.message}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </ScrollArea>

                  {/* Stream Error */}
                  {streamError && (
                    <div className="border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                      {streamError}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  onClick={handleStartDownload}
                  disabled={downloading}
                  className="flex-1 rounded-none gap-2 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloading
                    ? "Reconstructing Chunks..."
                    : readyBlobUrl
                      ? "Download Again"
                      : "Stream Reconstruct & Download"}
                </Button>

                {readyBlobUrl && (
                  <Button
                    variant="outline"
                    className="rounded-none gap-2 text-xs"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = readyBlobUrl;
                      a.download = fileInfo.originalName;
                      a.click();
                    }}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                    Save File
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-border pt-4 text-center text-[10px] text-muted-foreground">
        FS-Lite Distributed Orbital Storage · Authenticated End-to-End Delivery
      </footer>
    </div>
  );
}
