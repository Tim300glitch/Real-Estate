"use client";
// Thin typed client for the server API. Responses for immutable-ish
// provider records are cached in memory for the session.
import { useEffect, useRef, useState } from "react";
import type { CompCandidate, PropertyRecord, PropertySummary, SearchRequest, SearchResponse } from "../types";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

const propCache = new Map<string, Promise<PropertyRecord>>();

export const api = {
  search: (body: SearchRequest, signal?: AbortSignal) => req<SearchResponse>("/api/properties/search", { method: "POST", body: JSON.stringify(body), signal }),
  property: (id: string) => {
    if (!propCache.has(id)) {
      const p = req<PropertyRecord>(`/api/properties/${encodeURIComponent(id)}`);
      p.catch(() => propCache.delete(id));
      propCache.set(id, p);
    }
    return propCache.get(id)!;
  },
  comps: (q: { subjectId?: string; lat: number; lng: number; radiusMiles: number; months: number; limit?: number }) => {
    const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    return req<{ comps: CompCandidate[]; provider: string }>(`/api/comps?${qs}`);
  },
  owner: (ownerId: string) => req<{ owner: unknown; portfolio: PropertySummary[] }>(`/api/owners/${encodeURIComponent(ownerId)}`),
  market: (months = 12) => req<{ stats: import("@/server/providers/types").MarketStat[] }>(`/api/market?months=${months}`),
  parcels: (bbox: [number, number, number, number]) => req<GeoJSON.FeatureCollection & { tooLarge?: boolean }>(`/api/parcels?bbox=${bbox.map((n) => n.toFixed(6)).join(",")}`),
  skipTrace: (body: unknown) => req<import("@/server/providers/types").SkipTraceResult>("/api/skiptrace", { method: "POST", body: JSON.stringify(body) }),
  ai: (body: unknown) => req<{ configured: boolean; interpretation: string | null; error?: string; model?: string }>("/api/ai", { method: "POST", body: JSON.stringify(body) }),
  providers: () => req<{ routing: { capability: string; provider: string; kind: string }[]; providers: import("@/server/providers/types").ProviderInfo[]; integrations: Record<string, { configured: boolean; provider?: string | null; note?: string }> }>("/api/providers"),
  seed: () => req<{ seed: import("../store/workspace").SeedData | null }>("/api/demo/seed"),
  me: () => req<{ user: { id: string; name: string; email: string; role: import("../types").Role } }>("/api/auth/me"),
  logout: () => req<{ ok: true }>("/api/auth/logout", { method: "POST" }),
};

/** Fetch a full provider record by id (cached) */
export function useProperty(id: string | null | undefined) {
  const [data, setData] = useState<PropertyRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!id) { setData(null); return; }
    let live = true;
    setLoading(true);
    setError(null);
    api.property(id).then((d) => live && setData(d)).catch((e) => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [id]);
  return { data, error, loading };
}

/** Debounced, abortable property search */
export function useSearch(request: SearchRequest | null, debounceMs = 250) {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = request ? JSON.stringify(request) : "";
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!request) return;
    const t = setTimeout(() => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setLoading(true);
      api.search(request, c.signal)
        .then((d) => { setData(d); setError(null); })
        .catch((e) => { if (e.name !== "AbortError") setError(e.message); })
        .finally(() => { if (ctrl.current === c) setLoading(false); });
    }, debounceMs);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading, error };
}
