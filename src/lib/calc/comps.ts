// ════════════════════════════════════════════════════════════════════
// Comp Engine — similarity scoring + ARV methods. Pure functions, no I/O.
// Every number produced here is accompanied by the formula used, so the
// UI can show its work ("No black box").
// ════════════════════════════════════════════════════════════════════
import { haversineMiles } from "../geo";
import type {
  ArvMethodKey, CompCandidate, CompCriteria, CompEntry, PropertySummary, SimilarityWeights,
} from "../types";

export const DEFAULT_CRITERIA: CompCriteria = {
  radiusMiles: 0.5,
  months: 6,
  sameType: true,
  sqftTolerancePct: 20,
  bedTolerance: 1,
  bathTolerance: 1,
  yearTolerance: 15,
  lotTolerancePct: 40,
  maxResults: 40,
};

export const RADIUS_OPTIONS = [0.25, 0.5, 1, 2, 3];
export const MONTH_OPTIONS = [3, 6, 12, 18, 24];

export const DEFAULT_WEIGHTS: SimilarityWeights = {
  distance: 25,
  sqft: 25,
  bedsBaths: 15,
  yearBuilt: 10,
  lotSize: 5,
  recency: 15,
  propertyType: 5,
};

export type SubjectLike = Pick<
  PropertySummary,
  "lat" | "lng" | "propertyType" | "beds" | "baths" | "sqft" | "lotSqft" | "yearBuilt"
>;

export type Grade = "Exact" | "Excellent" | "Good" | "Similar" | "Recent" | "Fair" | "Poor" | "N/A";

export interface SimilarityPart {
  key: keyof SimilarityWeights;
  label: string;
  score: number | null; // 0..1, null = missing data (excluded from weighting)
  grade: Grade;
  detail: string;
}

