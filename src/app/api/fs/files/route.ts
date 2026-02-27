// ============================================
// GET /api/fs/files — List all stored files
// ============================================

import { NextResponse } from "next/server";
import { initEngine, listFiles } from "@/lib/fs-lite";

export async function GET() {
  try {
    await initEngine();
    const files = await listFiles();

    return NextResponse.json({
      files,
      total: files.length,
    });
  } catch (error) {
    console.error("[FS-LITE] List files error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list files",
      },
      { status: 500 },
    );
  }
}
