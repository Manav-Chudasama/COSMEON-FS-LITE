"use client";

import {
  Check,
  Clock,
  Copy,
  Globe,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  Share2,
  Trash2,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ShareLink, SharedUser } from "@/lib/fs-lite/types";

interface FileShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string | null;
  fileName: string;
  onUpdated?: () => void;
}

export function FileShareModal({
  open,
  onOpenChange,
  fileId,
  fileName,
  onUpdated,
}: FileShareModalProps) {
  const [activeTab, setActiveTab] = useState<"collaborators" | "public">(
    "collaborators",
  );
  const [loading, setLoading] = useState(false);
  const [collaborators, setCollaborators] = useState<SharedUser[]>([]);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [addingCollaborator, setAddingCollaborator] = useState(false);
  const [updatingLink, setUpdatingLink] = useState(false);
  const [expiryOption, setExpiryOption] = useState<string>("24h");
  const [copied, setCopied] = useState(false);

  // Fetch current sharing state
  const loadShareState = useCallback(async () => {
    if (!fileId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/fs/files/${fileId}`);
      if (!res.ok) throw new Error("Failed to load file sharing data");
      const data = await res.json();
      setCollaborators(data.sharedUsers || []);
      setShareLink(data.shareLink || null);

      if (data.shareLink?.enabled) {
        if (!data.shareLink.expiresAt) {
          setExpiryOption("never");
        } else {
          const remainingHours =
            (new Date(data.shareLink.expiresAt).getTime() - Date.now()) /
            (1000 * 60 * 60);
          if (remainingHours <= 1.5) {
            setExpiryOption("1h");
          } else if (remainingHours <= 25) {
            setExpiryOption("24h");
          } else {
            setExpiryOption("7d");
          }
        }
      }
    } catch {
      toast.error("Could not load sharing settings");
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (open && fileId) {
      loadShareState();
    } else {
      setEmailInput("");
      setCopied(false);
    }
  }, [open, fileId, loadShareState]);

  // Add collaborator by email
  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileId || !emailInput.trim()) return;

    setAddingCollaborator(true);
    try {
      const res = await fetch(`/api/fs/files/${fileId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          email: emailInput.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to share file");
      }

      toast.success(data.message || `File shared with ${emailInput.trim()}`);
      setEmailInput("");
      loadShareState();
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add collaborator");
    } finally {
      setAddingCollaborator(false);
    }
  };

  // Remove collaborator
  const handleRemoveCollaborator = async (email: string) => {
    if (!fileId) return;

    try {
      const res = await fetch(`/api/fs/files/${fileId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove",
          email,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove collaborator");
      }

      toast.success(`Access revoked for ${email}`);
      loadShareState();
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove collaborator");
    }
  };

  // Toggle or update public share link
  const handleToggleShareLink = async (enabled: boolean) => {
    if (!fileId) return;

    setUpdatingLink(true);
    try {
      const res = await fetch(`/api/fs/files/${fileId}/share-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          expiresIn: expiryOption === "never" ? null : expiryOption,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update share link");
      }

      setShareLink(data.shareLink);
      toast.success(
        enabled ? "Public share link generated" : "Public share link revoked",
      );
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update link");
    } finally {
      setUpdatingLink(false);
    }
  };

  const handleCopyLink = () => {
    if (!shareLink?.token) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/share/${shareLink.token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Share link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const fullShareUrl =
    shareLink?.token && typeof window !== "undefined"
      ? `${window.location.origin}/share/${shareLink.token}`
      : "";

  const isLinkExpired =
    shareLink?.enabled &&
    shareLink?.expiresAt &&
    new Date(shareLink.expiresAt).getTime() < Date.now();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-none border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
            <Share2 className="h-4 w-4 text-primary" />
            Share File
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground truncate">
            {fileName}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "collaborators" | "public")}
          className="mt-2"
        >
          <TabsList className="grid w-full grid-cols-2 rounded-none">
            <TabsTrigger
              value="collaborators"
              className="gap-1.5 text-xs rounded-none"
            >
              <Users className="h-3.5 w-3.5" />
              Collaborators ({collaborators.length})
            </TabsTrigger>
            <TabsTrigger
              value="public"
              className="gap-1.5 text-xs rounded-none"
            >
              <Globe className="h-3.5 w-3.5" />
              Public Link
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Collaborators */}
          <TabsContent value="collaborators" className="mt-4 space-y-4">
            {/* Add collaborator form */}
            <form onSubmit={handleAddCollaborator} className="flex gap-2">
              <Input
                type="email"
                placeholder="operator@cosmeon.io"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
                className="h-8 rounded-none text-xs"
              />
              <Button
                type="submit"
                size="sm"
                disabled={addingCollaborator || !emailInput.trim()}
                className="cursor-target rounded-none gap-1.5 text-xs shrink-0"
              >
                {addingCollaborator ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
                Grant Access
              </Button>
            </form>

            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
              Collaborators receive read and download access only. Deletion is
              restricted to the file owner.
            </p>

            {/* Collaborators list */}
            <div className="border border-border">
              {loading ? (
                <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Loading collaborators...
                </div>
              ) : collaborators.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No collaborators granted access yet.
                </div>
              ) : (
                <div className="divide-y divide-border max-h-56 overflow-y-auto">
                  {collaborators.map((c) => (
                    <div
                      key={c.userId || c.email}
                      className="flex items-center justify-between p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none bg-muted text-muted-foreground">
                          <User className="h-3 w-3" />
                        </div>
                        <div className="min-w-0 truncate">
                          <p className="truncate font-medium text-xs">
                            {c.email}
                          </p>
                          {c.name && (
                            <p className="truncate text-[10px] text-muted-foreground">
                              {c.name}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className="rounded-none border-border text-[9px] font-mono uppercase tracking-wider text-muted-foreground"
                        >
                          Read &amp; Download
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="cursor-target h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveCollaborator(c.email)}
                          title="Revoke access"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 2: Public Share Link */}
          <TabsContent value="public" className="mt-4 space-y-4">
            {/* Toggle Enable Public Link */}
            <div className="flex items-center justify-between border border-border p-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium">Public Stream Link</p>
                <p className="text-[10px] text-muted-foreground">
                  Allow anyone with the link to stream-reconstruct this file
                </p>
              </div>
              <Switch
                checked={!!shareLink?.enabled && !isLinkExpired}
                onCheckedChange={handleToggleShareLink}
                disabled={updatingLink || loading}
              />
            </div>

            {/* Link details when active */}
            {shareLink?.enabled && (
              <div className="space-y-3">
                {/* Expiry Selector */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Link Expiration:</span>
                  </div>
                  <Select
                    value={expiryOption}
                    onValueChange={(val) => {
                      setExpiryOption(val);
                      // Update link with new expiration
                      if (fileId) {
                        fetch(`/api/fs/files/${fileId}/share-link`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            enabled: true,
                            expiresIn: val === "never" ? null : val,
                          }),
                        })
                          .then((r) => r.json())
                          .then((data) => {
                            if (data.shareLink) setShareLink(data.shareLink);
                            toast.success("Expiration updated");
                            onUpdated?.();
                          });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-36 rounded-none text-xs">
                      <SelectValue placeholder="Expiration" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="1h" className="text-xs">
                        1 Hour
                      </SelectItem>
                      <SelectItem value="24h" className="text-xs">
                        24 Hours
                      </SelectItem>
                      <SelectItem value="7d" className="text-xs">
                        7 Days
                      </SelectItem>
                      <SelectItem value="never" className="text-xs">
                        Never
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Status indicator */}
                {isLinkExpired ? (
                  <div className="rounded-none border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                    This share link has expired. Toggle switch to regenerate a
                    new one.
                  </div>
                ) : (
                  <>
                    {/* Share URL input with copy button */}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <LinkIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          readOnly
                          value={fullShareUrl}
                          className="h-8 pl-8 font-mono text-[11px] rounded-none select-all"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCopyLink}
                        className="cursor-target h-8 rounded-none gap-1.5 text-xs shrink-0"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>

                    {/* Metadata stats */}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border pt-2">
                      <span>
                        Downloads:{" "}
                        <strong className="text-foreground">
                          {shareLink.downloads}
                        </strong>
                      </span>
                      <span>
                        {shareLink.expiresAt ? (
                          <>
                            Expires:{" "}
                            {new Date(shareLink.expiresAt).toLocaleDateString()}{" "}
                            {new Date(shareLink.expiresAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </>
                        ) : (
                          "No expiration"
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
