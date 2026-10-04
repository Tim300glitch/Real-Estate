import { haversineMiles, inBbox, pointInPolygon, radiusBbox, ringBbox } from "@/lib/geo";
import { motivationScore } from "@/lib/calc/scores";
import { matchesFilters } from "@/lib/filters";
import type {
  CompCandidate, PropertyRecord, PropertySummary, SearchRequest, SearchResponse,
} from "@/lib/types";
import type { CompQuery, MarketStat, MarketStatsQuery, PropertyDataProvider, ProviderInfo } from "../types";
import { BY_ID, DATA_AS_OF, GRID, HOOD_LIST, OWNER_INDEX, PROPERTIES, toSummary } from "./dataset";

// compute cached motivation scores once (the production equivalent is a DB column refreshed on data import)
for (const p of PROPERTIES) p.motivationScore = motivationScore(toSummary(p)).score;
const SUMMARIES = new Map<string, PropertySummary>(PROPERTIES.map((p) => [p.id, toSummary(p)]));

function candidatesInBbox(b: [number, number, number, number]): PropertyRecord[] {
  // Equivalent of a PostGIS && bounding-box index scan
  const out: PropertyRecord[] = [];
  const x0 = Math.floor(b[0] * 100), x1 = Math.floor(b[2] * 100), y0 = Math.floor(b[1] * 100), y1 = Math.floor(b[3] * 100);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) return PROPERTIES.filter((p) => inBbox([p.lng, p.lat], b));
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const bucket = GRID.get(`${x}:${y}`);
    if (bucket) for (const p of bucket) if (inBbox([p.lng, p.lat], b)) out.push(p);
  }
  return out;
}

const SORTERS: Record<NonNullable<SearchRequest["sort"]>, (a: PropertySummary, b: PropertySummary) => number> = {
  motivation: (a, b) => b.motivationScore - a.motivationScore,
  equity: (a, b) => (b.equityPct ?? -1) - (a.equityPct ?? -1),
  value: (a, b) => (b.estValue ?? 0) - (a.estValue ?? 0),
  years_owned: (a, b) => (b.yearsOwned ?? 0) - (a.yearsOwned ?? 0),
  recent_sale: (a, b) => (b.lastSaleDate ?? "").localeCompare(a.lastSaleDate ?? ""),
};

export class DemoPropertyProvider implements PropertyDataProvider {
  info(): ProviderInfo {
    return {
      id: "demo", name: "Demo Data Provider (synthetic)", kind: "demo",
      capabilities: ["search", "property", "owner", "owner_portfolio", "sales_history", "comps", "mortgage", "parcel", "tax", "value_history", "market_stats", "distress"],
      configured: true,
      licenseNotes: `Synthetic, seeded records for the Sacramento region generated for demonstration (as of ${DATA_AS_OF}). Not real people or parcels.`,
    };
  }

  async searchProperties(req: SearchRequest): Promise<SearchResponse> {
    const t0 = Date.now();
    let pool: PropertyRecord[];
    const area = req.area;
    if (area?.type === "polygon") pool = candidatesInBbox(ringBbox(area.ring)).filter((p) => pointInPolygon([p.lng, p.lat], area.ring));
    else if (area?.type === "radius") pool = candidatesInBbox(radiusBbox(area.center, area.miles)).filter((p) => haversineMiles(area.center, [p.lng, p.lat]) <= area.miles);
    else if (area?.type === "bbox") pool = candidatesInBbox(area.bbox);
    else pool = PROPERTIES;
    if (req.bbox) pool = pool.filter((p) => inBbox([p.lng, p.lat], req.bbox!));

    const matched: PropertySummary[] = [];
    for (const p of pool) {
      const s = SUMMARIES.get(p.id)!;
      if (matchesFilters(s, req.filters)) matched.push(s);
    }
    matched.sort(SORTERS[req.sort ?? "motivation"]);
    const limit = Math.min(req.limit ?? 2000, 5000);
    const offset = req.offset ?? 0;
    return {
      total: matched.length,
      truncated: matched.length > offset + limit,
      results: matched.slice(offset, offset + limit),
      tookMs: Date.now() - t0,
      provider: this.info().name,
    };
  }

