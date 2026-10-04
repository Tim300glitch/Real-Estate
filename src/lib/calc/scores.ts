// ════════════════════════════════════════════════════════════════════
// Transparent scoring. No ML, no hidden certainty: each score is a sum
// of named factors with configurable weights, and every factor reports
// the data it used and where that data came from.
// ════════════════════════════════════════════════════════════════════
import type { Buyer, PropertySummary, Seller } from "../types";

// ─── Motivation score (seller likelihood to sell) ───────────────────

export interface MotivationWeights {
  vacant: number; absentee: number; outOfState: number; taxDelinquent: number; longTermOwner: number;
  highEquity: number; inherited: number; codeViolations: number; preForeclosure: number;
  tiredLandlord: number; liens: number; freeAndClear: number; sellerQuickSale: number; sellerStated: number;
}

export const DEFAULT_MOTIVATION_WEIGHTS: MotivationWeights = {
  vacant: 16, absentee: 8, outOfState: 6, taxDelinquent: 16, longTermOwner: 10, highEquity: 10,
  inherited: 16, codeViolations: 8, preForeclosure: 20, tiredLandlord: 10, liens: 6, freeAndClear: 4,
  sellerQuickSale: 15, sellerStated: 15,
};

export interface ScoreFactor {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
  origin: "property data" | "seller-stated" | "calculated" | "user-entered";
  available: boolean;
}

export interface MotivationResult {
  score: number;
  factors: ScoreFactor[];
  label: "Very High" | "High" | "Moderate" | "Low";
}

export function motivationScore(p: PropertySummary, seller?: Seller | null, w: MotivationWeights = DEFAULT_MOTIVATION_WEIGHTS): MotivationResult {
  const f: ScoreFactor[] = [];
  const flag = (key: string, label: string, val: boolean | null, max: number, detailYes: string) =>
    f.push({ key, label, max, points: val ? max : 0, available: val !== null, origin: "property data",
      detail: val === null ? "not available from connected sources" : val ? detailYes : "no" });

  flag("vacant", "Vacancy indicator", p.distress.vacant, w.vacant, "vacancy indicator present (USPS/provider)");
  flag("absentee", "Absentee owner", p.absentee, w.absentee, "mailing address differs from property");
  flag("outOfState", "Out-of-state owner", p.outOfState, w.outOfState, "mailing address in another state");
  flag("taxDelinquent", "Tax delinquent", p.distress.taxDelinquent, w.taxDelinquent, "delinquent property taxes on record");
  const yo = p.yearsOwned;
  f.push({ key: "longTermOwner", label: "Long-term ownership", max: w.longTermOwner, available: yo != null, origin: "property data",
    points: yo == null ? 0 : yo >= 15 ? w.longTermOwner : yo >= 10 ? w.longTermOwner * 0.6 : 0,
    detail: yo == null ? "unknown" : `owned ${yo.toFixed(0)} years (≥15 full, ≥10 partial)` });
  const eq = p.equityPct;
  f.push({ key: "highEquity", label: "High equity", max: w.highEquity, available: eq != null, origin: "calculated",
    points: eq == null ? 0 : eq >= 60 ? w.highEquity : eq >= 40 ? w.highEquity * 0.5 : 0,
    detail: eq == null ? "unknown" : `est. ${eq.toFixed(0)}% equity (estimate, ≥60% full, ≥40% partial)` });
  flag("inherited", "Inherited / probate", p.distress.probate || p.distress.inherited ? true : p.distress.probate === null && p.distress.inherited === null ? null : false, w.inherited, "probate filing or inherited transfer recorded");
  f.push({ key: "codeViolations", label: "Code violations", max: w.codeViolations, available: p.distress.codeViolations != null, origin: "property data",
    points: (p.distress.codeViolations ?? 0) > 0 ? w.codeViolations : 0,
    detail: p.distress.codeViolations == null ? "not available" : `${p.distress.codeViolations} open case(s)` });
  flag("preForeclosure", "Pre-foreclosure", p.distress.preForeclosure, w.preForeclosure, "notice of default / lis pendens recorded");
  flag("tiredLandlord", "Tired-landlord indicators", p.distress.tiredLandlord, w.tiredLandlord, "non-owner-occupied rental held long-term with distress signals");
  f.push({ key: "liens", label: "Liens", max: w.liens, available: p.distress.liens != null, origin: "property data",
    points: (p.distress.liens ?? 0) > 0 ? w.liens : 0, detail: p.distress.liens == null ? "not available" : `${p.distress.liens} lien(s)` });
  flag("freeAndClear", "Free & clear", p.freeAndClear, w.freeAndClear, "no open mortgage on record (estimate)");

  if (seller) {
    const quick = /asap|30|immediately|quick|fast|week|2 week|this month/i.test(seller.timeline || "");
    f.push({ key: "sellerQuickSale", label: "Seller wants quick sale", max: w.sellerQuickSale, available: !!seller.timeline, origin: "seller-stated",
      points: quick ? w.sellerQuickSale : 0, detail: seller.timeline ? `timeline: “${seller.timeline}”` : "not asked yet" });
    f.push({ key: "sellerStated", label: "Seller motivation (rep-assessed)", max: w.sellerStated, available: true, origin: "user-entered",
      points: ((seller.motivation - 1) / 4) * w.sellerStated, detail: `${seller.motivation}/5 rated by rep` });
  }

  const raw = f.reduce((s, x) => s + x.points, 0);
  const score = Math.min(100, Math.round(raw));
  const label = score >= 70 ? "Very High" : score >= 50 ? "High" : score >= 30 ? "Moderate" : "Low";
  return { score, factors: f, label };
}

// ─── Deal score (opportunity quality, separate from motivation) ─────

export interface DealScoreWeights {
  equity: number; motivation: number; discount: number; repairComplexity: number; salesActivity: number;
  compQuality: number; buyerDemand: number; assignmentFee: number; daysOnMarket: number; condition: number; title: number;
}

export const DEFAULT_DEAL_WEIGHTS: DealScoreWeights = {
  equity: 10, motivation: 15, discount: 15, repairComplexity: 10, salesActivity: 8, compQuality: 12,
  buyerDemand: 10, assignmentFee: 12, daysOnMarket: 3, condition: 5, title: 5,
};

export interface DealScoreInput {
  equityPct: number | null;
  motivation: number | null;
  arv: number | null;
  targetOffer: number | null;
  repairs: number | null;
  compsInArea: number | null;   // count of nearby sales in window
  avgCompSimilarity: number | null;
  matchedBuyers: number | null; // buyers ≥70% match
  feeAtTarget: number | null;
  desiredFee: number;
  dom: number | null;           // only with MLS
  conditionRating: number | null; // 1 (poor) – 5 (good), from walkthrough / seller
  titleFlags: string[];          // probate, liens, multiple owners…
}

export interface DealScoreFactor {
  key: keyof DealScoreWeights;
  label: string;
  value: number | null; // 0..1
  weight: number;
  detail: string;
}

export interface DealScoreResult {
  score: number;
  label: "Excellent Opportunity" | "Strong" | "Marginal" | "Weak";
  factors: DealScoreFactor[];
  coverage: number; // share of weight that had data
}

const c01 = (n: number) => Math.max(0, Math.min(1, n));

export function dealScore(i: DealScoreInput, w: DealScoreWeights = DEFAULT_DEAL_WEIGHTS): DealScoreResult {
  const discount = i.arv && i.targetOffer ? (i.arv - i.targetOffer) / i.arv : null;
  const repairPct = i.arv && i.repairs != null ? i.repairs / i.arv : null;
  const factors: DealScoreFactor[] = [
    { key: "equity", label: "Equity", weight: w.equity, value: i.equityPct == null ? null : c01(i.equityPct / 70),
      detail: i.equityPct == null ? "unknown" : `${i.equityPct.toFixed(0)}% est. equity (70%+ = full)` },
    { key: "motivation", label: "Seller motivation", weight: w.motivation, value: i.motivation == null ? null : i.motivation / 100,
      detail: i.motivation == null ? "unknown" : `motivation score ${i.motivation}/100` },
    { key: "discount", label: "Discount to ARV", weight: w.discount, value: discount == null ? null : c01((discount - 0.2) / 0.2),
      detail: discount == null ? "needs ARV + offer" : `target offer is ${(discount * 100).toFixed(0)}% below ARV (20% = 0, 40% = full)` },
    { key: "repairComplexity", label: "Repair complexity", weight: w.repairComplexity, value: repairPct == null ? null : c01(1 - (repairPct - 0.05) / 0.3),
      detail: repairPct == null ? "no repair estimate" : `repairs ${(repairPct * 100).toFixed(0)}% of ARV (≤5% = full, ≥35% = 0)` },
    { key: "salesActivity", label: "Neighborhood sales activity", weight: w.salesActivity, value: i.compsInArea == null ? null : c01(i.compsInArea / 8),
      detail: i.compsInArea == null ? "comps not run" : `${i.compsInArea} nearby sales in window (8+ = full)` },
    { key: "compQuality", label: "Comp quality", weight: w.compQuality, value: i.avgCompSimilarity == null ? null : c01((i.avgCompSimilarity - 50) / 45),
      detail: i.avgCompSimilarity == null ? "no comps selected" : `avg similarity ${i.avgCompSimilarity.toFixed(0)}% (50% = 0, 95% = full)` },
    { key: "buyerDemand", label: "Buyer demand", weight: w.buyerDemand, value: i.matchedBuyers == null ? null : c01(i.matchedBuyers / 5),
      detail: i.matchedBuyers == null ? "no buyer data" : `${i.matchedBuyers} buyers match ≥70% (5+ = full)` },
    { key: "assignmentFee", label: "Expected assignment fee", weight: w.assignmentFee, value: i.feeAtTarget == null ? null : c01(i.feeAtTarget / (i.desiredFee * 1.5)),
      detail: i.feeAtTarget == null ? "needs analysis" : `$${Math.round(i.feeAtTarget).toLocaleString()} spread at target (1.5× desired fee = full)` },
    { key: "daysOnMarket", label: "Days on market", weight: w.daysOnMarket, value: i.dom == null ? null : c01(i.dom / 90),
      detail: i.dom == null ? "off-market / MLS not connected" : `${i.dom} DOM` },
    { key: "condition", label: "Property condition", weight: w.condition, value: i.conditionRating == null ? null : c01((5 - i.conditionRating) / 4 * 0.5 + 0.5),
      detail: i.conditionRating == null ? "no walkthrough yet" : `condition ${i.conditionRating}/5 (distress = opportunity, capped)` },
    { key: "title", label: "Title complexity", weight: w.title, value: c01(1 - i.titleFlags.length * 0.35),
      detail: i.titleFlags.length ? `flags: ${i.titleFlags.join(", ")}` : "no known title flags (not a title search)" },
  ];
  let num = 0, den = 0, all = 0;
  for (const f of factors) {
    all += f.weight;
    if (f.value == null) continue;
    num += f.value * f.weight;
    den += f.weight;
  }
  const score = den ? Math.round((num / den) * 100) : 0;
  const label = score >= 80 ? "Excellent Opportunity" : score >= 65 ? "Strong" : score >= 50 ? "Marginal" : "Weak";
  return { score, label, factors, coverage: all ? den / all : 0 };
}

