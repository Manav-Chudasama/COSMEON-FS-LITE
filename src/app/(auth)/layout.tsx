// ============================================
// COSMEON FS-LITE — Auth Pages Layout
// Full-screen centered layout with orbital background
// ============================================

import type { ReactNode } from "react";
import { Satellite } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "FS-Lite — Authentication",
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background flex flex-col items-center justify-center px-4">
      {/* Subtle grid background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Brand mark */}
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-sm font-bold tracking-widest uppercase text-foreground hover:text-primary transition-colors"
      >
        <Satellite className="h-5 w-5 text-primary" />
        FS-<span className="text-primary">LITE</span>
      </Link>

      {/* Auth card */}
      <div className="w-full max-w-sm">{children}</div>

      {/* Footer */}
      <p className="mt-8 text-[10px] uppercase tracking-widest text-muted-foreground">
        Orbital File System &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
