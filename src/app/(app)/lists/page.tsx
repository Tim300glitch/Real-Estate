"use client";
import { BookmarkPlus, Download, Map as MapIcon, Pencil, Plus, RefreshCw, Trash2, Zap } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ListForm } from "@/components/crm/forms";
import { FilterPanel } from "@/components/property/FilterPanel";
import { distressList } from "@/components/property/PropertyPanel";
import { Badge, Button, Card, Dialog, PageHeader, cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import { describeFilters } from "@/lib/filters";
import { pct100, relative, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";
import { PIN_STATUS, type PropertyFilters, type PropertySummary } from "@/lib/types";

function Lists() {
  const ws = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const { toast, openPanel } = useUI();
  const [active, setActive] = useState<string | null>(params.get("id") ?? ws.lists[0]?.id ?? null);
  const [newOpen, setNewOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rules, setRules] = useState<PropertyFilters>({});
  const [dyn, setDyn] = useState<{ id: string; rows: PropertySummary[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const list = ws.lists.find((l) => l.id === active);

  useEffect(() => {
    if (!list?.dynamic || !list.rules) return;
    setLoading(true);
    api.search({ filters: list.rules, limit: 1000, sort: "motivation" }).then((r) => setDyn({ id: list.id, rows: r.results, total: r.total })).finally(() => setLoading(false));
  }, [list?.id, list?.dynamic, JSON.stringify(list?.rules)]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows: PropertySummary[] = useMemo(() => !list ? [] : list.dynamic ? (dyn?.id === list.id ? dyn.rows : []) : list.propertyIds.map((id) => list.members[id]).filter(Boolean), [list, dyn]);
  const leadStatus = new Map(ws.leads.filter((l) => !l.deletedAt).map((l) => [l.propertyId, l.status]));

  async function refreshSearch(id: string) {
    const s = ws.savedSearches.find((x) => x.id === id)!;
    const r = await api.search({ filters: s.filters, area: s.area, limit: 5000 });
    const n = ws.refreshSearch(id, r.results.map((x) => x.id));
    toast(n ? `${n} new matching propert${n === 1 ? "y" : "ies"} since last refresh` : "No new matches since last refresh", n ? "good" : "info");
  }

  return (
    <div>
      <PageHeader title="Lists & saved searches" subtitle="Static lists, rule-based dynamic lists, and saved searches that flag new matches after data refreshes"
        actions={<Button variant="primary" icon={<Plus size={13} />} onClick={() => setNewOpen(true)}>New list</Button>} />
      <div className="px-5 pb-6 grid lg:grid-cols-[280px_1fr] gap-3">
        <div className="space-y-3">
          <Card title="Lists" bodyClass="p-1">
            {ws.lists.map((l) => (
              <button key={l.id} onClick={() => setActive(l.id)} className={cx("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px]", active === l.id ? "bg-accent-soft" : "hover:bg-hover")}>
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                <span className="truncate flex-1">{l.name}</span>
                {l.dynamic ? <Zap size={12} className="text-warn" /> : <span className="text-[11px] text-muted num">{l.propertyIds.length}</span>}
              </button>
            ))}
          </Card>
          <Card title="Saved searches" bodyClass="p-1">
            {ws.savedSearches.map((s) => (
              <div key={s.id} className="rounded-md px-2 py-1.5 hover:bg-hover">
                <div className="flex items-center gap-1 text-[12.5px]">
                  <button className="truncate flex-1 text-left font-medium" onClick={() => router.push(`/deal-finder?filters=${encodeURIComponent(JSON.stringify(s.filters))}`)}>{s.name}</button>
                  {s.newMatchIds.length > 0 && <Badge tone="good">{s.newMatchIds.length} new</Badge>}
                  <button title="Refresh & detect new matches" onClick={() => refreshSearch(s.id)} className="text-muted hover:text-fg"><RefreshCw size={12} /></button>
                  <button title="Delete" onClick={() => ws.deleteSearch(s.id)} className="text-muted hover:text-bad"><Trash2 size={12} /></button>
                </div>
                <div className="text-[11px] text-muted truncate">{describeFilters(s.filters).join(" · ")}</div>
                <div className="text-[10.5px] text-muted">last run {relative(s.lastRunAt)} · {s.lastResultIds.length} results</div>
              </div>
            ))}
            {ws.savedSearches.length === 0 && <div className="p-2 text-[12px] text-muted">Save searches from the Deal Finder.</div>}
          </Card>
        </div>
        {list ? (
          <Card title={<span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: list.color }} />{list.name}{list.dynamic && <Badge tone="warn"><Zap size={10} />dynamic</Badge>}</span>}
            subtitle={list.dynamic ? (loading ? "evaluating rules…" : `${dyn?.total ?? 0} matching now`) : `${list.propertyIds.length} properties`}
            actions={<>
              {list.dynamic && <Button size="xs" icon={<Pencil size={12} />} onClick={() => { setRules(list.rules ?? {}); setRulesOpen(true); }}>Edit rules</Button>}
              <Button size="xs" icon={<MapIcon size={12} />} onClick={() => router.push(list.dynamic ? `/deal-finder?filters=${encodeURIComponent(JSON.stringify(list.rules))}` : "/map")}>{list.dynamic ? "Open in Deal Finder" : "Map"}</Button>
              <Button size="xs" icon={<BookmarkPlus size={12} />} onClick={() => { let n = 0; rows.slice(0, 200).forEach((r) => { if (!leadStatus.has(r.id)) { ws.saveLead(r, { source: "list" }); n++; } }); toast(`${n} leads created from list`); }}>Save all as leads</Button>
              <Button size="xs" icon={<Download size={12} />} onClick={() => {
                const csv = ["address,city,zip,owner,apn,est_value,equity_pct", ...rows.map((r) => [r.line1, r.city, r.zip, r.ownerName, r.apn, r.estValue, r.equityPct].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
                const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${list.name}.csv`; a.click();
              }}>Export</Button>
              <Button size="xs" variant="ghost" icon={<Trash2 size={12} />} onClick={() => { if (confirm(`Delete list ${list.name}?`)) { ws.deleteList(list.id); setActive(ws.lists[0]?.id ?? null); } }} />
            </>} bodyClass="p-0">
            {list.description && <div className="px-3 py-2 text-[12px] text-muted border-b border-border">{list.description}</div>}
            {list.dynamic && list.rules && <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1">{describeFilters(list.rules).map((d) => <Badge key={d} tone="warn">{d}</Badge>)}<span className="text-[11px] text-muted ml-1">Properties are added/removed automatically as provider data changes.</span></div>}
            <div className="overflow-auto max-h-[70vh]">
              <table className="tbl text-[12.5px]">
                <thead><tr><th>Address</th><th>Owner</th><th className="text-right">Est. value</th><th className="text-right">Equity</th><th className="text-right">Owned</th><th>Signals</th><th className="text-right">Motivation</th><th>Lead</th>{!list.dynamic && <th></th>}</tr></thead>
                <tbody>{rows.slice(0, 500).map((r) => (
                  <tr key={r.id} className="cursor-pointer" onClick={() => openPanel(r.id)}>
                    <td className="font-medium">{r.line1}<div className="text-[11px] text-muted font-normal">{r.city} {r.zip}</div></td>
                    <td className="max-w-[180px] truncate">{r.ownerName}</td><td className="text-right num">{usd(r.estValue, { compact: true })}</td><td className="text-right num">{pct100(r.equityPct)}</td>
                    <td className="text-right num">{r.yearsOwned?.toFixed(0)}y</td>
                    <td><div className="flex gap-1">{distressList(r).slice(0, 3).map((t) => <Badge key={t.label} tone={t.tone}>{t.label}</Badge>)}</div></td>
                    <td className="text-right num font-semibold">{r.motivationScore}</td>
                    <td>{leadStatus.has(r.id) ? <Badge dot={PIN_STATUS[leadStatus.get(r.id)!].color}>{PIN_STATUS[leadStatus.get(r.id)!].label}</Badge> : "—"}</td>
                    {!list.dynamic && <td onClick={(e) => e.stopPropagation()}><button className="text-muted hover:text-bad" onClick={() => ws.removeFromList(list.id, r.id)}><Trash2 size={12} /></button></td>}
                  </tr>))}</tbody>
              </table>
              {rows.length === 0 && !loading && <div className="p-8 text-center text-[12.5px] text-muted">{list.dynamic ? "No properties currently match these rules." : "Empty list — add properties from the map, Deal Finder, or a property panel."}</div>}
            </div>
          </Card>
        ) : <Card><div className="text-muted text-[12.5px]">Create a list to get started.</div></Card>}
      </div>
      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="New list"><ListForm onDone={() => setNewOpen(false)} /></Dialog>
      <Dialog open={rulesOpen} onClose={() => setRulesOpen(false)} title="Dynamic list rules" width={420} footer={<><Button onClick={() => setRulesOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { if (list) ws.updateList(list.id, { rules }); setRulesOpen(false); }}>Save rules</Button></>}>
        <div className="-m-4 max-h-[60vh] overflow-y-auto"><FilterPanel filters={rules} onChange={setRules} /></div>
      </Dialog>
    </div>
  );
}

export default function Page() { return <Suspense><Lists /></Suspense>; }
