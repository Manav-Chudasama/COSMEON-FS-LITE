"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ShieldCheck,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  Satellite,
  ChevronLeft,
  ChevronRight,
  TreePine,
  Search,
  Hash,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import type { IntegrityReport } from "@/lib/fs-lite/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

interface FileDetail {
  fileId: string;
  originalName: string;
  mimeType: string;
  totalSize: number;
  chunkCount: number;
  checksum: string;
  uploadedAt: string;
  chunks: {
    chunkId: string;
    index: number;
    size: number;
    hash: string;
    nodeId: string;
    nodeName: string;
    nodeStatus: string;
    replicas: string[];
    replicaNodes: { nodeId: string; nodeName: string }[];
  }[];
}

export default function FileDetailPage() {
  const params = useParams();
  const fileId = params.fileId as string;
  const [file, setFile] = useState<FileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [verifyProgress, setVerifyProgress] = useState(0);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyStage, setVerifyStage] = useState("");
  const [verifyEvents, setVerifyEvents] = useState<
    { message: string; stage: string; match?: boolean }[]
  >([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => {
    fetch(`/api/fs/files/${fileId}`)
      .then((res) => res.json())
      .then((data) => {
        setFile(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [fileId]);

  const handleVerify = async () => {
    setVerifying(true);
    setReport(null);
    setVerifyProgress(0);
    setVerifyStage("");
    setVerifyEvents([]);
    setVerifyOpen(true);

    try {
      const res = await fetch(`/api/fs/integrity/${fileId}`);
      if (!res.ok || !res.body) throw new Error("Request failed");

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
            setVerifyStage(event.stage);
            setVerifyEvents((prev) => [...prev, event]);

            if (event.stage === "hashing_progress" && event.total) {
              setVerifyProgress(Math.round((event.current / event.total) * 40));
            } else if (event.stage === "build_tree_done") {
              setVerifyProgress(50);
            } else if (event.stage === "root_check") {
              setVerifyProgress(event.match ? 100 : 60);
            } else if (event.stage === "descend") {
              const descentProg =
                event.level && event.depth
                  ? 60 + Math.round((event.level / event.depth) * 30)
                  : 70;
              setVerifyProgress(descentProg);
            } else if (event.stage === "complete") {
              setVerifyProgress(100);
              setReport(event.report);
              if (event.report?.failedChunks === 0) {
                toast.success("All chunks passed integrity check");
              } else {
                toast.error(
                  `${event.report?.failedChunks} chunks failed verification`,
                );
              }
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch {
      toast.error("Integrity check failed");
    } finally {
      setVerifying(false);
    }
  };

  // Stepper stages
  const stages = ["hashing", "build_tree", "root_check", "descend", "complete"];
  const stageLabels: Record<string, string> = {
    hashing: "Hashing Chunks",
    build_tree: "Building Merkle Tree",
    root_check: "Root Hash Check",
    descend: "Tree Descent",
    complete: "Complete",
  };
  const stageIcons: Record<string, React.ReactNode> = {
    hashing: <Hash className="h-3.5 w-3.5" />,
    build_tree: <TreePine className="h-3.5 w-3.5" />,
    root_check: <ShieldCheck className="h-3.5 w-3.5" />,
    descend: <Search className="h-3.5 w-3.5" />,
    complete: <CheckCircle2 className="h-3.5 w-3.5" />,
  };

  const getStageStatus = (stage: string) => {
    const stageIndex = stages.indexOf(stage);
    const currentRaw = verifyStage;
    // Map sub-stages to parent
    const mapped =
      currentRaw === "hashing_progress" || currentRaw === "hashing_done"
        ? "hashing"
        : currentRaw === "build_tree_done"
          ? "build_tree"
          : currentRaw === "descend_start" || currentRaw === "leaf"
            ? "descend"
            : currentRaw;
    const currentIndex = stages.indexOf(mapped);

    if (mapped === "complete") return "done";
    // Root check passed = skip descent
    if (
      stage === "descend" &&
      verifyEvents.some((e) => e.stage === "root_check" && e.match)
    ) {
      return "skip";
    }
    if (stageIndex < currentIndex) return "done";
    if (stageIndex === currentIndex) return "active";
    return "pending";
  };

  const handleDownload = async () => {
    if (!file) return;
    try {
      const res = await fetch(`/api/fs/download/${fileId}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading file details...
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        File not found
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/files"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Files
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {file.originalName}
            </h1>
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.totalSize)} · {file.chunkCount} chunks ·{" "}
              {file.mimeType}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={handleVerify}
              disabled={verifying}
            >
              {verifying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              Verify Integrity
            </Button>
            <Button
              size="sm"
              className="gap-2 text-xs"
              onClick={handleDownload}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        </div>
      </div>

      {/* Merkle Integrity Check Dialog */}
      <Dialog
        open={verifyOpen}
        onOpenChange={(open) => {
          if (!verifying) {
            setVerifyOpen(open);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <TreePine className="h-4 w-4 text-primary" />
              Merkle Integrity Check
            </DialogTitle>
          </DialogHeader>

          {/* Stepper */}
          <div className="space-y-2">
            {stages
              .filter((s) => getStageStatus(s) !== "skip")
              .map((stage) => {
                const status = getStageStatus(stage);
                return (
                  <div key={stage} className="flex items-center gap-3 text-xs">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                        status === "done"
                          ? "border-green-500 bg-green-500/10 text-green-500"
                          : status === "active"
                            ? "border-primary bg-primary/10 text-primary animate-pulse"
                            : "border-muted-foreground/30 text-muted-foreground/30"
                      }`}
                    >
                      {status === "done" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        stageIcons[stage]
                      )}
                    </div>
                    <span
                      className={
                        status === "pending"
                          ? "text-muted-foreground/40"
                          : status === "active"
                            ? "text-foreground font-medium"
                            : "text-muted-foreground"
                      }
                    >
                      {stageLabels[stage]}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Progress */}
          <Progress value={verifyProgress} className="h-2" />

          {/* Event log */}
          <ScrollArea className="h-40 rounded-md border bg-muted/20 p-3">
            <div className="space-y-1">
              {verifyEvents.map((event, i) => (
                <div
                  key={i}
                  className={`text-[10px] font-mono ${
                    event.stage === "leaf"
                      ? "text-destructive font-semibold"
                      : event.match === false
                        ? "text-yellow-500"
                        : event.match === true
                          ? "text-green-500"
                          : "text-muted-foreground"
                  }`}
                >
                  {event.message}
                </div>
              ))}
              {verifying && (
                <div className="text-[10px] text-muted-foreground animate-pulse">
                  ...
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Result summary */}
          {report && (
            <div
              className={`rounded-md border p-3 ${
                report.failedChunks === 0
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-destructive/30 bg-destructive/5"
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-medium">
                {report.failedChunks === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                {report.passedChunks}/{report.totalChunks} chunks passed
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Integrity report */}
      {report && (
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card
            className={
              report.failedChunks > 0
                ? "border-destructive/50"
                : "border-green-500/50"
            }
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                {report.failedChunks === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                Integrity Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {report.passedChunks}/{report.totalChunks} chunks passed ·{" "}
                {report.failedChunks} failed
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* File info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">File Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-xs md:grid-cols-4">
            <div>
              <p className="text-muted-foreground">File ID</p>
              <p className="font-mono text-[10px]">
                {file.fileId.slice(0, 12)}...
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Checksum</p>
              <p className="font-mono text-[10px]">
                {file.checksum.slice(0, 16)}...
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Uploaded</p>
              <p>{new Date(file.uploadedAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">MIME Type</p>
              <p>{file.mimeType}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chunk distribution table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Chunk Distribution</CardTitle>
            <span className="text-xs text-muted-foreground">
              {file.chunks.length} chunks total
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">#</TableHead>
                <TableHead className="text-xs">Node</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Size</TableHead>
                <TableHead className="text-xs">Replicas</TableHead>
                <TableHead className="text-xs">Integrity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {file.chunks
                .sort((a, b) => a.index - b.index)
                .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                .map((chunk, i) => {
                  const result = report?.results.find(
                    (r) => r.chunkId === chunk.chunkId,
                  );

                  return (
                    <motion.tr
                      key={chunk.chunkId}
                      className="border-b"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                    >
                      <TableCell className="text-xs font-mono">
                        {chunk.index}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs">
                          <Satellite className="h-3 w-3 text-primary" />
                          {chunk.nodeName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            chunk.nodeStatus === "online"
                              ? "default"
                              : chunk.nodeStatus === "degraded"
                                ? "secondary"
                                : "destructive"
                          }
                          className="text-[10px]"
                        >
                          {chunk.nodeStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatBytes(chunk.size)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {chunk.replicaNodes.length > 0
                          ? chunk.replicaNodes.map((r) => r.nodeName).join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {result ? (
                          result.passed ? (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                            >
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            </motion.div>
                          ) : (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </motion.div>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                    </motion.tr>
                  );
                })}
            </TableBody>
          </Table>

          {/* Pagination controls */}
          {file.chunks.length > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <span className="text-xs text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, file.chunks.length)} of{" "}
                {file.chunks.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                {Array.from(
                  { length: Math.ceil(file.chunks.length / PAGE_SIZE) },
                  (_, i) => i + 1,
                )
                  .filter((p) => {
                    const total = Math.ceil(file.chunks.length / PAGE_SIZE);
                    return p === 1 || p === total || Math.abs(p - page) <= 1;
                  })
                  .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                    if (
                      idx > 0 &&
                      (p as number) - (arr[idx - 1] as number) > 1
                    ) {
                      acc.push("...");
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === "..." ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-1 text-xs text-muted-foreground"
                      >
                        ...
                      </span>
                    ) : (
                      <Button
                        key={p}
                        variant={page === p ? "default" : "outline"}
                        size="sm"
                        className="h-7 min-w-7 px-2 text-xs"
                        onClick={() => setPage(p as number)}
                      >
                        {p}
                      </Button>
                    ),
                  )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() =>
                    setPage((p) =>
                      Math.min(
                        Math.ceil(file.chunks.length / PAGE_SIZE),
                        p + 1,
                      ),
                    )
                  }
                  disabled={page === Math.ceil(file.chunks.length / PAGE_SIZE)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
