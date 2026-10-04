// ════════════════════════════════════════════════════════════════════
// Data-provider abstraction layer.
//
// The application NEVER talks to ATTOM / RentCast / Regrid / a county
// feed / an MLS directly. It talks to these interfaces. Each vendor gets
// an adapter that maps its payloads into our normalised types and fills
// in Provenance for every field it supplies. A CompositeProvider routes
// each capability to whichever adapter is configured for it (env vars),
// so e.g. parcels can come from Regrid while comps come from an MLS.
// ════════════════════════════════════════════════════════════════════
import type {
  CompCandidate, MortgageInfo, OwnerInfo, PropertyRecord, PropertySummary, SaleRecord,
  SearchRequest, SearchResponse, TaxInfo, ValuePoint,
} from "@/lib/types";

export type Capability =
  | "search" | "property" | "owner" | "owner_portfolio" | "sales_history" | "comps"
  | "mortgage" | "parcel" | "tax" | "value_history" | "market_stats" | "distress" | "mls";

export interface ProviderInfo {
  id: string;
  name: string;
  kind: "demo" | "public_record" | "third_party" | "mls";
  capabilities: Capability[];
  configured: boolean;
  /** licence / display restrictions surfaced in Settings → Data Sources */
  licenseNotes: string;
  docsUrl?: string;
}

export interface CompQuery {
  subjectId?: string;
  lat: number;
  lng: number;
  radiusMiles: number;
  months: number;
  limit: number;
}

export interface MarketStatsQuery {
  zips?: string[];
  months: number;
}

export interface MarketStat {
  key: string;            // zip
  label: string;          // "95818 · Land Park"
  lat: number;
  lng: number;
  medianSalePrice: number | null;
  medianPpsf: number | null;
  transactions: number;
  avgDom: number | null;            // MLS only
  investorPct: number | null;       // share of buyers that are entities
  cashPct: number | null;
  priceTrendPct: number | null;     // YoY change in median $/sqft
  inventory: number | null;         // MLS only
  source: string;
  synthetic: boolean;
}

export interface PropertyDataProvider {
  info(): ProviderInfo;
  searchProperties(req: SearchRequest): Promise<SearchResponse>;
  getProperty(id: string): Promise<PropertyRecord | null>;
  getOwner(ownerId: string): Promise<OwnerInfo | null>;
  getOwnerPortfolio(ownerId: string): Promise<PropertySummary[]>;
  getSalesHistory(id: string): Promise<SaleRecord[]>;
  getComps(q: CompQuery): Promise<CompCandidate[]>;
  getMortgageData(id: string): Promise<MortgageInfo[]>;
  getParcel(id: string): Promise<[number, number][] | null>;
  getTaxData(id: string): Promise<TaxInfo | null>;
  getValueHistory(id: string): Promise<ValuePoint[]>;
  getMarketStats(q: MarketStatsQuery): Promise<MarketStat[]>;
}

/** Thrown by adapters for capabilities they don't implement / aren't licensed for */
export class CapabilityNotSupported extends Error {
  constructor(provider: string, cap: Capability) {
    super(`${provider} does not provide "${cap}". Configure another provider for this capability in .env.`);
  }
}

// ─── Skip tracing ───────────────────────────────────────────────────

export interface SkipTraceInput {
  ownerName: string;
  propertyAddress: { line1: string; city: string; state: string; zip: string };
  mailingAddress?: { line1: string; city: string; state: string; zip: string };
}

export interface SkipTraceResult {
  provider: string;
  synthetic: boolean;
  matchedName: string | null;
  phones: { number: string; type: "mobile" | "landline" | "voip" | "unknown"; confidence: "verified" | "likely" | "unverified"; dnc: boolean | null; lastSeen?: string }[];
  emails: { address: string; confidence: "verified" | "likely" | "unverified" }[];
  mailingAddress: string | null;
  costCents: number;
  disclaimer: string;
}

export interface SkipTraceProvider {
  id: string;
  name: string;
  configured: boolean;
  trace(input: SkipTraceInput): Promise<SkipTraceResult>;
}

// ─── E-signature, messaging (integration points) ────────────────────

export interface ESignProvider {
  id: string;
  configured: boolean;
  createEnvelope(input: { title: string; signers: { name: string; email: string }[]; pdfBase64: string }): Promise<{ envelopeId: string; status: "sent" }>;
  getStatus(envelopeId: string): Promise<"sent" | "viewed" | "signed" | "executed" | "cancelled" | "expired">;
}

export interface MessagingProvider {
  id: string;
  configured: boolean;
  sendSms(input: { to: string; body: string }): Promise<{ id: string }>;
  sendEmail(input: { to: string; subject: string; html: string; unsubscribeUrl: string }): Promise<{ id: string }>;
}
