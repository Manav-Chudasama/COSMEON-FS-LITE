// ============================================
// GET /api/fs/integrity/[fileId] — Run integrity check
// ============================================

import { type NextRequest, NextResponse } from "next/server";
import { initEngine, getFile, verifyFile } from "@/lib/fs-lite";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    await initEngine();
    const { fileId } = await params;

    const file = await getFile(fileId);
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const report = await verifyFile(file);

    return NextResponse.json(report);
  } catch (error) {
    console.error("[FS-LITE] Integrity check error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Integrity check failed",
      },
      { status: 500 },
    );
  }
}
