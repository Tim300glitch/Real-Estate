// Filter evaluation shared by the demo provider (server) and dynamic lists /
// saved-search refresh (client). The Postgres provider translates the same
// PropertyFilters object into SQL (see db/migrations search_properties_bbox).
import type { PropertyFilters, PropertySummary, TriState } from "./types";

const tri = (t: TriState | undefined, v: boolean | null | undefined) => !t || t === "any" || (t === "yes" ? v === true : v === false);

export function matchesFilters(s: PropertySummary, f: PropertyFilters): boolean {
  if (f.query) {
    const q = f.query.toLowerCase();
    if (!`${s.line1} ${s.city} ${s.zip} ${s.ownerName} ${s.apn} ${s.neighborhood}`.toLowerCase().includes(q)) return false;
  }
  if (f.county && s.county.toLowerCase() !== f.county.toLowerCase()) return false;
  if (f.city && s.city.toLowerCase() !== f.city.toLowerCase()) return false;
  if (f.zips?.length && !f.zips.includes(s.zip)) return false;
  if (f.neighborhood && s.neighborhood !== f.neighborhood) return false;
  if (f.propertyTypes?.length && !f.propertyTypes.includes(s.propertyType)) return false;
  const rng = (v: number | null, min?: number, max?: number) =>
    (min == null || (v != null && v >= min)) && (max == null || (v != null && v <= max));
  if (!rng(s.yearBuilt, f.minYearBuilt, f.maxYearBuilt)) return false;
  if (!rng(s.sqft, f.minSqft, f.maxSqft)) return false;
  if (!rng(s.lotSqft, f.minLotSqft, f.maxLotSqft)) return false;
  if (!rng(s.beds, f.minBeds, f.maxBeds)) return false;
  if (!rng(s.baths, f.minBaths)) return false;
  if (!rng(s.estValue, f.minValue, f.maxValue)) return false;
  if (!rng(s.lastSalePrice, f.minLastSalePrice, f.maxLastSalePrice)) return false;
  if (f.lastSaleBefore && (!s.lastSaleDate || s.lastSaleDate > f.lastSaleBefore)) return false;
  if (f.lastSaleAfter && (!s.lastSaleDate || s.lastSaleDate < f.lastSaleAfter)) return false;
  if (!rng(s.yearsOwned, f.minYearsOwned, f.maxYearsOwned)) return false;
  if (f.minEquityPct != null && (s.equityPct == null || s.equityPct < f.minEquityPct)) return false;
  if (f.minEquity != null && (s.estEquity == null || s.estEquity < f.minEquity)) return false;
  if (!tri(f.ownerOccupied, s.ownerOccupied)) return false;
  if (!tri(f.absentee, s.absentee)) return false;
  if (!tri(f.outOfState, s.outOfState)) return false;
  if (!tri(f.freeAndClear, s.freeAndClear)) return false;
  if (!tri(f.cashPurchase, s.lastSaleCash)) return false;
  if (!tri(f.corporateOwner, s.ownerEntity === "llc" || s.ownerEntity === "corporation")) return false;
  const d = s.distress;
  if (!tri(f.taxDelinquent, d.taxDelinquent)) return false;
  if (!tri(f.preForeclosure, d.preForeclosure)) return false;
  if (!tri(f.foreclosure, d.foreclosure)) return false;
  if (!tri(f.auction, d.auctionDate != null)) return false;
  if (!tri(f.probate, d.probate)) return false;
  if (!tri(f.vacant, d.vacant)) return false;
  if (!tri(f.codeViolations, d.codeViolations == null ? null : d.codeViolations > 0)) return false;
  if (!tri(f.liens, d.liens == null ? null : d.liens > 0)) return false;
  if (!tri(f.tiredLandlord, d.tiredLandlord)) return false;
  if (!tri(f.inherited, d.inherited)) return false;
  if (!tri(f.expiredListing, d.expiredListing)) return false;
  if (f.minMotivation != null && s.motivationScore < f.minMotivation) return false;
  return true;
}


