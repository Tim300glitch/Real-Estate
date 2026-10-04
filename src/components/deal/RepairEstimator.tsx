"use client";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { CONDITIONS, MARKET_COST_MULTIPLIERS, REPAIR_CATALOG, UNIT_LABEL, catalogUnitCost, itemTotal, newRepairItem, repairTotals } from "@/lib/calc/repairs";
import { usd } from "@/lib/format";
import { useWorkspace } from "@/lib/store/workspace";
import type { Condition, PropertySummary, RepairItem, RepairUnit } from "@/lib/types";
import { Bar, Button, Menu, MenuItem, NumberInput, cx } from "../ui";

const SCOPES: { name: string; items: [string, Condition][] }[] = [
  { name: "Cosmetic refresh", items: [["Interior paint", "moderate"], ["Flooring", "moderate"], ["Landscaping", "minor"], ["Appliances", "minor"], ["Trash removal", "minor"]] },
  { name: "Moderate rehab", items: [["Interior paint", "moderate"], ["Flooring", "moderate"], ["Kitchen", "moderate"], ["Bathrooms", "moderate"], ["Exterior paint", "minor"], ["Landscaping", "minor"], ["Appliances", "moderate"], ["Trash removal", "minor"]] },
  { name: "Heavy rehab", items: [["Roof", "full"], ["HVAC", "full"], ["Electrical", "moderate"], ["Plumbing", "moderate"], ["Kitchen", "major"], ["Bathrooms", "major"], ["Flooring", "major"], ["Interior paint", "major"], ["Exterior paint", "moderate"], ["Windows", "moderate"], ["Drywall", "moderate"], ["Trash removal", "major"], ["Permits", "moderate"]] },
  { name: "Full gut", items: [["Demo", "full"], ["Roof", "full"], ["HVAC", "full"], ["Electrical", "full"], ["Plumbing", "full"], ["Kitchen", "full"], ["Bathrooms", "full"], ["Flooring", "full"], ["Drywall", "full"], ["Insulation", "full"], ["Interior paint", "full"], ["Exterior paint", "full"], ["Windows", "full"], ["Doors", "full"], ["Trash removal", "full"], ["Permits", "full"], ["Miscellaneous", "major"]] },
];

export function useRepairEstimate(subject: PropertySummary) {
  const est = useWorkspace((s) => s.repairs.find((r) => r.propertyId === subject.id));
  const saveRepairs = useWorkspace((s) => s.saveRepairs);
  const defaultMarket = useWorkspace((s) => s.settings.repairMarketId);
  const marketId = est?.marketId ?? defaultMarket;
  const multiplier = MARKET_COST_MULTIPLIERS.find((m) => m.id === marketId)?.multiplier ?? 1;
  const ctx = { sqft: subject.sqft ?? 1500, beds: subject.beds ?? 3, baths: subject.baths ?? 2, lotSqft: subject.lotSqft ?? 6000 };
  const items = est?.items ?? [];
  const save = (patch: Partial<{ items: RepairItem[]; marketId: string; contingencyPct: number; walkthrough: NonNullable<typeof est>["walkthrough"] }>) =>
    saveRepairs({ id: est?.id, propertyId: subject.id, marketId: patch.marketId ?? marketId, contingencyPct: patch.contingencyPct ?? est?.contingencyPct ?? 10, items: patch.items ?? items, walkthrough: patch.walkthrough ?? est?.walkthrough ?? [] });
  return { est, items, marketId, multiplier, ctx, save, totals: repairTotals(items, est?.contingencyPct ?? 10) };
}

