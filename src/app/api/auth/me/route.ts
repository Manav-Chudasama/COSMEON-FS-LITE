// ============================================
// GET /api/auth/me
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { connectDB, UserModel } from "@/lib/fs-lite/db";
import { getSessionFromRequest } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    await connectDB();
    const user = await UserModel.findOne({ userId: session.userId })
      .select("-passwordHash -__v")
      .lean() as Record<string, unknown> | null;

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("[AUTH] Me error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user." },
      { status: 500 },
    );
  }
}
