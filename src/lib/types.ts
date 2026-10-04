// ════════════════════════════════════════════════════════════════════
// Domain model shared by server (providers, API) and client (UI, store)
// ════════════════════════════════════════════════════════════════════

/** Where a value came from. Drives the provenance badges everywhere in the UI. */
export type SourceKind = "public_record" | "third_party" | "mls" | "calculated" | "user_entered";
export type Confidence = "high" | "medium" | "low" | "unknown";

export interface Provenance {
  kind: SourceKind;
  /** Human readable source, e.g. "County Assessor", "ATTOM", "Demo Data Provider" */
  source: string;
  /** ISO date the value was recorded/observed by the source */
  asOf: string;
  confidence: Confidence;
  /** Free-text: methodology, document number, licence restriction, … */
  note?: string;
  /** True when the value comes from the synthetic demo provider */
  synthetic?: boolean;
}

export type PropertyType =
  | "sfr" | "condo" | "townhouse" | "duplex" | "triplex" | "fourplex"
  | "multifamily" | "mobile" | "lot" | "land";

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  sfr: "Single-family", condo: "Condo", townhouse: "Townhouse", duplex: "Duplex",
  triplex: "Triplex", fourplex: "Fourplex", multifamily: "Multifamily (5+)",
  mobile: "Mobile", lot: "Lot", land: "Land",
};

export interface Address {
  line1: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
}

export type OwnerEntity = "individual" | "llc" | "trust" | "estate" | "corporation";

export interface OwnerInfo {
  ownerId: string;
  names: string[];
  entityType: OwnerEntity;
  mailing: Address;
  ownerOccupied: boolean;
  absentee: boolean;
  outOfState: boolean;
  /** number of properties this owner holds in the provider dataset, if the provider supports it */
  portfolioCount?: number;
}

export interface SaleRecord {
  date: string;
  price: number | null;
  docType: string;
  cash: boolean | null;
  armsLength: boolean;
  buyer?: string;
  seller?: string;
  source: Provenance;
  /** Days on market — only available with MLS access */
  dom?: number | null;
}

export interface MortgageInfo {
  lender: string | null;
  originalAmount: number | null;
  recordedOn: string | null;
  estBalance: number | null;
  loanType: string | null;
  source: Provenance;
}

export interface TaxInfo {
  year: number;
  assessedValue: number | null;
  annualTax: number | null;
  delinquent: boolean | null;
  delinquentAmount: number | null;
  source: Provenance;
}

/** Distress flags. `null` = unknown / not available from connected sources (NOT false). */
export interface DistressFlags {
  taxDelinquent: boolean | null;
  preForeclosure: boolean | null;
  foreclosure: boolean | null;
  auctionDate: string | null;
  probate: boolean | null;
  vacant: boolean | null;
  codeViolations: number | null;
  liens: number | null;
  inherited: boolean | null;
  tiredLandlord: boolean | null;
  expiredListing: boolean | null;
}

export interface ValuePoint {
  date: string;
  value: number;
  source: string;
}

/** Normalised property record returned by any PropertyDataProvider */
export interface PropertyRecord {
  id: string;
  apn: string;
  address: Address;
  neighborhood: string;
  lat: number;
  lng: number;
  /** Parcel ring [lng, lat][] if the parcel provider supplied it */
  parcel?: [number, number][];
  propertyType: PropertyType;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;
  units: number;
  owner: OwnerInfo;
  lastSale: SaleRecord | null;
  sales: SaleRecord[];
  estValue: number | null;
  estMortgageBalance: number | null;
  estEquity: number | null;
  equityPct: number | null;
  freeAndClear: boolean | null;
  yearsOwned: number | null;
  mortgages: MortgageInfo[];
  tax: TaxInfo | null;
  distress: DistressFlags;
  valueHistory: ValuePoint[];
  /** Provenance for each top-level field key (e.g. "estValue", "owner", "beds") */
  provenance: Record<string, Provenance>;
  /** Licensed photo URLs only. Empty when no licensed source is connected. */
  photos: string[];
  /** cached scores, calculated server-side from the record */
  motivationScore: number;
}

/** Lightweight version for map pins & tables (cached property summary) */
export interface PropertySummary {
  id: string;
  apn: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  neighborhood: string;
  lat: number;
  lng: number;
  propertyType: PropertyType;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;
  estValue: number | null;
  equityPct: number | null;
  estEquity: number | null;
  yearsOwned: number | null;
  ownerName: string;
  ownerEntity: OwnerEntity;
  absentee: boolean;
  outOfState: boolean;
  ownerOccupied: boolean;
  freeAndClear: boolean | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  lastSaleCash: boolean | null;
  distress: DistressFlags;
  motivationScore: number;
  synthetic?: boolean;
}

