// ════════════════════════════════════════════════════════════════════
// Third-party adapters — INTEGRATION POINTS.
//
// These adapters call the vendors' documented REST APIs server-side with
// keys from environment variables (never exposed to the browser) and map
// responses into normalised types with provenance. Field mappings follow
// the vendors' public docs at time of writing; verify against your
// contract/API version before production use, and respect each vendor's
// display, caching and retention terms (see ProviderInfo.licenseNotes).
// ════════════════════════════════════════════════════════════════════
/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  CompCandidate, MortgageInfo, OwnerInfo, PropertyRecord, PropertySummary, PropertyType, Provenance, SaleRecord,
  SearchRequest, SearchResponse, TaxInfo, ValuePoint,
} from "@/lib/types";
import {
  CapabilityNotSupported, type Capability, type CompQuery, type MarketStat, type MarketStatsQuery,
  type PropertyDataProvider, type ProviderInfo,
} from "./types";

// Simple TTL cache standing in for the api_records table (dedupes paid calls)
const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 1000 * 60 * 60 * 12;

async function getJson(url: string, headers: Record<string, string>, cacheKey = url): Promise<any> {
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, cache: "no-store" });
  if (!res.ok) throw new Error(`Provider request failed (${res.status}) for ${new URL(url).host}`);
  const data = await res.json();
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

const p = (source: string, kind: Provenance["kind"], confidence: Provenance["confidence"], asOf?: string, note?: string): Provenance =>
  ({ source, kind, confidence, asOf: asOf ?? new Date().toISOString().slice(0, 10), note });

const TYPE_MAP: Record<string, PropertyType> = {
  "single family": "sfr", "single-family": "sfr", sfr: "sfr", condo: "condo", condominium: "condo", townhouse: "townhouse",
  duplex: "duplex", triplex: "triplex", quadruplex: "fourplex", fourplex: "fourplex", "multi-family": "multifamily",
  multifamily: "multifamily", apartment: "multifamily", "manufactured": "mobile", land: "land", lot: "lot",
};
const mapType = (t?: string): PropertyType => TYPE_MAP[(t ?? "").toLowerCase()] ?? "sfr";

const UNKNOWN_DISTRESS = {
  taxDelinquent: null, preForeclosure: null, foreclosure: null, auctionDate: null, probate: null, vacant: null,
  codeViolations: null, liens: null, inherited: null, tiredLandlord: null, expiredListing: null,
};

abstract class BaseAdapter implements PropertyDataProvider {
  abstract info(): ProviderInfo;
  protected unsupported(cap: Capability): never { throw new CapabilityNotSupported(this.info().name, cap); }
  async searchProperties(_r: SearchRequest): Promise<SearchResponse> { return this.unsupported("search"); }
  async getProperty(_id: string): Promise<PropertyRecord | null> { return this.unsupported("property"); }
  async getOwner(_id: string): Promise<OwnerInfo | null> { return this.unsupported("owner"); }
  async getOwnerPortfolio(_id: string): Promise<PropertySummary[]> { return this.unsupported("owner_portfolio"); }
  async getSalesHistory(_id: string): Promise<SaleRecord[]> { return this.unsupported("sales_history"); }
  async getComps(_q: CompQuery): Promise<CompCandidate[]> { return this.unsupported("comps"); }
  async getMortgageData(_id: string): Promise<MortgageInfo[]> { return this.unsupported("mortgage"); }
  async getParcel(_id: string): Promise<[number, number][] | null> { return this.unsupported("parcel"); }
  async getTaxData(_id: string): Promise<TaxInfo | null> { return this.unsupported("tax"); }
  async getValueHistory(_id: string): Promise<ValuePoint[]> { return this.unsupported("value_history"); }
  async getMarketStats(_q: MarketStatsQuery): Promise<MarketStat[]> { return this.unsupported("market_stats"); }
}

