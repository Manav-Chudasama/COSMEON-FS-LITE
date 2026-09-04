"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [step, setStep] = useState<"credentials" | "2fa">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [twoFaCode, setTwoFaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // ── Resend 2FA OTP ───────────────────────────────────
  async function handleResend2FA() {
    setResending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to resend code.");
        return;
      }
      toast.info("New verification code sent to your email.");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setResending(false);
    }
  }

  // ── Step 1: Login with email + password ──────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Login failed.");
        return;
      }

      if (data.requiresTwoFactor) {
        setStep("2fa");
        toast.info("Verification code sent to your email.");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Verify 2FA code ───────────────────────────
  async function handleVerify2FA(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: twoFaCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Invalid code.");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Credentials Form ──────────────────────────────────
  if (step === "credentials") {
    return (
      <div className="border border-border bg-card p-8">
        <div className="mb-6">
          <h1 className="text-sm font-bold uppercase tracking-widest">
            Sign In
          </h1>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Access your orbital file system
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
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

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
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

          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" className="w-full gap-2 text-xs" size="sm" disabled={loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Sign In
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          No account?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Create one
          </Link>
        </p>
      </div>
    );
  }

  // ── 2FA Verification Form ─────────────────────────────
  return (
    <div className="border border-border bg-card p-8">
      <div className="mb-6">
        <h1 className="text-sm font-bold uppercase tracking-widest">
          Two-Factor Auth
        </h1>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Enter the 6-digit code sent to{" "}
          <span className="font-semibold text-foreground">{email}</span>
        </p>
      </div>

      <form onSubmit={handleVerify2FA} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="code" className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Verification Code
          </Label>
          <Input
            id="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={twoFaCode}
            onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            required
            className="h-9 text-center font-mono text-sm font-bold tracking-[0.4em]"
            autoFocus
          />
        </div>

        <Button type="submit" className="w-full gap-2 text-xs" size="sm" disabled={loading || twoFaCode.length !== 6}>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Verify & Sign In
        </Button>
      </form>

      <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
        <button
          type="button"
          onClick={() => { setStep("credentials"); setTwoFaCode(""); }}
          className="hover:text-foreground transition-colors"
        >
          ← Back to sign in
        </button>

        <button
          type="button"
          onClick={handleResend2FA}
          disabled={resending}
          className="text-primary hover:underline disabled:opacity-50"
        >
          {resending ? "Sending..." : "Resend Code"}
        </button>
      </div>
    </div>
  );
}
