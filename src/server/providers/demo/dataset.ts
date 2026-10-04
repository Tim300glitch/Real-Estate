// ════════════════════════════════════════════════════════════════════
// SYNTHETIC demo dataset — Sacramento region.
//
// Every record here is fabricated by a seeded generator for product
// demonstration. None of it describes a real parcel, owner, loan, sale,
// or distress event. All provenance entries carry `synthetic: true` and
// the UI labels them "Demo data". Replace with a licensed provider by
// setting PROPERTY_PROVIDER / COMPS_PROVIDER (see registry.ts).
// ════════════════════════════════════════════════════════════════════
import type {
  DistressFlags, MortgageInfo, OwnerEntity, OwnerInfo, PropertyRecord, PropertySummary, PropertyType,
  Provenance, SaleRecord, SourceKind, Confidence,
} from "@/lib/types";
import { FEATURED, type FeaturedSpec } from "@/lib/demo/featured";

// ─── deterministic PRNG ─────────────────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261004);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);
const ibetween = (a: number, b: number) => Math.floor(between(a, b + 1));
const chance = (p: number) => rnd() < p;

const TODAY = new Date();
TODAY.setUTCHours(12, 0, 0, 0);
export const DATA_AS_OF = new Date(TODAY.getTime() - 6 * 86400000).toISOString().slice(0, 10);
const isoDaysAgo = (d: number) => new Date(TODAY.getTime() - d * 86400000).toISOString().slice(0, 10);

// ─── provenance helpers ─────────────────────────────────────────────
const prov = (kind: SourceKind, source: string, asOf: string, confidence: Confidence, note?: string): Provenance =>
  ({ kind, source: `Demo · ${source}`, asOf, confidence, note, synthetic: true });

const SRC = {
  assessor: (asOf = DATA_AS_OF) => prov("public_record", "County Assessor", asOf, "high", "Assessor roll (synthetic)"),
  recorder: (asOf: string, doc?: string) => prov("public_record", "County Recorder", asOf, "high", doc ? `Recorded document ${doc}` : undefined),
  avm: () => prov("third_party", "AVM Provider", DATA_AS_OF, "medium", "Automated valuation model estimate — not an appraisal"),
  mortgageEst: () => prov("third_party", "Property Data Provider", DATA_AS_OF, "low", "Balance estimated by amortising recorded loan amount; actual payoff unknown"),
  tax: () => prov("public_record", "County Tax Collector", DATA_AS_OF, "high"),
  nod: (asOf: string) => prov("public_record", "County Recorder (NOD / NTS)", asOf, "high"),
  probate: (asOf: string) => prov("public_record", "Superior Court probate index", asOf, "medium", "Name match to decedent — verify"),
  vacancy: () => prov("third_party", "USPS vacancy indicator via provider", DATA_AS_OF, "medium", "Mail-delivery based; can lag reality"),
  code: () => prov("public_record", "City Code Enforcement", DATA_AS_OF, "medium"),
  liens: () => prov("public_record", "County Recorder (liens)", DATA_AS_OF, "medium"),
  calc: (note: string) => prov("calculated", "Calculated", DATA_AS_OF, "medium", note),
  mls: () => prov("mls", "MLS (not connected — simulated)", DATA_AS_OF, "low", "Requires licensed MLS/IDX access in production"),
};

// ─── reference data ─────────────────────────────────────────────────
interface Hood {
  name: string; city: string; zip: string; lat: number; lng: number; ppsf: number;
  years: [number, number]; sqft: [number, number]; lot: [number, number]; rows: number; cols: number;
  mix?: Partial<Record<PropertyType, number>>;
}

