"use client";
import { useCallback, useMemo } from "react";
import { computeDeal, inputsFromPreset } from "../calc/deal";
import { repairTotals } from "../calc/repairs";
import { useWorkspace } from "../store/workspace";
import type { DealInputs, PropertySummary } from "../types";
import type { CompSetApi } from "./useCompSet";

/**
 * Single source of truth for underwriting inputs:
 *  ARV      ← comp set (user override > calculated) unless the analysis pins a manual ARV
 *  Repairs  ← repair estimator "expected" unless user switched to a manual figure
 *  Everything else ← saved DealAnalysis (seeded from the market preset)
 * Every edit persists immediately, so all screens update in real time.
 */
export function useAnalysis(subject: PropertySummary | null, cs?: CompSetApi) {
  const settings = useWorkspace((s) => s.settings);
  const analysis = useWorkspace((s) => (subject ? s.analyses.find((a) => a.propertyId === subject.id) : undefined));
  const repairs = useWorkspace((s) => (subject ? s.repairs.find((r) => r.propertyId === subject.id) : undefined));
  const lead = useWorkspace((s) => (subject ? s.leads.find((l) => l.propertyId === subject.id && !l.deletedAt) : undefined));
  const seller = useWorkspace((s) => (lead?.sellerId ? s.sellers.find((x) => x.id === lead.sellerId) : undefined));
  const saveAnalysis = useWorkspace((s) => s.saveAnalysis);

  const preset = settings.presets.find((p) => p.id === (analysis?.inputs.presetId ?? settings.defaultPresetId)) ?? settings.presets[0];
  const repairsExpected = repairs ? repairTotals(repairs.items, repairs.contingencyPct).expected : null;
  const compArv = cs?.compSet?.userArv ?? cs?.arv?.likely ?? null;

  const inputs: DealInputs = useMemo(() => {
    const base = analysis?.inputs ?? inputsFromPreset(preset, { repairs: repairsExpected ?? 0 });
    const arv = base.arvSource === "manual" ? base.arv : compArv ?? base.arv;
    const arvSource: DealInputs["arvSource"] = base.arvSource === "manual" ? "manual" : cs?.compSet?.userArv ? "user" : compArv ? "calculated" : base.arvSource;
    return {
      ...base, arv, arvSource,
      repairs: base.repairsSource === "estimator" && repairsExpected != null ? repairsExpected : base.repairs,
      sellerAsk: seller?.askingPrice ?? lead?.askingPrice ?? base.sellerAsk,
    };
  }, [analysis, preset, repairsExpected, compArv, cs?.compSet?.userArv, seller, lead]);

  const outputs = useMemo(() => (inputs.arv > 0 ? computeDeal(inputs) : null), [inputs]);

  const update = useCallback((patch: Partial<DealInputs>) => {
    if (!subject) return;
    const next = { ...inputs, ...patch };
    if ("arv" in patch && cs && next.arvSource !== "manual") {
      cs.setUserArv(patch.arv || undefined, "Edited in deal calculator");
      next.arvSource = "user";
    }
    if ("repairs" in patch && !("repairsSource" in patch)) next.repairsSource = "manual";
    saveAnalysis({ propertyId: subject.id, inputs: next, id: analysis?.id });
  }, [subject, inputs, cs, saveAnalysis, analysis?.id]);

  const applyPreset = useCallback((presetId: string) => {
    const p = settings.presets.find((x) => x.id === presetId);
    if (!p || !subject) return;
    saveAnalysis({ propertyId: subject.id, id: analysis?.id, inputs: inputsFromPreset(p, { arv: inputs.arv, arvSource: inputs.arvSource, repairs: inputs.repairs, repairsSource: inputs.repairsSource, sellerAsk: inputs.sellerAsk, purchasePrice: inputs.purchasePrice, formula: inputs.formula }) });
  }, [settings.presets, subject, saveAnalysis, analysis?.id, inputs]);

  return { inputs, outputs, update, applyPreset, preset, presets: settings.presets, repairsExpected, compArv, lead, seller };
}
