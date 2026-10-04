"use client";
import { AlertTriangle, Info, RotateCcw, Sigma } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { CalcLine, DealOutputs } from "@/lib/calc/deal";
import type { DealScoreResult, MotivationResult } from "@/lib/calc/scores";
import type { useAnalysis } from "@/lib/client/useAnalysis";
import type { CompSetApi } from "@/lib/client/useCompSet";
import { pct, usd } from "@/lib/format";
import type { ArvMethodKey, PropertySummary } from "@/lib/types";
import { Badge, Bar, Button, Card, Field, NumberInput, ScoreBadge, Segmented, cx } from "../ui";

type An = ReturnType<typeof useAnalysis>;

export function MathLines({ lines, className }: { lines: CalcLine[]; className?: string }) {
  return (
    <div className={cx("rounded-md border border-border bg-panel-2 px-2.5 py-1.5 font-mono text-[11.5px]", className)}>
      {lines.map((l, i) => (
        <div key={i} className={cx("flex justify-between gap-3 py-0.5", l.op === "=" && "border-t border-border mt-0.5 pt-1 font-semibold")}>
          <span className="text-fg-2 truncate"><span className="inline-block w-3 text-muted">{l.op === "=" ? "=" : l.op ?? ""}</span>{l.label}</span>
          <span className="num">{l.op === "−" ? "−" : ""}{usd(l.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── ARV ────────────────────────────────────────────────────────────
export function ArvPanel({ subject, cs, compact }: { subject: PropertySummary; cs: CompSetApi; compact?: boolean }) {
  const a = cs.arv;
  const [override, setOverride] = useState<number>(cs.compSet?.userArv ?? 0);
  const [reason, setReason] = useState(cs.compSet?.userArvReason ?? "");
  if (!a) return null;
  const chosen = a.methods.find((m) => m.key === cs.method)!;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[["Conservative", a.conservative, "text-fg-2"], ["Likely", a.likely, "text-fg"], ["Aggressive", a.aggressive, "text-fg-2"]].map(([k, v, cls]) => (
          <div key={k as string} className={cx("rounded-lg border px-3 py-2", k === "Likely" ? "border-accent bg-accent-soft" : "border-border bg-panel")}>
            <div className="text-[10.5px] uppercase tracking-wide text-muted">{k as string}</div>
            <div className={cx("text-[18px] font-semibold num", cls as string)}>{usd(v as number | null)}</div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-muted">{a.rangeExplanation}</div>
      {a.warnings.map((w) => <div key={w} className="flex items-start gap-1.5 rounded-md bg-warn-soft text-warn px-2 py-1 text-[11.5px]"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w}</div>)}

      <div className="grid gap-2" style={{ gridTemplateColumns: compact ? "1fr" : "repeat(3, minmax(0, 1fr))" }}>
        {a.methods.map((m, i) => (
          <button key={m.key} onClick={() => cs.setMethod(m.key as ArvMethodKey)} className={cx("text-left rounded-lg border px-3 py-2 transition", cs.method === m.key ? "border-accent bg-accent-soft" : "border-border hover:bg-hover")}>
            <div className="text-[10.5px] uppercase tracking-wide text-muted">Method {i + 1}{cs.method === m.key && " · in use"}</div>
            <div className="text-[12px] font-medium">{m.label}</div>
            <div className="text-[16px] font-semibold num">{usd(m.value)}</div>
            <div className="text-[10.5px] text-muted font-mono truncate" title={m.formula}>{m.formula}</div>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border">
        <div className="flex items-center gap-2 px-3 h-9 border-b border-border text-[12px] font-semibold"><Sigma size={13} className="text-muted" /> Calculation — {chosen.label}</div>
        <div className="p-2.5 font-mono text-[11.5px] space-y-0.5 text-fg-2">
          {chosen.lines.length ? chosen.lines.map((l, i) => <div key={i} className={cx(i === chosen.lines.length - 1 && "text-fg font-semibold")}>{l}</div>) : <div>Select comps with square footage to calculate.</div>}
        </div>
        <table className="tbl text-[11.5px]">
          <thead><tr><th>Contributing comp</th><th className="text-right">Sale</th><th className="text-right">$/sf</th><th className="text-right">Match</th><th className="text-right">Weight</th><th className="text-right">Implied value</th></tr></thead>
          <tbody>
            {a.contributions.sort((x, y) => y.weight - x.weight).map((c) => (
              <tr key={c.compId}><td>{c.line1}</td><td className="text-right num">{usd(c.salePrice, { compact: true })}</td><td className="text-right num">{usd(c.ppsf)}</td><td className="text-right num">{c.similarity}%</td>
                <td className="text-right"><div className="flex items-center gap-1.5 justify-end"><Bar value={c.weight} className="w-12" /><span className="num w-10">{(c.weight * 100).toFixed(1)}%</span></div></td>
                <td className="text-right num">{usd(c.impliedValue)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-1.5 text-[10.5px] text-muted border-t border-border">Subject {subject.sqft?.toLocaleString() ?? "—"} sf · avg $/sf {usd(a.avgPpsf)} · median {usd(a.medianPpsf)} · range {usd(a.minPpsf)}–{usd(a.maxPpsf)} · no time or condition adjustments applied</div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12px] font-semibold">ARV override</div>
            <div className="text-[11px] text-muted">Both values are stored: calculated <b className="num">{usd(cs.compSet?.calculatedArv ?? a.likely)}</b>{cs.compSet?.userArv ? <> · your ARV <b className="num">{usd(cs.compSet.userArv)}</b></> : " · no override"}</div>
          </div>
          {cs.compSet?.userArv && <Button size="xs" icon={<RotateCcw size={12} />} onClick={() => { cs.setUserArv(undefined); setOverride(0); setReason(""); }}>Use calculated</Button>}
        </div>
        <div className="mt-2 grid grid-cols-[140px_1fr_auto] gap-2">
          <NumberInput prefix="$" value={override || null} onChange={setOverride} placeholder="User ARV" />
          <input className="input" placeholder="Reason (e.g. superior lot, comps under-renovated)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="primary" onClick={() => override > 0 && cs.setUserArv(override, reason)}>Set ARV</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Deal calculator ────────────────────────────────────────────────
export function DealCalculator({ an, compact }: { an: An; compact?: boolean }) {
  const { inputs: i, outputs: o, update } = an;
  const [showMath, setShowMath] = useState(true);
  const pctField = (label: string, key: keyof typeof i, hint?: string) => (
    <Field label={label} hint={hint}><NumberInput size="sm" suffix="%" decimals={2} step={0.5} value={+(((i[key] as number) ?? 0) * 100).toFixed(2)} onChange={(v) => update({ [key]: v / 100 } as Partial<typeof i>)} /></Field>
  );
  const money = (label: string, key: keyof typeof i, hint?: ReactNode) => (
    <Field label={label} hint={hint}><NumberInput size="sm" prefix="$" step={1000} value={(i[key] as number) ?? 0} onChange={(v) => update({ [key]: v } as Partial<typeof i>)} /></Field>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input input-sm w-auto" value={i.presetId} onChange={(e) => an.applyPreset(e.target.value)} title="Market preset — sets every percentage below">
          {an.presets.map((p) => <option key={p.id} value={p.id}>Preset: {p.name}</option>)}
        </select>
        <Segmented size="xs" value={i.formula} onChange={(v) => update({ formula: v })} options={[{ value: "percent_of_arv", label: "% of ARV" }, { value: "detailed", label: "Detailed cost model" }]} />
        <button onClick={() => setShowMath((s) => !s)} className="ml-auto text-[11.5px] text-accent">{showMath ? "Hide" : "Show"} math</button>
      </div>
      <div className={cx("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
        <Field label={<span className="flex items-center gap-1">ARV <Badge tone={i.arvSource === "user" || i.arvSource === "manual" ? "accent" : "warn"}>{i.arvSource === "calculated" ? "calc" : i.arvSource}</Badge></span>}>
          <NumberInput size="sm" prefix="$" step={5000} value={i.arv} onChange={(v) => update({ arv: v })} />
        </Field>
        <Field label={<span className="flex items-center gap-1">Repairs <Badge tone={i.repairsSource === "estimator" ? "warn" : "accent"}>{i.repairsSource}</Badge></span>} hint={i.repairsSource === "manual" && an.repairsExpected != null ? <button className="text-accent" onClick={() => update({ repairsSource: "estimator", repairs: an.repairsExpected! })}>use estimator ({usd(an.repairsExpected, { compact: true })})</button> : undefined}>
          <NumberInput size="sm" prefix="$" step={1000} value={i.repairs} onChange={(v) => update({ repairs: v })} />
        </Field>
        {money("Wholesale fee", "wholesaleFee")}
        {money("Purchase price (seller)", "purchasePrice", o && <button className="text-accent" onClick={() => update({ purchasePrice: o.offers[1].price })}>use target</button>)}
        {i.formula === "percent_of_arv" ? pctField("Investor factor", "investorPct", "never hard-coded") : pctField("Buyer profit (of ARV)", "buyerProfitPct")}
        {pctField("Closing — buy", "closingCostsBuyPct")}
        {pctField("Closing — sell", "closingCostsSellPct")}
        {pctField("Agent / resale", "agentPct")}
        <Field label="Holding months"><NumberInput size="sm" value={i.holdingMonths} step={1} onChange={(v) => update({ holdingMonths: v })} /></Field>
        {money("Holding / month", "holdingCostMonthly")}
        {pctField("Financing (pts + int.)", "financingPct")}
        {money("Other expenses", "otherCosts")}
        {pctField("Target cushion", "offerTargetPct", "target = MAO × (1 − x)")}
        {pctField("Low cushion", "offerLowPct", "low = MAO × (1 − x)")}
        {money("Seller asking", "sellerAsk")}
      </div>
      {o && (
        <>
          <OfferRange o={o} />
          {showMath && (
            <div className={cx("grid gap-2", compact ? "grid-cols-1" : "md:grid-cols-2")}>
              <div>
                <div className="text-[11px] text-muted mb-1 font-mono">{o.maoFormula}</div>
                <MathLines lines={[...o.buyerMaxLines, ...o.maoLines.slice(1)]} />
              </div>
              <div>
                <div className="text-[11px] text-muted mb-1">Investor view at contract {usd(i.purchasePrice || o.offers[1].price)}{!i.purchasePrice && " (target)"}</div>
                <MathLines lines={[...o.totalInvestmentLines, { label: "Sale costs (closing + agent)", value: o.saleCosts, op: "−" }, { label: "Expected investor profit (ARV − investment − sale costs)", value: o.investorProfit, op: "=" }]} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[
              ["Total investment", usd(o.totalInvestment, { compact: true })], ["Investor profit", usd(o.investorProfit, { compact: true })], ["ROI", pct(o.roi, 1)],
              ["Profit margin", pct(o.profitMargin, 1)], ["Wholesale spread", usd(o.wholesaleSpread, { compact: true })], ["Buyer price", usd(o.buyerPurchasePrice, { compact: true })],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-border px-2 py-1.5"><div className="text-[10px] uppercase tracking-wide text-muted">{k}</div><div className={cx("text-[14px] font-semibold num", (k === "Investor profit" || k === "Wholesale spread") && v.startsWith("−") && "text-bad")}>{v}</div></div>
            ))}
          </div>
        </>
      )}
      {!o && <div className="rounded-md bg-panel-2 p-3 text-[12px] text-muted">Enter or calculate an ARV to see MAO and offer range.</div>}
    </div>
  );
}

export function OfferRange({ o }: { o: DealOutputs }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {o.offers.map((p) => (
        <div key={p.label} className={cx("rounded-lg border px-3 py-2", p.label === "Target" ? "border-accent bg-accent-soft" : "border-border")}>
          <div className="text-[10.5px] uppercase tracking-wide text-muted">{p.label === "Max" ? "Max offer (MAO)" : `${p.label} offer`}</div>
          <div className="text-[17px] font-semibold num">{usd(p.price)}</div>
          <div className="text-[11px] text-muted num">{pct(p.pctOfArv)} of ARV · fee <span className={p.fee >= 0 ? "text-good" : "text-bad"}>{usd(p.fee)}</span></div>
        </div>
      ))}
    </div>
  );
}

// ─── Visual deal indicator ──────────────────────────────────────────
const QUALITY_TONE = { Strong: "good", Good: "accent", Marginal: "warn", Weak: "bad", "No Deal": "bad" } as const;

export function DealIndicator({ an }: { an: An }) {
  const { inputs: i, outputs: o } = an;
  const [math, setMath] = useState(false);
  const cells: [string, string, string?][] = [
    ["ARV", usd(i.arv), i.arvSource],
    ["Repairs", usd(i.repairs), i.repairsSource],
    ["Seller ask", usd(i.sellerAsk ?? null)],
    ["Target offer", usd(o?.offers[1].price)],
    ["Max offer", usd(o?.offers[2].price)],
    ["Expected assignment", usd(o ? o.offers[1].fee : null)],
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-px rounded-lg overflow-hidden border border-border bg-border">
        {cells.map(([k, v, tag]) => (
          <div key={k} className="bg-panel px-3 py-2">
            <div className="text-[10.5px] uppercase tracking-wide text-muted flex items-center gap-1">{k}{tag && <span className="normal-case tracking-normal text-[10px] text-muted">· {tag}</span>}</div>
            <div className={cx("text-[17px] font-semibold num", k === "Expected assignment" && o && o.offers[1].fee > 0 && "text-good")}>{v}</div>
          </div>
        ))}
      </div>
      {o && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted">Deal quality</span>
          <Badge tone={QUALITY_TONE[o.quality]} className="text-[12px] h-[22px] px-2">{o.quality.toUpperCase()}</Badge>
          <button onClick={() => setMath((m) => !m)} className="ml-auto text-[11.5px] text-accent inline-flex items-center gap-1"><Info size={12} />{math ? "hide" : "show"} math</button>
        </div>
      )}
      {o && <div className="mt-1 text-[11.5px] text-fg-2">{o.qualityReason}</div>}
      {o && math && <MathLines className="mt-2" lines={[...o.buyerMaxLines, ...o.maoLines.slice(1)]} />}
    </div>
  );
}

// ─── Scores ─────────────────────────────────────────────────────────
export function DealScoreCard({ score }: { score: DealScoreResult }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <ScoreBadge score={score.score} size="lg" label="/ 100" />
        <div>
          <div className="text-[14px] font-semibold">{score.label}</div>
          <div className="text-[11.5px] text-muted">Weighted factor score · {Math.round(score.coverage * 100)}% of weight had data (missing factors excluded, not guessed)</div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {score.factors.map((f) => (
          <div key={f.key} className="grid grid-cols-[150px_60px_1fr] items-center gap-2 text-[11.5px]" title={f.detail}>
            <span className={cx(f.value == null && "text-muted")}>{f.label}</span>
            {f.value == null ? <span className="text-muted">n/a</span> : <Bar value={f.value} color={f.value >= 0.7 ? "var(--good)" : f.value >= 0.4 ? "var(--warn)" : "var(--bad)"} />}
            <span className="text-muted truncate">w{f.weight} · {f.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MotivationCard({ m }: { m: MotivationResult }) {
  const shown = m.factors.filter((f) => f.points > 0 || !f.available);
  return (
    <div>
      <div className="flex items-center gap-3">
        <ScoreBadge score={m.score} size="lg" label="motivation" />
        <div>
          <div className="text-[14px] font-semibold">{m.label} motivation</div>
          <div className="text-[11.5px] text-muted">Sum of indicator points (capped at 100). Kept separate from deal quality.</div>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        {shown.map((f) => (
          <div key={f.key} className="flex items-center gap-2 text-[11.5px]">
            <span className={cx("w-10 text-right num font-semibold", f.points > 0 ? "text-good" : "text-muted")}>{f.points > 0 ? `+${Math.round(f.points)}` : "—"}</span>
            <span className={cx("w-[150px] shrink-0", !f.available && "text-muted")}>{f.label}</span>
            <Badge tone={f.origin === "seller-stated" ? "violet" : f.origin === "user-entered" ? "accent" : f.origin === "calculated" ? "warn" : "neutral"}>{f.origin}</Badge>
            <span className="text-muted truncate">{f.detail}</span>
          </div>
        ))}
        {shown.length === 0 && <div className="text-[12px] text-muted">No motivation indicators found in connected data.</div>}
      </div>
    </div>
  );
}

export function SectionCard(props: Parameters<typeof Card>[0]) {
  return <Card {...props} />;
}