const HOODS: Hood[] = [
  { name: "Land Park", city: "Sacramento", zip: "95818", lat: 38.5530, lng: -121.4990, ppsf: 430, years: [1924, 1956], sqft: [1100, 2600], lot: [5200, 8500], rows: 9, cols: 5 },
  { name: "Curtis Park", city: "Sacramento", zip: "95818", lat: 38.5440, lng: -121.4825, ppsf: 415, years: [1920, 1950], sqft: [1000, 2300], lot: [4800, 7000], rows: 7, cols: 4 },
  { name: "Oak Park", city: "Sacramento", zip: "95817", lat: 38.5420, lng: -121.4600, ppsf: 335, years: [1908, 1962], sqft: [850, 1900], lot: [4000, 6500], rows: 9, cols: 5, mix: { duplex: 0.08, triplex: 0.02, lot: 0.03 } },
  { name: "Tahoe Park", city: "Sacramento", zip: "95820", lat: 38.5388, lng: -121.4345, ppsf: 305, years: [1942, 1960], sqft: [900, 1700], lot: [5000, 7000], rows: 8, cols: 5 },
  { name: "Hollywood Park", city: "Sacramento", zip: "95822", lat: 38.5235, lng: -121.4955, ppsf: 330, years: [1946, 1958], sqft: [950, 1650], lot: [5000, 6800], rows: 7, cols: 4 },
  { name: "Fruitridge Manor", city: "Sacramento", zip: "95824", lat: 38.5160, lng: -121.4420, ppsf: 268, years: [1950, 1966], sqft: [850, 1500], lot: [5200, 7200], rows: 7, cols: 5, mix: { duplex: 0.05, lot: 0.03 } },
  { name: "Florin", city: "Sacramento", zip: "95828", lat: 38.4935, lng: -121.4020, ppsf: 262, years: [1962, 1985], sqft: [1100, 1950], lot: [5500, 7500], rows: 8, cols: 5 },
  { name: "Valley Hi", city: "Sacramento", zip: "95823", lat: 38.4795, lng: -121.4455, ppsf: 258, years: [1968, 1992], sqft: [1050, 1900], lot: [5000, 7000], rows: 8, cols: 5, mix: { townhouse: 0.06 } },
  { name: "Meadowview", city: "Sacramento", zip: "95832", lat: 38.4870, lng: -121.4790, ppsf: 248, years: [1955, 1978], sqft: [950, 1650], lot: [5200, 7200], rows: 7, cols: 4 },
  { name: "Del Paso Heights", city: "Sacramento", zip: "95838", lat: 38.6380, lng: -121.4470, ppsf: 245, years: [1938, 1968], sqft: [750, 1450], lot: [5500, 9500], rows: 8, cols: 5, mix: { duplex: 0.06, lot: 0.06 } },
  { name: "North Highlands", city: "North Highlands", zip: "95660", lat: 38.6720, lng: -121.3780, ppsf: 258, years: [1952, 1972], sqft: [950, 1700], lot: [6000, 8500], rows: 9, cols: 5, mix: { duplex: 0.07, triplex: 0.02, fourplex: 0.02 } },
  { name: "Arden-Arcade", city: "Sacramento", zip: "95821", lat: 38.6050, lng: -121.3870, ppsf: 300, years: [1952, 1976], sqft: [1150, 2300], lot: [6500, 10500], rows: 9, cols: 5, mix: { condo: 0.05, fourplex: 0.02 } },
  { name: "Carmichael", city: "Carmichael", zip: "95608", lat: 38.6295, lng: -121.3250, ppsf: 342, years: [1955, 1988], sqft: [1250, 2600], lot: [7500, 14000], rows: 8, cols: 5 },
  { name: "Citrus Heights", city: "Citrus Heights", zip: "95610", lat: 38.6950, lng: -121.2895, ppsf: 292, years: [1968, 1996], sqft: [1100, 2100], lot: [6000, 9000], rows: 8, cols: 5, mix: { condo: 0.05 } },
  { name: "Rancho Cordova", city: "Rancho Cordova", zip: "95670", lat: 38.5895, lng: -121.2890, ppsf: 285, years: [1958, 2004], sqft: [1000, 2000], lot: [5500, 8000], rows: 8, cols: 5 },
  { name: "Rosemont", city: "Sacramento", zip: "95827", lat: 38.5500, lng: -121.3600, ppsf: 292, years: [1962, 1980], sqft: [1050, 1850], lot: [5500, 7500], rows: 7, cols: 5 },
  { name: "Natomas", city: "Sacramento", zip: "95834", lat: 38.6400, lng: -121.5000, ppsf: 290, years: [1996, 2016], sqft: [1300, 2800], lot: [4000, 6500], rows: 8, cols: 5, mix: { townhouse: 0.08, condo: 0.05 } },
  { name: "Elk Grove", city: "Elk Grove", zip: "95758", lat: 38.4180, lng: -121.4385, ppsf: 285, years: [1988, 2016], sqft: [1400, 3000], lot: [5000, 7500], rows: 9, cols: 5 },
];

