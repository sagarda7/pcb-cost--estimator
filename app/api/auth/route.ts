// app/api/login/route.ts
import { NextResponse } from "next/server";
import { signApiToken } from "@/lib/auth";

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = process.env.ALLOWED_ORIGIN;
  if (!origin || (allowed && origin !== allowed)) {
    return NextResponse.json({ ok: false, error: "Forbidden origin" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok:false, error:"Invalid JSON" }, { status: 400 }); }

  const { username, password } = body ?? {};
  if (username !== process.env.AUTH_USERNAME || password !== process.env.AUTH_PASSWORD) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  // short-lived token, purpose-scoped
  const token = await signApiToken({ sub: "send-summary" }, "10m");
  return NextResponse.json({ ok: true, token });
}
