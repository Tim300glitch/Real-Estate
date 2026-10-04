// Zod schemas for API input validation (server) — mirrors lib/types.
import { z } from "zod";

const tri = z.enum(["any", "yes", "no"]).optional();
const num = z.number().finite().optional();
const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const filtersSchema = z.object({
  query: z.string().max(200).optional(),
  county: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  zips: z.array(z.string().regex(/^\d{5}$/)).max(50).optional(),
  neighborhood: z.string().max(80).optional(),
  propertyTypes: z.array(z.enum(["sfr", "condo", "townhouse", "duplex", "triplex", "fourplex", "multifamily", "mobile", "lot", "land"])).optional(),
  minYearBuilt: num, maxYearBuilt: num, minSqft: num, maxSqft: num, minLotSqft: num, maxLotSqft: num,
  minBeds: num, maxBeds: num, minBaths: num, minValue: num, maxValue: num, minLastSalePrice: num, maxLastSalePrice: num,
  lastSaleBefore: z.string().max(10).optional(), lastSaleAfter: z.string().max(10).optional(),
  minYearsOwned: num, maxYearsOwned: num, minEquityPct: num, minEquity: num,
  ownerOccupied: tri, absentee: tri, outOfState: tri, freeAndClear: tri, cashPurchase: tri, corporateOwner: tri,
  taxDelinquent: tri, preForeclosure: tri, foreclosure: tri, auction: tri, probate: tri, vacant: tri,
  codeViolations: tri, liens: tri, tiredLandlord: tri, inherited: tri, expiredListing: tri, minMotivation: num,
}).strict();

export const areaSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bbox"), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
  z.object({ type: z.literal("radius"), center: lngLat, miles: z.number().positive().max(50) }),
  z.object({ type: z.literal("polygon"), ring: z.array(lngLat).min(4).max(500) }),
]);

export const searchSchema = z.object({
  filters: filtersSchema.default({}),
  area: areaSchema.optional(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
  offset: z.number().int().min(0).optional(),
  sort: z.enum(["motivation", "equity", "value", "years_owned", "recent_sale"]).optional(),
});

export const compsSchema = z.object({
  subjectId: z.string().max(100).optional(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMiles: z.coerce.number().positive().max(10),
  months: z.coerce.number().int().min(1).max(60),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

export const skipTraceSchema = z.object({
  ownerName: z.string().min(1).max(200),
  propertyAddress: z.object({ line1: z.string().max(200), city: z.string().max(100), state: z.string().max(2), zip: z.string().max(10) }),
  mailingAddress: z.object({ line1: z.string().max(200), city: z.string().max(100), state: z.string().max(2), zip: z.string().max(10) }).optional(),
});

export const aiSchema = z.object({
  task: z.enum(["why_lead", "summarize_conversations", "explain_comps", "suspicious_assumptions", "draft_followup", "deal_summary", "analyze_rehab", "prioritize_leads", "ask"]),
  question: z.string().max(2000).optional(),
  /** Known database facts assembled by the client from stored records. Model may use ONLY these. */
  facts: z.array(z.object({ label: z.string().max(200), value: z.string().max(2000), source: z.string().max(200) })).max(200),
});

export const loginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });
