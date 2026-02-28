"use client";

import Link from "next/link";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import {
  Rocket,
  Layers,
  Shield,
  Activity,
  Database,
  Satellite,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const Orb = dynamic(() => import("@/components/Orb"), { ssr: false });

const features = [
  {
    icon: Layers,
    title: "Chunk Distribution",
    description:
      "Files are split into 256 KB chunks and distributed across orbital nodes using round-robin or weighted strategies.",
  },
  {
    icon: Database,
    title: "Replication & Fault Tolerance",
    description:
      "Each chunk is replicated across multiple nodes. If a satellite goes offline, data is still retrievable.",
  },
  {
    icon: Shield,
    title: "Integrity Verification",
    description:
      "SHA-256 checksums on every chunk. On-demand verification ensures zero data corruption across the constellation.",
  },
  {
    icon: Activity,
    title: "Auto Rebalancing",
    description:
      "When nodes fail or recover, chunks are automatically redistributed to maintain optimal system balance.",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Animated background grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[4rem_4rem] opacity-20" />

      {/* Floating orbital dots */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={`orb-${i}`}
            className="absolute h-2 w-2 rounded-full bg-primary/40"
            style={{
              top: `${15 + i * 18}%`,
              left: `${10 + i * 20}%`,
            }}
            animate={{
              y: [0, -30, 0],
              x: [0, 20, 0],
              opacity: [0.3, 0.7, 0.3],
            }}
            transition={{
              duration: 4 + i,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
              delay: i * 0.5,
            }}
          />
        ))}
      </div>

      {/* Orb — glowing ring backdrop behind hero text */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-5"
        style={{ top: "50px", width: "680px", height: "680px", opacity: 0.68 }}
      >
        <Orb
          hoverIntensity={2}
          rotateOnHover
          hue={0}
          forceHoverState={false}
          backgroundColor="#000000"
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 md:px-12">
        <div className="flex items-center gap-2">
          <Satellite className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold tracking-wider uppercase">
            COSMEON
          </span>
        </div>
        <Link href="/dashboard">
          <Button variant="outline" size="sm" className="text-xs">
            Launch Dashboard
          </Button>
        </Link>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center px-6 pt-16 pb-24 md:pt-28">
        <motion.div
          className="flex max-w-3xl flex-col items-center text-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className="mb-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Orbital File System Simulation
            </span>
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="mb-6 text-4xl font-bold leading-tight tracking-tight md:text-6xl"
          >
            FS-
            <span className="text-primary">LITE</span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="mb-10 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg"
          >
            A lightweight distributed file system that splits files into chunks,
            distributes them across orbital satellite nodes, and reconstructs
            them on demand — with full integrity verification.
          </motion.p>

          <motion.div
            variants={itemVariants}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <Link href="/dashboard">
              <Button size="lg" className="gap-2 text-sm">
                <Rocket className="h-4 w-4" />
                Launch Dashboard
              </Button>
            </Link>
            <Link href="/dashboard/nodes">
              <Button variant="outline" size="lg" className="gap-2 text-sm">
                <Satellite className="h-4 w-4" />
                View Constellation
              </Button>
            </Link>
          </motion.div>
        </motion.div>

        {/* Features grid */}
        <motion.div
          className="mt-24 grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-2"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              className="group rounded-lg border border-border bg-card/50 p-6 transition-colors hover:border-primary/30 hover:bg-card"
            >
              <feature.icon className="mb-3 h-5 w-5 text-primary transition-transform group-hover:scale-110" />
              <h3 className="mb-2 text-sm font-semibold">{feature.title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* System architecture preview */}
        <motion.div
          className="mt-20 w-full max-w-2xl"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="rounded-lg border border-border bg-card/30 p-8">
            <p className="mb-6 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
              System Architecture
            </p>
            <div className="flex flex-col items-center gap-4">
              {/* Client */}
              <div className="rounded border border-primary/40 bg-primary/5 px-6 py-2 text-xs font-medium text-primary">
                Browser Dashboard
              </div>
              <div className="h-6 w-px bg-border" />
              {/* API Layer */}
              <div className="rounded border border-border bg-muted px-6 py-2 text-xs font-medium">
                API Routes + Arcjet Security
              </div>
              <div className="h-6 w-px bg-border" />
              {/* Engine */}
              <div className="rounded border border-border bg-muted px-6 py-2 text-xs font-medium">
                FS-Lite Core Engine
              </div>
              <div className="h-6 w-px bg-border" />
              {/* Nodes */}
              <div className="flex flex-wrap justify-center gap-3">
                {["ORBIT-1", "ORBIT-2", "ORBIT-3", "ORBIT-4", "ORBIT-5"].map(
                  (name, i) => (
                    <motion.div
                      key={name}
                      className="rounded border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary"
                      initial={{ opacity: 0, scale: 0.8 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.1 * i }}
                    >
                      <Satellite className="mr-1 inline h-3 w-3" />
                      {name}
                    </motion.div>
                  ),
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border px-6 py-6 text-center text-xs text-muted-foreground">
        COSMEON FS-LITE · Orbital File System Simulation
      </footer>
    </div>
  );
}
