// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyApiToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  // Allow CORS preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "600",
      },
    });
  }

  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token)
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

  try {
    const payload = await verifyApiToken(token);
    if (payload.sub !== "send-summary") throw new Error("Bad subject");
    return NextResponse.next();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}

export const config = {
  matcher: ["/api/send-summary"], // <-- this alone is enough
};