// ─── Buyer matching ─────────────────────────────────────────────────

export interface MatchDeal {
  zip: string;
  city: string;
  propertyType: PropertySummary["propertyType"];
  beds: number | null;
  price: number;        // buyer purchase price (contract + fee)
  repairs: number;
  arv: number;
}

export interface BuyerMatch {
  buyer: Buyer;
  score: number;
  reasons: { label: string; ok: boolean | "partial"; points: number; max: number; detail: string }[];
}

const REHAB_LEVEL = { cosmetic: 0.08, moderate: 0.18, heavy: 0.3, full_gut: 1 } as const;

export function matchBuyer(b: Buyer, d: MatchDeal, now = new Date()): BuyerMatch {
  const reasons: BuyerMatch["reasons"] = [];
  const zipOk = b.zips.includes(d.zip);
  const mktOk = b.markets.some((m) => m.toLowerCase() === d.city.toLowerCase());
  reasons.push({ label: "Location", ok: zipOk ? true : mktOk ? "partial" : false, max: 30, points: zipOk ? 30 : mktOk ? 18 : 0,
    detail: zipOk ? `buys in ${d.zip}` : mktOk ? `buys in ${d.city} (ZIP not listed)` : "outside buy box" });
  const typeOk = b.propertyTypes.includes(d.propertyType);
  reasons.push({ label: "Property type", ok: typeOk, max: 20, points: typeOk ? 20 : 0, detail: typeOk ? "type match" : `doesn't list ${d.propertyType}` });
  const inRange = d.price >= b.minPrice && d.price <= b.maxPrice;
  const near = d.price >= b.minPrice * 0.9 && d.price <= b.maxPrice * 1.1;
  reasons.push({ label: "Price range", ok: inRange ? true : near ? "partial" : false, max: 20, points: inRange ? 20 : near ? 10 : 0,
    detail: `$${Math.round(b.minPrice / 1000)}k–$${Math.round(b.maxPrice / 1000)}k vs $${Math.round(d.price / 1000)}k` });
  const rehabPct = d.arv ? d.repairs / d.arv : 0;
  const tol = REHAB_LEVEL[b.rehabTolerance];
  const rehabOk = rehabPct <= tol;
  reasons.push({ label: "Rehab tolerance", ok: rehabOk ? true : rehabPct <= tol * 1.3 ? "partial" : false, max: 15,
    points: rehabOk ? 15 : rehabPct <= tol * 1.3 ? 7 : 0, detail: `${(rehabPct * 100).toFixed(0)}% of ARV vs ${b.rehabTolerance.replace("_", " ")}` });
  const days = (now.getTime() - new Date(b.lastActivityAt).getTime()) / 86400000;
  reasons.push({ label: "Recent activity", ok: days <= 30 ? true : days <= 90 ? "partial" : false, max: 10,
    points: days <= 30 ? 10 : days <= 90 ? 5 : 0, detail: `last active ${Math.round(days)} days ago` });
  const bedsOk = d.beds == null || d.beds >= b.minBeds;
  const pof = !!b.pofVerifiedAt;
  reasons.push({ label: "Beds / POF / reliability", ok: bedsOk && pof && b.reliability >= 4 ? true : bedsOk ? "partial" : false, max: 5,
    points: (bedsOk ? 2 : 0) + (pof ? 2 : 0) + (b.reliability >= 4 ? 1 : 0),
    detail: `${bedsOk ? "beds ok" : `needs ${b.minBeds}+ beds`} · ${pof ? "POF verified" : "no POF"} · reliability ${b.reliability}/5` });
  const score = reasons.reduce((s, r) => s + r.points, 0);
  return { buyer: b, score, reasons };
}

export function matchBuyers(buyers: Buyer[], d: MatchDeal): BuyerMatch[] {
  return buyers.map((b) => matchBuyer(b, d)).sort((a, b) => b.score - a.score);
}
