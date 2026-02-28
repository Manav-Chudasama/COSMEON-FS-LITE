"use client";

import {
  Activity,
  Cloud,
  Cpu,
  Database,
  GraduationCap,
  Layers,
  Microscope,
  Rocket,
  Router,
  Satellite,
  Shield,
  ShieldAlert,
  Server,
  WifiOff,
  Globe,
  HardDrive,
  FileText,
  Network,
  LineChart,
  Users,
  Github,
  Twitter,
} from "lucide-react";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { MagicCard } from "@/components/ui/magic-card";
import { Marquee } from "@/components/ui/marquee";
import RippleGrid from "@/components/RippleGrid";
import { OrbitingCircles } from "@/components/ui/orbiting-circles";

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

const useCases = [
  {
    icon: Satellite,
    title: "Satellite Data Storage Simulation",
    description:
      "Demonstrate how data can be safely distributed across orbital or remote nodes.",
  },
  {
    icon: GraduationCap,
    title: "Distributed Storage Learning Platform",
    description:
      "Helps students understand replication, fault tolerance, and distributed systems visually.",
  },
  {
    icon: Cpu,
    title: "Edge Computing Storage",
    description:
      "Store chunks closer to users or devices to reduce latency and improve reliability.",
  },
  {
    icon: ShieldAlert,
    title: "Disaster Recovery Systems",
    description:
      "Maintain multiple copies of data so services continue working even when servers fail.",
  },
  {
    icon: Router,
    title: "IoT Data Storage",
    description:
      "Distribute sensor data across nodes instead of relying on one central server.",
  },
  {
    icon: Cloud,
    title: "Cloud Storage Simulation",
    description:
      "Prototype concepts similar to AWS S3 or Google Cloud Storage in a simplified environment.",
  },
  {
    icon: Microscope,
    title: "Research & Testing Environment",
    description:
      "Test replication, rebalancing, and failure handling before deploying real infrastructure.",
  },
  {
    icon: WifiOff,
    title: "Offline-Resilient Systems",
    description: "Ensure data survives when some nodes go offline temporarily.",
  },
];

