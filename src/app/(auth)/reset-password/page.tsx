"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState(prefillEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: code.trim(), newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Password reset failed.");
        return;
      }

      toast.success("Password reset successfully. Please sign in.");
      router.push("/login");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-border bg-card p-8">
      <div className="mb-6">
        <h1 className="text-sm font-bold uppercase tracking-widest">
          Reset Password
        </h1>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Enter the reset code and your new password
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!prefillEmail && (
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="commander@fs-lite.org"
              required
              className="h-9 text-xs"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="code" className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Reset Code
          </Label>
          <Input
            id="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            required
            className="h-9 text-center text-lg tracking-[0.5em]"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="newPassword" className="text-[11px] uppercase tracking-widest text-muted-foreground">
            New Password
          </Label>
          <div className="relative">
            <Input
              id="newPassword"
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 6 characters"
              required
              className="h-9 pr-10 text-xs"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Confirm New Password
          </Label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            required
            className="h-9 text-xs"
          />
        </div>

        <Button
          type="submit"
          className="w-full gap-2 text-xs"
          size="sm"
          disabled={loading || code.length !== 6}
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Reset Password
        </Button>
      </form>
    </div>
  );
}
