// ============================================
// POST /api/auth/login
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { connectDB, UserModel } from "@/lib/fs-lite/db";
import { verifyPassword } from "@/lib/auth/password";
import { createOtp, send2FAEmail } from "@/lib/auth/otp";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    await connectDB();

    // Find user
    const user = await UserModel.findOne({
      email: email.toLowerCase(),
    }).lean() as Record<string, unknown> | null;

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash as string);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    // Mandatory 2FA for all users — send code and return prompt for OTP
    const code = await createOtp(user.email as string, "2fa");
    await send2FAEmail(user.email as string, code);

    return NextResponse.json({
      success: true,
      requiresTwoFactor: true,
      email: user.email,
    });
  } catch (error) {
    console.error("[AUTH] Login error:", error);
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 500 },
    );
  }
}
