// lib/auth.ts
import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.NEXT_PUBLIC_FIREBASE_APP_ID);

export async function signApiToken(payload: Record<string, any>, exp = "10m") {
  console.log("Signing API token with payload:", payload, "and expiration:", exp);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret);
}

export async function verifyApiToken(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload; // throws on invalid/expired
}
