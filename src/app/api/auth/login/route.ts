import { NextResponse, type NextRequest } from "next/server";
import { loginSchema } from "@/lib/schemas";
import { cookieOptions, SESSION_COOKIE, signSession } from "@/server/auth/session";
import { isHttps } from "@/server/auth/secret";
import { verifyCredentials } from "@/server/auth/users";
import { rateLimit } from "@/server/rateLimit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = rateLimit(`login:${ip}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  const parsed = loginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  const user = verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  try {
    const token = await signSession({ sub: user.id, email: user.email, name: user.name, role: user.role });
    const res = NextResponse.json({ user });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions(isHttps(req)));
    return res;
  } catch (e) {
    console.error("[auth] login failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sign-in failed (server configuration)" }, { status: 500 });
  }
}
