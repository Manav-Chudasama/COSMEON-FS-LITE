"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to send reset code.");
        return;
      }
      setSent(true);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="border border-border bg-card p-8">
        <div className="mb-6">
          <h1 className="text-sm font-bold uppercase tracking-widest">
            Check Your Email
          </h1>
          <p className="mt-1 text-[11px] text-muted-foreground">
            A 6-digit reset code has been sent to{" "}
            <span className="text-foreground">{email}</span>
          </p>
        </div>
        <Link href={`/reset-password?email=${encodeURIComponent(email)}`}>
          <Button className="w-full text-xs" size="sm">
            Enter Reset Code →
          </Button>
        </Link>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-4 w-full text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="border border-border bg-card p-8">
      <div className="mb-6">
        <h1 className="text-sm font-bold uppercase tracking-widest">
          Forgot Password
        </h1>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Enter your email to receive a reset code
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
            autoComplete="email"
            className="h-9 text-xs"
          />
        </div>

        <Button type="submit" className="w-full gap-2 text-xs" size="sm" disabled={loading}>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Send Reset Code
        </Button>
      </form>

      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        Remember your password?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
