// ============================================
// COSMEON FS-LITE — MongoDB Connection & Schemas
// ============================================

import dns from "node:dns";
import mongoose, { type Connection } from "mongoose";

// Ensure Node/Bun on Windows reliably resolves MongoDB Atlas SRV records
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
  // Ignore in restricted environments
}

// ── Singleton connection ──────────────────────────────

let cachedConnection: Connection | null = null;

export async function connectDB(): Promise<Connection> {
  if (cachedConnection?.readyState === 1) {
    return cachedConnection;
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("[FS-LITE] MONGODB_URI is not defined");
  }

  try {
    const conn = await mongoose.connect(uri, {
      bufferCommands: false,
    });
    cachedConnection = conn.connection;
    console.log("[FS-LITE] MongoDB connected:", uri);
    return cachedConnection;
  } catch (error) {
    console.error("[FS-LITE] MongoDB connection failed:", error);
    throw error;
  }
}

export function isDBConnected(): boolean {
  return cachedConnection?.readyState === 1;
}

// ── Mongoose Schemas ──────────────────────────────────

const chunkSubSchema = new mongoose.Schema(
  {
    chunkId: { type: String, required: true },
    fileId: { type: String, required: true },
    index: { type: Number, required: true },
    offset: { type: Number, required: true, default: 0 },
    size: { type: Number, required: true },
    hash: { type: String, required: true },
    nodeId: { type: String, required: true },
    replicas: { type: [String], default: [] },
  },
  { _id: false },
);

const fileSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true, unique: true, index: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, default: "application/octet-stream" },
    totalSize: { type: Number, required: true },
    chunkCount: { type: Number, required: true },
    chunkSize: { type: Number, required: true },
    checksum: { type: String, required: true },
    uploadedAt: { type: String, required: true },
    version: { type: Number, default: 1 },
    chunks: { type: [chunkSubSchema], default: [] },
    // ── Ownership & Sharing ──
    ownerId: { type: String, index: true },
    sharedWith: { type: [String], default: [] },
  },
  { timestamps: true },
);

const nodeSchema = new mongoose.Schema(
  {
    nodeId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ["online", "offline", "degraded"],
      default: "online",
    },
    createdAt: { type: String, required: true },
    rackId: { type: String },
    capacityBytes: { type: Number, required: true },
    usedBytes: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const logSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    timestamp: { type: String, required: true },
    type: { type: String, required: true, index: true },
    message: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

// ── User Schema ───────────────────────────────────────

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    twoFactorEnabled: { type: Boolean, default: true },
    createdAt: { type: String, required: true },
  },
  { timestamps: true },
);

// ── OTP Schema (for 2FA, Forgot Password, Registration) ─

const otpSchema = new mongoose.Schema(
  {
    otpId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, index: true },
    codeHash: { type: String, required: true },
    type: {
      type: String,
      enum: ["2fa", "forgot_password", "registration"],
      required: true,
    },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    used: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Prevent model recompilation in Next.js hot reload
export const FileModel =
  mongoose.models.File || mongoose.model("File", fileSchema);
export const NodeModel =
  mongoose.models.Node || mongoose.model("Node", nodeSchema);
export const LogModel = mongoose.models.Log || mongoose.model("Log", logSchema);
export const UserModel =
  mongoose.models.User || mongoose.model("User", userSchema);
export const OtpModel =
  mongoose.models.Otp || mongoose.model("Otp", otpSchema);
