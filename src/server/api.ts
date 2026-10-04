import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { can, type Permission } from "@/lib/permissions";
import { getSession, type Session } from "./auth/session";
import { rateLimit } from "./rateLimit";

interface Opts<T> {
  permission: Permission;
  /** requests per minute per user */
  rpm?: number;
  schema?: ZodType<T>;
}

/** Wraps a route handler with auth, RBAC, rate limiting, input validation and error shaping. */
export function api<T = unknown>(opts: Opts<T>, handler: (ctx: { req: NextRequest; session: Session; input: T; params: Record<string, string> }) => Promise<unknown>) {
  return async (req: NextRequest, routeCtx: { params: Promise<Record<string, string>> }) => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!can(session.role, opts.permission)) return NextResponse.json({ error: `Forbidden: requires ${opts.permission}` }, { status: 403 });
    const rl = rateLimit(`${session.sub}:${req.nextUrl.pathname}`, opts.rpm ?? 120, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
    let input = undefined as T;
    if (opts.schema) {
      let raw: unknown;
      if (req.method === "GET") raw = Object.fromEntries(req.nextUrl.searchParams);
      else {
        try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
      }
      const parsed = opts.schema.safeParse(raw);
      if (!parsed.success) return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues.slice(0, 10) }, { status: 400 });
      input = parsed.data;
    }
    try {
      const params = routeCtx?.params ? await routeCtx.params : {};
      const out = await handler({ req, session, input, params });
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unexpected error";
      console.error(`[api] ${req.method} ${req.nextUrl.pathname}:`, msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  };
}