const STREET_ROOTS = [
  "Alder", "Birch", "Cedar", "Dogwood", "Elm", "Fir", "Hawthorn", "Juniper", "Laurel", "Magnolia", "Oleander", "Poplar",
  "Redbud", "Sycamore", "Tamarack", "Walnut", "Willow", "Aspen", "Larkspur", "Primrose", "Marigold", "Heather", "Sage",
  "Ridgecrest", "Brookfield", "Fairway", "Glenwood", "Hillsdale", "Kingsley", "Lindale", "Meadowlark", "Northgate",
  "Orchard", "Parkcrest", "Quail", "Riverside", "Stonehaven", "Timberline", "Valley Oak", "Westbrook", "Yorktown",
  "Amber", "Bluebell", "Copper", "Driftwood", "Eastwood", "Foxglove", "Granite", "Harbor", "Ironwood", "Jasmine",
  "Kestrel", "Lantern", "Mesa", "Nutmeg", "Oriole", "Pinecone", "Rosewood", "Saddle", "Thistle", "Union", "Vista",
  "Whitney", "Arbor", "Bancroft", "Carlisle", "Dunmore", "Ellsworth", "Fremont", "Garnet", "Hedgerow", "Ivy",
];
const SUFFIX = ["St", "Ave", "Way", "Dr", "Ct", "Ln", "Cir", "Pl", "Rd"];
const FIRST = [
  "James", "Maria", "Robert", "Linda", "Michael", "Patricia", "David", "Jennifer", "William", "Elizabeth", "Richard", "Susan",
  "Joseph", "Jessica", "Thomas", "Karen", "Daniel", "Nancy", "Carlos", "Lisa", "Anthony", "Sandra", "Kevin", "Ashley",
  "Minh", "Mei", "Arjun", "Priya", "Luis", "Rosa", "Andre", "Keisha", "Viktor", "Olga", "Hiroshi", "Yuki", "Samuel",
  "Grace", "Tyrone", "Fatima", "Jorge", "Esperanza", "Dmitri", "Svetlana", "Wei", "Lan", "Rajesh", "Anita", "Earl",
  "Doris", "Clarence", "Bernice", "Harold", "Gloria", "Leonard", "Mildred", "Raymond", "Irene", "Dennis", "Carol",
];
const LAST = [
  "Nguyen", "Garcia", "Johnson", "Martinez", "Patel", "Kim", "Thompson", "Hernandez", "Lee", "Walker", "Lopez", "Wright",
  "Okafor", "Petrov", "Sandoval", "Chen", "Fitzgerald", "Kowalski", "Ramirez", "Washington", "Tran", "Singh", "Yamamoto",
  "Brennan", "Castillo", "Delgado", "Ellison", "Fong", "Gutierrez", "Halvorsen", "Ibarra", "Jensen", "Kaur", "Lindqvist",
  "Moreno", "Nakamura", "Olsen", "Pham", "Quintero", "Rossi", "Sato", "Turner", "Vargas", "Whitaker", "Xiong", "Yoder",
  "Zamora", "Abbott", "Bishop", "Crawford", "Dunham", "Everett", "Foster", "Grimes", "Holloway", "Ingram", "Jacobs",
  "Kessler", "Lombardi", "Mercer", "Novak", "Orozco", "Prescott", "Rasmussen", "Stroud", "Toscano", "Underwood", "Vance",
];
const LLC_ROOTS = ["Capitol", "River City", "Delta", "Sierra", "Golden State", "American River", "Midtown", "Gold Country",
  "Valley Oak", "Sutter", "Folsom Lake", "Pacific Crest", "Northgate", "Riverbend", "Granite Bay", "Two Rivers"];
const LLC_SUFFIX = ["Rentals LLC", "Holdings LLC", "Property Group LLC", "Homes LLC", "Investments LLC", "Real Estate LLC", "Capital LLC"];
const OUT_OF_STATE: { city: string; state: string; zip: string }[] = [
  { city: "Phoenix", state: "AZ", zip: "85018" }, { city: "Las Vegas", state: "NV", zip: "89123" }, { city: "Reno", state: "NV", zip: "89509" },
  { city: "Boise", state: "ID", zip: "83706" }, { city: "Portland", state: "OR", zip: "97214" }, { city: "Austin", state: "TX", zip: "78745" },
  { city: "Dallas", state: "TX", zip: "75214" }, { city: "Seattle", state: "WA", zip: "98118" }, { city: "Denver", state: "CO", zip: "80210" },
  { city: "Scottsdale", state: "AZ", zip: "85251" }, { city: "Honolulu", state: "HI", zip: "96816" }, { city: "Salt Lake City", state: "UT", zip: "84106" },
];
const IN_STATE: { city: string; zip: string }[] = [
  { city: "Roseville", zip: "95661" }, { city: "Folsom", zip: "95630" }, { city: "Davis", zip: "95616" }, { city: "San Jose", zip: "95125" },
  { city: "Oakland", zip: "94610" }, { city: "Walnut Creek", zip: "94596" }, { city: "Granite Bay", zip: "95746" }, { city: "Fresno", zip: "93711" },
];
const LENDERS = ["Wells Fargo Bank", "Chase", "Bank of America", "Golden 1 Credit Union", "Rocket Mortgage", "U.S. Bank", "PennyMac Loan Services",
  "Guild Mortgage", "SAFE Credit Union", "Freedom Mortgage", "loanDepot", "Mr. Cooper"];

// Approximate regional home-price index (current year = 1.0) used to back-cast historical sale prices.
const HPI: [number, number][] = [
  [1975, 0.08], [1980, 0.15], [1985, 0.19], [1990, 0.3], [1995, 0.24], [2000, 0.3], [2003, 0.47], [2005, 0.72], [2006, 0.74],
  [2008, 0.5], [2009, 0.38], [2011, 0.33], [2012, 0.32], [2013, 0.42], [2015, 0.52], [2017, 0.6], [2019, 0.66], [2020, 0.7],
  [2021, 0.86], [2022, 0.96], [2023, 0.91], [2024, 0.95], [2025, 0.98], [2026, 1.0], [2030, 1.0],
];
function hpi(yearFrac: number) {
  for (let i = 1; i < HPI.length; i++) {
    if (yearFrac <= HPI[i][0]) {
      const [y0, v0] = HPI[i - 1]; const [y1, v1] = HPI[i];
      return v0 + ((v1 - v0) * (yearFrac - y0)) / (y1 - y0);
    }
  }
  return 1;
}
const RATE_BY_YEAR = (y: number) => (y < 1990 ? 0.1 : y < 2000 ? 0.075 : y < 2008 ? 0.062 : y < 2020 ? 0.042 : y < 2022 ? 0.03 : 0.068);