// ─── RentCast ───────────────────────────────────────────────────────
// Docs: https://developers.rentcast.io  (header: X-Api-Key)
export class RentCastAdapter extends BaseAdapter {
  private base = "https://api.rentcast.io/v1";
  constructor(private key = process.env.RENTCAST_API_KEY ?? "") { super(); }
  info(): ProviderInfo {
    return {
      id: "rentcast", name: "RentCast", kind: "third_party", configured: !!this.key, docsUrl: "https://developers.rentcast.io",
      capabilities: ["search", "property", "sales_history", "comps", "tax", "market_stats"],
      licenseNotes: "Property records & AVM comparables. Check plan limits for caching/redistribution of records and comps.",
    };
  }
  private h() { return { "X-Api-Key": this.key }; }

  private toRecord(r: any): PropertyRecord {
    const src = (c: Provenance["confidence"] = "medium") => p("RentCast", "third_party", c, r.lastSaleDate?.slice(0, 10));
    const history: SaleRecord[] = Object.values(r.history ?? {}).map((h: any) => ({
      date: String(h.date ?? "").slice(0, 10), price: h.price ?? null, docType: h.event ?? "Sale", cash: null, armsLength: true, source: src("high"),
    })).sort((a, b) => b.date.localeCompare(a.date));
    const lastTax: any = Object.values(r.propertyTaxes ?? {}).sort((a: any, b: any) => b.year - a.year)[0];
    const lastAssess: any = Object.values(r.taxAssessments ?? {}).sort((a: any, b: any) => b.year - a.year)[0];
    const owner = r.owner ?? {};
    const mailing = owner.mailingAddress ?? {};
    return {
      id: `rentcast:${r.id}`, apn: r.assessorID ?? "",
      address: { line1: r.addressLine1, city: r.city, state: r.state, zip: r.zipCode, county: r.county },
      neighborhood: r.subdivision ?? "", lat: r.latitude, lng: r.longitude, propertyType: mapType(r.propertyType),
      beds: r.bedrooms ?? null, baths: r.bathrooms ?? null, sqft: r.squareFootage ?? null, lotSqft: r.lotSize ?? null,
      yearBuilt: r.yearBuilt ?? null, units: 1,
      owner: {
        ownerId: `rentcast-owner:${(owner.names ?? []).join("|")}`, names: owner.names ?? [], entityType: owner.type === "Organization" ? "llc" : "individual",
        mailing: { line1: mailing.addressLine1 ?? "", city: mailing.city ?? "", state: mailing.state ?? "", zip: mailing.zipCode ?? "" },
        ownerOccupied: !!r.ownerOccupied, absentee: r.ownerOccupied === false, outOfState: !!mailing.state && mailing.state !== r.state,
      },
      lastSale: r.lastSaleDate ? { date: r.lastSaleDate.slice(0, 10), price: r.lastSalePrice ?? null, docType: "Sale", cash: null, armsLength: true, source: src("high") } : null,
      sales: history, estValue: null, estMortgageBalance: null, estEquity: null, equityPct: null, freeAndClear: null,
      yearsOwned: r.lastSaleDate ? (Date.now() - new Date(r.lastSaleDate).getTime()) / 3.156e10 : null,
      mortgages: [], tax: lastTax || lastAssess ? { year: lastTax?.year ?? lastAssess?.year, assessedValue: lastAssess?.value ?? null, annualTax: lastTax?.total ?? null, delinquent: null, delinquentAmount: null, source: src("high") } : null,
      distress: { ...UNKNOWN_DISTRESS }, valueHistory: [], photos: [], motivationScore: 0,
      provenance: { address: src("high"), owner: src("high"), beds: src(), baths: src(), sqft: src(), lastSale: src("high") },
    };
  }

  async getProperty(id: string) {
    const rid = id.replace(/^rentcast:/, "");
    const data = await getJson(`${this.base}/properties/${encodeURIComponent(rid)}`, this.h());
    return data ? this.toRecord(data) : null;
  }

