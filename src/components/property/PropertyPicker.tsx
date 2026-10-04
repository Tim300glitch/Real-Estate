"use client";
import { Search, MapPin } from "lucide-react";
import { useState } from "react";
import { useSearch } from "@/lib/client/api";
import { useWorkspace } from "@/lib/store/workspace";
import { PROPERTY_TYPE_LABEL, type PropertySummary } from "@/lib/types";
import { usd } from "@/lib/format";
import { cx } from "../ui";

/** Address / owner / APN search against the property provider, with workspace leads first. */
export function PropertyPicker({ onPick, autoFocus, placeholder = "Search address, owner, APN, ZIP…" }: { onPick: (p: PropertySummary) => void; autoFocus?: boolean; placeholder?: string }) {
  const [q, setQ] = useState("");
  const leads = useWorkspace((s) => s.leads);
  const { data, loading } = useSearch(q.trim().length >= 2 ? { filters: { query: q.trim() }, limit: 8, sort: "motivation" } : null, 200);
  const ql = q.trim().toLowerCase();
  const leadHits = ql.length >= 2 ? leads.filter((l) => !l.deletedAt && `${l.property.line1} ${l.property.ownerName} ${l.property.apn} ${l.property.zip}`.toLowerCase().includes(ql)).slice(0, 4) : [];
  const leadIds = new Set(leadHits.map((l) => l.propertyId));
  const rows: { p: PropertySummary; lead: boolean }[] = [...leadHits.map((l) => ({ p: l.property, lead: true })), ...(data?.results ?? []).filter((p) => !leadIds.has(p.id)).map((p) => ({ p, lead: false }))];
  return (
    <div>
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input autoFocus={autoFocus} className="input h-9 pl-8" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {q.trim().length >= 2 && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {loading && !rows.length && <div className="p-3 text-[12px] text-muted">Searching…</div>}
          {!loading && !rows.length && <div className="p-3 text-[12px] text-muted">No properties match “{q}”. Try a street name, owner, ZIP or APN.</div>}
          {rows.map(({ p, lead }) => (
            <button key={p.id} type="button" onClick={() => onPick(p)} className={cx("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-hover")}>
              <MapPin size={14} className="text-muted shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-medium truncate">{p.line1}, {p.city} {p.zip}</div>
                <div className="text-[11.5px] text-muted truncate">{p.ownerName} · {PROPERTY_TYPE_LABEL[p.propertyType]} · {p.beds ?? "—"}bd/{p.baths ?? "—"}ba · {usd(p.estValue, { compact: true })}</div>
              </div>
              {lead && <span className="text-[10.5px] rounded bg-accent-soft text-accent-text px-1.5 py-0.5">Lead</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
