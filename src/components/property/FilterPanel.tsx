"use client";
import { ChevronDown, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { countActive } from "@/lib/filters";
import { PROPERTY_TYPE_LABEL, type PropertyFilters, type PropertyType, type TriState } from "@/lib/types";
import { NumberInput, cx } from "../ui";

export const FILTER_STACKS: { name: string; filters: PropertyFilters; hint: string }[] = [
  { name: "Absentee + long-term + equity", hint: "Absentee · 15+ yrs · 60%+ equity · SFR · pre-1990", filters: { absentee: "yes", minYearsOwned: 15, minEquityPct: 60, propertyTypes: ["sfr"], maxYearBuilt: 1990 } },
  { name: "Tired landlords", hint: "Absentee, 10+ yrs, distress signal", filters: { tiredLandlord: "yes" } },
  { name: "Vacant", hint: "Vacancy indicator present", filters: { vacant: "yes" } },
  { name: "Pre-foreclosure", hint: "NOD / lis pendens on record", filters: { preForeclosure: "yes" } },
  { name: "Probate / inherited", hint: "Probate filing or inherited transfer", filters: { probate: "yes" } },
  { name: "Tax delinquent", hint: "Delinquent property taxes", filters: { taxDelinquent: "yes" } },
  { name: "Free & clear, out of state", hint: "No mortgage, owner out of state", filters: { freeAndClear: "yes", outOfState: "yes" } },
  { name: "High motivation", hint: "Motivation score ≥ 50", filters: { minMotivation: 50 } },
];

const TRI_FILTERS: { key: keyof PropertyFilters; label: string; group: "owner" | "distress" }[] = [
  { key: "ownerOccupied", label: "Owner occupied", group: "owner" },
  { key: "absentee", label: "Absentee owner", group: "owner" },
  { key: "outOfState", label: "Out-of-state owner", group: "owner" },
  { key: "corporateOwner", label: "LLC / corporate owner", group: "owner" },
  { key: "freeAndClear", label: "Free & clear", group: "owner" },
  { key: "cashPurchase", label: "Cash purchase", group: "owner" },
  { key: "taxDelinquent", label: "Tax delinquent", group: "distress" },
  { key: "preForeclosure", label: "Pre-foreclosure", group: "distress" },
  { key: "foreclosure", label: "Foreclosure", group: "distress" },
  { key: "auction", label: "Auction scheduled", group: "distress" },
  { key: "probate", label: "Probate", group: "distress" },
  { key: "inherited", label: "Inherited", group: "distress" },
  { key: "vacant", label: "Vacancy indicator", group: "distress" },
  { key: "codeViolations", label: "Code violations", group: "distress" },
  { key: "liens", label: "Liens", group: "distress" },
  { key: "tiredLandlord", label: "Tired landlord", group: "distress" },
  { key: "expiredListing", label: "Expired listing (MLS)", group: "distress" },
];

function Section({ title, children, defaultOpen = true, count }: { title: string; children: ReactNode; defaultOpen?: boolean; count?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 h-9 text-[12px] font-semibold">
        <span>{title}{count ? <span className="ml-1.5 rounded bg-accent-soft text-accent-text px-1 text-[10.5px]">{count}</span> : null}</span>
        <ChevronDown size={14} className={cx("text-muted transition", open && "rotate-180")} />
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function Range({ label, min, max, onMin, onMax, prefix, suffix }: { label: string; min?: number; max?: number; onMin: (v?: number) => void; onMax: (v?: number) => void; prefix?: string; suffix?: string }) {
  return (
    <div>
      <div className="text-[11.5px] text-fg-2 mb-1">{label}</div>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberInput size="sm" prefix={prefix} suffix={suffix} placeholder="Min" value={min ?? null} onChange={(v) => onMin(v || undefined)} />
        <NumberInput size="sm" prefix={prefix} suffix={suffix} placeholder="Max" value={max ?? null} onChange={(v) => onMax(v || undefined)} />
      </div>
    </div>
  );
}

function Tri({ label, value, onChange }: { label: string; value?: TriState; onChange: (v: TriState) => void }) {
  const v = value ?? "any";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px] text-fg-2 truncate">{label}</span>
      <div className="inline-flex rounded border border-border overflow-hidden shrink-0">
        {(["any", "yes", "no"] as TriState[]).map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)}
            className={cx("h-5 px-1.5 text-[10.5px] capitalize", v === o ? (o === "yes" ? "bg-good text-white" : o === "no" ? "bg-bad text-white" : "bg-hover text-fg") : "text-muted hover:bg-hover")}>{o}</button>
        ))}
      </div>
    </div>
  );
}