function amortizedBalance(principal: number, annualRate: number, monthsElapsed: number, termMonths = 360) {
  const r = annualRate / 12;
  if (monthsElapsed >= termMonths) return 0;
  const pmt = (principal * r) / (1 - Math.pow(1 + r, -termMonths));
  return Math.max(0, principal * Math.pow(1 + r, monthsElapsed) - (pmt * (Math.pow(1 + r, monthsElapsed) - 1)) / r);
}

// ─── generation ─────────────────────────────────────────────────────
interface OwnerSeed { id: string; names: string[]; entity: OwnerEntity; mailing: { line1: string; city: string; state: string; zip: string } }

const investorOwners: OwnerSeed[] = Array.from({ length: 70 }, (_, i) => {
  const outState = chance(0.25);
  const loc = outState ? pick(OUT_OF_STATE) : { ...pick(IN_STATE), state: "CA" };
  const isLLC = chance(0.65);
  return {
    id: `own-inv-${i}`,
    names: [isLLC ? `${pick(LLC_ROOTS)} ${pick(LLC_SUFFIX)}` : `${pick(FIRST)} ${pick(LAST)}`],
    entity: isLLC ? "llc" : "individual",
    mailing: { line1: `${ibetween(100, 9999)} ${pick(STREET_ROOTS)} ${pick(SUFFIX)}${isLLC ? ` Ste ${ibetween(100, 400)}` : ""}`, ...loc },
  };
});

function typeFor(h: Hood): PropertyType {
  const r = rnd();
  let acc = 0;
  for (const [t, p] of Object.entries(h.mix ?? {})) {
    acc += p as number;
    if (r < acc) return t as PropertyType;
  }
  return "sfr";
}

function apnFor(zip: string, n: number) {
  const book = (parseInt(zip.slice(2), 10) * 7) % 300 + 10;
  return `${String(book).padStart(3, "0")}-${String(ibetween(10, 999)).padStart(4, "0")}-${String(n % 1000).padStart(3, "0")}-0000`;
}

const ALL: PropertyRecord[] = [];
let seq = 0;

function buildRecord(opts: {
  id: string; line1: string; hood: Hood | { name: string; city: string; zip: string }; lat: number; lng: number;
  parcel?: [number, number][]; type: PropertyType; beds: number | null; baths: number | null; sqft: number | null;
  lotSqft: number; yearBuilt: number | null; estValue: number; owner: OwnerSeed; occupied: boolean;
  sales: SaleRecord[]; mortgage: MortgageInfo | null; distress: DistressFlags; annualTax: number; units: number;
}): PropertyRecord {
  const { hood } = opts;
  const lastSale = opts.sales[0] ?? null;
  const est = opts.estValue;
  const bal = opts.mortgage?.estBalance ?? 0;
  const equity = est - bal;
  const yearsOwned = lastSale ? (TODAY.getTime() - new Date(lastSale.date).getTime()) / (365.25 * 86400000) : null;
  const ownerInfo: OwnerInfo = {
    ownerId: opts.owner.id,
    names: opts.owner.names,
    entityType: opts.owner.entity,
    mailing: opts.occupied ? { line1: opts.line1, city: hood.city, state: "CA", zip: hood.zip } : opts.owner.mailing,
    ownerOccupied: opts.occupied,
    absentee: !opts.occupied,
    outOfState: !opts.occupied && opts.owner.mailing.state !== "CA",
  };
  const vh: { date: string; value: number; source: string }[] = [];
  for (let m = 24; m >= 0; m -= 3) {
    const d = isoDaysAgo(m * 30.4 + 6);
    const yf = TODAY.getFullYear() + (TODAY.getMonth() - m) / 12;
    vh.push({ date: d, value: Math.round((est * hpi(yf)) / hpi(TODAY.getFullYear() + TODAY.getMonth() / 12) / 1000) * 1000, source: "Demo · AVM Provider" });
  }
  const provenance: Record<string, Provenance> = {
    address: SRC.assessor(), apn: SRC.assessor(), beds: SRC.assessor(), baths: SRC.assessor(), sqft: SRC.assessor(),
    lotSqft: SRC.assessor(), yearBuilt: SRC.assessor(), propertyType: SRC.assessor(), owner: SRC.assessor(),
    mailing: SRC.assessor(), ownerOccupied: SRC.calc("Mailing address compared with situs address (homeowner exemption where available)"),
    lastSale: lastSale ? lastSale.source : SRC.recorder(DATA_AS_OF),
    estValue: SRC.avm(),
    estMortgageBalance: opts.mortgage ? SRC.mortgageEst() : SRC.calc("No open mortgage found in recorded documents"),
    estEquity: SRC.calc("Estimated value − estimated open mortgage balance. Both inputs are estimates."),
    equityPct: SRC.calc("Estimated equity ÷ estimated value"),
    yearsOwned: SRC.calc("Today − last ownership transfer date"),
    tax: SRC.tax(),
    taxDelinquent: SRC.tax(),
    preForeclosure: SRC.nod(DATA_AS_OF),
    foreclosure: SRC.nod(DATA_AS_OF),
    probate: SRC.probate(DATA_AS_OF),
    vacant: SRC.vacancy(),
    codeViolations: SRC.code(),
    liens: SRC.liens(),
    inherited: SRC.calc("Derived from transfer document type (affidavit of death / trustee's deed)"),
    tiredLandlord: SRC.calc("Absentee + held 10+ yrs + at least one distress signal"),
    expiredListing: SRC.mls(),
    parcel: prov("public_record", "Parcel Provider", DATA_AS_OF, "medium", "Simplified parcel geometry"),
  };
  const rec: PropertyRecord = {
    id: opts.id, apn: apnFor(hood.zip, seq++),
    address: { line1: opts.line1, city: hood.city, state: "CA", zip: hood.zip, county: "Sacramento" },
    neighborhood: hood.name, lat: opts.lat, lng: opts.lng, parcel: opts.parcel,
    propertyType: opts.type, beds: opts.beds, baths: opts.baths, sqft: opts.sqft, lotSqft: opts.lotSqft, yearBuilt: opts.yearBuilt,
    units: opts.units, owner: ownerInfo, lastSale, sales: opts.sales,
    estValue: est, estMortgageBalance: opts.mortgage ? Math.round(bal) : 0, estEquity: Math.round(equity),
    equityPct: est ? Math.round((equity / est) * 1000) / 10 : null,
    freeAndClear: !opts.mortgage, yearsOwned: yearsOwned != null ? Math.round(yearsOwned * 10) / 10 : null,
    mortgages: opts.mortgage ? [opts.mortgage] : [],
    tax: { year: TODAY.getFullYear(), assessedValue: Math.round(est * between(0.35, 0.95) / 1000) * 1000, annualTax: opts.annualTax,
      delinquent: opts.distress.taxDelinquent, delinquentAmount: opts.distress.taxDelinquent ? Math.round(opts.annualTax * between(1, 2.6)) : 0, source: SRC.tax() },
    distress: opts.distress,
    valueHistory: vh,
    provenance,
    photos: [],
    motivationScore: 0,
  };
  return rec;
}