// ─── Search ─────────────────────────────────────────────────────────

export type TriState = "any" | "yes" | "no";

export interface PropertyFilters {
  query?: string;
  county?: string;
  city?: string;
  zips?: string[];
  neighborhood?: string;
  propertyTypes?: PropertyType[];
  minYearBuilt?: number; maxYearBuilt?: number;
  minSqft?: number; maxSqft?: number;
  minLotSqft?: number; maxLotSqft?: number;
  minBeds?: number; maxBeds?: number;
  minBaths?: number;
  minValue?: number; maxValue?: number;
  minLastSalePrice?: number; maxLastSalePrice?: number;
  lastSaleBefore?: string; lastSaleAfter?: string;
  minYearsOwned?: number; maxYearsOwned?: number;
  minEquityPct?: number;
  minEquity?: number;
  ownerOccupied?: TriState;
  absentee?: TriState;
  outOfState?: TriState;
  freeAndClear?: TriState;
  cashPurchase?: TriState;
  corporateOwner?: TriState;
  taxDelinquent?: TriState;
  preForeclosure?: TriState;
  foreclosure?: TriState;
  auction?: TriState;
  probate?: TriState;
  vacant?: TriState;
  codeViolations?: TriState;
  liens?: TriState;
  tiredLandlord?: TriState;
  inherited?: TriState;
  expiredListing?: TriState;
  minMotivation?: number;
}

export type SearchArea =
  | { type: "bbox"; bbox: [number, number, number, number] }
  | { type: "radius"; center: [number, number]; miles: number }
  | { type: "polygon"; ring: [number, number][] };

export interface SearchRequest {
  filters: PropertyFilters;
  area?: SearchArea;
  /** viewport bbox, always applied for map queries */
  bbox?: [number, number, number, number];
  limit?: number;
  offset?: number;
  sort?: "motivation" | "equity" | "value" | "years_owned" | "recent_sale";
}

export interface SearchResponse {
  total: number;
  truncated: boolean;
  results: PropertySummary[];
  tookMs: number;
  provider: string;
}

// ─── Comps ──────────────────────────────────────────────────────────

export interface CompCriteria {
  radiusMiles: number;
  months: number;
  sameType: boolean;
  sqftTolerancePct: number;
  bedTolerance: number;
  bathTolerance: number;
  yearTolerance: number;
  lotTolerancePct: number;
  maxResults: number;
}

export interface CompCandidate {
  id: string;
  propertyId: string | null;
  line1: string;
  city: string;
  zip: string;
  lat: number;
  lng: number;
  propertyType: PropertyType;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;
  salePrice: number;
  saleDate: string;
  dom: number | null;
  cash: boolean | null;
  source: Provenance;
  manual?: boolean;
}

export interface CompEntry extends CompCandidate {
  included: boolean;
  conditionNotes?: string;
  /** user-assigned weight override (0–1). Undefined → derived from similarity */
  weightOverride?: number;
}

export interface SimilarityWeights {
  distance: number;
  sqft: number;
  bedsBaths: number;
  yearBuilt: number;
  lotSize: number;
  recency: number;
  propertyType: number;
}

// ─── Workspace (CRM) entities ───────────────────────────────────────

export type LeadStage =
  | "new_lead" | "researching" | "contact_attempted" | "contacted" | "follow_up" | "appointment"
  | "offer_prep" | "offer_sent" | "negotiating" | "contract_sent" | "under_contract"
  | "disposition" | "closing" | "closed" | "dead";

export const STAGES: { id: LeadStage; label: string }[] = [
  { id: "new_lead", label: "New Lead" },
  { id: "researching", label: "Researching" },
  { id: "contact_attempted", label: "Contact Attempted" },
  { id: "contacted", label: "Contacted" },
  { id: "follow_up", label: "Follow-up" },
  { id: "appointment", label: "Appointment" },
  { id: "offer_prep", label: "Offer Prep" },
  { id: "offer_sent", label: "Offer Sent" },
  { id: "negotiating", label: "Negotiating" },
  { id: "contract_sent", label: "Contract Sent" },
  { id: "under_contract", label: "Under Contract" },
  { id: "disposition", label: "Disposition" },
  { id: "closing", label: "Closing" },
  { id: "closed", label: "Closed" },
  { id: "dead", label: "Dead" },
];