export function FilterPanel({ filters, onChange, zipOptions, cityOptions }: { filters: PropertyFilters; onChange: (f: PropertyFilters) => void; zipOptions?: string[]; cityOptions?: string[] }) {
  const set = (patch: Partial<PropertyFilters>) => {
    const next = { ...filters, ...patch };
    for (const k of Object.keys(next) as (keyof PropertyFilters)[]) {
      const v = next[k];
      if (v === undefined || v === "any" || v === "" || (Array.isArray(v) && v.length === 0)) delete next[k];
    }
    onChange(next);
  };
  const types = filters.propertyTypes ?? [];
  const ownerCount = TRI_FILTERS.filter((t) => t.group === "owner" && filters[t.key] && filters[t.key] !== "any").length + (filters.minYearsOwned || filters.maxYearsOwned ? 1 : 0) + (filters.minEquityPct || filters.minEquity ? 1 : 0);
  const distressCount = TRI_FILTERS.filter((t) => t.group === "distress" && filters[t.key] && filters[t.key] !== "any").length + (filters.minMotivation ? 1 : 0);
  return (
    <div className="text-[12px]">
      <div className="flex items-center justify-between px-3 h-10 border-b border-border">
        <span className="font-semibold text-[12.5px]">Filters {countActive(filters) > 0 && <span className="text-muted font-normal">· {countActive(filters)} active</span>}</span>
        <button type="button" onClick={() => onChange({})} className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-fg"><RotateCcw size={12} /> Reset</button>
      </div>
      <Section title="Quick stacks">
        <div className="flex flex-wrap gap-1">
          {FILTER_STACKS.map((s) => (
            <button key={s.name} type="button" title={s.hint} onClick={() => onChange(s.filters)} className="h-6 px-2 rounded border border-border text-[11.5px] hover:bg-hover">{s.name}</button>
          ))}
        </div>
      </Section>
      <Section title="Location">
        <input className="input input-sm" placeholder="Address, owner, APN contains…" value={filters.query ?? ""} onChange={(e) => set({ query: e.target.value || undefined })} />
        <div className="grid grid-cols-2 gap-1.5">
          <select className="input input-sm" value={filters.city ?? ""} onChange={(e) => set({ city: e.target.value || undefined })}>
            <option value="">Any city</option>{(cityOptions ?? []).map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="input input-sm" value={filters.county ?? ""} onChange={(e) => set({ county: e.target.value || undefined })}>
            <option value="">Any county</option><option>Sacramento</option>
          </select>
        </div>
        <select className="input input-sm" value={filters.zips?.[0] ?? ""} onChange={(e) => set({ zips: e.target.value ? [e.target.value] : undefined })}>
          <option value="">Any ZIP</option>{(zipOptions ?? []).map((z) => <option key={z}>{z}</option>)}
        </select>
        <p className="text-[11px] text-muted">Draw a polygon or radius on the map to search a custom area.</p>
      </Section>
      <Section title="Property">
        <div className="flex flex-wrap gap-1">
          {(Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[]).map((t) => (
            <button key={t} type="button" onClick={() => set({ propertyTypes: types.includes(t) ? types.filter((x) => x !== t) : [...types, t] })}
              className={cx("h-6 px-2 rounded border text-[11.5px]", types.includes(t) ? "bg-accent-soft border-transparent text-accent-text" : "border-border text-muted hover:text-fg")}>{PROPERTY_TYPE_LABEL[t]}</button>
          ))}
        </div>
        <Range label="Year built" min={filters.minYearBuilt} max={filters.maxYearBuilt} onMin={(v) => set({ minYearBuilt: v })} onMax={(v) => set({ maxYearBuilt: v })} />
        <Range label="Square feet" min={filters.minSqft} max={filters.maxSqft} onMin={(v) => set({ minSqft: v })} onMax={(v) => set({ maxSqft: v })} />
        <Range label="Lot size (sf)" min={filters.minLotSqft} max={filters.maxLotSqft} onMin={(v) => set({ minLotSqft: v })} onMax={(v) => set({ maxLotSqft: v })} />
        <Range label="Bedrooms" min={filters.minBeds} max={filters.maxBeds} onMin={(v) => set({ minBeds: v })} onMax={(v) => set({ maxBeds: v })} />
        <div><div className="text-[11.5px] text-fg-2 mb-1">Min bathrooms</div><NumberInput size="sm" value={filters.minBaths ?? null} onChange={(v) => set({ minBaths: v || undefined })} decimals={1} /></div>
      </Section>
      <Section title="Value & sale" defaultOpen={false}>
        <Range label="Estimated value" prefix="$" min={filters.minValue} max={filters.maxValue} onMin={(v) => set({ minValue: v })} onMax={(v) => set({ maxValue: v })} />
        <Range label="Last sale price" prefix="$" min={filters.minLastSalePrice} max={filters.maxLastSalePrice} onMin={(v) => set({ minLastSalePrice: v })} onMax={(v) => set({ maxLastSalePrice: v })} />
        <div className="grid grid-cols-2 gap-1.5">
          <label className="text-[11.5px] text-fg-2">Sold after<input type="date" className="input input-sm mt-1" value={filters.lastSaleAfter ?? ""} onChange={(e) => set({ lastSaleAfter: e.target.value || undefined })} /></label>
          <label className="text-[11.5px] text-fg-2">Sold before<input type="date" className="input input-sm mt-1" value={filters.lastSaleBefore ?? ""} onChange={(e) => set({ lastSaleBefore: e.target.value || undefined })} /></label>
        </div>
      </Section>
      <Section title="Owner & equity" count={ownerCount}>
        <Range label="Years owned" min={filters.minYearsOwned} max={filters.maxYearsOwned} onMin={(v) => set({ minYearsOwned: v })} onMax={(v) => set({ maxYearsOwned: v })} />
        <div className="grid grid-cols-2 gap-1.5">
          <div><div className="text-[11.5px] text-fg-2 mb-1">Min equity %</div><NumberInput size="sm" suffix="%" value={filters.minEquityPct ?? null} onChange={(v) => set({ minEquityPct: v || undefined })} /></div>
          <div><div className="text-[11.5px] text-fg-2 mb-1">Min equity $</div><NumberInput size="sm" prefix="$" value={filters.minEquity ?? null} onChange={(v) => set({ minEquity: v || undefined })} /></div>
        </div>
        {TRI_FILTERS.filter((t) => t.group === "owner").map((t) => <Tri key={t.key} label={t.label} value={filters[t.key] as TriState} onChange={(v) => set({ [t.key]: v } as Partial<PropertyFilters>)} />)}
        <p className="text-[10.5px] text-muted">Equity and mortgage figures are provider estimates, not payoff statements.</p>
      </Section>
      <Section title="Distress & motivation" count={distressCount}>
        <div><div className="text-[11.5px] text-fg-2 mb-1">Min motivation score</div><NumberInput size="sm" value={filters.minMotivation ?? null} onChange={(v) => set({ minMotivation: v || undefined })} /></div>
        {TRI_FILTERS.filter((t) => t.group === "distress").map((t) => <Tri key={t.key} label={t.label} value={filters[t.key] as TriState} onChange={(v) => set({ [t.key]: v } as Partial<PropertyFilters>)} />)}
        <p className="text-[10.5px] text-muted">Distress flags appear only where a connected, licensed source provides them; “unknown” never matches yes or no.</p>
      </Section>
    </div>
  );
}
