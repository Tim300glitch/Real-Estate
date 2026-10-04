import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateArv, checkCriteria, compSimilarity, scoreComps, scoreSimilarity, DEFAULT_CRITERIA, DEFAULT_WEIGHTS } from "../src/lib/calc/comps";
import { computeDeal, inputsFromPreset, DEFAULT_PRESETS } from "../src/lib/calc/deal";
import { repairTotals, newRepairItem, catalogUnitCost } from "../src/lib/calc/repairs";
import { dealScore, matchBuyer, motivationScore } from "../src/lib/calc/scores";
import { matchesFilters } from "../src/lib/filters";
import { haversineMiles, pointInPolygon } from "../src/lib/geo";
import type { Buyer, CompEntry, PropertySummary } from "../src/lib/types";

const subject: PropertySummary = {
  id: "s", apn: "1", line1: "7428 Alder Grove Way", city: "Sacramento", state: "CA", zip: "95828", county: "Sacramento", neighborhood: "Florin",
  lat: 38.49236, lng: -121.40412, propertyType: "sfr", beds: 3, baths: 2, sqft: 1820, lotSqft: 7200, yearBuilt: 1978, estValue: 400000,
  equityPct: 82, estEquity: 328000, yearsOwned: 24, ownerName: "Test Owner", ownerEntity: "individual", absentee: true, outOfState: true,
  ownerOccupied: false, freeAndClear: false, lastSalePrice: 120000, lastSaleDate: "2002-01-01", lastSaleCash: false,
  distress: { taxDelinquent: false, preForeclosure: false, foreclosure: false, auctionDate: null, probate: false, vacant: true, codeViolations: 0, liens: 0, inherited: false, tiredLandlord: false, expiredListing: false },
  motivationScore: 0,
};
const recent = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
const comp = (id: string, price: number, sqft: number, dLat = 0.002, daysAgo = 60, extra: Partial<CompEntry> = {}): CompEntry => ({
  id, propertyId: id, line1: id, city: "Sacramento", zip: "95828", lat: subject.lat + dLat, lng: subject.lng, propertyType: "sfr", beds: 3, baths: 2,
  sqft, lotSqft: 7000, yearBuilt: 1980, salePrice: price, saleDate: recent(daysAgo), dom: null, cash: null,
  source: { kind: "public_record", source: "test", asOf: "2026-01-01", confidence: "high" }, included: true, ...extra,
});

test("MAO — spec example: ARV 500k × 75% − 50k repairs − 20k fee = 305k", () => {
  const i = inputsFromPreset(DEFAULT_PRESETS[0], { arv: 500000, repairs: 50000, wholesaleFee: 20000, investorPct: 0.75, formula: "percent_of_arv" });
  const o = computeDeal(i);
  assert.equal(o.mao, 305000);
  assert.equal(o.buyerMaxPrice, 325000);
  assert.equal(o.offers[2].price, 305000);
  assert.ok(o.offers[0].price < o.offers[1].price && o.offers[1].price < o.offers[2].price);
  assert.equal(o.offers[1].fee, o.buyerMaxPrice - o.offers[1].price);
});

test("MAO — detailed model solves the circular closing/financing costs", () => {
  const i = inputsFromPreset(DEFAULT_PRESETS[0], { arv: 500000, repairs: 50000, formula: "detailed" });
  const o = computeDeal(i);
  const P = o.buyerMaxPrice;
  const rebuilt = i.arv - i.repairs - i.holdingMonths * i.holdingCostMonthly - P * i.closingCostsBuyPct - i.arv * i.closingCostsSellPct
    - i.arv * i.agentPct - (P + i.repairs) * i.financingPct - i.arv * i.buyerProfitPct - i.otherCosts;
  assert.ok(Math.abs(rebuilt - P) < 0.01, "buyer max price satisfies its own equation");
  assert.equal(o.mao, P - i.wholesaleFee);
});

test("deal quality flags a seller ask above buyer max", () => {
  const i = inputsFromPreset(DEFAULT_PRESETS[0], { arv: 400000, repairs: 40000, sellerAsk: 390000 });
  const o = computeDeal(i);
  assert.match(o.qualityReason, /above what a buyer can pay/);
});

test("ARV methods — average price, avg $/sf, and weighted", () => {
  const comps = [comp("a", 480000, 1760), comp("b", 495000, 1905), comp("c", 470000, 1800)];
  const scored = scoreComps(subject, comps, DEFAULT_WEIGHTS, DEFAULT_CRITERIA);
  const a = calculateArv(subject, scored, "weighted");
  const avgPrice = (480000 + 495000 + 470000) / 3;
  assert.equal(a.methods[0].value, Math.round(avgPrice / 1000) * 1000);
  const avgPpsf = (480000 / 1760 + 495000 / 1905 + 470000 / 1800) / 3;
  assert.equal(a.methods[1].value, Math.round((avgPpsf * 1820) / 1000) * 1000);
  const w = a.contributions.reduce((s, c) => s + c.weight, 0);
  assert.ok(Math.abs(w - 1) < 1e-9, "weights sum to 1");
  assert.ok(a.conservative! <= a.likely! && a.likely! <= a.aggressive!);
});

