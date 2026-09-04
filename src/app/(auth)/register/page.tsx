"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "details" | "otp";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // ── Step 1: Send OTP to email ─────────────────────────
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to send verification code.");
        return;
      }

      toast.info("Verification code sent to your email.");
      setStep("otp");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Verify OTP and create user ────────────────
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();

    if (otpCode.length !== 6) {
      toast.error("Please enter the 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, code: otpCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Invalid verification code.");
        return;
      }

      toast.success("Account verified and created. Welcome aboard.");
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Resend OTP ────────────────────────────────────────
  async function handleResend() {
    setResending(true);
    try {
      const res = await fetch("/api/auth/register/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
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

  // ── Step 1: Details Form ──────────────────────────────
  if (step === "details") {
    return (
      <div className="border border-border bg-card p-8">
        <div className="mb-6">
          <h1 className="text-sm font-bold uppercase tracking-widest">
            Create Account
          </h1>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Join the orbital file system
          </p>
        </div>

        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Name
            </Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Commander"
              required
              autoComplete="name"
              className="h-9 text-xs"
            />
          </div>

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
                placeholder="Min. 6 characters"
                required
                autoComplete="new-password"
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
              Confirm Password
            </Label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              required
              autoComplete="new-password"
              className="h-9 text-xs"
            />
          </div>

          <Button type="submit" className="w-full gap-2 text-xs" size="sm" disabled={loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Continue
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  // ── Step 2: Email OTP Verification Form ───────────────
  return (
    <div className="border border-border bg-card p-8">
      <div className="mb-6">
        <h1 className="text-sm font-bold uppercase tracking-widest">
          Verify Email
        </h1>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Enter the 6-digit code sent to{" "}
          <span className="font-semibold text-foreground">{email}</span>
        </p>
      </div>

      <form onSubmit={handleVerifyOtp} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="otpCode" className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Verification Code
          </Label>
          <Input
            id="otpCode"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            required
            className="h-9 text-center font-mono text-sm font-bold tracking-[0.4em]"
            autoFocus
          />
        </div>

        <Button
          type="submit"
          className="w-full gap-2 text-xs"
          size="sm"
          disabled={loading || otpCode.length !== 6}
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Verify & Create Account
        </Button>
      </form>

      <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
        <button
          type="button"
          onClick={() => { setStep("details"); setOtpCode(""); }}
          className="hover:text-foreground transition-colors"
        >
          ← Edit details
        </button>

        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="text-primary hover:underline disabled:opacity-50"
        >
          {resending ? "Sending..." : "Resend Code"}
        </button>
      </div>
    </div>
  );
}