function makeSales(estValue: number, opts: { occupied: boolean; entity: OwnerEntity; forceRecent?: { monthsAgo: number; renovated: boolean } }): SaleRecord[] {
  const sales: SaleRecord[] = [];
  let date: Date;
  if (opts.forceRecent) {
    date = new Date(TODAY.getTime() - opts.forceRecent.monthsAgo * 30.44 * 86400000);
  } else {
    // ownership tenure distribution skewed toward long holds
    const yearsAgo = Math.min(48, Math.pow(rnd(), 1.35) * 40 + 0.3);
    date = new Date(TODAY.getTime() - yearsAgo * 365.25 * 86400000);
  }
  const yf = date.getFullYear() + date.getMonth() / 12;
  const factor = hpi(yf) / hpi(TODAY.getFullYear() + TODAY.getMonth() / 12);
  const renov = opts.forceRecent?.renovated ? between(1.12, 1.2) : 1;
  const price = Math.round((estValue * factor * renov * between(0.94, 1.05)) / 500) * 500;
  const cash = opts.entity === "llc" ? chance(0.7) : chance(0.18);
  const iso = date.toISOString().slice(0, 10);
  sales.push({ date: iso, price, docType: "Grant Deed", cash, armsLength: true, source: SRC.recorder(iso, `${date.getFullYear()}${String(ibetween(1, 99999)).padStart(5, "0")}`),
    dom: chance(0.7) ? ibetween(4, 75) : null });
  // one or two prior transfers
  let prev = date;
  for (let k = 0; k < ibetween(0, 2); k++) {
    const p = new Date(prev.getTime() - between(4, 14) * 365.25 * 86400000);
    if (p.getFullYear() < 1970) break;
    const f2 = hpi(p.getFullYear() + p.getMonth() / 12) / hpi(TODAY.getFullYear() + TODAY.getMonth() / 12);
    const iso2 = p.toISOString().slice(0, 10);
    sales.push({ date: iso2, price: Math.round((estValue * f2 * between(0.9, 1.05)) / 500) * 500, docType: "Grant Deed", cash: chance(0.15), armsLength: true,
      source: SRC.recorder(iso2), dom: null });
    prev = p;
  }
  return sales;
}

