// ============================================
// POST /api/auth/logout
// ============================================

import { NextResponse } from "next/server";
import { clearAuthCookieHeader } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.headers.set("Set-Cookie", clearAuthCookieHeader());
  return response;
}
