// ============================================
// POST /api/auth/register/send-otp
// Validates registration input and sends OTP
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { connectDB, UserModel } from "@/lib/fs-lite/db";
import { createOtp, sendRegistrationEmail } from "@/lib/auth/otp";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = body as {
      name?: string;
      email?: string;
      password?: string;
    };

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

    const existing = await UserModel.findOne({
      email: email.toLowerCase(),
    }).lean();

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    // Generate OTP & dispatch email
    const code = await createOtp(email, "registration");
    await sendRegistrationEmail(email, code);

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your email.",
    });
  } catch (error) {
    console.error("[AUTH] Register send-otp error:", error);
    return NextResponse.json(
      { error: "Failed to send verification code. Please try again." },
      { status: 500 },
    );
  }
}