function generateHood(h: Hood) {
  const streetsEW = Array.from({ length: h.rows }, () => `${pick(STREET_ROOTS)} ${pick(SUFFIX)}`);
  const lotW = 0.00021; // ≈ 60 ft frontage in lng degrees at this latitude
  const blockH = 0.00125;
  const startLat = h.lat - (h.rows * blockH) / 2;
  const startLng = h.lng - (h.cols * 7 * lotW) / 2 - h.cols * 0.0002;
  for (let r = 0; r < h.rows; r++) {
    const street = streetsEW[r];
    const baseNo = ibetween(10, 80) * 100;
    const yLat = startLat + r * blockH;
    for (let c = 0; c < h.cols; c++) {
      for (let k = 0; k < 7; k++) {
        for (const side of [-1, 1] as const) {
          if (chance(0.07)) continue; // gaps: parks, schools, unbuilt lots
          const lng = startLng + c * (7 * lotW + 0.0004) + k * lotW + lotW / 2;
          const lat = yLat + side * 0.00022;
          const houseNo = baseNo + (c * 7 + k) * 4 + (side === 1 ? 1 : 0) * 1 + (side === 1 ? 0 : 2);
          const type = typeFor(h);
          const units = type === "duplex" ? 2 : type === "triplex" ? 3 : type === "fourplex" ? 4 : 1;
          const isLot = type === "lot" || type === "land";
          const sqft = isLot ? null : Math.round(between(h.sqft[0], h.sqft[1]) * (units > 1 ? 1.25 : type === "condo" ? 0.7 : 1) / 10) * 10;
          const beds = isLot ? null : Math.max(1, Math.min(6, Math.round((sqft! / 520) + between(-0.4, 0.6)))) * (units > 1 ? 1 : 1) + (units > 1 ? units : 0);
          const baths = isLot ? null : Math.max(1, Math.round(((sqft! / 800) + between(-0.3, 0.5)) * 2) / 2) + (units > 1 ? units - 1 : 0);
          const yearBuilt = isLot ? null : ibetween(h.years[0], h.years[1]);
          const lotSqft = Math.round(between(h.lot[0], h.lot[1]) / 10) * 10;
          const condition = between(0.82, 1.1);
          const estValue = isLot
            ? Math.round(lotSqft * between(9, 16) / 1000) * 1000
            : Math.round((sqft! * h.ppsf * condition * (units > 1 ? 0.88 : 1) * (type === "condo" ? 0.82 : 1)) / 1000) * 1000;

          const investor = chance(units > 1 ? 0.7 : 0.16);
          let owner: OwnerSeed;
          let occupied: boolean;
          if (investor) {
            owner = pick(investorOwners); occupied = false;
          } else {
            const ln = pick(LAST);
            const r2 = rnd();
            const entity: OwnerEntity = r2 < 0.12 ? "trust" : r2 < 0.14 ? "estate" : "individual";
            const names = entity === "trust" ? [`${pick(FIRST)} & ${pick(FIRST)} ${ln} Family Trust`]
              : entity === "estate" ? [`Estate of ${pick(FIRST)} ${ln}`]
              : chance(0.45) ? [`${pick(FIRST)} ${ln}`, `${pick(FIRST)} ${ln}`] : [`${pick(FIRST)} ${String.fromCharCode(65 + ibetween(0, 25))}. ${ln}`];
            occupied = entity === "estate" ? false : chance(0.84);
            const outState = !occupied && chance(0.3);
            const loc = outState ? pick(OUT_OF_STATE) : { ...pick(IN_STATE), state: "CA" };
            owner = { id: `own-${seq}-${ibetween(1000, 9999)}`, names, entity,
              mailing: { line1: `${ibetween(100, 9999)} ${pick(STREET_ROOTS)} ${pick(SUFFIX)}`, ...loc } };
          }

          const recent = !isLot && chance(0.13);
          const sales = makeSales(estValue, { occupied, entity: owner.entity, forceRecent: recent ? { monthsAgo: between(0.3, 24), renovated: chance(0.55) } : undefined });
          const last = sales[0];
          const yearsHeld = (TODAY.getTime() - new Date(last.date).getTime()) / (365.25 * 86400000);
          let mortgage: MortgageInfo | null = null;
          if (!last.cash && yearsHeld < 30 && !(yearsHeld > 14 && chance(0.4))) {
            const orig = Math.round((last.price ?? estValue) * between(0.7, 0.95) / 100) * 100;
            const y = new Date(last.date).getFullYear();
            const refi = yearsHeld > 6 && chance(0.35);
            const principal = refi ? Math.round(estValue * between(0.35, 0.6) / 100) * 100 : orig;
            const monthsElapsed = refi ? between(12, 60) : yearsHeld * 12;
            mortgage = {
              lender: pick(LENDERS), originalAmount: principal,
              recordedOn: refi ? isoDaysAgo(monthsElapsed * 30.4) : last.date,
              estBalance: Math.round(amortizedBalance(principal, RATE_BY_YEAR(refi ? 2021 : y), monthsElapsed)),
              loanType: chance(0.8) ? "Conventional" : "FHA", source: SRC.mortgageEst(),
            };
          }
          const absentee = !occupied;
          const vacantKnown = chance(0.93);
          const distress: DistressFlags = {
            taxDelinquent: chance(absentee ? 0.06 : 0.025),
            preForeclosure: mortgage ? chance(0.018) : false,
            foreclosure: false,
            auctionDate: null,
            probate: owner.entity === "estate" ? true : chance(0.006),
            vacant: vacantKnown ? chance(absentee ? 0.09 : 0.012) : null,
            codeViolations: chance(0.96) ? (chance(absentee ? 0.07 : 0.025) ? ibetween(1, 3) : 0) : null,
            liens: chance(0.05) ? ibetween(1, 2) : 0,
            inherited: owner.entity === "estate" || chance(0.01),
            tiredLandlord: false,
            expiredListing: chance(0.01),
          };
          if (distress.preForeclosure && chance(0.5)) distress.auctionDate = isoDaysAgo(-ibetween(20, 90));
          distress.tiredLandlord = absentee && yearsHeld >= 10 && (!!distress.codeViolations || !!distress.taxDelinquent || !!distress.vacant || units > 1);
          if (distress.inherited && sales[0]) {
            sales.unshift({ date: isoDaysAgo(ibetween(60, 700)), price: null, docType: "Affidavit of Death of Joint Tenant", cash: null, armsLength: false, source: SRC.recorder(DATA_AS_OF), dom: null });
          }
          // parcel rectangle extending away from street
          const depth = 0.00034;
          const x0 = lng - lotW / 2 + 0.000005, x1 = lng + lotW / 2 - 0.000005;
          const y0 = side === 1 ? lat - 0.00002 : lat + 0.00002;
          const y1 = side === 1 ? lat + depth : lat - depth;
          const parcel: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
          const pinLat = side === 1 ? lat + depth * 0.35 : lat - depth * 0.35;

          ALL.push(buildRecord({
            id: `p-${h.zip}-${ALL.length}`, line1: `${houseNo} ${street}`, hood: h, lat: pinLat, lng, parcel, type,
            beds, baths, sqft, lotSqft, yearBuilt, estValue, owner, occupied, sales, mortgage, distress,
            annualTax: Math.round(Math.max(800, estValue * hpi(new Date(last.date).getFullYear()) * 0.0112 + between(-150, 400))), units,
          }));
        }
      }
    }
  }
}