export type PinStatus =
  | "not_reviewed" | "potential" | "hot" | "contacted" | "offer_sent"
  | "under_contract" | "dead" | "do_not_contact" | "owned";

export const PIN_STATUS: Record<PinStatus, { label: string; color: string }> = {
  not_reviewed: { label: "Not Reviewed", color: "#8b93a7" },
  potential: { label: "Potential Deal", color: "#3b82f6" },
  hot: { label: "Hot Lead", color: "#ef4444" },
  contacted: { label: "Contacted", color: "#06b6d4" },
  offer_sent: { label: "Offer Sent", color: "#a855f7" },
  under_contract: { label: "Under Contract", color: "#22c55e" },
  dead: { label: "Dead Lead", color: "#52525b" },
  do_not_contact: { label: "Do Not Contact", color: "#f97316" },
  owned: { label: "Owned / Buyer Property", color: "#eab308" },
};

export type LeadSource =
  | "deal_finder" | "map" | "list" | "driving_for_dollars" | "direct_mail" | "cold_call"
  | "sms" | "ppc" | "referral" | "probate_list" | "website" | "other";

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  deal_finder: "Deal Finder", map: "Map", list: "List", driving_for_dollars: "Driving for Dollars",
  direct_mail: "Direct Mail", cold_call: "Cold Call", sms: "SMS", ppc: "PPC", referral: "Referral",
  probate_list: "Probate List", website: "Website", other: "Other",
};

export interface Lead {
  id: string;
  propertyId: string;
  property: PropertySummary;
  stage: LeadStage;
  status: PinStatus;
  source: LeadSource;
  campaignId?: string;
  assignedTo: string;
  tags: string[];
  askingPrice?: number;
  deadReason?: string;
  sellerId?: string;
  createdAt: string;
  updatedAt: string;
  stageChangedAt: string;
  stageHistory: { stage: LeadStage; at: string }[];
  lastContactAt?: string;
  closedAt?: string;
  deletedAt?: string;
}

export type ContactStatus = "verified" | "likely" | "unverified" | "bad";

export interface ContactPoint {
  id: string;
  kind: "phone" | "email";
  value: string;
  phoneType?: "mobile" | "landline" | "voip" | "unknown";
  status: ContactStatus;
  source: string;
  dnc: boolean;
  optedOut: boolean;
  smsConsent: boolean;
  addedAt: string;
}

export const SELLER_QUESTIONS: { key: string; q: string }[] = [
  { key: "why", q: "Why are you selling?" },
  { key: "timeline", q: "How quickly do you want to sell?" },
  { key: "repairs", q: "What repairs are needed?" },
  { key: "occupied", q: "Is the property occupied?" },
  { key: "mortgage", q: "Is there a mortgage?" },
  { key: "price", q: "What price are you hoping for?" },
  { key: "ifnot", q: "What happens if you don't sell?" },
];

export interface Seller {
  id: string;
  leadId: string;
  name: string;
  contacts: ContactPoint[];
  mailing?: Address;
  motivation: number; // 1-5
  timeline: string;
  askingPrice?: number;
  mortgageEstimate?: number;
  reasonForSelling: string;
  condition: string;
  occupancy: string;
  decisionMakers: string;
  preferredComm: "call" | "sms" | "email" | "any";
  answers: Record<string, string>;
  createdAt: string;
}

export type CommType =
  | "call" | "sms" | "email" | "voicemail" | "note" | "appointment" | "offer" | "contract" | "automation" | "mail";

export interface Communication {
  id: string;
  leadId?: string;
  buyerId?: string;
  type: CommType;
  direction: "inbound" | "outbound" | "internal";
  outcome?: string;
  body?: string;
  contact?: string;
  at: string;
  userId: string;
}

export type TaskType =
  | "call_seller" | "run_comps" | "send_offer" | "request_photos" | "follow_up" | "schedule_walkthrough"
  | "contact_title" | "contact_buyer" | "check_closing" | "sms" | "email" | "other";

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  call_seller: "Call seller", run_comps: "Run comps", send_offer: "Send offer", request_photos: "Request photos",
  follow_up: "Follow up", schedule_walkthrough: "Schedule walkthrough", contact_title: "Contact title company",
  contact_buyer: "Contact buyer", check_closing: "Check closing", sms: "Send SMS", email: "Send email", other: "Other",
};

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  leadId?: string;
  buyerId?: string;
  dispositionId?: string;
  dueAt: string;
  completedAt?: string;
  assignee: string;
  priority: 1 | 2 | 3;
  sequenceId?: string;
  createdAt: string;
}

