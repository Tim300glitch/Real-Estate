"use client";
import { Database, Calculator, Building2, PencilLine, Landmark, Info } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Confidence, Provenance, SourceKind } from "@/lib/types";
import { date } from "@/lib/format";
import { cx } from ".";

export const SOURCE_META: Record<SourceKind, { label: string; color: string; icon: typeof Database }> = {
  public_record: { label: "Public record", color: "var(--good)", icon: Landmark },
  third_party: { label: "Third-party provider", color: "var(--info)", icon: Database },
  mls: { label: "MLS", color: "var(--violet)", icon: Building2 },
  calculated: { label: "Calculated estimate", color: "var(--warn)", icon: Calculator },
  user_entered: { label: "User-entered", color: "var(--accent)", icon: PencilLine },
};

const CONF_LABEL: Record<Confidence, string> = { high: "High confidence", medium: "Medium confidence", low: "Low confidence", unknown: "Unknown confidence" };

export function SourceDot({ kind }: { kind: SourceKind }) {
  return <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ background: SOURCE_META[kind].color }} />;
}

/** A value with an inspectable data-source popover (source, as-of date, confidence, note). */
export function Sourced({ prov, children, className, inline }: { prov?: Provenance | null; children: ReactNode; className?: string; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  if (!prov) return <span className={className}>{children}</span>;
  const meta = SOURCE_META[prov.kind];
  const Icon = meta.icon;
  return (
    <span ref={ref} className={cx("relative inline-flex items-center gap-1 min-w-0", className)}>
      <span className="truncate">{children}</span>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} title={`${meta.label} · ${prov.source}`}
        className={cx("inline-flex items-center justify-center rounded hover:bg-hover shrink-0", inline ? "h-3.5 w-3.5" : "h-4 w-4")}>
        <SourceDot kind={prov.kind} />
      </button>
      {open && (
        <span className="anim-fade absolute right-0 top-5 z-[65] w-[260px] rounded-lg border border-border bg-panel p-2.5 text-left shadow-pop whitespace-normal">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: meta.color }}>
            <Icon size={12} /> {meta.label}
          </span>
          <span className="mt-1.5 grid grid-cols-[72px_1fr] gap-y-1 text-[11.5px]">
            <span className="text-muted">Source</span><span>{prov.source}</span>
            <span className="text-muted">As of</span><span>{date(prov.asOf)}</span>
            <span className="text-muted">Confidence</span><span>{CONF_LABEL[prov.confidence]}</span>
            {prov.note && (<><span className="text-muted">Note</span><span>{prov.note}</span></>)}
          </span>
          {prov.synthetic && (
            <span className="mt-2 flex gap-1 rounded bg-warn-soft px-1.5 py-1 text-[10.5px] text-warn"><Info size={11} className="mt-px shrink-0" />Synthetic demo data — not a real record.</span>
          )}
        </span>
      )}
    </span>
  );
}

export function SourceLegend({ className }: { className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted", className)}>
      {(Object.keys(SOURCE_META) as SourceKind[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1"><SourceDot kind={k} />{SOURCE_META[k].label}</span>
      ))}
    </div>
  );
}
