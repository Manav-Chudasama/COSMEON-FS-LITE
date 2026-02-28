"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Upload, Download, Trash2, ShieldCheck, FileIcon } from "lucide-react";
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

  const handleUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("strategy", strategy);

    try {
      const res = await fetch("/api/fs/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      const result = await res.json();
      toast.success(`"${result.file.originalName}" uploaded`, {
        description: `${result.file.chunkCount} chunks distributed across nodes`,
      });
      setUploadOpen(false);
      fetchFiles();
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

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const res = await fetch(`/api/fs/download/${fileId}`);
      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`"${fileName}" downloaded`);
    } catch {
      toast.error("Download failed");
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Files</h1>
          <p className="text-xs text-muted-foreground">
            Manage files stored across the orbital constellation
          </p>
        </div>

        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 text-xs">
              <Upload className="h-3.5 w-3.5" />
              Upload File
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-sm">
                Upload to Constellation
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Distribution Strategy
                </label>
                <Select
                  value={strategy}
                  onValueChange={setStrategy}
                  disabled={uploading}
                >
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
                  {uploading
                    ? "Distributing across nodes..."
                    : "Drop file here or click to browse"}
                </p>
                <p className="text-xs text-muted-foreground">
                  File will be chunked and distributed
                </p>
                {!uploading && (
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
                )}
              </div>
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
