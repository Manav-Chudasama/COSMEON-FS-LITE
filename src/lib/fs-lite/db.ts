// ============================================
// COSMEON FS-LITE — MongoDB Connection & Schemas
// ============================================

import mongoose, { type Connection } from "mongoose";

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
    capacityBytes: { type: Number, required: true },
    usedBytes: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Prevent model recompilation in Next.js hot reload
export const FileModel =
  mongoose.models.File || mongoose.model("File", fileSchema);
export const NodeModel =
  mongoose.models.Node || mongoose.model("Node", nodeSchema);
