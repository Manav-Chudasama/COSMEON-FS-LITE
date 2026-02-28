"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Upload, Download, Trash2, ShieldCheck, FileIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { FSFile } from "@/lib/fs-lite/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 10 },
};

export default function FilesPage() {
  const [files, setFiles] = useState<FSFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [strategy, setStrategy] = useState("round-robin");
  const [chunkingStrategy, setChunkingStrategy] = useState<"fixed" | "cdc">("fixed");

  // Streaming upload progress state
  const [uploadStage, setUploadStage] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
  });
  const [uploadEvents, setUploadEvents] = useState<
    { message: string; stage: string }[]
  >([]);

  // Streaming download progress state
  const [downloading, setDownloading] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadFileName, setDownloadFileName] = useState("");
  const [downloadStage, setDownloadStage] = useState<string>("");
  const [downloadProgress, setDownloadProgress] = useState({
    current: 0,
    total: 0,
  });
  const [downloadEvents, setDownloadEvents] = useState<
    { message: string; stage: string }[]
  >([]);
  const [dlSimulateLatency, setDlSimulateLatency] = useState(true);

  const fetchFiles = useCallback(() => {
    fetch("/api/fs/files")
      .then((res) => res.json())
      .then((data) => {
        setFiles(data.files || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const resetUploadState = () => {
    setUploadStage("");
    setUploadProgress({ current: 0, total: 0 });
    setUploadEvents([]);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    resetUploadState();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("strategy", strategy);
    formData.append("chunkingStrategy", chunkingStrategy);

    try {
      const res = await fetch("/api/fs/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok || !res.body) {
        throw new Error("Upload failed");
      }

      // Read the NDJSON stream
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
            setUploadStage(event.stage);
            setUploadEvents((prev) => [
              ...prev,
              { message: event.message, stage: event.stage },
            ]);

            if (event.stage === "write") {
              setUploadProgress({
                current: (event.chunkIndex as number) + 1,
                total: event.totalChunks as number,
              });
            } else if (event.stage === "split_done") {
              setUploadProgress((prev) => ({
                ...prev,
                total: event.totalChunks as number,
              }));
            } else if (event.stage === "complete") {
              const result = event.result as any;
              toast.success(`"${result.file.originalName}" uploaded`, {
                description: `${result.file.chunkCount} chunks distributed across nodes`,
              });
              setTimeout(() => {
                setUploadOpen(false);
                resetUploadState();
                fetchFiles();
              }, 800);
            } else if (event.stage === "error") {
              toast.error(event.message as string);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId: string, fileName: string) => {
    try {
      const res = await fetch(`/api/fs/files/${fileId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Delete failed");

      toast.success(`"${fileName}" deleted`);
      fetchFiles();
    } catch {
      toast.error("Failed to delete file");
    }
  };

  const resetDownloadState = () => {
    setDownloadStage("");
    setDownloadProgress({ current: 0, total: 0 });
    setDownloadEvents([]);
    setDownloadFileName("");
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    setDownloading(true);
    resetDownloadState();
    setDownloadFileName(fileName);
    setDownloadOpen(true);

    try {
      const res = await fetch(`/api/fs/download/${fileId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulateLatency: dlSimulateLatency }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Download failed");
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
            } else if (event.stage === "complete") {
              // Decode base64 directly into a Blob — no second request
              const base64 = event.fileData as string;
              const mimeType =
                (event.mimeType as string) || "application/octet-stream";
              const binary = atob(base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++)
                bytes[i] = binary.charCodeAt(i);
              const blob = new Blob([bytes], { type: mimeType });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = fileName;
              a.click();
              URL.revokeObjectURL(url);
              toast.success(`"${fileName}" downloaded`);
              setTimeout(() => {
                setDownloadOpen(false);
                resetDownloadState();
              }, 800);
            } else if (event.stage === "error") {
              toast.error(event.message as string);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  // Determine completed stages for the stepper
  const stages = [
    "checksum",
    "split",
    "distribute",
    "write",
    "replicate",
    "complete",
  ];
  const stageLabels: Record<string, string> = {
    checksum: "Compute Checksum",
    split: "Split into Chunks",
    distribute: "Assign to Nodes",
    write: "Write to Nodes",
    replicate: "Replicate Chunks",
    complete: "Upload Complete",
  };

  const getStageStatus = (stage: string) => {
    const doneStages: Record<string, string> = {
      checksum: "checksum_done",
      split: "split_done",
      distribute: "distribute_done",
      write: "replicate",
      replicate: "replicate_done",
      complete: "complete",
    };
    const currentIndex = stages.indexOf(uploadStage.replace(/_done$/, ""));
    const stageIndex = stages.indexOf(stage);

    if (uploadStage === "complete" || uploadStage === doneStages[stage])
      return "done";
    if (stageIndex < currentIndex) return "done";
    if (uploadStage === stage || uploadStage === stage + "_done")
      return "active";
    return "pending";
  };

  const progressPercent =
    uploadProgress.total > 0
      ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
      : 0;

  // Download stage stepper logic
  const dlStages = ["start", "read", "verify", "reassemble", "complete"];
  const dlStageLabels: Record<string, string> = {
    start: "Locating Chunks",
    read: "Reading Chunks",
    verify: "Verifying Integrity",
    reassemble: "Reassembling File",
    complete: "Download Ready",
  };

  const getDlStageStatus = (stage: string) => {
    const doneMap: Record<string, string> = {
      start: "read",
      read: "verify",
      verify: "reassemble",
      reassemble: "verify_done",
      complete: "complete",
    };
    const currentIndex = dlStages.indexOf(downloadStage.replace(/_done$/, ""));
    const stageIndex = dlStages.indexOf(stage);

    if (downloadStage === "complete") return "done";
    if (downloadStage === "verify_done" && stageIndex <= 3) return "done";
    if (stageIndex < currentIndex) return "done";
    if (
      downloadStage === stage ||
      downloadStage === stage + "_done" ||
      downloadStage === doneMap[stage]
    )
      return "active";
    return "pending";
  };

  const dlProgressPercent =
    downloadProgress.total > 0
      ? Math.round((downloadProgress.current / downloadProgress.total) * 100)
      : 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Files</h1>
          <p className="text-xs text-muted-foreground">
            Manage files stored across the orbital constellation
          </p>
        </div>

        <Dialog
          open={uploadOpen}
          onOpenChange={(open) => {
            if (!uploading) {
              setUploadOpen(open);
              if (!open) resetUploadState();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 text-xs">
              <Upload className="h-3.5 w-3.5" />
              Upload File
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">
                Upload to Constellation
              </DialogTitle>
            </DialogHeader>

            {!uploading ? (
              /* ─── Pre-upload: strategy + drop zone ─── */
              <div className="mt-2 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Distribution Strategy
                  </label>
                  <Select value={strategy} onValueChange={setStrategy}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select a strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="round-robin" className="text-xs">
                        Round-Robin (Sequential)
                      </SelectItem>
                      <SelectItem value="weighted" className="text-xs">
                        Weighted (Load Balanced)
                      </SelectItem>
                      <SelectItem value="crush" className="text-xs">
                        CRUSH (Rack-Aware Hashing)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Chunking Strategy
                  </label>
                  <Select value={chunkingStrategy} onValueChange={(v) => setChunkingStrategy(v as "fixed" | "cdc")}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select chunking" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed" className="text-xs">
                        Fixed-Size (256 KB blocks)
                      </SelectItem>
                      <SelectItem value="cdc" className="text-xs">
                        CDC (Content-Defined, 128–512 KB)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div
                  className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors ${
                    dragOver ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleUpload(file);
                  }}
                >
                  <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="mb-1 text-sm font-medium">
                    Drop file here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">
                    File will be chunked and distributed
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 text-xs"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleUpload(file);
                      };
                      input.click();
                    }}
                  >
                    Browse Files
                  </Button>
                </div>
              </div>
            ) : (
              /* ─── Upload in progress: animated stepper ─── */
              <div className="mt-2 space-y-4">
                {/* Stage stepper */}
                <div className="space-y-2">
                  {stages
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
                            {stageLabels[stage]}
                            {stage === "write" &&
                              uploadProgress.total > 0 &&
                              status === "active" && (
                                <span className="ml-1.5 font-mono text-primary">
                                  {uploadProgress.current}/
                                  {uploadProgress.total}
                                </span>
                              )}
                          </span>
                        </motion.div>
                      );
                    })}
                </div>

                {/* Progress bar for chunk writes */}
                {uploadProgress.total > 0 && (
                  <div>
                    <Progress value={progressPercent} className="h-2" />
                    <p className="mt-1 text-right text-[10px] text-muted-foreground">
                      {progressPercent}% • {uploadProgress.current} of{" "}
                      {uploadProgress.total} chunks
                    </p>
                  </div>
                )}

                {/* Live feed */}
                {uploadEvents.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
                      LIVE FEED
                    </p>
                    <ScrollArea className="h-32 rounded-md border bg-muted/30 p-2">
                      <AnimatePresence>
                        {uploadEvents
                          .filter(
                            (e) =>
                              e.stage === "write" ||
                              e.stage === "checksum_done" ||
                              e.stage === "split_done" ||
                              e.stage === "distribute_done" ||
                              e.stage === "replicate_done" ||
                              e.stage === "complete",
                          )
                          .slice(-20)
                          .map((event, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex items-center gap-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                            >
                              <span className="text-primary">→</span>
                              {event.message}
                            </motion.div>
                          ))}
                      </AnimatePresence>
                    </ScrollArea>
                  </div>
                )}

                {/* Complete check */}
                {uploadStage === "complete" && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 py-3 text-xs font-medium text-green-500"
                  >
                    <span className="text-base">✓</span> Upload Complete
                  </motion.div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Download progress dialog */}
        <Dialog
          open={downloadOpen}
          onOpenChange={(open) => {
            if (!downloading) {
              setDownloadOpen(open);
              if (!open) resetDownloadState();
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">
                Downloading &quot;{downloadFileName}&quot;
              </DialogTitle>
            </DialogHeader>

            {/* Latency toggle */}
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label
                htmlFor="dl-latency"
                className="text-xs text-muted-foreground"
              >
                Simulate Node Latency
              </Label>
              <Switch
                id="dl-latency"
                checked={dlSimulateLatency}
                onCheckedChange={setDlSimulateLatency}
                disabled={downloading}
              />
            </div>
            <div className="mt-2 space-y-4">
              {/* Stage stepper */}
              <div className="space-y-2">
                {dlStages
                  .filter((s) => s !== "complete")
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
                          {dlStageLabels[stage]}
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
                  <p className="mt-1 text-right text-[10px] text-muted-foreground">
                    {dlProgressPercent}% • {downloadProgress.current} of{" "}
                    {downloadProgress.total} chunks
                  </p>
                </div>
              )}

              {/* Live feed */}
              {downloadEvents.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
                    LIVE FEED
                  </p>
                  <ScrollArea className="h-32 rounded-md border bg-muted/30 p-2">
                    <AnimatePresence>
                      {downloadEvents
                        .filter(
                          (e) =>
                            e.stage === "read" ||
                            e.stage === "verify" ||
                            e.stage === "verify_done" ||
                            e.stage === "reassemble" ||
                            e.stage === "complete",
                        )
                        .slice(-20)
                        .map((event, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                          >
                            <span className="text-primary">←</span>
                            {event.message}
                          </motion.div>
                        ))}
                    </AnimatePresence>
                  </ScrollArea>
                </div>
              )}

              {/* Complete */}
              {downloadStage === "complete" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 py-3 text-xs font-medium text-green-500"
                >
                  <span className="text-base">✓</span> Download Complete
                </motion.div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Loading files...
        </div>
      ) : files.length === 0 ? (
        <motion.div
          className="flex h-40 flex-col items-center justify-center text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <FileIcon className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No files in the constellation
          </p>
          <p className="text-xs text-muted-foreground/70">
            Upload a file to get started
          </p>
        </motion.div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Size</TableHead>
                <TableHead className="text-xs">Chunks</TableHead>
                <TableHead className="text-xs">Uploaded</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {files.map((file, i) => (
                  <motion.tr
                    key={file.fileId}
                    variants={rowVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ delay: i * 0.05 }}
                    className="border-b transition-colors hover:bg-muted/50"
                  >
                    <TableCell>
                      <Link
                        href={`/dashboard/files/${file.fileId}`}
                        className="flex items-center gap-2 text-xs font-medium hover:text-primary"
                      >
                        <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        {file.originalName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {formatBytes(file.totalSize)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{file.chunkCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(file.uploadedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            handleDownload(file.fileId, file.originalName)
                          }
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Link href={`/dashboard/files/${file.fileId}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() =>
                            handleDelete(file.fileId, file.originalName)
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