  async searchProperties(req: SearchRequest): Promise<SearchResponse> {
    const t0 = Date.now();
    const qs = new URLSearchParams({ limit: String(Math.min(req.limit ?? 500, 500)), offset: String(req.offset ?? 0) });
    if (req.area?.type === "radius") { qs.set("latitude", String(req.area.center[1])); qs.set("longitude", String(req.area.center[0])); qs.set("radius", String(req.area.miles)); }
    else if (req.bbox) {
      const [w, s, e, n] = req.bbox;
      qs.set("latitude", String((s + n) / 2)); qs.set("longitude", String((w + e) / 2));
      qs.set("radius", String(Math.min(25, Math.max(0.5, ((n - s) * 69) / 2))));
    }
    if (req.filters.zips?.[0]) qs.set("zipCode", req.filters.zips[0]);
    if (req.filters.city) qs.set("city", req.filters.city);
    const data: any[] = await getJson(`${this.base}/properties?${qs}`, this.h());
    const results = (data ?? []).map((r) => this.toRecord(r)).map(summarize);
    return { total: results.length, truncated: results.length >= (req.limit ?? 500), results, tookMs: Date.now() - t0, provider: "RentCast" };
  }

  async getSalesHistory(id: string) { return (await this.getProperty(id))?.sales ?? []; }
  async getTaxData(id: string) { return (await this.getProperty(id))?.tax ?? null; }

  async getComps(q: CompQuery): Promise<CompCandidate[]> {
    const qs = new URLSearchParams({ latitude: String(q.lat), longitude: String(q.lng), compCount: String(Math.min(25, q.limit)), maxRadius: String(q.radiusMiles), daysOld: String(Math.round(q.months * 30.4)) });
    const data = await getJson(`${this.base}/avm/value?${qs}`, this.h());
    return (data?.comparables ?? []).filter((c: any) => c.price || c.lastSalePrice).map((c: any) => ({
      id: `rentcast:${c.id}`, propertyId: null, line1: c.addressLine1, city: c.city, zip: c.zipCode, lat: c.latitude, lng: c.longitude,
      propertyType: mapType(c.propertyType), beds: c.bedrooms ?? null, baths: c.bathrooms ?? null, sqft: c.squareFootage ?? null,
      lotSqft: c.lotSize ?? null, yearBuilt: c.yearBuilt ?? null, salePrice: c.price ?? c.lastSalePrice,
      saleDate: String(c.removedDate ?? c.lastSeenDate ?? c.listedDate ?? "").slice(0, 10), dom: c.daysOnMarket ?? null, cash: null,
      source: p("RentCast AVM comparables", "third_party", "medium", undefined, "Listing-derived comparable; confirm closed price with recorder/MLS"),
    }));
  }

  async getMarketStats(q: MarketStatsQuery): Promise<MarketStat[]> {
    const out: MarketStat[] = [];
    for (const zip of q.zips ?? []) {
      const d = await getJson(`${this.base}/markets?zipCode=${zip}&dataType=Sale&historyRange=12`, this.h());
      const s = d?.saleData ?? {};
      out.push({ key: zip, label: zip, lat: 0, lng: 0, medianSalePrice: s.medianPrice ?? null, medianPpsf: s.medianPricePerSquareFoot ?? null,
        transactions: s.totalListings ?? 0, avgDom: s.averageDaysOnMarket ?? null, investorPct: null, cashPct: null, priceTrendPct: null,
        inventory: s.totalListings ?? null, source: "RentCast market data", synthetic: false });
    }
    return out;
  }
}

// ─── ATTOM ──────────────────────────────────────────────────────────
// Docs: https://api.developer.attomdata.com/docs  (header: apikey)
export class AttomAdapter extends BaseAdapter {
  private base = "https://api.gateway.attomdata.com/propertyapi/v1.0.0";
  constructor(private key = process.env.ATTOM_API_KEY ?? "") { super(); }
  info(): ProviderInfo {
    return {
      id: "attom", name: "ATTOM Data", kind: "third_party", configured: !!this.key, docsUrl: "https://api.developer.attomdata.com/docs",
      capabilities: ["search", "property", "owner", "sales_history", "mortgage", "tax", "value_history", "distress"],
      licenseNotes: "Assessor, recorder, AVM, mortgage and foreclosure data. Licence terms govern storage, display and redistribution.",
    };
  }
  private h() { return { apikey: this.key }; }

