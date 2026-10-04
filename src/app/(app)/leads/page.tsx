"use client";
import { Copy, Download, Flame, ListOrdered, Tag, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Badge, Button, Dialog, Menu, MenuItem, PageHeader, cx } from "@/components/ui";
import { motivationScore } from "@/lib/calc/scores";
import { normalizeAddress, relative, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { SYSTEM_TAGS, TEAM, useWorkspace, userName } from "@/lib/store/workspace";
import { LEAD_SOURCE_LABEL, PIN_STATUS, STAGES, type LeadSource, type LeadStage, type PinStatus } from "@/lib/types";

function Leads() {
  const params = useSearchParams();
  const router = useRouter();
  const ws = useWorkspace();
  const toast = useUI((s) => s.toast);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<LeadStage | "">("");
  const [status, setStatus] = useState<PinStatus | "">((params.get("status") as PinStatus) ?? "");
  const [source, setSource] = useState<LeadSource | "">("");
  const [tag, setTag] = useState("");
  const [rep, setRep] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dupOpen, setDupOpen] = useState(false);
  const [sort, setSort] = useState<"updated" | "motivation" | "created" | "contact">("updated");

  const rows = useMemo(() => ws.leads.filter((l) => !l.deletedAt)
    .filter((l) => !q || `${l.property.line1} ${l.property.city} ${l.property.zip} ${l.property.ownerName} ${l.property.apn}`.toLowerCase().includes(q.toLowerCase()))
    .filter((l) => (!stage || l.stage === stage) && (!status || l.status === status) && (!source || l.source === source) && (!tag || l.tags.includes(tag)) && (!rep || l.assignedTo === rep))
    .map((l) => ({ l, m: motivationScore(l.property, ws.sellers.find((s) => s.id === l.sellerId)).score }))
    .sort((a, b) => sort === "motivation" ? b.m - a.m : sort === "created" ? b.l.createdAt.localeCompare(a.l.createdAt) : sort === "contact" ? (a.l.lastContactAt ?? "").localeCompare(b.l.lastContactAt ?? "") : b.l.updatedAt.localeCompare(a.l.updatedAt)),
  [ws.leads, ws.sellers, q, stage, status, source, tag, rep, sort]);

  const dupGroups = useMemo(() => {
    const m = new Map<string, typeof ws.leads>();
    for (const l of ws.leads.filter((x) => !x.deletedAt)) { const k = `${normalizeAddress(l.property.line1)}|${l.property.zip}`; m.set(k, [...(m.get(k) ?? []), l]); }
    // phone duplicates across sellers
    const phoneMap = new Map<string, string[]>();
    for (const s of ws.sellers) for (const c of s.contacts.filter((x) => x.kind === "phone")) { const k = c.value.replace(/\D/g, ""); phoneMap.set(k, [...(phoneMap.get(k) ?? []), s.leadId]); }
    const phoneDups = [...phoneMap.entries()].filter(([, v]) => new Set(v).size > 1);
    return { addr: [...m.values()].filter((g) => g.length > 1), phones: phoneDups };
  }, [ws.leads, ws.sellers]);

  const allTags = [...SYSTEM_TAGS, ...ws.settings.customTags];
  const selected = rows.filter((r) => sel.has(r.l.id)).map((r) => r.l);
  const exportCsv = () => {
    const head = ["address", "city", "zip", "owner", "stage", "status", "source", "tags", "asking", "motivation", "last_contact", "created"];
    const body = rows.map(({ l, m }) => [l.property.line1, l.property.city, l.property.zip, l.property.ownerName, l.stage, l.status, l.source, l.tags.join("|"), l.askingPrice ?? "", m, l.lastContactAt ?? "", l.createdAt].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" }));
    a.download = "leads.csv"; a.click();
  };

  return (
    <div>
      <PageHeader title="Leads" subtitle={`${rows.length} of ${ws.leads.filter((l) => !l.deletedAt).length} leads`}
        actions={<>
          <Button icon={<Copy size={13} />} onClick={() => setDupOpen(true)}>Duplicates {dupGroups.addr.length + dupGroups.phones.length > 0 && <Badge tone="warn">{dupGroups.addr.length + dupGroups.phones.length}</Badge>}</Button>
          <Button icon={<Download size={13} />} onClick={exportCsv}>Export</Button>
          <Button variant="primary" onClick={() => useUI.getState().openQuick("lead")}>New lead</Button>
        </>} />
      <div className="px-5 flex flex-wrap items-center gap-2 pb-3">
        <input className="input input-sm w-[220px]" placeholder="Search address, owner, APN, ZIP" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input input-sm w-auto" value={stage} onChange={(e) => setStage(e.target.value as LeadStage)}><option value="">All stages</option>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select className="input input-sm w-auto" value={status} onChange={(e) => setStatus(e.target.value as PinStatus)}><option value="">All statuses</option>{(Object.keys(PIN_STATUS) as PinStatus[]).map((s) => <option key={s} value={s}>{PIN_STATUS[s].label}</option>)}</select>
        <select className="input input-sm w-auto" value={source} onChange={(e) => setSource(e.target.value as LeadSource)}><option value="">All sources</option>{(Object.keys(LEAD_SOURCE_LABEL) as LeadSource[]).map((s) => <option key={s} value={s}>{LEAD_SOURCE_LABEL[s]}</option>)}</select>
        <select className="input input-sm w-auto" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">All tags</option>{allTags.map((t) => <option key={t}>{t}</option>)}</select>
        <select className="input input-sm w-auto" value={rep} onChange={(e) => setRep(e.target.value)}><option value="">All reps</option>{TEAM.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select className="input input-sm w-auto ml-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="updated">Recently updated</option><option value="motivation">Motivation</option><option value="created">Newest</option><option value="contact">Least recently contacted</option></select>
      </div>
      {sel.size > 0 && (
        <div className="mx-5 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-1.5 text-[12px]">
          <b>{sel.size} selected</b>
          <select className="input input-sm w-auto" defaultValue="" onChange={(e) => { selected.forEach((l) => ws.moveStage(l.id, e.target.value as LeadStage)); toast(`Moved ${selected.length}`); e.target.value = ""; }}><option value="" disabled>Move to stage…</option>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          <select className="input input-sm w-auto" defaultValue="" onChange={(e) => { selected.forEach((l) => ws.updateLead(l.id, { assignedTo: e.target.value })); toast("Reassigned"); e.target.value = ""; }}><option value="" disabled>Assign to…</option>{TEAM.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          <Menu align="left" trigger={(t) => <Button size="xs" icon={<Tag size={12} />} onClick={t}>Tag</Button>}>{(close) => allTags.map((tg) => <MenuItem key={tg} onClick={() => { selected.forEach((l) => !l.tags.includes(tg) && ws.toggleTag(l.id, tg)); close(); toast(`Tagged ${tg}`); }}>{tg}</MenuItem>)}</Menu>
          <Menu align="left" trigger={(t) => <Button size="xs" icon={<ListOrdered size={12} />} onClick={t}>Start sequence</Button>}>{(close) => ws.settings.sequences.map((s) => <MenuItem key={s.id} onClick={() => { selected.forEach((l) => ws.applySequence(l.id, s.id)); close(); toast(`Sequence started for ${selected.length}`); }}>{s.name}</MenuItem>)}</Menu>
          <Button size="xs" variant="ghost" icon={<Trash2 size={12} />} onClick={() => { if (confirm(`Archive ${selected.length} leads?`)) { selected.forEach((l) => ws.deleteLead(l.id)); setSel(new Set()); } }}>Archive</Button>
          <button className="ml-auto text-muted" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
      <div className="mx-5 mb-6 rounded-lg border border-border bg-panel overflow-auto">
        <table className="tbl text-[12.5px]">
          <thead><tr>
            <th className="w-8"><input type="checkbox" checked={sel.size > 0 && sel.size === rows.length} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.l.id)) : new Set())} /></th>
            <th>Property</th><th>Seller / owner</th><th>Stage</th><th>Status</th><th>Source</th><th>Tags</th><th className="text-right">Asking</th><th className="text-right">Motivation</th><th>Last contact</th><th>Rep</th>
          </tr></thead>
          <tbody>
            {rows.map(({ l, m }) => (
              <tr key={l.id} className="cursor-pointer" onClick={() => router.push(`/properties/${l.propertyId}`)}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(l.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(l.id); else n.delete(l.id); setSel(n); }} /></td>
                <td className="font-medium">{l.status === "hot" && <Flame size={12} className="inline text-bad mr-1 -mt-0.5" />}{l.property.line1}<div className="text-[11px] text-muted font-normal">{l.property.city} {l.property.zip}</div></td>
                <td className="max-w-[180px] truncate">{ws.sellers.find((s) => s.id === l.sellerId)?.name ?? l.property.ownerName}</td>
                <td><Badge>{STAGES.find((s) => s.id === l.stage)?.label}</Badge></td>
                <td><Badge dot={PIN_STATUS[l.status].color}>{PIN_STATUS[l.status].label}</Badge></td>
                <td className="text-fg-2">{LEAD_SOURCE_LABEL[l.source]}</td>
                <td><div className="flex gap-1 max-w-[200px] overflow-hidden">{l.tags.slice(0, 3).map((t) => <Badge key={t} tone={t === "Do Not Contact" ? "bad" : "neutral"}>{t}</Badge>)}{l.tags.length > 3 && <span className="text-muted text-[11px]">+{l.tags.length - 3}</span>}</div></td>
                <td className="text-right num">{usd(l.askingPrice ?? null, { compact: true })}</td>
                <td className="text-right num font-semibold">{m}</td>
                <td className={cx(!l.lastContactAt && "text-muted")}>{relative(l.lastContactAt)}</td>
                <td className="text-fg-2">{userName(l.assignedTo).split(" ")[0]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-8 text-center text-muted text-[12.5px]">No leads match.</div>}
      </div>

      <Dialog open={dupOpen} onClose={() => setDupOpen(false)} title="Duplicate detection" width={680}>
        {dupGroups.addr.length === 0 && dupGroups.phones.length === 0 && <div className="text-[12.5px] text-muted">No duplicate leads or shared phone numbers found. New leads, contacts and buyers are checked on entry.</div>}
        {dupGroups.addr.map((g, i) => (
          <div key={i} className="rounded-md border border-border p-2.5 mb-2">
            <div className="text-[12.5px] font-medium">{g[0].property.line1} — {g.length} leads at the same normalized address</div>
            {g.map((l, j) => (
              <div key={l.id} className="flex items-center gap-2 text-[12px] mt-1"><span className="text-muted">#{j + 1}</span>{l.stage.replace(/_/g, " ")} · created {relative(l.createdAt)}
                {j > 0 && <div className="ml-auto flex gap-1">
                  <Button size="xs" variant="primary" onClick={() => { ws.mergeLeads(g[0].id, l.id); toast("Merged — history moved to the original lead"); }}>Merge into #1</Button>
                  <Button size="xs" onClick={() => { ws.toggleTag(l.id, `Linked to ${g[0].id}`); toast("Linked"); }}>Link</Button>
                  <Button size="xs" variant="ghost" onClick={() => { ws.toggleTag(l.id, "Reviewed duplicate"); toast("Kept separate"); }}>Keep separate</Button>
                </div>}
              </div>
            ))}
          </div>
        ))}
        {dupGroups.phones.map(([phone, ids]) => (
          <div key={phone} className="rounded-md border border-border p-2.5 mb-2 text-[12.5px]">
            Phone <b className="num">{phone}</b> appears on {new Set(ids).size} sellers: {[...new Set(ids)].map((id) => ws.leads.find((l) => l.id === id)?.property.line1).join(", ")} — possibly the same owner (portfolio) or a bad skip-trace match.
          </div>
        ))}
      </Dialog>
    </div>
  );
}

export default function Page() { return <Suspense><Leads /></Suspense>; }
