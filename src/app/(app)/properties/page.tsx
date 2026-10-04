"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { distressList } from "@/components/property/PropertyPanel";
import { Badge, Button, PageHeader, Segmented } from "@/components/ui";
import { useSearch } from "@/lib/client/api";
import { num, pct100, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";
import { PIN_STATUS, PROPERTY_TYPE_LABEL, type PropertySummary } from "@/lib/types";

export default function Properties() {
  const router = useRouter();
  const openPanel = useUI((s) => s.openPanel);
  const leads = useWorkspace((s) => s.leads);
  const lists = useWorkspace((s) => s.lists);
  const [scope, setScope] = useState<"workspace" | "provider">("workspace");
  const [q, setQ] = useState("");
  const { data } = useSearch(scope === "provider" && q.trim().length >= 2 ? { filters: { query: q.trim() }, limit: 200 } : null);
  const workspace = useMemo(() => {
    const m = new Map<string, { p: PropertySummary; lead?: (typeof leads)[number]; lists: string[] }>();
    for (const l of leads) if (!l.deletedAt) m.set(l.propertyId, { p: l.property, lead: l, lists: [] });
    for (const ls of lists) for (const id of ls.propertyIds) { const e = m.get(id) ?? (ls.members[id] ? { p: ls.members[id], lists: [] } : null); if (e) { e.lists.push(ls.name); m.set(id, e); } }
    return [...m.values()];
  }, [leads, lists]);
  const rows = scope === "workspace"
    ? workspace.filter((r) => !q || `${r.p.line1} ${r.p.city} ${r.p.zip} ${r.p.ownerName} ${r.p.apn}`.toLowerCase().includes(q.toLowerCase()))
    : (data?.results ?? []).map((p) => ({ p, lead: leads.find((l) => l.propertyId === p.id && !l.deletedAt), lists: lists.filter((l) => l.propertyIds.includes(p.id)).map((l) => l.name) }));
  return (
    <div>
      <PageHeader title="Properties" subtitle={scope === "workspace" ? `${workspace.length} properties saved as leads or on lists (cached summaries)` : "Search every record from the connected property-data provider"}
        actions={<><Segmented value={scope} onChange={setScope} options={[{ value: "workspace", label: "My properties" }, { value: "provider", label: "All provider records" }]} /><Button variant="primary" href="/deal-finder">Deal Finder</Button></>} />
      <div className="px-5 pb-3"><input className="input w-[360px]" placeholder={scope === "provider" ? "Address, owner, APN, ZIP (min 2 chars)" : "Filter address, owner, APN, ZIP"} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="mx-5 mb-6 rounded-lg border border-border bg-panel overflow-auto">
        <table className="tbl text-[12.5px]">
          <thead><tr><th>Address</th><th>APN</th><th>Owner</th><th>Type</th><th className="text-right">Bd/Ba</th><th className="text-right">Sq ft</th><th className="text-right">Est. value</th><th className="text-right">Equity</th><th>Signals</th><th>Lead</th><th>Lists</th></tr></thead>
          <tbody>
            {rows.slice(0, 500).map(({ p, lead, lists: ls }) => (
              <tr key={p.id} className="cursor-pointer" onClick={() => (lead ? router.push(`/properties/${p.id}`) : openPanel(p.id))}>
                <td className="font-medium">{p.line1}<div className="text-[11px] text-muted font-normal">{p.city} {p.zip}</div></td>
                <td className="text-muted num">{p.apn}</td><td className="max-w-[180px] truncate">{p.ownerName}</td><td>{PROPERTY_TYPE_LABEL[p.propertyType]}</td>
                <td className="text-right num">{p.beds ?? "—"}/{p.baths ?? "—"}</td><td className="text-right num">{num(p.sqft)}</td>
                <td className="text-right num">{usd(p.estValue, { compact: true })}</td><td className="text-right num">{pct100(p.equityPct)}</td>
                <td><div className="flex gap-1">{distressList(p).slice(0, 2).map((t) => <Badge key={t.label} tone={t.tone}>{t.label}</Badge>)}</div></td>
                <td>{lead ? <Badge dot={PIN_STATUS[lead.status].color}>{lead.stage.replace(/_/g, " ")}</Badge> : <span className="text-muted">—</span>}</td>
                <td className="text-[11.5px] text-muted max-w-[180px] truncate">{ls.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-8 text-center text-[12.5px] text-muted">{scope === "provider" && q.length < 2 ? "Type to search the provider." : "Nothing found."}</div>}
      </div>
    </div>
  );
}