const firstRow = useCases.slice(0, useCases.length / 2);
const secondRow = useCases.slice(useCases.length / 2);

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
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground selection:bg-primary/30">
      {/* Animated background grid */}
      <div className="pointer-events-auto fixed inset-0 z-0 overflow-hidden opacity-80">
        <RippleGrid
          gridColor="#e13915"
          opacity={0.4}
          rippleIntensity={0.05}
          fadeDistance={2.0}
        />
        {/* Soft vignette fade at the edges to blend the grid smoothly */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,var(--background)_100%)] pointer-events-none" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-12 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <Satellite className="h-6 w-6 text-primary" />
          <span className="text-base font-bold tracking-widest uppercase">
            FS-LITE
          </span>
        </div>
        <Link href="/dashboard" className="pointer-events-auto">
          <Button
            variant="outline"
            size="sm"
            className="text-xs cursor-target border-primary/20 hover:bg-primary/10 transition-colors"
          >
            Launch Dashboard
          </Button>
        </Link>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto max-w-7xl px-6 pt-16 pb-24 md:pt-8 pointer-events-none">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-8 items-center">
          {/* Left Text */}
          <motion.div
            className="flex flex-col items-start text-left"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div
              variants={itemVariants}
              className="mb-6 pointer-events-auto"
            >
              <div className="cursor-target inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium shadow-sm shadow-primary/10 backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <AnimatedShinyText className="inline-flex items-center justify-center transition ease-out hover:text-primary hover:duration-300">
                  <span className="text-primary/90">Next-Gen Storage</span>
                </AnimatedShinyText>
              </div>
            </motion.div>

            <motion.h1
              variants={itemVariants}
              className="pointer-events-auto mb-6 text-5xl font-extrabold leading-[1.1] tracking-tighter sm:text-6xl md:text-7xl"
            >
              Store data
              <br />
              in the <span className="text-primary">cosmos.</span>
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="pointer-events-auto mb-10 max-w-lg text-lg leading-relaxed text-muted-foreground sm:text-xl"
            >
              FS-Lite brings orbital file systems to life. We chunk your files,
              distribute them across satellite nodes securely, and reconstruct
              them instantly on demand.
            </motion.p>

            <motion.div
              variants={itemVariants}
              className="pointer-events-auto flex flex-col gap-4 sm:flex-row w-full sm:w-auto"
            >
              <Link
                href="/dashboard"
                className="cursor-target block w-full sm:w-auto"
              >
                <Button
                  size="lg"
                  className="w-full gap-2 shadow-2xl shadow-primary/20"
                >
                  <Rocket className="h-4 w-4" />
                  Deploy Now
                </Button>
              </Link>
              <Link
                href="/dashboard/nodes"
                className="cursor-target block w-full sm:w-auto"
              >
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full gap-2 text-sm border-primary/20 hover:bg-primary/10"
                >
                  <Activity className="h-4 w-4 text-primary" />
                  View Constellation
                </Button>
              </Link>
            </motion.div>
          </motion.div>

          {/* Right Visual (Orbiting Circles) */}
          <motion.div
            className="relative flex items-center justify-center h-[400px] lg:h-[600px] w-full"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
          >
            <div className="relative flex h-[500px] w-full flex-col items-center justify-center overflow-hidden pointer-events-auto z-5">
              <span className="pointer-events-none whitespace-pre-wrap bg-linear-to-b from-foreground to-muted-foreground bg-clip-text text-center text-8xl font-semibold leading-none text-transparent dark:from-white dark:to-white/20">
                <Globe className="h-32 w-32 text-primary" />
              </span>

              {/* Inner Circles */}
              <OrbitingCircles
                className="size-[40px] border-none bg-transparent"
                duration={25}
                delay={0}
                radius={120}
              >
                <Satellite className="text-primary h-8 w-8" />
                <Server className="text-primary h-8 w-8" />
                <HardDrive className="text-primary h-8 w-8" />
              </OrbitingCircles>

              {/* Outer Circles (reverse) */}
              <OrbitingCircles
                className="size-[50px] border-none bg-transparent"
                radius={220}
                duration={35}
                reverse
              >
                <FileText className="text-muted-foreground h-10 w-10" />
                <Shield className="text-primary h-10 w-10" />
                <Layers className="text-muted-foreground h-10 w-10" />
                <Network className="text-primary h-10 w-10" />
              </OrbitingCircles>
            </div>
            {/* Soft backdrop glow behind orbits */}
            <div className="absolute inset-0 z-0 rounded-full bg-primary/5 blur-[100px] w-3/4 h-3/4 left-1/8 top-1/8 pointer-events-none" />
          </motion.div>
        </div>

        {/* Features grid */}
        <motion.div
          className="relative z-10 mt-32 grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 pointer-events-auto"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              className="h-full"
            >
              <MagicCard
                className="cursor-target group flex h-full flex-col p-8 overflow-hidden bg-card/40 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors"
                gradientColor={
                  typeof window !== "undefined" &&
                  document.documentElement?.classList.contains("dark")
                    ? "#2a1515"
                    : "#fee2e2"
                }
              >
                <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3">
                  <feature.icon className="h-6 w-6 text-primary transition-transform duration-300 group-hover:scale-110" />
                </div>
                <h3 className="mb-3 text-lg font-bold tracking-tight text-foreground">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </MagicCard>
            </motion.div>
          ))}
        </motion.div>

        {/* Use Cases Section */}
        <motion.div
          className="mt-40 w-full mx-auto max-w-7xl pointer-events-auto"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl mb-4">
              Real-World <span className="text-primary">Use Cases</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              From edge computing and IoT to educational platforms, discover how
              FS-Lite adapts to various distributed environments.
            </p>
          </div>

          <div className="relative flex w-full flex-col items-center justify-center overflow-hidden">
            <Marquee pauseOnHover className="[--duration:40s]">
              {firstRow.map((useCase) => (
                <MagicCard
                  key={useCase.title}
                  className="cursor-target group flex w-80 flex-col p-6 overflow-hidden bg-card/20 backdrop-blur-md border-border/40 hover:border-primary/40 transition-colors"
                  gradientColor={
                    typeof window !== "undefined" &&
                    document.documentElement?.classList.contains("dark")
                      ? "#2a1515"
                      : "#fee2e2"
                  }
                >
                  <div className="mb-4 inline-flex items-center justify-center rounded-xl bg-primary/10 w-12 h-12">
                    <useCase.icon className="h-6 w-6 text-primary transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <h3 className="mb-2 text-base font-bold tracking-tight text-foreground">
                    {useCase.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-normal">
                    {useCase.description}
                  </p>
                </MagicCard>
              ))}
            </Marquee>
            <Marquee reverse pauseOnHover className="[--duration:40s]">
              {secondRow.map((useCase) => (
                <MagicCard
                  key={useCase.title}
                  className="cursor-target group flex w-80 flex-col p-6 overflow-hidden bg-card/20 backdrop-blur-md border-border/40 hover:border-primary/40 transition-colors"
                  gradientColor={
                    typeof window !== "undefined" &&
                    document.documentElement?.classList.contains("dark")
                      ? "#2a1515"
                      : "#fee2e2"
                  }
                >
                  <div className="mb-4 inline-flex items-center justify-center rounded-xl bg-primary/10 w-12 h-12">
                    <useCase.icon className="h-6 w-6 text-primary transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <h3 className="mb-2 text-base font-bold tracking-tight text-foreground">
                    {useCase.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-normal">
                    {useCase.description}
                  </p>
                </MagicCard>
              ))}
            </Marquee>
            {/* Gradient Fades for Marquee edges */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-background dark:from-background" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-linear-to-l from-background dark:from-background" />
          </div>
        </motion.div>

        {/* Business Model Section */}
        <motion.div
          className="mt-40 w-full mx-auto max-w-7xl pointer-events-auto"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl mb-4">
              Strategic <span className="text-primary">Business Models</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Built not just as a technology demonstration, but as a dual-engine
              platform for education and scalable enterprise SaaS.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
            {/* Educational Model */}
            <div className="flex flex-col h-full">
              <div className="mb-6 flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <GraduationCap className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Educational Platform</h3>
                  <p className="text-sm text-primary font-medium tracking-wider uppercase">
                    Strong B2B Academic Model
                  </p>
                </div>
              </div>
              <MagicCard
                className="cursor-target flex-1 p-8 bg-card/10 backdrop-blur-sm border-border/40 hover:border-primary/30 transition-colors"
                gradientColor={
                  typeof window !== "undefined" &&
                  document.documentElement?.classList.contains("dark")
                    ? "#2a1515"
                    : "#fee2e2"
                }
              >
                <div className="space-y-8">
                  <div>
                    <h4 className="flex items-center gap-2 text-lg font-semibold mb-3 border-b border-border/40 pb-2">
                      <Users className="h-5 w-5 text-muted-foreground" /> Target
                      Users
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Universities, Engineering Colleges, Distributed Systems
                      Courses, Cloud Computing Labs, and Bootcamps.
                    </p>
                  </div>
                  <div>
                    <h4 className="flex items-center gap-2 text-lg font-semibold mb-3 border-b border-border/40 pb-2">
                      <Layers className="h-5 w-5 text-muted-foreground" /> Core
                      Value
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      "Learn distributed systems visually instead of only
                      reading theory." Interactive node simulation, visual chunk
                      distribution, and prebuilt lab exercises for students.
                    </p>
                  </div>
                  <div>
                    <h4 className="flex items-center gap-2 text-lg font-semibold mb-3 border-b border-border/40 pb-2">
                      <LineChart className="h-5 w-5 text-muted-foreground" />{" "}
                      Revenue Streams
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside marker:text-primary/50">
                      <li>Institution licensing per semester</li>
                      <li>Classroom subscriptions for professors</li>
                      <li>Paid lab modules and assignments</li>
                      <li>Certification-based learning modules</li>
                    </ul>
                  </div>
                </div>
              </MagicCard>
            </div>

            {/* SaaS Platform Model */}
            <div className="flex flex-col h-full">
              <div className="mb-6 flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Cloud className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">Enterprise SaaS</h3>
                  <p className="text-sm text-primary font-medium tracking-wider uppercase">
                    Scalable Infrastructure
                  </p>
                </div>
              </div>
              <MagicCard
                className="cursor-target flex-1 p-8 bg-card/10 backdrop-blur-sm border-border/40 hover:border-primary/30 transition-colors"
                gradientColor={
                  typeof window !== "undefined" &&
                  document.documentElement?.classList.contains("dark")
                    ? "#2a1515"
                    : "#fee2e2"
                }
              >
                <div className="space-y-8">
                  <div>
                    <h4 className="flex items-center gap-2 text-lg font-semibold mb-3 border-b border-border/40 pb-2">
                      <Rocket className="h-5 w-5 text-muted-foreground" />{" "}
                      Target Customers
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Startups needing lightweight storage, Small SaaS
                      companies, AI/data processing apps, and Edge computing
                      applications.
                    </p>
                  </div>
                  <div>
                    <h4 className="flex items-center gap-2 text-lg font-semibold mb-3 border-b border-border/40 pb-2">
                      <Shield className="h-5 w-5 text-muted-foreground" /> Core
                      Value
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Managed distributed file storage with built-in
                      replication, failure handling, APIs, and high availability
                      through multi-node storage.
                    </p>
                  </div>
                  <div>
                    <h4 className="flex items-center gap-2 text-lg font-semibold mb-3 border-b border-border/40 pb-2">
                      <Database className="h-5 w-5 text-muted-foreground" />{" "}
                      Pricing & Revenue
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                      <div className="bg-background/50 rounded-lg p-3 border border-border/50 text-center">
                        <span className="block text-xs font-bold uppercase text-primary/80 mb-1">
                          Free Tier
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-tight">
                          Limited storage & basic sync
                        </span>
                      </div>
                      <div className="bg-primary/5 rounded-lg p-3 border border-primary/20 text-center">
                        <span className="block text-xs font-bold uppercase text-primary mb-1">
                          Pro Tier
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-tight">
                          High storage & monitoring
                        </span>
                      </div>
                      <div className="bg-background/50 rounded-lg p-3 border border-border/50 text-center">
                        <span className="block text-xs font-bold uppercase text-foreground mb-1">
                          Enterprise
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-tight">
                          Custom clusters & SLAs
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </MagicCard>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 bg-card/10 backdrop-blur-xl mt-32 pointer-events-auto">
        <div className="mx-auto max-w-7xl px-6 py-12 md:px-12 lg:py-16">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-4 lg:gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <Satellite className="h-6 w-6 text-primary" />
                <span className="text-xl font-bold tracking-widest uppercase">
                  FS-LITE
                </span>
              </div>
              <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">
                The lightweight, orbital-inspired distributed file system
                simulation. Purpose-built for education and scalable edge
                network prototypes.
              </p>
              <div className="mt-6 flex items-center gap-4">
                <a
                  href="#"
                  className="p-2 bg-primary/10 rounded-full hover:bg-primary/20 transition-colors"
                >
                  <Github className="h-4 w-4 text-primary" />
                </a>
                <a
                  href="#"
                  className="p-2 bg-primary/10 rounded-full hover:bg-primary/20 transition-colors"
                >
                  <Twitter className="h-4 w-4 text-primary" />
                </a>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold tracking-wider text-foreground uppercase mb-4">
                Product
              </h3>
              <ul className="space-y-3">
                <li>
                  <a
                    href="#"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Dashboard
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Constellation
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Pricing
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold tracking-wider text-foreground uppercase mb-4">
                Resources
              </h3>
              <ul className="space-y-3">
                <li>
                  <a
                    href="#"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Documentation
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    API Reference
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    University Labs
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Github
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-border/40 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-muted-foreground text-center md:text-left">
              &copy; {new Date().getFullYear()} COSMEON FS-LITE. All rights
              reserved.
            </p>
            <div className="flex gap-6">
              <a
                href="#"
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Privacy Policy
              </a>
              <a
                href="#"
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