function plantFeatured(f: FeaturedSpec) {
  const hood = HOODS.find((h) => h.name === f.neighborhood) ?? { name: f.neighborhood, city: f.city, zip: f.zip };
  const owner: OwnerSeed = { id: `own-${f.id}`, names: f.owner.names, entity: f.owner.entity, mailing: f.owner.mailing };
  const ls = f.lastSale;
  const sales: SaleRecord[] = [{ date: ls.date, price: ls.price, docType: ls.docType, cash: ls.cash, armsLength: ls.price != null, source: SRC.recorder(ls.date, `${ls.date.slice(0, 4)}0${f.id.length}4417`), dom: null }];
  const mortgage: MortgageInfo | null = f.mortgageBalance != null
    ? { lender: f.lender ?? null, originalAmount: f.originalLoan ?? null, recordedOn: ls.date, estBalance: f.mortgageBalance, loanType: "Conventional", source: SRC.mortgageEst() }
    : null;
  const d = f.distress;
  const distress: DistressFlags = {
    taxDelinquent: d.taxDelinquent ?? false, preForeclosure: d.preForeclosure ?? false, foreclosure: d.foreclosure ?? false,
    auctionDate: d.auctionDate ?? null, probate: d.probate ?? false, vacant: d.vacant ?? false, codeViolations: d.codeViolations ?? 0,
    liens: d.liens ?? 0, inherited: d.inherited ?? false, tiredLandlord: d.tiredLandlord ?? false, expiredListing: false,
  };
  const lotW = 0.00021, depth = 0.00034;
  const parcel: [number, number][] = [[f.lng - lotW / 2, f.lat - depth / 2], [f.lng + lotW / 2, f.lat - depth / 2], [f.lng + lotW / 2, f.lat + depth / 2], [f.lng - lotW / 2, f.lat + depth / 2], [f.lng - lotW / 2, f.lat - depth / 2]];
  const rec = buildRecord({
    id: f.id, line1: f.line1, hood: { ...hood, city: f.city, zip: f.zip }, lat: f.lat, lng: f.lng, parcel, type: f.type,
    beds: f.beds, baths: f.baths, sqft: f.sqft, lotSqft: f.lotSqft, yearBuilt: f.yearBuilt, estValue: f.estValue, owner,
    occupied: f.owner.occupied, sales, mortgage, distress, annualTax: f.annualTax, units: f.type === "duplex" ? 2 : 1,
  });
  if (distress.preForeclosure) rec.provenance.preForeclosure = SRC.nod(isoDaysAgo(74));
  if (distress.probate) rec.provenance.probate = SRC.probate(isoDaysAgo(190));
  ALL.push(rec);

  // Plant comparable sales around the featured subject (renovated + as-is) so comps work
  const ppsf = f.targetArv / f.sqft;
  const nearbyStreets = Array.from({ length: 6 }, () => `${pick(STREET_ROOTS)} ${pick(SUFFIX)}`);
  const plan = [
    ...Array.from({ length: 6 }, () => ({ renovated: true })),
    ...Array.from({ length: 3 }, () => ({ renovated: false })),
    { renovated: true, far: true },
  ];
  plan.forEach((p, i) => {
    const angle = between(0, Math.PI * 2);
    const miles = "far" in p ? between(0.75, 1.4) : between(0.12, 0.62);
    const lat = f.lat + (miles / 69) * Math.sin(angle);
    const lng = f.lng + (miles / (69.172 * Math.cos((f.lat * Math.PI) / 180))) * Math.cos(angle);
    const sqftC = Math.round(f.sqft * (p.renovated ? between(0.93, 1.08) : between(0.87, 1.14)) / 10) * 10;
    const monthsAgo = !p.renovated ? between(6.5, 11) : i === 2 ? between(7, 10) : between(0.4, 5.6);
    const price = p.renovated
      ? Math.round((sqftC * ppsf * between(0.95, 1.05)) / 500) * 500
      : Math.round((sqftC * ppsf * between(0.72, 0.82)) / 500) * 500;
    const date = new Date(TODAY.getTime() - monthsAgo * 30.44 * 86400000).toISOString().slice(0, 10);
    const cOwner: OwnerSeed = { id: `own-c-${f.id}-${i}`, names: [`${pick(FIRST)} ${pick(LAST)}`], entity: "individual", mailing: { line1: "", city: f.city, state: "CA", zip: f.zip } };
    const compSales: SaleRecord[] = [
      { date, price, docType: "Grant Deed", cash: !p.renovated && chance(0.6), armsLength: true, source: SRC.recorder(date, `${date.slice(0, 4)}${ibetween(10000, 99999)}`), dom: ibetween(5, 48) },
      { date: isoDaysAgo(ibetween(2500, 9000)), price: Math.round(price * between(0.3, 0.55) / 500) * 500, docType: "Grant Deed", cash: false, armsLength: true, source: SRC.recorder(DATA_AS_OF), dom: null },
    ];
    const rec2 = buildRecord({
      id: `c-${f.id}-${i}`, line1: `${ibetween(10, 89) * 100 + ibetween(1, 98)} ${nearbyStreets[i % nearbyStreets.length]}`,
      hood: { ...hood, city: f.city, zip: f.zip }, lat, lng, type: f.type,
      beds: Math.max(1, f.beds + (chance(0.25) ? (chance(0.5) ? 1 : -1) : 0)), baths: Math.max(1, f.baths + (chance(0.2) ? 0.5 : 0)),
      sqft: sqftC, lotSqft: Math.round(f.lotSqft * between(0.85, 1.2) / 10) * 10, yearBuilt: f.yearBuilt + ibetween(-6, 6),
      estValue: Math.round(price * 1.01 / 1000) * 1000, owner: cOwner, occupied: true, sales: compSales, mortgage: null,
      distress: { taxDelinquent: false, preForeclosure: false, foreclosure: false, auctionDate: null, probate: false, vacant: false, codeViolations: 0, liens: 0, inherited: false, tiredLandlord: false, expiredListing: false },
      annualTax: Math.round(price * 0.0112), units: 1,
    });
    rec2.lastSale!.dom = compSales[0].dom;
    ALL.push(rec2);
  });
}

