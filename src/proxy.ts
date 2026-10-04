import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Gate every page behind a valid session. API routes enforce auth + RBAC themselves (src/server/api.ts).
const PUBLIC = ["/login", "/api/auth/login", "/favicon.ico", "/maplibre/"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p)) || pathname.startsWith("/_next") || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  const token = req.cookies.get("wos_session")?.value;
  const secret = process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32 ? process.env.AUTH_SECRET : "insecure-development-secret-change-me-please-0000";
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret), { issuer: "wholesale-os" });
      return NextResponse.next();
    } catch { /* fall through */ }
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|svg|ico|webp)$).*)"] };