  async getProperty(id: string) { return BY_ID.get(id) ?? null; }
  async getOwner(ownerId: string) {
    const ids = OWNER_INDEX.get(ownerId);
    return ids ? BY_ID.get(ids[0])!.owner : null;
  }
  async getOwnerPortfolio(ownerId: string) {
    return (OWNER_INDEX.get(ownerId) ?? []).map((id) => SUMMARIES.get(id)!);
  }
  async getSalesHistory(id: string) { return BY_ID.get(id)?.sales ?? []; }
  async getMortgageData(id: string) { return BY_ID.get(id)?.mortgages ?? []; }
  async getParcel(id: string) { return BY_ID.get(id)?.parcel ?? null; }
  async getTaxData(id: string) { return BY_ID.get(id)?.tax ?? null; }
  async getValueHistory(id: string) { return BY_ID.get(id)?.valueHistory ?? []; }

  async getComps(q: CompQuery): Promise<CompCandidate[]> {
    const cutoff = new Date(Date.now() - q.months * 30.44 * 86400000).toISOString().slice(0, 10);
    const out: (CompCandidate & { d: number })[] = [];
    for (const p of candidatesInBbox(radiusBbox([q.lng, q.lat], q.radiusMiles))) {
      if (p.id === q.subjectId) continue;
      const sale = p.sales.find((s) => s.price != null && s.armsLength);
      if (!sale || sale.date < cutoff || sale.price == null) continue;
      const d = haversineMiles([q.lng, q.lat], [p.lng, p.lat]);
      if (d > q.radiusMiles) continue;
      out.push({
        id: `${p.id}:${sale.date}`, propertyId: p.id, line1: p.address.line1, city: p.address.city, zip: p.address.zip,
        lat: p.lat, lng: p.lng, propertyType: p.propertyType, beds: p.beds, baths: p.baths, sqft: p.sqft,
        lotSqft: p.lotSqft, yearBuilt: p.yearBuilt, salePrice: sale.price, saleDate: sale.date, dom: sale.dom ?? null,
        cash: sale.cash, source: sale.source, d,
      });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, q.limit).map(({ d: _d, ...c }) => c);
  }

  async getMarketStats(q: MarketStatsQuery): Promise<MarketStat[]> {
    const now = Date.now();
    const cut = new Date(now - q.months * 30.44 * 86400000).toISOString().slice(0, 10);
    const prevCut = new Date(now - 2 * q.months * 30.44 * 86400000).toISOString().slice(0, 10);
    const byZip = new Map<string, PropertyRecord[]>();
    for (const p of PROPERTIES) {
      if (q.zips?.length && !q.zips.includes(p.address.zip)) continue;
      const l = byZip.get(p.address.zip) ?? [];
      l.push(p);
      byZip.set(p.address.zip, l);
    }
    const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const stats: MarketStat[] = [];
    for (const [zip, props] of byZip) {
      const recent = props.flatMap((p) => p.sales.filter((s) => s.price && s.date >= cut).map((s) => ({ p, s })));
      const prior = props.flatMap((p) => p.sales.filter((s) => s.price && s.date < cut && s.date >= prevCut).map((s) => ({ p, s })));
      const ppsf = recent.filter((r) => r.p.sqft).map((r) => r.s.price! / r.p.sqft!);
      const ppsfPrior = prior.filter((r) => r.p.sqft).map((r) => r.s.price! / r.p.sqft!);
      const hoods = HOOD_LIST.filter((h) => h.zip === zip);
      const mPpsf = median(ppsf);
      const mPrior = median(ppsfPrior);
      const doms = recent.map((r) => r.s.dom).filter((d): d is number => d != null);
      stats.push({
        key: zip,
        label: `${zip} · ${hoods.map((h) => h.name).join(" / ") || props[0].neighborhood}`,
        lat: hoods[0]?.lat ?? props[0].lat, lng: hoods[0]?.lng ?? props[0].lng,
        medianSalePrice: median(recent.map((r) => r.s.price!)),
        medianPpsf: mPpsf,
        transactions: recent.length,
        avgDom: doms.length ? Math.round(doms.reduce((a, b) => a + b, 0) / doms.length) : null,
        investorPct: recent.length ? recent.filter((r) => r.p.owner.entityType === "llc").length / recent.length : null,
        cashPct: recent.length ? recent.filter((r) => r.s.cash).length / recent.length : null,
        priceTrendPct: mPpsf && mPrior ? (mPpsf - mPrior) / mPrior : null,
        inventory: null,
        source: "Demo Data Provider (synthetic). DOM simulated; real DOM/inventory require MLS access.",
        synthetic: true,
      });
    }
    return stats.sort((a, b) => b.transactions - a.transactions);
  }
}

export function demoSummary(id: string) { return SUMMARIES.get(id) ?? null; }
export { HOOD_LIST };