for (const h of HOODS) generateHood(h);
for (const f of FEATURED) plantFeatured(f);

// ─── derived: owner portfolios, motivation, summaries ───────────────
export const OWNER_INDEX = new Map<string, string[]>();
for (const p of ALL) {
  const list = OWNER_INDEX.get(p.owner.ownerId) ?? [];
  list.push(p.id);
  OWNER_INDEX.set(p.owner.ownerId, list);
}
for (const p of ALL) p.owner.portfolioCount = OWNER_INDEX.get(p.owner.ownerId)!.length;

export const PROPERTIES = ALL;
export const BY_ID = new Map(ALL.map((p) => [p.id, p]));

export function toSummary(p: PropertyRecord): PropertySummary {
  return {
    id: p.id, apn: p.apn, line1: p.address.line1, city: p.address.city, state: p.address.state, zip: p.address.zip,
    county: p.address.county ?? "", neighborhood: p.neighborhood, lat: p.lat, lng: p.lng, propertyType: p.propertyType,
    beds: p.beds, baths: p.baths, sqft: p.sqft, lotSqft: p.lotSqft, yearBuilt: p.yearBuilt, estValue: p.estValue,
    equityPct: p.equityPct, estEquity: p.estEquity, yearsOwned: p.yearsOwned, ownerName: p.owner.names.join(" & "),
    ownerEntity: p.owner.entityType, absentee: p.owner.absentee, outOfState: p.owner.outOfState, ownerOccupied: p.owner.ownerOccupied,
    freeAndClear: p.freeAndClear, lastSalePrice: p.sales.find((s) => s.price != null)?.price ?? null,
    lastSaleDate: p.lastSale?.date ?? null, lastSaleCash: p.lastSale?.cash ?? null, distress: p.distress,
    motivationScore: p.motivationScore, synthetic: true,
  };
}

// spatial grid index (0.01° buckets) for fast bbox queries
export const GRID = new Map<string, PropertyRecord[]>();
export const gridKey = (lng: number, lat: number) => `${Math.floor(lng * 100)}:${Math.floor(lat * 100)}`;
for (const p of ALL) {
  const k = gridKey(p.lng, p.lat);
  const b = GRID.get(k) ?? [];
  b.push(p);
  GRID.set(k, b);
}

export const HOOD_LIST = HOODS.map((h) => ({ name: h.name, city: h.city, zip: h.zip, lat: h.lat, lng: h.lng }));
