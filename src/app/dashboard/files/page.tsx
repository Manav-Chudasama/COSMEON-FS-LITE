"use client";

import {
  Download,
  FileIcon,
  Lock,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileRebuildModal } from "@/components/file-rebuild-modal";
import { FileDeleteModal } from "@/components/file-delete-modal";
import { FileShareModal } from "@/components/file-share-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const [chunkingStrategy, setChunkingStrategy] = useState<"fixed" | "cdc">(
    "fixed",
  );
  const [encryptEnabled, setEncryptEnabled] = useState(true);

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
  const [downloadModal, setDownloadModal] = useState<{
    open: boolean;
    fileId: string | null;
    fileName: string;
  }>({
    open: false,
    fileId: null,
    fileName: "",
  });

  // Deletion modal state
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    fileId: string | null;
    fileName: string;
    chunkCount?: number;
  }>({
    open: false,
    fileId: null,
    fileName: "",
  });

  // Sharing modal state
  const [shareModal, setShareModal] = useState<{
    open: boolean;
    fileId: string | null;
    fileName: string;
  }>({
    open: false,
    fileId: null,
    fileName: "",
  });



  const [currentUser, setCurrentUser] = useState<{
    userId: string;
    email: string;
    name: string;
  } | null>(null);

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
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setCurrentUser(data.user);
      })
      .catch(() => {});
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
    formData.append("encrypt", encryptEnabled ? "true" : "false");

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
              const result = event.result as {
                file: { originalName: string; chunkCount: number };
              };
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

  const handleDelete = (fileId: string, fileName: string, chunkCount?: number) => {
    setDeleteModal({
      open: true,
      fileId,
      fileName,
      chunkCount,
    });
  };

  const handleDownload = (fileId: string, fileName: string) => {
    setDownloadModal({
      open: true,
      fileId,
      fileName,
    });
  };

  // Determine completed stages for the stepper
  const stages = [
    "checksum",
    "encrypt",
    "split",
    "distribute",
    "write",
    "replicate",
    "complete",
  ];
  const stageLabels: Record<string, string> = {
    checksum: "Compute Checksum",
    encrypt: "AES-256-GCM Encrypt",
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
    if (uploadStage === stage || uploadStage === `${stage}_done`)
      return "active";
    return "pending";
  };

  const progressPercent =
    uploadProgress.total > 0
      ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
      : 0;

  const ownedFiles = files.filter(
    (file) =>
      !file.ownerId ||
      !currentUser?.userId ||
      file.ownerId === currentUser.userId,
  );

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
                <div className="grid grid-cols-2 gap-5">
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
                    <Select
                      value={chunkingStrategy}
                      onValueChange={(v) =>
                        setChunkingStrategy(v as "fixed" | "cdc")
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select chunking" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed" className="text-xs">
                          Fixed-Size (256 KB)
                        </SelectItem>
                        <SelectItem value="cdc" className="text-xs">
                          CDC (128–512 KB)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* AES-256 Encryption Toggle */}
                <div className="flex items-center justify-between border p-3">
                  <div className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    <div>
                      <p className="text-xs font-medium">AES-256 Encryption</p>
                      <p className="text-[10px] text-muted-foreground">
                        Encrypt file before chunking &amp; distribution
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={encryptEnabled}
                    onCheckedChange={setEncryptEnabled}
                  />
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
                              <div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                            ) : (
                              <div className="h-2.5 w-2.5 rounded-full border border-muted-foreground/30" />
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
                            {stage === "distribute" &&
                              uploadProgress.total > 0 &&
                              status === "active" && (
                                <span className="ml-1 font-mono text-primary">
                                  {uploadProgress.current}/{uploadProgress.total}
                                </span>
                              )}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Progress bar for distribution */}
                  {uploadProgress.total > 0 && (
                    <div>
                      <Progress value={progressPercent} className="h-1.5" />
                      <p className="mt-1 text-right text-[10px] text-muted-foreground font-mono">
                        {progressPercent}% • {uploadProgress.current} of{" "}
                        {uploadProgress.total} chunks
                      </p>
                    </div>
                  )}

                  {/* Live Feed */}
                  <ScrollArea className="h-24 rounded border bg-muted/30 p-2 font-mono text-[10px]">
                    <AnimatePresence>
                      {uploadEvents.slice(-10).map((event, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 3 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-1.5 py-0.5 text-muted-foreground"
                        >
                          <span className="text-primary">→</span>
                          {event.message}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </ScrollArea>
                </div>
              )}
            </DialogContent>
        </Dialog>

        {/* Rebuilding download progress dialog */}
        <FileRebuildModal
          open={downloadModal.open}
          onOpenChange={(open) =>
            setDownloadModal((prev) => ({ ...prev, open }))
          }
          fileId={downloadModal.fileId}
          fileName={downloadModal.fileName}
        />
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Loading files...
        </div>
      ) : ownedFiles.length === 0 ? (
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
                {ownedFiles.map((file, i) => {
                  const isOwner =
                    !file.ownerId ||
                    (currentUser?.userId
                      ? file.ownerId === currentUser.userId
                      : true);
                  const isSharedWithUser =
                    file.ownerId &&
                    currentUser?.userId &&
                    file.ownerId !== currentUser.userId;

                  return (
                    <motion.tr
                      key={file.fileId}
                      variants={rowVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={{ delay: i * 0.05 }}
                      className="cursor-target border-b transition-colors hover:bg-muted/50"
                    >
                      <TableCell className="max-w-[200px] sm:max-w-[350px]">
                        <Link
                          href={`/dashboard/files/${file.fileId}`}
                          className="flex items-center gap-2 text-xs font-medium hover:text-primary min-w-0"
                        >
                          <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate" title={file.originalName}>
                            {file.originalName}
                          </span>
                          {file.encrypted && (
                            <Badge
                              variant="outline"
                              className="shrink-0 gap-1 border-primary/30 text-[9px] text-primary px-1.5 py-0"
                            >
                              <Lock className="h-2.5 w-2.5" />
                              AES-256
                            </Badge>
                          )}
                          {isSharedWithUser && (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-border text-[9px] text-muted-foreground px-1.5 py-0"
                            >
                              Shared
                            </Badge>
                          )}
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
                            title="Download File"
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
                              title="Inspect Chunks & Integrity"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                          {isOwner && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Share File"
                                onClick={() =>
                                  setShareModal({
                                    open: true,
                                    fileId: file.fileId,
                                    fileName: file.originalName,
                                  })
                                }
                              >
                                <Share2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                title="Delete File"
                                onClick={() =>
                                  handleDelete(
                                    file.fileId,
                                    file.originalName,
                                    file.chunkCount,
                                  )
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Streaming Rebuild Modal */}
      <FileRebuildModal
        open={downloadModal.open}
        onOpenChange={(open) =>
          setDownloadModal((prev) => ({ ...prev, open }))
        }
        fileId={downloadModal.fileId}
        fileName={downloadModal.fileName}
      />

      {/* Streaming Delete Modal */}
      <FileDeleteModal
        open={deleteModal.open}
        onOpenChange={(open) =>
          setDeleteModal((prev) => ({ ...prev, open }))
        }
        fileId={deleteModal.fileId}
        fileName={deleteModal.fileName}
        chunkCount={deleteModal.chunkCount}
        onDeleted={fetchFiles}
      />

      {/* File Share Modal */}
      <FileShareModal
        open={shareModal.open}
        onOpenChange={(open) =>
          setShareModal((prev) => ({ ...prev, open }))
        }
        fileId={shareModal.fileId}
        fileName={shareModal.fileName}
        onUpdated={fetchFiles}
      />
    </div>
  );
}
