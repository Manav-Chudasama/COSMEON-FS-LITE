// ============================================
// POST /api/auth/register/verify-otp
// Verifies OTP and completes user registration
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { connectDB, UserModel } from "@/lib/fs-lite/db";
import { verifyOtp } from "@/lib/auth/otp";
import { hashPassword } from "@/lib/auth/password";
import { signAuthToken } from "@/lib/auth/jwt";
import { makeAuthCookieHeader } from "@/lib/auth/session";
import type { AuthTokenPayload, UserRole } from "@/lib/fs-lite/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, code } = body as {
      name?: string;
      email?: string;
      password?: string;
      code?: string;
    };

    if (!name || !email || !password || !code) {
      return NextResponse.json(
        { error: "Name, email, password, and verification code are required." },
        { status: 400 },
      );
    }

    await connectDB();

    // Verify OTP
    const valid = await verifyOtp(email, code.trim(), "registration");
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid or expired verification code." },
        { status: 400 },
      );
    }

    // Check if user already exists
    const existing = await UserModel.findOne({
      email: email.toLowerCase(),
    }).lean();

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    // Create user with mandatory 2FA enabled
    const userId = uuidv4();
    const passwordHash = await hashPassword(password);

    const user = await UserModel.create({
      userId,
      name: name.trim(),
      email: email.toLowerCase(),
      passwordHash,
      role: "user",
      twoFactorEnabled: true,
      createdAt: new Date().toISOString(),
    });

    // Issue JWT session
    const payload: AuthTokenPayload = {
      userId: user.userId,
      email: user.email,
      name: user.name,
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
    console.error("[AUTH] Register verify-otp error:", error);
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 },
    );
  }
}