/** Human-readable chips for an active filter set */
export function describeFilters(f: PropertyFilters): string[] {
  const out: string[] = [];
  const triL = (t: TriState | undefined, yes: string, no: string) => { if (t === "yes") out.push(yes); else if (t === "no") out.push(no); };
  if (f.query) out.push(`“${f.query}”`);
  if (f.city) out.push(f.city);
  if (f.county) out.push(`${f.county} County`);
  if (f.zips?.length) out.push(`ZIP ${f.zips.join(", ")}`);
  if (f.neighborhood) out.push(f.neighborhood);
  if (f.propertyTypes?.length) out.push(f.propertyTypes.map((t) => t.toUpperCase()).join("/"));
  if (f.minYearBuilt) out.push(`Built ≥ ${f.minYearBuilt}`);
  if (f.maxYearBuilt) out.push(`Built ≤ ${f.maxYearBuilt}`);
  if (f.minSqft || f.maxSqft) out.push(`${f.minSqft ?? 0}–${f.maxSqft ?? "∞"} sf`);
  if (f.minLotSqft || f.maxLotSqft) out.push(`Lot ${f.minLotSqft ?? 0}–${f.maxLotSqft ?? "∞"} sf`);
  if (f.minBeds) out.push(`${f.minBeds}+ bd`);
  if (f.maxBeds) out.push(`≤ ${f.maxBeds} bd`);
  if (f.minBaths) out.push(`${f.minBaths}+ ba`);
  if (f.minValue || f.maxValue) out.push(`Value $${Math.round((f.minValue ?? 0) / 1000)}k–${f.maxValue ? `$${Math.round(f.maxValue / 1000)}k` : "∞"}`);
  if (f.minLastSalePrice || f.maxLastSalePrice) out.push(`Last sale $${Math.round((f.minLastSalePrice ?? 0) / 1000)}k–${f.maxLastSalePrice ? `$${Math.round(f.maxLastSalePrice / 1000)}k` : "∞"}`);
  if (f.lastSaleBefore) out.push(`Sold before ${f.lastSaleBefore}`);
  if (f.lastSaleAfter) out.push(`Sold after ${f.lastSaleAfter}`);
  if (f.minYearsOwned) out.push(`Owned ${f.minYearsOwned}+ yrs`);
  if (f.maxYearsOwned) out.push(`Owned ≤ ${f.maxYearsOwned} yrs`);
  if (f.minEquityPct) out.push(`${f.minEquityPct}%+ equity`);
  if (f.minEquity) out.push(`$${Math.round(f.minEquity / 1000)}k+ equity`);
  triL(f.ownerOccupied, "Owner occupied", "Not owner occupied");
  triL(f.absentee, "Absentee", "Not absentee");
  triL(f.outOfState, "Out-of-state", "In-state owner");
  triL(f.freeAndClear, "Free & clear", "Has mortgage");
  triL(f.cashPurchase, "Cash purchase", "Financed purchase");
  triL(f.corporateOwner, "Corporate/LLC owner", "Individual owner");
  triL(f.taxDelinquent, "Tax delinquent", "Not tax delinquent");
  triL(f.preForeclosure, "Pre-foreclosure", "No pre-foreclosure");
  triL(f.foreclosure, "Foreclosure", "No foreclosure");
  triL(f.auction, "Auction scheduled", "No auction");
  triL(f.probate, "Probate", "No probate");
  triL(f.vacant, "Vacant", "Occupied");
  triL(f.codeViolations, "Code violations", "No code violations");
  triL(f.liens, "Liens", "No liens");
  triL(f.tiredLandlord, "Tired landlord", "Not tired landlord");
  triL(f.inherited, "Inherited", "Not inherited");
  triL(f.expiredListing, "Expired listing", "No expired listing");
  if (f.minMotivation) out.push(`Motivation ≥ ${f.minMotivation}`);
  return out;
}

export function countActive(f: PropertyFilters): number {
  return describeFilters(f).length;
}
