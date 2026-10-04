"use client";
import { AlertTriangle, Columns3, Plus, RefreshCw, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { DEFAULT_WEIGHTS, MONTH_OPTIONS, RADIUS_OPTIONS, sortComps, type CompSort, type ScoredComp } from "@/lib/calc/comps";
import type { CompSetApi } from "@/lib/client/useCompSet";
import { date, num, usd } from "@/lib/format";
import { PROPERTY_TYPE_LABEL, type PropertySummary, type PropertyType, type SimilarityWeights } from "@/lib/types";
import { CompLayer } from "../map/layers";
import { PropertyMap } from "../map/PropertyMap";
import { Badge, Button, Dialog, Field, NumberInput, Toggle, cx } from "../ui";
import { Sourced } from "../ui/Provenance";

const gradeTone = (g: string) => (["Exact", "Excellent", "Recent", "Similar"].includes(g) ? "good" : g === "Good" ? "accent" : g === "Fair" ? "warn" : g === "N/A" ? "neutral" : "bad") as "good" | "accent" | "warn" | "neutral" | "bad";

export function SimilarityBadge({ c }: { c: ScoredComp }) {
  const [open, setOpen] = useState(false);
  const color = c.similarity >= 85 ? "var(--good)" : c.similarity >= 70 ? "var(--accent)" : c.similarity >= 55 ? "var(--warn)" : "var(--bad)";
  return (
    <span className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} className="inline-flex items-center gap-1 rounded px-1.5 h-[20px] text-[11.5px] font-semibold num border border-border hover:bg-hover" style={{ color }}>
        {c.similarity}%
      </button>
      {open && (
        <span className="anim-fade absolute right-0 top-6 z-30 w-[290px] rounded-lg border border-border bg-panel p-2.5 shadow-pop text-left whitespace-normal" onClick={(e) => e.stopPropagation()}>
          <span className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Comp match {c.similarity}%</span><button onClick={() => setOpen(false)}><X size={12} /></button></span>
          <span className="mt-1.5 block space-y-1">
            {c.sim.parts.map((p) => (
              <span key={p.key} className="grid grid-cols-[78px_70px_1fr] items-center gap-1 text-[11.5px]">
                <span className="text-muted">{p.label}</span><Badge tone={gradeTone(p.grade)}>{p.grade}</Badge><span className="truncate text-fg-2" title={p.detail}>{p.detail}</span>
              </span>
            ))}
          </span>
          <span className="mt-2 block text-[10.5px] text-muted">Weighted average of part scores using the configurable weights. Parts with missing data are excluded and weights re-normalised.</span>
        </span>
      )}
    </span>
  );
}

