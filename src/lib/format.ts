export const usd = (n: number | null | undefined, opts: { compact?: boolean; dash?: string } = {}) => {
  if (n == null || Number.isNaN(n)) return opts.dash ?? "—";
  if (opts.compact) {
    const a = Math.abs(n);
    const s = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k` : `${Math.round(a)}`;
    return `${n < 0 ? "−" : ""}$${s}`;
  }
  return `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
};

export const num = (n: number | null | undefined, digits = 0) =>
  n == null || Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const pct = (n: number | null | undefined, digits = 0) => (n == null || Number.isNaN(n) ? "—" : `${(n * 100).toFixed(digits)}%`);

export const pct100 = (n: number | null | undefined, digits = 0) => (n == null || Number.isNaN(n) ? "—" : `${n.toFixed(digits)}%`);

export const date = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

export const time = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—";

export const dateTime = (iso?: string | null) => (iso ? `${shortDate(iso)} · ${time(iso)}` : "—");

export function relative(iso?: string | null, now = Date.now()): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - now;
  const a = Math.abs(diff);
  const m = Math.round(a / 60000);
  const h = Math.round(a / 3600000);
  const d = Math.round(a / 86400000);
  const s = m < 1 ? "just now" : m < 60 ? `${m}m` : h < 24 ? `${h}h` : d < 45 ? `${d}d` : `${Math.round(d / 30)}mo`;
  if (s === "just now") return s;
  return diff < 0 ? `${s} ago` : `in ${s}`;
}

export const sqft = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("en-US")} sf`);

export const uid = (prefix = "") => `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export const normalizePhone = (p: string) => p.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const normalizeAddress = (a: string) =>
  a.toUpperCase().replace(/[.,#]/g, " ").replace(/\bSTREET\b/g, "ST").replace(/\bAVENUE\b/g, "AVE").replace(/\bDRIVE\b/g, "DR")
    .replace(/\bROAD\b/g, "RD").replace(/\bCOURT\b/g, "CT").replace(/\bLANE\b/g, "LN").replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\s+/g, " ").trim();

export const formatPhone = (p: string) => {
  const d = normalizePhone(p);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
};