export interface FollowUpSequence {
  id: string;
  name: string;
  steps: { day: number; type: TaskType; note?: string }[];
}

export interface Appointment {
  id: string;
  leadId?: string;
  title: string;
  kind: "walkthrough" | "seller_call" | "closing" | "buyer_showing" | "other";
  startsAt: string;
  durationMin: number;
  location?: string;
  notes?: string;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  assignee: string;
}

export interface Note {
  id: string;
  entityType: "property" | "lead" | "buyer" | "disposition";
  entityId: string;
  body: string;
  pinned: boolean;
  tags: string[];
  viaVoice: boolean;
  photoIds: string[];
  userId: string;
  at: string;
}

export interface CompSet {
  id: string;
  propertyId: string;
  criteria: CompCriteria;
  weights: SimilarityWeights;
  comps: CompEntry[];
  arvMethod: ArvMethodKey;
  calculatedArv: number | null;
  arvLow: number | null;
  arvHigh: number | null;
  userArv?: number;
  userArvReason?: string;
  updatedAt: string;
}

export type ArvMethodKey = "average_price" | "average_ppsf" | "weighted";

export type Condition = "good" | "minor" | "moderate" | "major" | "full";
export type RepairUnit = "sqft" | "unit" | "room" | "linear_ft" | "flat";

export interface RepairItem {
  id: string;
  category: string;
  room?: string;
  condition: Condition;
  unit: RepairUnit;
  quantity: number;
  unitCost: number;
  notes?: string;
}

export interface WalkthroughRoom {
  id: string;
  name: string;
  rating?: Condition;
  notes: string;
  photoIds: string[];
  voiceNotes: string[];
  repairItemIds: string[];
}

export interface RepairEstimate {
  id: string;
  propertyId: string;
  marketId: string;
  contingencyPct: number;
  items: RepairItem[];
  walkthrough: WalkthroughRoom[];
  updatedAt: string;
}

export type MaoFormula = "percent_of_arv" | "detailed";

export interface DealInputs {
  arv: number;
  arvSource: "calculated" | "user" | "manual";
  repairs: number;
  repairsSource: "estimator" | "manual";
  formula: MaoFormula;
  investorPct: number;        // e.g. 0.70 — never hard-coded, comes from preset
  wholesaleFee: number;
  buyerProfitPct: number;     // detailed model: buyer profit requirement as % of ARV
  closingCostsBuyPct: number; // % of purchase
  closingCostsSellPct: number;// % of ARV
  agentPct: number;           // % of ARV on resale
  holdingMonths: number;
  holdingCostMonthly: number;
  financingPct: number;       // points+interest as % of purchase+rehab
  otherCosts: number;
  sellerAsk?: number;
  purchasePrice: number;      // proposed contract price with seller
  offerLowPct: number;        // low offer = MAO × (1 - pct)
  offerTargetPct: number;     // target offer = MAO × (1 - pct)
  presetId: string;
}

export interface DealAnalysis {
  id: string;
  propertyId: string;
  inputs: DealInputs;
  updatedAt: string;
}

export type OfferStatus = "draft" | "sent" | "countered" | "accepted" | "rejected" | "expired" | "withdrawn";

export interface Offer {
  id: string;
  leadId: string;
  propertyId: string;
  amount: number;
  earnestMoney: number;
  closeDays: number;
  inspectionDays: number;
  terms: string;
  templateId: string;
  status: OfferStatus;
  arv: number;
  repairs: number;
  mao: number;
  projectedFee: number;
  sellerAsk?: number;
  createdAt: string;
  sentAt?: string;
  respondedAt?: string;
  counterAmount?: number;
}

export type ContractKind =
  | "purchase_agreement" | "assignment_agreement" | "addendum" | "disclosure" | "title"
  | "proof_of_funds" | "seller_document" | "buyer_document";

export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = {
  purchase_agreement: "Purchase agreement", assignment_agreement: "Assignment agreement", addendum: "Addendum",
  disclosure: "Disclosure", title: "Title document", proof_of_funds: "Proof of funds",
  seller_document: "Seller document", buyer_document: "Buyer document",
};

export type ContractStatus = "draft" | "sent" | "viewed" | "signed" | "executed" | "cancelled" | "expired";

export interface Contract {
  id: string;
  leadId: string;
  dispositionId?: string;
  kind: ContractKind;
  title: string;
  status: ContractStatus;
  amount?: number;
  party?: string;
  esignProvider?: string;
  envelopeId?: string;
  history: { status: ContractStatus; at: string }[];
  createdAt: string;
  expiresAt?: string;
}