export function CompEngine({ subject, cs, mapHeight = 340, compact }: { subject: PropertySummary; cs: CompSetApi; mapHeight?: number; compact?: boolean }) {
  const [sort, setSort] = useState<CompSort>("similar");
  const [selected, setSelected] = useState<string | null>(null);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [showExcluded, setShowExcluded] = useState(true);
  const c = cs.criteria;
  const rows = useMemo(() => sortComps(cs.scored, sort), [cs.scored, sort]);
  const indexById = useMemo(() => new Map(sortComps(cs.scored, "similar").map((r, i) => [r.id, i + 1])), [cs.scored]);
  const pins = useMemo(() => cs.scored.filter((r) => showExcluded || r.included).map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, price: r.salePrice, included: r.included, label: r.line1, similarity: r.similarity, index: indexById.get(r.id)! })), [cs.scored, showExcluded, indexById]);
  const sel = cs.scored.find((r) => r.id === selected);
  const included = cs.scored.filter((r) => r.included);
  const subjectPpsf = cs.arv?.likely && subject.sqft ? cs.arv.likely / subject.sqft : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-panel p-2.5">
        <Field label="Distance"><select className="input input-sm w-[96px]" value={c.radiusMiles} onChange={(e) => cs.setCriteria({ ...c, radiusMiles: Number(e.target.value) })}>{RADIUS_OPTIONS.map((r) => <option key={r} value={r}>{r} mi</option>)}</select></Field>
        <Field label="Sold within"><select className="input input-sm w-[108px]" value={c.months} onChange={(e) => cs.setCriteria({ ...c, months: Number(e.target.value) })}>{MONTH_OPTIONS.map((m) => <option key={m} value={m}>{m} months</option>)}</select></Field>
        <Field label="Sq ft ±"><NumberInput size="sm" className="w-[70px]" suffix="%" value={c.sqftTolerancePct} onChange={(v) => cs.setCriteria({ ...c, sqftTolerancePct: v })} /></Field>
        <Field label="Beds ±"><NumberInput size="sm" className="w-[56px]" value={c.bedTolerance} onChange={(v) => cs.setCriteria({ ...c, bedTolerance: v })} /></Field>
        <Field label="Baths ±"><NumberInput size="sm" className="w-[56px]" decimals={1} value={c.bathTolerance} onChange={(v) => cs.setCriteria({ ...c, bathTolerance: v })} /></Field>
        <Field label="Year ±"><NumberInput size="sm" className="w-[60px]" value={c.yearTolerance} onChange={(v) => cs.setCriteria({ ...c, yearTolerance: v })} /></Field>
        <Field label="Lot ±"><NumberInput size="sm" className="w-[66px]" suffix="%" value={c.lotTolerancePct} onChange={(v) => cs.setCriteria({ ...c, lotTolerancePct: v })} /></Field>
        <div className="pb-1"><Toggle checked={c.sameType} onChange={(v) => cs.setCriteria({ ...c, sameType: v })} label="Same type" /></div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button size="xs" icon={<RefreshCw size={12} className={cs.loading ? "animate-spin" : ""} />} onClick={cs.refetch}>Refresh</Button>
          <Button size="xs" icon={<Sparkles size={12} />} onClick={cs.autoSelect} title="Select up to 8 best comps that pass criteria and score ≥55%">Auto-select best</Button>
          <Button size="xs" icon={<SlidersHorizontal size={12} />} onClick={() => setWeightsOpen(true)}>Weights</Button>
          <Button size="xs" icon={<Columns3 size={12} />} onClick={() => setCompareOpen(true)} disabled={!included.length}>Compare</Button>
          <Button size="xs" icon={<Plus size={12} />} onClick={() => setManualOpen(true)}>Manual comp</Button>
        </div>
      </div>

      <div className={cx("grid gap-3", compact ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]")}>
        <div className="relative rounded-lg border border-border overflow-hidden" style={{ height: mapHeight }}>
          <PropertyMap center={[subject.lng, subject.lat]} zoom={c.radiusMiles <= 0.5 ? 14.6 : c.radiusMiles <= 1 ? 13.6 : 12.4}>
            <CompLayer subject={{ lat: subject.lat, lng: subject.lng, label: subject.line1 }} comps={pins} radiusMiles={c.radiusMiles} selectedId={selected} onSelect={setSelected} />
          </PropertyMap>
          <div className="absolute left-2 top-2 z-10 flex gap-1.5">
            <span className="rounded-md border border-border bg-panel/95 px-2 py-1 text-[11px] shadow-panel">{included.length} selected · {cs.scored.length} found{cs.provider ? ` · ${cs.provider}` : ""}</span>
            <button onClick={() => setShowExcluded((v) => !v)} className="rounded-md border border-border bg-panel/95 px-2 py-1 text-[11px] shadow-panel hover:bg-hover">{showExcluded ? "Hide" : "Show"} excluded</button>
          </div>
          {sel && (
            <div className="anim-fade absolute right-2 top-2 z-10 w-[230px] rounded-lg border border-border bg-panel p-2.5 shadow-pop text-[12px]">
              <div className="flex items-start justify-between gap-2"><div className="font-semibold">{sel.line1}</div><button onClick={() => setSelected(null)}><X size={13} /></button></div>
              <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
                <span className="text-muted">Sale price</span><span className="num text-right">{usd(sel.salePrice)}</span>
                <span className="text-muted">Sale date</span><span className="text-right">{date(sel.saleDate)}</span>
                <span className="text-muted">Distance</span><span className="num text-right">{sel.sim.distanceMiles.toFixed(2)} mi</span>
                <span className="text-muted">Sq ft</span><span className="num text-right">{num(sel.sqft)}</span>
                <span className="text-muted">$/sqft</span><span className="num text-right">{usd(sel.ppsf)}</span>
                <span className="text-muted">Beds / baths</span><span className="num text-right">{sel.beds}/{sel.baths}</span>
                <span className="text-muted">Similarity</span><span className="text-right"><SimilarityBadge c={sel} /></span>
              </div>
              <Button size="xs" className="mt-2 w-full" variant={sel.included ? "secondary" : "primary"} onClick={() => cs.toggle(sel.id)}>{sel.included ? "Exclude comp" : "Include comp"}</Button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-panel flex flex-col min-w-0" style={{ maxHeight: compact ? 420 : mapHeight + 160 }}>
          <div className="flex items-center gap-2 px-3 h-10 border-b border-border">
            <span className="text-[12.5px] font-semibold">Comparable sales</span>
            {cs.loading && <span className="text-[11px] text-muted">loading…</span>}
            {cs.error && <span className="text-[11px] text-bad">{cs.error}</span>}
            <select className="input input-sm w-auto ml-auto" value={sort} onChange={(e) => setSort(e.target.value as CompSort)}>
              <option value="similar">Most similar</option><option value="closest">Closest</option><option value="newest">Newest</option><option value="ppsf_high">Highest $/sf</option><option value="ppsf_low">Lowest $/sf</option><option value="price">Sale price</option>
            </select>
          </div>
          <div className="overflow-auto flex-1">
            <table className="tbl text-[12px]">
              <thead><tr><th>Use</th><th>#</th><th>Address</th><th className="text-right">Dist</th><th className="text-right">Price</th><th>Date</th><th className="text-right">Sq ft</th><th className="text-right">$/sf</th><th className="text-right">Bd/Ba</th><th className="text-right">Built</th><th className="text-right">Lot</th><th>Type</th><th className="text-right">DOM</th><th>Match</th><th>Condition notes</th><th></th></tr></thead>
              <tbody>
                <tr className="bg-panel-2">
                  <td colSpan={2}><Badge tone="bad">Subject</Badge></td><td className="font-semibold">{subject.line1}</td><td className="text-right">—</td>
                  <td className="text-right num">{cs.arv?.likely ? <span className="text-muted">ARV {usd(cs.arv.likely, { compact: true })}</span> : "—"}</td><td>—</td>
                  <td className="text-right num">{num(subject.sqft)}</td><td className="text-right num">{subjectPpsf ? usd(subjectPpsf) : "—"}</td><td className="text-right num">{subject.beds}/{subject.baths}</td>
                  <td className="text-right num">{subject.yearBuilt}</td><td className="text-right num">{num(subject.lotSqft)}</td><td>{PROPERTY_TYPE_LABEL[subject.propertyType]}</td><td></td><td></td><td></td><td></td>
                </tr>
                {rows.map((r) => (
                  <tr key={r.id} className={cx("cursor-pointer", !r.included && "row-muted", selected === r.id && "row-active")} onClick={() => setSelected(r.id)}>
                    <td onClick={(e) => e.stopPropagation()}><Toggle checked={r.included} onChange={() => cs.toggle(r.id)} /></td>
                    <td className="text-muted num">{indexById.get(r.id)}</td>
                    <td className="font-medium max-w-[170px]">
                      <div className="flex items-center gap-1"><Sourced prov={r.source} inline>{r.line1}</Sourced>{r.manual && <Badge tone="accent">manual</Badge>}{!r.criteria.passes && <span title={`Outside criteria: ${r.criteria.reasons.join(", ")}`}><AlertTriangle size={12} className="text-warn" /></span>}</div>
                    </td>
                    <td className="text-right num">{r.sim.distanceMiles.toFixed(2)}</td>
                    <td className="text-right num">{usd(r.salePrice, { compact: true })}</td>
                    <td>{date(r.saleDate)}</td>
                    <td className="text-right num">{num(r.sqft)}</td>
                    <td className="text-right num">{usd(r.ppsf)}</td>
                    <td className="text-right num">{r.beds ?? "—"}/{r.baths ?? "—"}</td>
                    <td className="text-right num">{r.yearBuilt ?? "—"}</td>
                    <td className="text-right num">{num(r.lotSqft)}</td>
                    <td>{PROPERTY_TYPE_LABEL[r.propertyType]}</td>
                    <td className="text-right num" title="Days on market — requires MLS access">{r.dom ?? "—"}</td>
                    <td><SimilarityBadge c={r} /></td>
                    <td onClick={(e) => e.stopPropagation()}><input className="input input-sm w-[150px]" placeholder="e.g. fully renovated" value={r.conditionNotes ?? ""} onChange={(e) => cs.updateComp(r.id, { conditionNotes: e.target.value })} /></td>
                    <td onClick={(e) => e.stopPropagation()}>{r.manual && <button onClick={() => cs.removeComp(r.id)} className="text-muted hover:text-bad"><Trash2 size={13} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!cs.loading && rows.length === 0 && <div className="p-6 text-center text-[12px] text-muted">No sales found. Widen the distance or time window, or add a manual comp.</div>}
          </div>
          <div className="px-3 py-1.5 border-t border-border text-[10.5px] text-muted">Excluded comps stay visible (greyed). ⚠ = outside current criteria (still selectable). DOM requires MLS access. Click a match % to see why.</div>
        </div>
      </div>

      <WeightsDialog open={weightsOpen} onClose={() => setWeightsOpen(false)} weights={cs.weights} onSave={cs.setWeights} />
      <ManualCompDialog open={manualOpen} onClose={() => setManualOpen(false)} subject={subject} onAdd={(m) => { cs.addManual(m); setManualOpen(false); }} />
      <CompareDialog open={compareOpen} onClose={() => setCompareOpen(false)} subject={subject} comps={included.sort((a, b) => b.similarity - a.similarity).slice(0, 5)} />
    </div>
  );
}

function WeightsDialog({ open, onClose, weights, onSave }: { open: boolean; onClose: () => void; weights: SimilarityWeights; onSave: (w: SimilarityWeights) => void }) {
  const [w, setW] = useState(weights);
  const labels: Record<keyof SimilarityWeights, string> = { distance: "Distance", sqft: "Square footage", bedsBaths: "Beds / baths", yearBuilt: "Year built", lotSize: "Lot size", recency: "Sale recency", propertyType: "Property type" };
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  return (
    <Dialog open={open} onClose={onClose} title="Similarity weights" footer={<><Button onClick={() => setW(DEFAULT_WEIGHTS)}>Reset defaults</Button><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { onSave(w); onClose(); }}>Apply</Button></>}>
      <p className="text-[12px] text-muted mb-3">Match % = Σ(weight × part score) ÷ Σ(weights of parts with data). Weights are relative — they don't need to sum to 100.</p>
      <div className="space-y-2">
        {(Object.keys(labels) as (keyof SimilarityWeights)[]).map((k) => (
          <div key={k} className="grid grid-cols-[120px_1fr_60px] items-center gap-3">
            <span className="text-[12.5px]">{labels[k]}</span>
            <input type="range" min={0} max={50} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} />
            <span className="text-right num text-[12px]">{w[k]} <span className="text-muted">({total ? Math.round((w[k] / total) * 100) : 0}%)</span></span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function ManualCompDialog({ open, onClose, subject, onAdd }: { open: boolean; onClose: () => void; subject: PropertySummary; onAdd: (c: Parameters<CompSetApi["addManual"]>[0]) => void }) {
  const [f, setF] = useState({ line1: "", salePrice: 0, saleDate: new Date().toISOString().slice(0, 10), sqft: subject.sqft ?? 0, beds: subject.beds ?? 3, baths: subject.baths ?? 2, yearBuilt: subject.yearBuilt ?? 1980, lotSqft: subject.lotSqft ?? 6000, offsetMi: 0.3, conditionNotes: "" });
  return (
    <Dialog open={open} onClose={onClose} title="Add manual comp" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => {
      if (!f.line1 || !f.salePrice) return;
      const ang = Math.random() * Math.PI * 2;
      onAdd({ propertyId: null, line1: f.line1, city: subject.city, zip: subject.zip, lat: subject.lat + (f.offsetMi / 69) * Math.sin(ang), lng: subject.lng + (f.offsetMi / 54) * Math.cos(ang), propertyType: subject.propertyType as PropertyType,
        beds: f.beds, baths: f.baths, sqft: f.sqft, lotSqft: f.lotSqft, yearBuilt: f.yearBuilt, salePrice: f.salePrice, saleDate: f.saleDate, dom: null, cash: null, conditionNotes: f.conditionNotes });
    }}>Add comp</Button></>}>
      <p className="text-[12px] text-muted mb-3">Manual comps are marked “user-entered” and always selectable. Use for MLS sales you have access to, or recorded sales your provider missed.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Address" className="col-span-2"><input className="input" value={f.line1} onChange={(e) => setF({ ...f, line1: e.target.value })} /></Field>
        <Field label="Sale price"><NumberInput prefix="$" value={f.salePrice} onChange={(v) => setF({ ...f, salePrice: v })} /></Field>
        <Field label="Sale date"><input type="date" className="input" value={f.saleDate} onChange={(e) => setF({ ...f, saleDate: e.target.value })} /></Field>
        <Field label="Sq ft"><NumberInput value={f.sqft} onChange={(v) => setF({ ...f, sqft: v })} /></Field>
        <Field label="Distance from subject (mi)"><NumberInput decimals={2} value={f.offsetMi} onChange={(v) => setF({ ...f, offsetMi: v })} /></Field>
        <Field label="Beds"><NumberInput value={f.beds} onChange={(v) => setF({ ...f, beds: v })} /></Field>
        <Field label="Baths"><NumberInput decimals={1} value={f.baths} onChange={(v) => setF({ ...f, baths: v })} /></Field>
        <Field label="Year built"><NumberInput value={f.yearBuilt} onChange={(v) => setF({ ...f, yearBuilt: v })} /></Field>
        <Field label="Lot sq ft"><NumberInput value={f.lotSqft} onChange={(v) => setF({ ...f, lotSqft: v })} /></Field>
        <Field label="Condition notes" className="col-span-2"><input className="input" value={f.conditionNotes} onChange={(e) => setF({ ...f, conditionNotes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

export function CompareDialog({ open, onClose, subject, comps }: { open: boolean; onClose: () => void; subject: PropertySummary; comps: ScoredComp[] }) {
  const rows: { label: string; s: string; get: (c: ScoredComp) => string; diff: (c: ScoredComp) => boolean }[] = [
    { label: "Sq ft", s: num(subject.sqft), get: (c) => num(c.sqft), diff: (c) => !!subject.sqft && !!c.sqft && Math.abs(c.sqft - subject.sqft) / subject.sqft > 0.1 },
    { label: "Beds", s: String(subject.beds ?? "—"), get: (c) => String(c.beds ?? "—"), diff: (c) => c.beds !== subject.beds },
    { label: "Baths", s: String(subject.baths ?? "—"), get: (c) => String(c.baths ?? "—"), diff: (c) => c.baths !== subject.baths },
    { label: "Year", s: String(subject.yearBuilt ?? "—"), get: (c) => String(c.yearBuilt ?? "—"), diff: (c) => Math.abs((c.yearBuilt ?? 0) - (subject.yearBuilt ?? 0)) > 10 },
    { label: "Lot", s: num(subject.lotSqft), get: (c) => num(c.lotSqft), diff: (c) => !!subject.lotSqft && !!c.lotSqft && Math.abs(c.lotSqft - subject.lotSqft) / subject.lotSqft > 0.25 },
    { label: "Distance", s: "—", get: (c) => `${c.sim.distanceMiles.toFixed(2)} mi`, diff: (c) => c.sim.distanceMiles > 0.75 },
    { label: "Sale date", s: "—", get: (c) => date(c.saleDate), diff: (c) => c.sim.monthsAgo > 9 },
    { label: "Sale price", s: "—", get: (c) => usd(c.salePrice), diff: () => false },
    { label: "$/sqft", s: "—", get: (c) => usd(c.ppsf), diff: () => false },
    { label: "Match", s: "—", get: (c) => `${c.similarity}%`, diff: (c) => c.similarity < 70 },
    { label: "Condition", s: "—", get: (c) => c.conditionNotes || "—", diff: () => false },
  ];
  return (
    <Dialog open={open} onClose={onClose} title="Side-by-side comparison" width={900}>
      <div className="overflow-x-auto">
        <table className="tbl text-[12.5px]">
          <thead><tr><th></th><th>Subject</th>{comps.map((c, i) => <th key={c.id}>Comp {i + 1}</th>)}</tr></thead>
          <tbody>
            <tr><td className="text-muted">Address</td><td className="font-medium">{subject.line1}</td>{comps.map((c) => <td key={c.id} className="font-medium">{c.line1}</td>)}</tr>
            {rows.map((r) => (
              <tr key={r.label}><td className="text-muted">{r.label}</td><td className="num">{r.s}</td>
                {comps.map((c) => <td key={c.id} className={cx("num", r.diff(c) && "text-warn font-semibold")}>{r.get(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted">Highlighted cells differ materially from the subject (sq ft &gt;10%, lot &gt;25%, year &gt;10 yrs, distance &gt;0.75 mi, sale &gt;9 months, match &lt;70%).</p>
    </Dialog>
  );
}
