import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@/lib/types";

export const SESSION_COOKIE = "wos_session";
const MAX_AGE = 60 * 60 * 12; // 12h

export interface Session {
  sub: string;
  email: string;
  name: string;
  role: Role;
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set (≥32 chars) in production");
    return new TextEncoder().encode("insecure-development-secret-change-me-please-0000");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .setIssuer("wholesale-os")
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "wholesale-os" });
    return { sub: String(payload.sub), email: String(payload.email), name: String(payload.name), role: payload.role as Role };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  return verifySession(c.get(SESSION_COOKIE)?.value);
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};
