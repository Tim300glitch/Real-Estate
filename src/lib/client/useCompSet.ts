"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calculateArv, scoreComps, type ScoredComp } from "../calc/comps";
import { useWorkspace } from "../store/workspace";
import type { ArvMethodKey, CompCandidate, CompCriteria, CompEntry, PropertySummary, SimilarityWeights } from "../types";
import { api } from "./api";

/**
 * Owns the comp set for a subject: fetches candidates from the comps provider
 * (radius + months are server-side), applies tolerances client-side so toggles
 * are instant, auto-includes candidates that pass criteria, persists the set and
 * keeps calculated ARV in sync. Manual comps and include/exclude choices survive refetches.
 */
export function useCompSet(subject: PropertySummary | null) {
  const settings = useWorkspace((s) => s.settings);
  const compSet = useWorkspace((s) => (subject ? s.compSets.find((c) => c.propertyId === subject.id) : undefined));
  const saveCompSet = useWorkspace((s) => s.saveCompSet);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("");

  const criteria: CompCriteria = compSet?.criteria ?? settings.compCriteria;
  const weights: SimilarityWeights = compSet?.weights ?? settings.similarityWeights;
  const method: ArvMethodKey = compSet?.arvMethod ?? "weighted";
  const comps = useMemo(() => compSet?.comps ?? [], [compSet]);

  const scored: ScoredComp[] = useMemo(() => (subject ? scoreComps(subject, comps, weights, criteria) : []), [subject, comps, weights, criteria]);
  const arv = useMemo(() => (subject ? calculateArv(subject, scored, method) : null), [subject, scored, method]);

  const persist = useCallback((patch: Partial<{ criteria: CompCriteria; weights: SimilarityWeights; comps: CompEntry[]; arvMethod: ArvMethodKey; userArv: number | undefined; userArvReason: string | undefined }>) => {
    if (!subject) return;
    const cur = useWorkspace.getState().compSets.find((c) => c.propertyId === subject.id);
    const next = {
      propertyId: subject.id,
      criteria: patch.criteria ?? cur?.criteria ?? settings.compCriteria,
      weights: patch.weights ?? cur?.weights ?? settings.similarityWeights,
      comps: patch.comps ?? cur?.comps ?? [],
      arvMethod: patch.arvMethod ?? cur?.arvMethod ?? "weighted",
      userArv: "userArv" in patch ? patch.userArv : cur?.userArv,
      userArvReason: "userArvReason" in patch ? patch.userArvReason : cur?.userArvReason,
    };
    const sc = scoreComps(subject, next.comps, next.weights, next.criteria);
    const a = calculateArv(subject, sc, next.arvMethod);
    saveCompSet({ ...next, id: cur?.id, calculatedArv: a.likely, arvLow: a.conservative, arvHigh: a.aggressive });
  }, [subject, saveCompSet, settings]);

  const fetchedKey = useRef<string>("");
  const fetchCandidates = useCallback(async (c: CompCriteria, autoInclude: boolean) => {
    if (!subject) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.comps({ subjectId: subject.id, lat: subject.lat, lng: subject.lng, radiusMiles: c.radiusMiles, months: c.months, limit: c.maxResults });
      setProvider(res.provider);
      const cur = useWorkspace.getState().compSets.find((x) => x.propertyId === subject.id);
      const existing = new Map((cur?.comps ?? []).map((x) => [x.id, x]));
      const sc = scoreComps(subject, res.comps.map((x) => ({ ...x, included: true })), cur?.weights ?? settings.similarityWeights, c);
      // auto-include: the 6 most similar candidates that pass criteria (≥65% match)
      const auto = new Set(sc.filter((s) => s.criteria.passes && s.similarity >= 65).sort((a, b) => b.similarity - a.similarity).slice(0, 6).map((s) => s.id));
      const merged: CompEntry[] = sc.map((s): CompEntry => {
        const prev = existing.get(s.id);
        const base: CompCandidate = { id: s.id, propertyId: s.propertyId, line1: s.line1, city: s.city, zip: s.zip, lat: s.lat, lng: s.lng, propertyType: s.propertyType, beds: s.beds, baths: s.baths, sqft: s.sqft, lotSqft: s.lotSqft, yearBuilt: s.yearBuilt, salePrice: s.salePrice, saleDate: s.saleDate, dom: s.dom, cash: s.cash, source: s.source };
        return prev ? { ...base, included: prev.included, conditionNotes: prev.conditionNotes, weightOverride: prev.weightOverride } : { ...base, included: autoInclude && auto.has(s.id) };
      });
      const manual = (cur?.comps ?? []).filter((x) => x.manual);
      persist({ criteria: c, comps: [...merged, ...manual] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load comps");
    } finally {
      setLoading(false);
    }
  }, [subject, persist, settings.similarityWeights]);

  // first load
  useEffect(() => {
    if (!subject) return;
    const key = subject.id;
    if (fetchedKey.current === key) return;
    fetchedKey.current = key;
    const cur = useWorkspace.getState().compSets.find((x) => x.propertyId === subject.id);
    if (!cur || cur.comps.length === 0) fetchCandidates(cur?.criteria ?? settings.compCriteria, true);
  }, [subject, fetchCandidates, settings.compCriteria]);

  const setCriteria = (c: CompCriteria) => {
    const prev = criteria;
    if (c.radiusMiles !== prev.radiusMiles || c.months !== prev.months || c.maxResults !== prev.maxResults) fetchCandidates(c, false);
    else persist({ criteria: c });
  };
  const toggle = (id: string) => persist({ comps: comps.map((c) => (c.id === id ? { ...c, included: !c.included } : c)) });
  const setIncluded = (ids: Set<string>) => persist({ comps: comps.map((c) => ({ ...c, included: ids.has(c.id) })) });
  const autoSelect = () => {
    const pass = scored.filter((s) => s.criteria.passes && s.similarity >= 65).sort((a, b) => b.similarity - a.similarity).slice(0, 6);
    setIncluded(new Set(pass.map((p) => p.id)));
  };
  const updateComp = (id: string, patch: Partial<CompEntry>) => persist({ comps: comps.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const addManual = (c: Omit<CompEntry, "id" | "manual" | "included" | "source">) =>
    persist({ comps: [...comps, { ...c, id: `manual-${Date.now()}`, manual: true, included: true, source: { kind: "user_entered", source: "Entered by user", asOf: new Date().toISOString().slice(0, 10), confidence: "medium" } }] });
  const removeComp = (id: string) => persist({ comps: comps.filter((c) => c.id !== id) });

  return {
    compSet, criteria, weights, method, scored, arv, loading, error, provider,
    setCriteria, toggle, autoSelect, updateComp, addManual, removeComp, refetch: () => fetchCandidates(criteria, false),
    setWeights: (w: SimilarityWeights) => persist({ weights: w }),
    setMethod: (m: ArvMethodKey) => persist({ arvMethod: m }),
    setUserArv: (v: number | undefined, reason?: string) => persist({ userArv: v, userArvReason: reason }),
    ensure: () => { if (!compSet) fetchCandidates(criteria, true); },
  };
}

export type CompSetApi = ReturnType<typeof useCompSet>;
