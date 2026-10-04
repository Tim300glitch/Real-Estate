// Shared by the session helpers and proxy.ts so both always agree on the key.
const DEMO_FALLBACK = "wholesale-os-demo-only-secret-set-AUTH_SECRET-in-production";
let warned = false;

export function authSecretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return new TextEncoder().encode(s);
  if (process.env.DEMO_MODE === "false") {
    throw new Error("AUTH_SECRET must be set (≥32 characters) when DEMO_MODE=false");
  }
  if (!warned) {
    warned = true;
    console.warn("[auth] AUTH_SECRET is missing or shorter than 32 chars — using the built-in demo secret. Set AUTH_SECRET before using real data.");
  }
  return new TextEncoder().encode(DEMO_FALLBACK);
}

/** Mark cookies Secure only when the request actually arrived over HTTPS (works behind proxies too). */
export function isHttps(req: { headers: Headers; nextUrl?: URL }): boolean {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return req.nextUrl?.protocol === "https:";
}
