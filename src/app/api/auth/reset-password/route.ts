// ============================================
// POST /api/auth/reset-password
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { connectDB, UserModel } from "@/lib/fs-lite/db";
import { verifyOtp } from "@/lib/auth/otp";
import { hashPassword } from "@/lib/auth/password";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code, newPassword } = body as {
      email?: string;
      code?: string;
      newPassword?: string;
    };

    if (!email || !code || !newPassword) {
      return NextResponse.json(
        { error: "Email, code, and new password are required." },
        { status: 400 },
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters." },
        { status: 400 },
      );
    }

    // Verify OTP
    const valid = await verifyOtp(email, code.trim(), "forgot_password");
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid or expired reset code." },
        { status: 401 },
      );
    }

    await connectDB();
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Update password
    user.passwordHash = await hashPassword(newPassword);
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AUTH] Reset password error:", error);
    return NextResponse.json(
      { error: "Password reset failed. Please try again." },
      { status: 500 },
    );
  }
}