export function RepairEstimator({ subject, compact }: { subject: PropertySummary; compact?: boolean }) {
  const r = useRepairEstimate(subject);
  const [cat, setCat] = useState(REPAIR_CATALOG[0].category);
  const [cond, setCond] = useState<Condition>("moderate");
  const t = r.totals;
  const setItem = (id: string, patch: Partial<RepairItem>) => r.save({ items: r.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[["Low rehab", t.low], ["Expected rehab", t.expected], ["High rehab", t.high]].map(([k, v]) => (
          <div key={k as string} className={cx("rounded-lg border px-3 py-2", k === "Expected rehab" ? "border-accent bg-accent-soft" : "border-border")}>
            <div className="text-[10.5px] uppercase tracking-wide text-muted">{k}</div>
            <div className="text-[17px] font-semibold num">{usd(v as number)}</div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-muted">{t.explanation} · subtotal {usd(t.subtotal)} · {usd(subject.sqft ? t.expected / subject.sqft : null)}/sf</div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="input input-sm w-auto" value={r.marketId} onChange={(e) => {
          const m = MARKET_COST_MULTIPLIERS.find((x) => x.id === e.target.value)!;
          r.save({ marketId: m.id, items: r.items.map((i) => ({ ...i, unitCost: catalogUnitCost(i.category, i.condition, m.multiplier) || i.unitCost })) });
        }}>
          {MARKET_COST_MULTIPLIERS.map((m) => <option key={m.id} value={m.id}>Pricing: {m.name} (×{m.multiplier})</option>)}
        </select>
        <label className="flex items-center gap-1 text-[12px] text-fg-2">Contingency <NumberInput size="sm" className="w-[66px]" suffix="%" value={r.est?.contingencyPct ?? 10} onChange={(v) => r.save({ contingencyPct: v })} /></label>
        <Menu align="left" trigger={(tg) => <Button size="xs" icon={<Wand2 size={12} />} onClick={tg}>Quick scope</Button>}>
          {(close) => SCOPES.map((s) => <MenuItem key={s.name} onClick={() => { r.save({ items: s.items.map(([c, cd]) => newRepairItem(c, cd, r.ctx, r.multiplier)) }); close(); }}>{s.name} (replaces items)</MenuItem>)}
        </Menu>
        <div className="flex items-center gap-1 ml-auto">
          <select className="input input-sm w-[140px]" value={cat} onChange={(e) => setCat(e.target.value)}>{REPAIR_CATALOG.map((c) => <option key={c.category}>{c.category}</option>)}</select>
          <select className="input input-sm w-[130px]" value={cond} onChange={(e) => setCond(e.target.value as Condition)}>{CONDITIONS.filter((c) => c.id !== "good").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          <Button size="xs" variant="primary" icon={<Plus size={12} />} onClick={() => r.save({ items: [...r.items, newRepairItem(cat, cond, r.ctx, r.multiplier)] })}>Add</Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-auto" style={{ maxHeight: compact ? 300 : undefined }}>
        <table className="tbl text-[12px]">
          <thead><tr><th>Category</th>{!compact && <th>Room</th>}<th>Condition</th><th>Unit</th><th className="text-right">Qty</th><th className="text-right">Unit cost</th><th className="text-right">Total</th>{!compact && <th>Notes</th>}<th></th></tr></thead>
          <tbody>
            {r.items.map((i) => (
              <tr key={i.id}>
                <td className="font-medium">{i.category}</td>
                {!compact && <td><input className="input input-sm w-[100px]" value={i.room ?? ""} onChange={(e) => setItem(i.id, { room: e.target.value })} /></td>}
                <td><select className="input input-sm w-[120px]" value={i.condition} onChange={(e) => { const c = e.target.value as Condition; setItem(i.id, { condition: c, unitCost: catalogUnitCost(i.category, c, r.multiplier) }); }}>
                  {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></td>
                <td><select className="input input-sm w-[96px]" value={i.unit} onChange={(e) => setItem(i.id, { unit: e.target.value as RepairUnit })}>{Object.entries(UNIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                <td className="text-right"><NumberInput size="sm" className="w-[80px] ml-auto" value={i.quantity} onChange={(v) => setItem(i.id, { quantity: v })} /></td>
                <td className="text-right"><NumberInput size="sm" className="w-[90px] ml-auto" prefix="$" decimals={2} value={i.unitCost} onChange={(v) => setItem(i.id, { unitCost: v })} /></td>
                <td className="text-right num font-medium">{usd(itemTotal(i))}</td>
                {!compact && <td><input className="input input-sm w-[160px]" value={i.notes ?? ""} onChange={(e) => setItem(i.id, { notes: e.target.value })} /></td>}
                <td><button onClick={() => r.save({ items: r.items.filter((x) => x.id !== i.id) })} className="text-muted hover:text-bad"><Trash2 size={13} /></button></td>
              </tr>
            ))}
            {r.items.length === 0 && <tr><td colSpan={9} className="text-center text-muted py-6">No repair items yet — add categories or use a quick scope.</td></tr>}
          </tbody>
        </table>
      </div>
      {!compact && t.byCategory.length > 0 && (
        <div className="space-y-1">
          {t.byCategory.slice(0, 8).map((c) => (
            <div key={c.category} className="grid grid-cols-[120px_1fr_70px] items-center gap-2 text-[11.5px]"><span className="text-fg-2">{c.category}</span><Bar value={c.total} max={t.byCategory[0].total} /><span className="text-right num">{usd(c.total, { compact: true })}</span></div>
          ))}
        </div>
      )}
      <p className="text-[10.5px] text-muted">Unit costs are editable default assumptions (e.g. interior paint, moderate: $3.25/sf), not contractor quotes. Changing condition re-prices the line from the market price book.</p>
    </div>
  );
}