  private toRecord(x: any): PropertyRecord {
    const asOf = x.vintage?.pubDate?.slice(0, 10);
    const pub = (c: Provenance["confidence"] = "high") => p("ATTOM (assessor/recorder)", "public_record", c, asOf);
    const third = (c: Provenance["confidence"] = "medium", note?: string) => p("ATTOM", "third_party", c, asOf, note);
    const owner = x.assessment?.owner ?? {};
    const names = [owner.owner1?.fullName, owner.owner2?.fullName].filter(Boolean);
    const mail = owner.mailingAddressOneLine ?? "";
    const avm = x.avm?.amount?.value ?? null;
    const loan = x.assessment?.mortgage?.FirstConcurrent ?? x.mortgage ?? null;
    const sale = x.sale ?? {};
    const lastSale: SaleRecord | null = sale.saleTransDate || sale.amount?.saleRecDate ? {
      date: String(sale.amount?.saleRecDate ?? sale.saleTransDate).slice(0, 10), price: sale.amount?.saleAmt ?? null,
      docType: sale.amount?.saleTransType ?? "Deed", cash: sale.amount?.saleCode === "cash" ? true : null, armsLength: true, source: pub(),
    } : null;
    const bal = loan?.amount ?? null;
    return {
      id: `attom:${x.identifier?.attomId}`, apn: x.identifier?.apn ?? "",
      address: { line1: x.address?.line1, city: x.address?.locality, state: x.address?.countrySubd, zip: x.address?.postal1, county: x.area?.countrySecSubd },
      neighborhood: x.area?.subdName ?? "", lat: +x.location?.latitude, lng: +x.location?.longitude,
      propertyType: mapType(x.summary?.propertyType ?? x.summary?.proptype), beds: x.building?.rooms?.beds ?? null,
      baths: x.building?.rooms?.bathsTotal ?? null, sqft: x.building?.size?.livingSize ?? x.building?.size?.universalSize ?? null,
      lotSqft: x.lot?.lotSize2 ?? null, yearBuilt: x.summary?.yearBuilt ?? null, units: x.building?.summary?.unitsCount ?? 1,
      owner: { ownerId: `attom-owner:${names.join("|")}`, names, entityType: owner.corporateIndicator === "Y" ? "llc" : "individual",
        mailing: { line1: mail, city: "", state: "", zip: "" }, ownerOccupied: x.summary?.absenteeInd === "OWNER OCCUPIED",
        absentee: x.summary?.absenteeInd === "ABSENTEE OWNER", outOfState: false },
      lastSale, sales: lastSale ? [lastSale] : [], estValue: avm, estMortgageBalance: bal,
      estEquity: avm != null && bal != null ? avm - bal : null, equityPct: avm && bal != null ? ((avm - bal) / avm) * 100 : null,
      freeAndClear: loan ? false : null, yearsOwned: lastSale ? (Date.now() - new Date(lastSale.date).getTime()) / 3.156e10 : null,
      mortgages: loan ? [{ lender: loan.lenderLastName ?? null, originalAmount: loan.amount ?? null, recordedOn: loan.date ?? null, estBalance: null, loanType: loan.loanType ?? null, source: third("low", "Original recorded amount — current balance not known") }] : [],
      tax: x.assessment?.tax ? { year: x.assessment.tax.taxYear, assessedValue: x.assessment.assessed?.assdTtlValue ?? null, annualTax: x.assessment.tax.taxAmt ?? null, delinquent: null, delinquentAmount: null, source: pub() } : null,
      distress: { ...UNKNOWN_DISTRESS }, valueHistory: avm ? [{ date: asOf ?? "", value: avm, source: "ATTOM AVM" }] : [], photos: [], motivationScore: 0,
      provenance: { address: pub(), owner: pub(), beds: pub(), baths: pub(), sqft: pub(), lastSale: pub(), estValue: third("medium", "ATTOM AVM"), estMortgageBalance: third("low") },
    };
  }

  async getProperty(id: string) {
    const attomId = id.replace(/^attom:/, "");
    const d = await getJson(`${this.base}/property/expandedprofile?attomid=${encodeURIComponent(attomId)}`, this.h());
    const x = d?.property?.[0];
    return x ? this.toRecord(x) : null;
  }

