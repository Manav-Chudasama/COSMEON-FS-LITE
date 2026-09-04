// ============================================
// POST /api/auth/login/verify-2fa
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { connectDB, UserModel } from "@/lib/fs-lite/db";
import { verifyOtp } from "@/lib/auth/otp";
import { signAuthToken } from "@/lib/auth/jwt";
import { makeAuthCookieHeader } from "@/lib/auth/session";
import type { AuthTokenPayload, UserRole } from "@/lib/fs-lite/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code } = body as { email?: string; code?: string };

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email and code are required." },
        { status: 400 },
      );
    }

    // Verify OTP
    const valid = await verifyOtp(email, code.trim(), "2fa");
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid or expired verification code." },
        { status: 401 },
      );
    }

    await connectDB();

    // Fetch user and issue token
    const user = await UserModel.findOne({
      email: email.toLowerCase(),
    }).lean() as Record<string, unknown> | null;

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const payload: AuthTokenPayload = {
      userId: user.userId as string,
      email: user.email as string,
      name: user.name as string,
      role: user.role as UserRole,
    };
    const token = await signAuthToken(payload);

    const response = NextResponse.json({
      success: true,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
      },
    });

    response.headers.set("Set-Cookie", makeAuthCookieHeader(token));
    return response;
  } catch (error) {
    console.error("[AUTH] 2FA verify error:", error);
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 },
    );
  }
}