test("ARV ignores excluded comps and warns on thin data", () => {
  const comps = [comp("a", 480000, 1760), comp("b", 900000, 1800, 0.002, 60, { included: false })];
  const a = calculateArv(subject, scoreComps(subject, comps, DEFAULT_WEIGHTS, DEFAULT_CRITERIA));
  assert.equal(a.n, 1);
  assert.ok(a.warnings.some((w) => /Only 1 comp/.test(w)));
  assert.ok(a.likely! < 600000);
});

test("similarity — identical nearby recent comp scores high; far/old/different scores low", () => {
  const good = compSimilarity(subject, comp("g", 480000, 1820, 0.001, 20));
  const bad = compSimilarity(subject, comp("x", 480000, 3200, 0.03, 700, { beds: 6, yearBuilt: 2015, propertyType: "condo" }));
  assert.ok(scoreSimilarity(good, DEFAULT_WEIGHTS) >= 90);
  assert.ok(scoreSimilarity(bad, DEFAULT_WEIGHTS) < 40);
  assert.ok(good.parts.every((p) => p.detail.length > 0), "every part explains itself");
});

test("criteria tolerances", () => {
  const c = comp("t", 1, 2500);
  const sim = compSimilarity(subject, c);
  const r = checkCriteria(subject, c, DEFAULT_CRITERIA, sim.distanceMiles, sim.monthsAgo);
  assert.equal(r.passes, false);
  assert.ok(r.reasons.some((x) => x.includes("sq ft")));
});

test("repairs — interior paint 1,850 sf × $3.25 = $6,012.50; totals bands", () => {
  assert.equal(catalogUnitCost("Interior paint", "moderate"), 3.25);
  const item = { ...newRepairItem("Interior paint", "moderate", { sqft: 1850, beds: 3, baths: 2, lotSqft: 6000 }) };
  assert.equal(item.quantity * item.unitCost, 6012.5);
  const t = repairTotals([item], 10);
  assert.equal(t.expected, Math.round(6012.5 * 1.1));
  assert.ok(t.low < t.expected && t.expected < t.high);
});

test("motivation score explains itself and treats unknown as unavailable", () => {
  const m = motivationScore({ ...subject, distress: { ...subject.distress, vacant: null } });
  const vac = m.factors.find((f) => f.key === "vacant")!;
  assert.equal(vac.available, false);
  assert.equal(vac.points, 0);
  assert.ok(m.factors.find((f) => f.key === "outOfState")!.points > 0);
});

test("deal score excludes missing factors instead of guessing", () => {
  const s = dealScore({ equityPct: 80, motivation: 70, arv: null, targetOffer: null, repairs: null, compsInArea: null, avgCompSimilarity: null, matchedBuyers: null, feeAtTarget: null, desiredFee: 20000, dom: null, conditionRating: null, titleFlags: [] });
  assert.ok(s.coverage < 0.5);
  assert.ok(s.score > 0);
});

test("buyer matching", () => {
  const b: Buyer = { id: "b", name: "B", contacts: [], markets: ["Sacramento"], zips: ["95828"], propertyTypes: ["sfr"], minPrice: 200000, maxPrice: 400000, minBeds: 2,
    rehabTolerance: "heavy", strategies: ["flip"], desiredMarginPct: 15, dealsPurchased: 3, avgPurchasePrice: 300000, reliability: 5, pofVerifiedAt: new Date().toISOString(), lastActivityAt: new Date().toISOString(), tags: [], createdAt: "" };
  assert.equal(matchBuyer(b, { zip: "95828", city: "Sacramento", propertyType: "sfr", beds: 3, price: 350000, repairs: 80000, arv: 550000 }).score, 100);
  const miss = matchBuyer(b, { zip: "90210", city: "LA", propertyType: "condo", beds: 1, price: 900000, repairs: 300000, arv: 1000000 });
  assert.ok(miss.score < 35);
  for (const k of ["Location", "Property type", "Price range"]) assert.equal(miss.reasons.find((r) => r.label === k)!.points, 0);
});

test("filters — absentee + 15 yrs + 60% equity + SFR + pre-1990", () => {
  const f = { absentee: "yes" as const, minYearsOwned: 15, minEquityPct: 60, propertyTypes: ["sfr" as const], maxYearBuilt: 1990 };
  assert.equal(matchesFilters(subject, f), true);
  assert.equal(matchesFilters({ ...subject, absentee: false }, f), false);
  assert.equal(matchesFilters({ ...subject, distress: { ...subject.distress, vacant: null } }, { vacant: "no" }), false, "unknown never matches yes/no");
});

test("geo helpers", () => {
  assert.ok(Math.abs(haversineMiles([-121.4, 38.5], [-121.4, 38.5145]) - 1) < 0.01);
  assert.equal(pointInPolygon([0.5, 0.5], [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]), true);
  assert.equal(pointInPolygon([1.5, 0.5], [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]), false);
});