export type RehabTolerance = "cosmetic" | "moderate" | "heavy" | "full_gut";
export type BuyerStrategy = "flip" | "hold" | "brrrr" | "land" | "multifamily";

export interface Buyer {
  id: string;
  name: string;
  company?: string;
  contacts: ContactPoint[];
  markets: string[];
  zips: string[];
  propertyTypes: PropertyType[];
  minPrice: number;
  maxPrice: number;
  minBeds: number;
  rehabTolerance: RehabTolerance;
  strategies: BuyerStrategy[];
  desiredMarginPct: number;
  dealsPurchased: number;
  avgPurchasePrice: number;
  reliability: number; // 1-5
  pofAmount?: number;
  pofVerifiedAt?: string;
  lastActivityAt: string;
  notes?: string;
  tags: string[];
  createdAt: string;
}

export type DispositionStatus = "preparing" | "marketing" | "reviewing_offers" | "assigned" | "closing" | "closed" | "cancelled";

export interface Disposition {
  id: string;
  leadId: string;
  contractPrice: number;
  askingPrice: number;
  minimumPrice: number;
  accessInstructions: string;
  closingDate: string;
  earnestMoney: number;
  titleCompany: string;
  titleContact: string;
  status: DispositionStatus;
  showFullAddress: boolean;
  selectedBuyerIds: string[];
  winningOfferId?: string;
  actualFee?: number;
  feeReceivedAt?: string;
  createdAt: string;
}

export type BlastRecipientStatus = "sent" | "opened" | "clicked" | "interested" | "passed" | "offer_submitted" | "suppressed";

export interface DealBlast {
  id: string;
  dispositionId: string;
  channel: "email" | "sms" | "portal";
  subject: string;
  body: string;
  sentAt: string;
  recipients: { buyerId: string; status: BlastRecipientStatus; at: string }[];
}

export interface BuyerOffer {
  id: string;
  dispositionId: string;
  buyerId: string;
  amount: number;
  closeDays: number;
  emd: number;
  pofVerified: boolean;
  status: "pending" | "accepted" | "declined";
  notes?: string;
  at: string;
}

export interface LeadList {
  id: string;
  name: string;
  description?: string;
  dynamic: boolean;
  rules?: PropertyFilters;
  propertyIds: string[];
  /** Cached summaries for static members so lists work without re-querying the provider */
  members: Record<string, PropertySummary>;
  color: string;
  createdAt: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: PropertyFilters;
  area?: SearchArea;
  createdAt: string;
  lastRunAt?: string;
  lastResultIds: string[];
  newMatchIds: string[];
}

export interface Campaign {
  id: string;
  name: string;
  audience: "seller" | "buyer";
  channel: "direct_mail" | "cold_call" | "sms" | "email" | "ppc" | "driving_for_dollars" | "deal_blast" | "referral";
  spend: number;
  startDate: string;
  endDate?: string;
  status: "draft" | "active" | "paused" | "completed";
  listId?: string;
  sent: number;
  responses: number;
  notes?: string;
}

export interface Activity {
  id: string;
  at: string;
  type: string;
  text: string;
  leadId?: string;
  propertyId?: string;
  buyerId?: string;
  userId: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  userId: string;
  entity: string;
  entityId: string;
  action: "create" | "update" | "delete" | "merge";
  changes?: Record<string, { from: unknown; to: unknown }>;
}

export interface D4DRoute {
  id: string;
  startedAt: string;
  endedAt?: string;
  points: [number, number, number][]; // lng, lat, epoch ms
  taggedPropertyIds: string[];
  userId: string;
}

export interface DocumentRecord {
  id: string;
  name: string;
  kind: "property_report" | "comp_report" | "deal_package" | "offer" | "contract" | "upload";
  leadId?: string;
  propertyId?: string;
  dispositionId?: string;
  createdAt: string;
  sizeKb?: number;
  /** Generated documents are regenerated on demand from current data */
  generated: boolean;
}

export interface MarketPreset {
  id: string;
  name: string;
  investorPct: number;
  wholesaleFee: number;
  buyerProfitPct: number;
  closingCostsBuyPct: number;
  closingCostsSellPct: number;
  agentPct: number;
  holdingMonths: number;
  holdingCostMonthly: number;
  financingPct: number;
  repairCostMultiplier: number;
  offerLowPct: number;
  offerTargetPct: number;
}

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  initials: string;
}

export type Role = "owner" | "admin" | "acquisitions" | "dispositions" | "assistant" | "read_only";
