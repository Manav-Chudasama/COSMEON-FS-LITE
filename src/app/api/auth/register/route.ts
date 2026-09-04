// ============================================
// POST /api/auth/register
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { connectDB, UserModel } from "@/lib/fs-lite/db";
import { hashPassword } from "@/lib/auth/password";
import { signAuthToken } from "@/lib/auth/jwt";
import { makeAuthCookieHeader } from "@/lib/auth/session";
import type { AuthTokenPayload, UserRole } from "@/lib/fs-lite/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = body as {
      name?: string;
      email?: string;
      password?: string;
    };

    // Validation
    if (!name || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Name must be at least 2 characters." },
        { status: 400 },
      );
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 },
      );
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 },
      );
    }

    await connectDB();

    // Check for existing user
    const existing = await UserModel.findOne({
      email: email.toLowerCase(),
    }).lean();
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    // Create user
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

    // Issue JWT
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
    console.error("[AUTH] Register error:", error);
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 },
    );
  }
}
