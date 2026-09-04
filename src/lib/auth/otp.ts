// ============================================
// COSMEON FS-LITE — OTP Generation & Email Sending
// ============================================

import { randomInt, createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";
import { connectDB, OtpModel } from "@/lib/fs-lite/db";
import type { OtpType } from "@/lib/fs-lite/types";

const OTP_EXPIRY_MINUTES = 10;

// ── Nodemailer Transport ──────────────────────────────

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER || "",
      pass: process.env.EMAIL_PASS || "",
    },
  });
}

// ── OTP Helpers ───────────────────────────────────────

/**
 * Generate a 6-digit numeric OTP code.
 */
function generateCode(): string {
  return String(randomInt(100000, 999999));
}

/**
 * Hash the OTP code for safe storage (SHA-256).
 * We don't use bcrypt here because OTPs are short-lived and 1:1 compared.
 */
function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Create a new OTP record in MongoDB and return the plain-text code.
 * Invalidates any previously unused OTPs of the same type for the email.
 */
export async function createOtp(
  email: string,
  type: OtpType,
): Promise<string> {
  await connectDB();

  // Invalidate old unused OTPs of the same type
  await OtpModel.updateMany(
    { email: email.toLowerCase(), type, used: false },
    { used: true },
  );

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await OtpModel.create({
    otpId: uuidv4(),
    email: email.toLowerCase(),
    codeHash: hashCode(code),
    type,
    expiresAt,
    used: false,
  });

  // Always log in development for frictionless testing
  console.log(`\n======================================================`);
  console.log(`🔑 [FS-LITE OTP] Action: ${type.toUpperCase()} | Email: ${email}`);
  console.log(`👉 VERIFICATION CODE: ${code} (Valid for ${OTP_EXPIRY_MINUTES} mins)`);
  console.log(`======================================================\n`);

  return code;
}

/**
 * Verify an OTP code. Marks it as used on success.
 * Returns true if valid and not expired, false otherwise.
 */
export async function verifyOtp(
  email: string,
  code: string,
  type: OtpType,
): Promise<boolean> {
  await connectDB();

  const otp = await OtpModel.findOne({
    email: email.toLowerCase(),
    type,
    used: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!otp) return false;

  const codeHash = hashCode(code);
  if (otp.codeHash !== codeHash) return false;

  otp.used = true;
  await otp.save();
  return true;
}

// ── Email Senders ─────────────────────────────────────

async function deliverEmail(to: string, subject: string, html: string): Promise<void> {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass || user.includes("your_email") || pass.includes("your_gmail")) {
    console.log(`[AUTH-EMAIL] SMTP not configured in .env.local — OTP printed to terminal above.`);
    return;
  }

  try {
    const transporter = createTransport();
    const from = process.env.EMAIL_FROM || `"FS-Lite" <${user}>`;
    await transporter.sendMail({ from, to, subject, html });
    console.log(`[AUTH-EMAIL] Email successfully dispatched to ${to}`);
  } catch (err) {
    console.error(`[AUTH-EMAIL] Error dispatching email to ${to}:`, err);
    // Don't throw so dev / test flows are not broken
  }
}

/**
 * Send a 2FA verification code email.
 */
export async function send2FAEmail(email: string, code: string): Promise<void> {
  await deliverEmail(
    email,
    "Your FS-Lite Login Verification Code",
    `
      <div style="font-family: 'IBM Plex Mono', monospace; background:#18181b; color:#e4e4e7; padding:40px; max-width:480px; margin:0 auto; border-radius:0px; border:1px solid #3f3f46;">
        <h2 style="color:#e97b3e; margin:0 0 8px; letter-spacing:0.1em;">FS-LITE</h2>
        <p style="margin:0 0 24px; color:#71717a; font-size:12px; letter-spacing:0.1em;">ORBITAL FILE SYSTEM</p>
        <p style="margin:0 0 16px; font-size:14px;">Your two-factor authentication code:</p>
        <div style="background:#09090b; border:1px solid #3f3f46; padding:24px; text-align:center; margin-bottom:24px;">
          <span style="font-size:36px; font-weight:bold; letter-spacing:12px; color:#e97b3e;">${code}</span>
        </div>
        <p style="color:#71717a; font-size:12px; margin:0;">This code expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>. Do not share it with anyone.</p>
      </div>
    `,
  );
}

/**
 * Send a registration verification code email.
 */
export async function sendRegistrationEmail(email: string, code: string): Promise<void> {
  await deliverEmail(
    email,
    "Verify Your FS-Lite Account",
    `
      <div style="font-family: 'IBM Plex Mono', monospace; background:#18181b; color:#e4e4e7; padding:40px; max-width:480px; margin:0 auto; border-radius:0px; border:1px solid #3f3f46;">
        <h2 style="color:#e97b3e; margin:0 0 8px; letter-spacing:0.1em;">FS-LITE</h2>
        <p style="margin:0 0 24px; color:#71717a; font-size:12px; letter-spacing:0.1em;">ORBITAL FILE SYSTEM</p>
        <p style="margin:0 0 16px; font-size:14px;">Welcome aboard. Please verify your email address to activate your account:</p>
        <div style="background:#09090b; border:1px solid #3f3f46; padding:24px; text-align:center; margin-bottom:24px;">
          <span style="font-size:36px; font-weight:bold; letter-spacing:12px; color:#e97b3e;">${code}</span>
        </div>
        <p style="color:#71717a; font-size:12px; margin:0;">This code expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>. Enter this code on the registration page.</p>
      </div>
    `,
  );
}

/**
 * Send a forgot-password OTP email.
 */
export async function sendForgotPasswordEmail(
  email: string,
  code: string,
): Promise<void> {
  await deliverEmail(
    email,
    "Reset Your FS-Lite Password",
    `
      <div style="font-family: 'IBM Plex Mono', monospace; background:#18181b; color:#e4e4e7; padding:40px; max-width:480px; margin:0 auto; border-radius:0px; border:1px solid #3f3f46;">
        <h2 style="color:#e97b3e; margin:0 0 8px; letter-spacing:0.1em;">FS-LITE</h2>
        <p style="margin:0 0 24px; color:#71717a; font-size:12px; letter-spacing:0.1em;">ORBITAL FILE SYSTEM</p>
        <p style="margin:0 0 16px; font-size:14px;">Your password reset code:</p>
        <div style="background:#09090b; border:1px solid #3f3f46; padding:24px; text-align:center; margin-bottom:24px;">
          <span style="font-size:36px; font-weight:bold; letter-spacing:12px; color:#e97b3e;">${code}</span>
        </div>
        <p style="color:#71717a; font-size:12px; margin:0;">This code expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>. If you did not request a password reset, ignore this email.</p>
      </div>
    `,
  );
}
