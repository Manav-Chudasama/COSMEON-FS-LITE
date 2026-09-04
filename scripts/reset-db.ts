// ============================================
// FS-Lite — Database & Local Storage Reset Script
// Run via: bun run db:reset
// ============================================

import dns from "node:dns";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import mongoose from "mongoose";

// Ensure Node/Bun on Windows can resolve MongoDB Atlas SRV records
dns.setServers(["8.8.8.8", "1.1.1.1"]);
import {
  UserModel,
  OtpModel,
  FileModel,
  LogModel,
  NodeModel,
  connectDB,
} from "../src/lib/fs-lite/db";

async function resetDatabase() {
  console.log("\n========================================");
  console.log("   FS-LITE DATABASE RESET UTILITY");
  console.log("========================================\n");

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ ERROR: MONGODB_URI is not set in environment or .env.local");
    process.exit(1);
  }

  try {
    console.log("⏳ Connecting to MongoDB...");
    await connectDB();
    console.log("✓ Connected to MongoDB.\n");

    // 1. Clear MongoDB Collections
    console.log("🧹 Clearing collections...");

    const [userRes, otpRes, fileRes, logRes, nodeRes] = await Promise.all([
      UserModel.deleteMany({}),
      OtpModel.deleteMany({}),
      FileModel.deleteMany({}),
      LogModel.deleteMany({}),
      NodeModel.deleteMany({}),
    ]);

    console.log(`  • Users deleted:  ${userRes.deletedCount}`);
    console.log(`  • OTPs deleted:   ${otpRes.deletedCount}`);
    console.log(`  • Files deleted:  ${fileRes.deletedCount}`);
    console.log(`  • Logs deleted:   ${logRes.deletedCount}`);
    console.log(`  • Nodes deleted:  ${nodeRes.deletedCount}`);

    // 2. Clean Local Storage Chunks
    const localNodesDir = join(process.cwd(), ".fs-lite-data", "nodes");
    try {
      await rm(localNodesDir, { recursive: true, force: true });
      console.log(`\n✓ Cleaned local storage directory: ${localNodesDir}`);
    } catch {
      console.log("\n• Local storage directory was already empty.");
    }

    console.log("\n========================================");
    console.log("✅ RESET COMPLETE!");
    console.log("   • All user accounts and auth sessions cleared.");
    console.log("   • All files and chunk metadata cleared.");
    console.log("   • Nodes wiped (auto-seeded upon next server start).");
    console.log("========================================\n");
  } catch (error) {
    console.error("\n❌ Database reset failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("✓ Disconnected from MongoDB.");
    process.exit(0);
  }
}

resetDatabase();
