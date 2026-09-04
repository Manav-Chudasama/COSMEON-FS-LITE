// ============================================
// POST /api/auth/forgot-password
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { connectDB, UserModel } from "@/lib/fs-lite/db";
import { createOtp, sendForgotPasswordEmail } from "@/lib/auth/otp";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body as { email?: string };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 },
      );
    }

    await connectDB();
    const user = await UserModel.findOne({ email: email.toLowerCase() }).lean();

    // Security: always respond with success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ success: true });
    }

    const code = await createOtp(email, "forgot_password");
    await sendForgotPasswordEmail(email, code);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AUTH] Forgot password error:", error);
    return NextResponse.json(
      { error: "Failed to send reset code. Please try again." },
      { status: 500 },
    );
  }
}
