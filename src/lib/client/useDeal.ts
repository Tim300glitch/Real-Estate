"use client";
// Collects every workspace record for a property and derives the numbers
// the UI shows everywhere (ARV in use, repairs in use, MAO, offer range, scores).
import { useMemo } from "react";
import { computeDeal, inputsFromPreset } from "../calc/deal";
import { repairTotals } from "../calc/repairs";
import { dealScore, matchBuyers, motivationScore } from "../calc/scores";
import { useWorkspace } from "../store/workspace";
import type { PropertySummary } from "../types";

export function usePropertyWorkspace(propertyId: string | null | undefined) {
  const lead = useWorkspace((s) => s.leads.find((l) => l.propertyId === propertyId && !l.deletedAt));
  const seller = useWorkspace((s) => (lead?.sellerId ? s.sellers.find((x) => x.id === lead.sellerId) : undefined));
  const compSet = useWorkspace((s) => s.compSets.find((c) => c.propertyId === propertyId));
  const repairs = useWorkspace((s) => s.repairs.find((r) => r.propertyId === propertyId));
  const analysis = useWorkspace((s) => s.analyses.find((a) => a.propertyId === propertyId));
  const allOffers = useWorkspace((s) => s.offers);
  const offers = useMemo(() => allOffers.filter((o) => o.propertyId === propertyId), [allOffers, propertyId]);
  return { lead, seller, compSet, repairs, analysis, offers };
}

export function useDealNumbers(propertyId: string | null | undefined, summary?: PropertySummary | null) {
  const { lead, seller, compSet, repairs, analysis } = usePropertyWorkspace(propertyId);
  const settings = useWorkspace((s) => s.settings);
  const buyers = useWorkspace((s) => s.buyers);
  return useMemo(() => {
    const p = summary ?? lead?.property ?? null;
    const preset = settings.presets.find((x) => x.id === (analysis?.inputs.presetId ?? settings.defaultPresetId)) ?? settings.presets[0];
    const repairTotal = repairs ? repairTotals(repairs.items, repairs.contingencyPct).expected : null;
    const arv = compSet?.userArv ?? compSet?.calculatedArv ?? analysis?.inputs.arv ?? null;
    const arvKind: "user" | "calculated" | "analysis" | null = compSet?.userArv ? "user" : compSet?.calculatedArv ? "calculated" : analysis?.inputs.arv ? "analysis" : null;
    const inputs = analysis?.inputs
      ? { ...analysis.inputs, arv: arv ?? analysis.inputs.arv, repairs: analysis.inputs.repairsSource === "estimator" && repairTotal != null ? repairTotal : analysis.inputs.repairs, sellerAsk: seller?.askingPrice ?? lead?.askingPrice ?? analysis.inputs.sellerAsk }
      : arv ? inputsFromPreset(preset, { arv, repairs: repairTotal ?? 0, sellerAsk: seller?.askingPrice ?? lead?.askingPrice }) : null;
    const deal = inputs && inputs.arv > 0 ? computeDeal(inputs) : null;
    const motivation = p ? motivationScore(p, seller, settings.motivationWeights) : null;
    const target = deal?.offers[1];
    const matches = p && deal ? matchBuyers(buyers, { zip: p.zip, city: p.city, propertyType: p.propertyType, beds: p.beds, price: (target?.price ?? 0) + (inputs?.wholesaleFee ?? 0), repairs: inputs?.repairs ?? 0, arv: inputs?.arv ?? 0 }) : [];
    const included = compSet?.comps.filter((c) => c.included) ?? [];
    const titleFlags = p ? [p.distress.probate && "probate", (p.distress.liens ?? 0) > 0 && "liens", p.ownerName.includes("&") && "multiple owners", p.distress.preForeclosure && "pre-foreclosure"].filter(Boolean) as string[] : [];
    const score = p ? dealScore({
      equityPct: p.equityPct, motivation: motivation?.score ?? null, arv: inputs?.arv ?? null, targetOffer: target?.price ?? null,
      repairs: inputs?.repairs ?? null, compsInArea: compSet ? compSet.comps.length : null, avgCompSimilarity: null,
      matchedBuyers: deal ? matches.filter((m) => m.score >= 70).length : null, feeAtTarget: target?.fee ?? null, desiredFee: inputs?.wholesaleFee ?? 20000,
      dom: null, conditionRating: null, titleFlags,
    }, settings.dealWeights) : null;
    return { p, inputs, deal, arv, arvKind, repairTotal, motivation, matches, score, includedComps: included.length, preset };
  }, [summary, lead, seller, compSet, repairs, analysis, settings, buyers]);
}