export interface Similarity {
  score: number; // 0..100
  parts: SimilarityPart[];
  distanceMiles: number;
  monthsAgo: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const grade = (s: number | null, exact = false): Grade =>
  s === null ? "N/A" : exact && s === 1 ? "Exact" : s >= 0.85 ? "Excellent" : s >= 0.7 ? "Good" : s >= 0.5 ? "Fair" : "Poor";

export function monthsBetween(isoDate: string, now = new Date()): number {
  const d = new Date(isoDate);
  return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

export function compSimilarity(subject: SubjectLike, comp: CompCandidate, now = new Date()): Similarity {
  const dist = haversineMiles([subject.lng, subject.lat], [comp.lng, comp.lat]);
  const months = monthsBetween(comp.saleDate, now);
  const parts: SimilarityPart[] = [];

  const sDist = clamp01(1 - dist / 2);
  parts.push({ key: "distance", label: "Distance", score: sDist, grade: grade(sDist), detail: `${dist.toFixed(2)} mi (0 mi = 100%, 2 mi = 0%)` });

  if (subject.sqft && comp.sqft) {
    const d = Math.abs(comp.sqft - subject.sqft) / subject.sqft;
    const s = clamp01(1 - d / 0.35);
    parts.push({ key: "sqft", label: "Sq Ft", score: s, grade: grade(s), detail: `${comp.sqft.toLocaleString()} vs ${subject.sqft.toLocaleString()} (${(d * 100).toFixed(0)}% diff)` });
  } else parts.push({ key: "sqft", label: "Sq Ft", score: null, grade: "N/A", detail: "missing square footage" });

  if (subject.beds != null && comp.beds != null && subject.baths != null && comp.baths != null) {
    const db = Math.abs(comp.beds - subject.beds);
    const dba = Math.abs(comp.baths - subject.baths);
    const s = clamp01(1 - (db + dba * 0.5) / 2.5);
    parts.push({ key: "bedsBaths", label: "Beds/Baths", score: s, grade: grade(s, true), detail: `${comp.beds}bd/${comp.baths}ba vs ${subject.beds}bd/${subject.baths}ba` });
  } else parts.push({ key: "bedsBaths", label: "Beds/Baths", score: null, grade: "N/A", detail: "missing bed/bath count" });

  if (subject.yearBuilt && comp.yearBuilt) {
    const d = Math.abs(comp.yearBuilt - subject.yearBuilt);
    const s = clamp01(1 - d / 40);
    parts.push({ key: "yearBuilt", label: "Year Built", score: s, grade: d <= 5 ? (d === 0 ? "Exact" : "Similar") : grade(s), detail: `${comp.yearBuilt} vs ${subject.yearBuilt} (${d} yrs)` });
  } else parts.push({ key: "yearBuilt", label: "Year Built", score: null, grade: "N/A", detail: "missing year built" });

  if (subject.lotSqft && comp.lotSqft) {
    const d = Math.abs(comp.lotSqft - subject.lotSqft) / subject.lotSqft;
    const s = clamp01(1 - d / 0.6);
    parts.push({ key: "lotSize", label: "Lot Size", score: s, grade: d <= 0.15 ? ("Similar") : grade(s), detail: `${comp.lotSqft.toLocaleString()} vs ${subject.lotSqft.toLocaleString()} sf (${(d * 100).toFixed(0)}%)` });
  } else parts.push({ key: "lotSize", label: "Lot Size", score: null, grade: "N/A", detail: "missing lot size" });

  const sRec = clamp01(1 - months / 24);
  parts.push({ key: "recency", label: "Sale Date", score: sRec, grade: months <= 3 ? ("Recent") : grade(sRec), detail: `${months.toFixed(1)} months ago` });

  const sType = comp.propertyType === subject.propertyType ? 1 : 0.3;
  parts.push({ key: "propertyType", label: "Property Type", score: sType, grade: sType === 1 ? "Exact" : "Poor", detail: sType === 1 ? "same type" : `${comp.propertyType} vs ${subject.propertyType}` });

  return { score: 0, parts, distanceMiles: dist, monthsAgo: months };
}

/** Weighted similarity 0–100. Missing parts are excluded and remaining weights re-normalised. */
export function scoreSimilarity(sim: Similarity, weights: SimilarityWeights): number {
  let num = 0, den = 0;
  for (const p of sim.parts) {
    if (p.score === null) continue;
    const w = weights[p.key] ?? 0;
    num += w * p.score;
    den += w;
  }
  return den === 0 ? 0 : Math.round((num / den) * 100);
}

export interface CriteriaCheck {
  passes: boolean;
  reasons: string[];
}

/** Apply tolerance criteria client-side so toggling them is instant */
export function checkCriteria(subject: SubjectLike, comp: CompCandidate, c: CompCriteria, distanceMiles: number, monthsAgo: number): CriteriaCheck {
  const reasons: string[] = [];
  if (distanceMiles > c.radiusMiles) reasons.push(`> ${c.radiusMiles} mi`);
  if (monthsAgo > c.months) reasons.push(`sold > ${c.months} mo ago`);
  if (c.sameType && comp.propertyType !== subject.propertyType) reasons.push("different type");
  if (subject.sqft && comp.sqft && Math.abs(comp.sqft - subject.sqft) / subject.sqft > c.sqftTolerancePct / 100) reasons.push(`sq ft outside ±${c.sqftTolerancePct}%`);
  if (subject.beds != null && comp.beds != null && Math.abs(comp.beds - subject.beds) > c.bedTolerance) reasons.push(`beds outside ±${c.bedTolerance}`);
  if (subject.baths != null && comp.baths != null && Math.abs(comp.baths - subject.baths) > c.bathTolerance) reasons.push(`baths outside ±${c.bathTolerance}`);
  if (subject.yearBuilt && comp.yearBuilt && Math.abs(comp.yearBuilt - subject.yearBuilt) > c.yearTolerance) reasons.push(`year outside ±${c.yearTolerance}`);
  if (subject.lotSqft && comp.lotSqft && Math.abs(comp.lotSqft - subject.lotSqft) / subject.lotSqft > c.lotTolerancePct / 100) reasons.push(`lot outside ±${c.lotTolerancePct}%`);
  return { passes: reasons.length === 0 || !!comp.manual, reasons };
}

export interface ScoredComp extends CompEntry {
  similarity: number;
  sim: Similarity;
  ppsf: number | null;
  criteria: CriteriaCheck;
}

export function scoreComps(subject: SubjectLike, comps: CompEntry[], weights: SimilarityWeights, criteria: CompCriteria, now = new Date()): ScoredComp[] {
  return comps.map((c) => {
    const sim = compSimilarity(subject, c, now);
    const similarity = scoreSimilarity(sim, weights);
    return {
      ...c,
      similarity,
      sim: { ...sim, score: similarity },
      ppsf: c.sqft ? c.salePrice / c.sqft : null,
      criteria: checkCriteria(subject, c, criteria, sim.distanceMiles, sim.monthsAgo),
    };
  });
}

export type CompSort = "closest" | "newest" | "similar" | "ppsf_high" | "ppsf_low" | "price";

export function sortComps(list: ScoredComp[], sort: CompSort): ScoredComp[] {
  const a = [...list];
  switch (sort) {
    case "closest": return a.sort((x, y) => x.sim.distanceMiles - y.sim.distanceMiles);
    case "newest": return a.sort((x, y) => y.saleDate.localeCompare(x.saleDate));
    case "similar": return a.sort((x, y) => y.similarity - x.similarity);
    case "ppsf_high": return a.sort((x, y) => (y.ppsf ?? 0) - (x.ppsf ?? 0));
    case "ppsf_low": return a.sort((x, y) => (x.ppsf ?? Infinity) - (y.ppsf ?? Infinity));
    case "price": return a.sort((x, y) => y.salePrice - x.salePrice);
  }
}

// ─── ARV ────────────────────────────────────────────────────────────

export interface ArvMethodResult {
  key: ArvMethodKey;
  label: string;
  value: number | null;
  formula: string;
  lines: string[];
}

export interface ArvContribution {
  compId: string;
  line1: string;
  salePrice: number;
  ppsf: number | null;
  similarity: number;
  weight: number;
  impliedValue: number | null;
}

export interface ArvResult {
  n: number;
  subjectSqft: number | null;
  methods: ArvMethodResult[];
  recommendedMethod: ArvMethodKey;
  likely: number | null;
  conservative: number | null;
  aggressive: number | null;
  rangeExplanation: string;
  avgPrice: number | null;
  avgPpsf: number | null;
  medianPpsf: number | null;
  weightedPpsf: number | null;
  minPpsf: number | null;
  maxPpsf: number | null;
  contributions: ArvContribution[];
  warnings: string[];
}

const round1k = (n: number) => Math.round(n / 1000) * 1000;
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Calculates ARV three ways from the INCLUDED comps.
 *  1. Average sale price
 *  2. Average $/sqft × subject sqft
 *  3. Similarity-weighted $/sqft × subject sqft (weights ∝ similarity², or user override)
 * Conservative / aggressive = 25th / 75th percentile $/sqft × subject sqft.
 */
export function calculateArv(subject: SubjectLike, scored: ScoredComp[], method: ArvMethodKey = "weighted"): ArvResult {
  const inc = scored.filter((c) => c.included);
  const warnings: string[] = [];
  const sqft = subject.sqft ?? null;
  const withPpsf = inc.filter((c) => c.ppsf != null) as (ScoredComp & { ppsf: number })[];

  if (inc.length === 0) warnings.push("No comps selected — ARV cannot be calculated.");
  else if (inc.length < 3) warnings.push(`Only ${inc.length} comp${inc.length === 1 ? "" : "s"} selected — 3+ recommended for a defensible ARV.`);
  if (!sqft) warnings.push("Subject square footage unknown — $/sqft methods unavailable.");
  const lowSim = inc.filter((c) => c.similarity < 60);
  if (lowSim.length) warnings.push(`${lowSim.length} selected comp(s) score below 60% similarity.`);
  const old = inc.filter((c) => c.sim.monthsAgo > 12);
  if (old.length) warnings.push(`${old.length} selected comp(s) sold more than 12 months ago (no time adjustment applied).`);

  const avgPrice = inc.length ? inc.reduce((s, c) => s + c.salePrice, 0) / inc.length : null;
  const ppsfs = withPpsf.map((c) => c.ppsf).sort((a, b) => a - b);
  const avgPpsf = ppsfs.length ? ppsfs.reduce((s, v) => s + v, 0) / ppsfs.length : null;
  const medianPpsf = ppsfs.length ? percentile(ppsfs, 0.5) : null;

  // weights
  const rawW = withPpsf.map((c) => (c.weightOverride != null ? c.weightOverride : Math.pow(Math.max(c.similarity, 1) / 100, 2)));
  const sumW = rawW.reduce((s, v) => s + v, 0);
  const weights = rawW.map((w) => (sumW ? w / sumW : 0));
  const weightedPpsf = withPpsf.length ? withPpsf.reduce((s, c, i) => s + c.ppsf * weights[i], 0) : null;

  const contributions: ArvContribution[] = inc.map((c) => {
    const i = withPpsf.indexOf(c as ScoredComp & { ppsf: number });
    return {
      compId: c.id, line1: c.line1, salePrice: c.salePrice, ppsf: c.ppsf, similarity: c.similarity,
      weight: i >= 0 ? weights[i] : 0,
      impliedValue: c.ppsf != null && sqft ? c.ppsf * sqft : null,
    };
  });

  const m1: ArvMethodResult = {
    key: "average_price", label: "Average sale price",
    value: avgPrice != null ? round1k(avgPrice) : null,
    formula: "Σ sale price ÷ n",
    lines: avgPrice != null ? [`${inc.map((c) => usd(c.salePrice)).join(" + ")}`, `÷ ${inc.length} = ${usd(avgPrice)}`] : [],
  };
  const m2: ArvMethodResult = {
    key: "average_ppsf", label: "Average $/sqft × subject sqft",
    value: avgPpsf != null && sqft ? round1k(avgPpsf * sqft) : null,
    formula: "(Σ price/sqft ÷ n) × subject sqft",
    lines: avgPpsf != null && sqft ? [`avg $/sqft = ${usd(avgPpsf)}`, `${usd(avgPpsf)} × ${sqft.toLocaleString()} sqft = ${usd(avgPpsf * sqft)}`] : [],
  };
  const m3: ArvMethodResult = {
    key: "weighted", label: "Similarity-weighted model",
    value: weightedPpsf != null && sqft ? round1k(weightedPpsf * sqft) : null,
    formula: "Σ (weightᵢ × $/sqftᵢ) × subject sqft, weightᵢ = similarityᵢ² ÷ Σ similarity² (or manual)",
    lines: weightedPpsf != null && sqft
      ? [
          ...withPpsf.map((c, i) => `${c.line1}: ${(weights[i] * 100).toFixed(1)}% × ${usd(c.ppsf)}/sf`),
          `weighted $/sqft = ${usd(weightedPpsf)} (${weightedPpsf.toFixed(2)})`,
          `${weightedPpsf.toFixed(2)} × ${sqft.toLocaleString()} sqft = ${usd(weightedPpsf * sqft)}`,
        ]
      : [],
  };
  const methods = [m1, m2, m3];
  const chosen = methods.find((m) => m.key === method) ?? m3;
  const likely = chosen.value ?? methods.find((m) => m.value != null)?.value ?? null;

  let conservative: number | null = null;
  let aggressive: number | null = null;
  let rangeExplanation = "";
  if (likely != null) {
    if (ppsfs.length >= 3 && sqft) {
      conservative = round1k(Math.min(percentile(ppsfs, 0.25) * sqft, likely));
      aggressive = round1k(Math.max(percentile(ppsfs, 0.75) * sqft, likely));
      rangeExplanation = `Conservative = 25th percentile $/sqft (${usd(percentile(ppsfs, 0.25))}) × ${sqft.toLocaleString()} sqft; Aggressive = 75th percentile $/sqft (${usd(percentile(ppsfs, 0.75))}) × sqft.`;
    } else {
      conservative = round1k(likely * 0.96);
      aggressive = round1k(likely * 1.04);
      rangeExplanation = "Fewer than 3 comps with sqft — range shown as ±4% of likely ARV.";
    }
  }

  return {
    n: inc.length, subjectSqft: sqft, methods, recommendedMethod: chosen.key, likely, conservative, aggressive,
    rangeExplanation, avgPrice, avgPpsf, medianPpsf, weightedPpsf,
    minPpsf: ppsfs.length ? ppsfs[0] : null, maxPpsf: ppsfs.length ? ppsfs[ppsfs.length - 1] : null,
    contributions, warnings,
  };
}
