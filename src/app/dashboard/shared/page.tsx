"use client";

import {
  Download,
  ExternalLink,
  FileIcon,
  Lock,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  User,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileRebuildModal } from "@/components/file-rebuild-modal";
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

function formatDate(iso?: string): string {
  if (!iso) return "—";
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

export default function SharedPage() {
  const [files, setFiles] = useState<FSFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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

  const fetchSharedFiles = useCallback(() => {
    setLoading(true);
    fetch("/api/fs/files/shared")
      .then((res) => res.json())
      .then((data) => {
        setFiles(data.files || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSharedFiles();
  }, [fetchSharedFiles]);

  const handleDownload = (fileId: string, fileName: string) => {
    setDownloadModal({
      open: true,
      fileId,
      fileName,
    });
  };

  const filteredFiles = files.filter((file) => {
    const q = searchQuery.toLowerCase();
    const nameMatch = file.originalName.toLowerCase().includes(q);
    const ownerMatch =
      (file.ownerName && file.ownerName.toLowerCase().includes(q)) ||
      (file.ownerEmail && file.ownerEmail.toLowerCase().includes(q));
    return nameMatch || ownerMatch;
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Shared with Me</h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Files shared by constellation operators with read and download access
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="cursor-target gap-1.5 text-xs"
            onClick={fetchSharedFiles}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by file name or owner..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs rounded-none"
          />
        </div>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {filteredFiles.length} {filteredFiles.length === 1 ? "file" : "files"}
        </span>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Loading shared files...
        </div>
      ) : filteredFiles.length === 0 ? (
        <motion.div
          className="flex h-56 flex-col items-center justify-center border border-dashed border-border p-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-none border border-border bg-muted/20">
            <Share2 className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <p className="text-sm font-medium">No files shared with you yet</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            When other operators share files with your email address, they will
            appear here with read and streaming download permissions.
          </p>
        </motion.div>
      ) : (
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">File Name</TableHead>
                <TableHead className="text-xs">Owner</TableHead>
                <TableHead className="text-xs">Size</TableHead>
                <TableHead className="text-xs">Chunks</TableHead>
                <TableHead className="text-xs">Access</TableHead>
                <TableHead className="text-xs">Shared</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {filteredFiles.map((file, i) => (
                  <motion.tr
                    key={file.fileId}
                    variants={rowVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ delay: i * 0.04 }}
                    className="cursor-target border-b transition-colors hover:bg-muted/50"
                  >
                    {/* File Name */}
                    <TableCell className="max-w-[200px] sm:max-w-[300px]">
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
                            className="shrink-0 gap-1 rounded-none border-primary/30 text-[9px] text-primary px-1.5 py-0"
                          >
                            <Lock className="h-2.5 w-2.5" />
                            AES-256
                          </Badge>
                        )}
                      </Link>
                    </TableCell>

                    {/* Owner */}
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs">
                        <User className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span
                          className="truncate max-w-[140px]"
                          title={file.ownerEmail || file.ownerName || "Operator"}
                        >
                          {file.ownerName || file.ownerEmail || "Operator"}
                        </span>
                      </div>
                    </TableCell>

                    {/* Size */}
                    <TableCell>
                      <Badge variant="secondary" className="rounded-none text-[10px]">
                        {formatBytes(file.totalSize)}
                      </Badge>
                    </TableCell>

                    {/* Chunks */}
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {file.chunkCount}
                    </TableCell>

                    {/* Access level badge (strictly Read & Download) */}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="rounded-none border-border bg-muted/30 text-[9px] font-mono uppercase tracking-wider text-muted-foreground"
                      >
                        Read Only
                      </Badge>
                    </TableCell>

                    {/* Uploaded / Shared date */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(file.uploadedAt)}
                    </TableCell>

                    {/* Actions: Download + View Details ONLY (No Delete) */}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="cursor-target h-7 w-7"
                          title="Stream Rebuild & Download"
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
                            className="cursor-target h-7 w-7"
                            title="View Integrity & Distribution"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
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
    </div>
  );
}