  async searchProperties(req: SearchRequest): Promise<SearchResponse> {
    const t0 = Date.now();
    const qs = new URLSearchParams({ pagesize: String(Math.min(req.limit ?? 100, 100)), page: String(1 + Math.floor((req.offset ?? 0) / 100)) });
    if (req.area?.type === "radius") { qs.set("latitude", String(req.area.center[1])); qs.set("longitude", String(req.area.center[0])); qs.set("radius", String(req.area.miles)); }
    else if (req.bbox) { const [w, s, e, n] = req.bbox; qs.set("latitude", String((s + n) / 2)); qs.set("longitude", String((w + e) / 2)); qs.set("radius", String(Math.min(20, ((n - s) * 69) / 2))); }
    else if (req.filters.zips?.[0]) qs.set("postalcode", req.filters.zips[0]);
    const d = await getJson(`${this.base}/property/snapshot?${qs}`, this.h());
    const results = (d?.property ?? []).map((x: any) => summarize(this.toRecord(x)));
    return { total: d?.status?.total ?? results.length, truncated: (d?.status?.total ?? 0) > results.length, results, tookMs: Date.now() - t0, provider: "ATTOM" };
  }

  async getSalesHistory(id: string) {
    const d = await getJson(`${this.base}/saleshistory/detail?attomid=${encodeURIComponent(id.replace(/^attom:/, ""))}`, this.h());
    return (d?.property?.[0]?.salehistory ?? []).map((s: any) => ({
      date: String(s.amount?.salerecdate ?? s.saleTransDate).slice(0, 10), price: s.amount?.saleamt ?? null, docType: s.amount?.saletranstype ?? "Deed",
      cash: null, armsLength: true, source: p("ATTOM (recorder)", "public_record", "high"),
    }));
  }
  async getOwner(ownerId: string) { void ownerId; return null; }
  async getMortgageData(id: string) { return (await this.getProperty(id))?.mortgages ?? []; }
  async getTaxData(id: string) { return (await this.getProperty(id))?.tax ?? null; }
  async getValueHistory(id: string) { return (await this.getProperty(id))?.valueHistory ?? []; }
}

// ─── Regrid (parcels) ───────────────────────────────────────────────
// Docs: https://support.regrid.com/api  (token query param)
export class RegridAdapter extends BaseAdapter {
  constructor(private token = process.env.REGRID_API_TOKEN ?? "") { super(); }
  info(): ProviderInfo {
    return {
      id: "regrid", name: "Regrid Parcels", kind: "third_party", configured: !!this.token, docsUrl: "https://support.regrid.com/api",
      capabilities: ["parcel", "owner"],
      licenseNotes: "Nationwide parcel boundaries + assessor attributes. Tile/vector usage subject to Regrid licence.",
    };
  }
  /** id must be "lat,lng" for point lookups when no Regrid id is stored yet */
  async getParcel(id: string) {
    const [lat, lng] = id.split(",").map(Number);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    const d = await getJson(`https://app.regrid.com/api/v2/parcels/point?lat=${lat}&lon=${lng}&token=${this.token}`, {}, `regrid:${lat},${lng}`);
    const geom = d?.parcels?.features?.[0]?.geometry;
    if (!geom) return null;
    const ring = geom.type === "MultiPolygon" ? geom.coordinates[0][0] : geom.coordinates[0];
    return ring as [number, number][];
  }
}

export function summarize(r: PropertyRecord): PropertySummary {
  return {
    id: r.id, apn: r.apn, line1: r.address.line1, city: r.address.city, state: r.address.state, zip: r.address.zip,
    county: r.address.county ?? "", neighborhood: r.neighborhood, lat: r.lat, lng: r.lng, propertyType: r.propertyType,
    beds: r.beds, baths: r.baths, sqft: r.sqft, lotSqft: r.lotSqft, yearBuilt: r.yearBuilt, estValue: r.estValue,
    equityPct: r.equityPct, estEquity: r.estEquity, yearsOwned: r.yearsOwned, ownerName: r.owner.names.join(" & "),
    ownerEntity: r.owner.entityType, absentee: r.owner.absentee, outOfState: r.owner.outOfState, ownerOccupied: r.owner.ownerOccupied,
    freeAndClear: r.freeAndClear, lastSalePrice: r.lastSale?.price ?? null, lastSaleDate: r.lastSale?.date ?? null,
    lastSaleCash: r.lastSale?.cash ?? null, distress: r.distress, motivationScore: r.motivationScore,
  };
}
