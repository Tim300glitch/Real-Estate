"use client";
import { PhoneCall, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, PageHeader, Stat } from "@/components/ui";
import { api } from "@/lib/client/api";
import { formatPhone, relative } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";

export default function SkipTrace() {
  const ws = useWorkspace();
  const toast = useUI((s) => s.toast);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [provider, setProvider] = useState<string>("");
  useEffect(() => { api.providers().then((r) => setProvider(r.integrations.skipTrace?.provider ?? "")).catch(() => {}); }, []);
  const leads = ws.leads.filter((l) => !l.deletedAt && !["closed", "dead"].includes(l.stage));
  const needs = leads.filter((l) => { const s = ws.sellers.find((x) => x.id === l.sellerId); return !s || s.contacts.filter((c) => c.status !== "bad").length === 0; });
  const traced = ws.activities.filter((a) => a.type === "skiptrace").slice(0, 30);
  const all = ws.sellers.flatMap((s) => s.contacts.map((c) => ({ s, c })));

  async function run() {
    setRunning(true);
    let total = 0;
    for (const id of sel) {
      const l = ws.leads.find((x) => x.id === id)!;
      const seller = ws.sellers.find((x) => x.id === l.sellerId) ?? ws.upsertSeller({ leadId: l.id });
      try {
        const r = await api.skipTrace({ ownerName: l.property.ownerName, propertyAddress: { line1: l.property.line1, city: l.property.city, state: l.property.state, zip: l.property.zip } });
        let added = 0;
        for (const p of r.phones) if (useWorkspace.getState().addContact(seller.id, { kind: "phone", value: p.number, phoneType: p.type, status: p.confidence, source: r.provider, dnc: !!p.dnc, optedOut: false, smsConsent: false }).added) added++;
        for (const e of r.emails) if (useWorkspace.getState().addContact(seller.id, { kind: "email", value: e.address, status: e.confidence, source: r.provider, dnc: false, optedOut: false, smsConsent: false }).added) added++;
        ws.log("skiptrace", `Skip trace — ${added} new contact point(s) for ${l.property.line1}`, { leadId: l.id });
        total += added;
      } catch (e) { toast(e instanceof Error ? e.message : "Skip trace failed", "bad"); }
    }
    setRunning(false); setSel(new Set());
    toast(`${total} contact points added across ${sel.size} leads`);
  }

  return (
    <div>
      <PageHeader title="Skip trace" subtitle={`Provider: ${provider || "…"} — results are probabilistic and labeled Verified / Likely / Unverified; never guaranteed accurate`}
        actions={<Button variant="primary" icon={<PhoneCall size={13} />} disabled={!sel.size || running} onClick={run}>{running ? "Tracing…" : `Skip trace ${sel.size || ""} selected`}</Button>} />
      <div className="px-5 grid grid-cols-2 md:grid-cols-4 gap-2 pb-3">
        <Stat label="Open leads missing contacts" value={needs.length} />
        <Stat label="Contact points on file" value={all.length} />
        <Stat label="Verified" value={all.filter((x) => x.c.status === "verified").length} />
        <Stat label="DNC-flagged numbers" value={all.filter((x) => x.c.dnc).length} tone="warn" />
      </div>
      <div className="px-5 pb-3">
        <div className="flex gap-2 rounded-lg border border-warn/40 bg-warn-soft/40 px-3 py-2 text-[12px]"><ShieldAlert size={14} className="text-warn mt-0.5 shrink-0" />
          Use skip-trace data only for permissible purposes. Numbers are scrubbed against DNC where the provider supports it; calls to DNC-flagged numbers and SMS without consent are blocked by default (Settings → Compliance). Demo results use reserved 555-01xx numbers.</div>
      </div>
      <div className="px-5 pb-6 grid lg:grid-cols-[1.3fr_1fr] gap-3">
        <Card title="Leads needing contact info" bodyClass="p-0">
          <table className="tbl text-[12.5px]">
            <thead><tr><th className="w-8"><input type="checkbox" checked={sel.size > 0 && sel.size === needs.length} onChange={(e) => setSel(e.target.checked ? new Set(needs.map((l) => l.id)) : new Set())} /></th><th>Property</th><th>Owner of record</th><th>Entity</th><th>Stage</th></tr></thead>
            <tbody>{needs.map((l) => (
              <tr key={l.id}>
                <td><input type="checkbox" checked={sel.has(l.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(l.id); else n.delete(l.id); setSel(n); }} /></td>
                <td className="font-medium"><Link href={`/properties/${l.propertyId}?tab=seller`} className="hover:text-accent">{l.property.line1}</Link></td>
                <td>{l.property.ownerName}</td><td className="capitalize">{l.property.ownerEntity}{["llc", "trust", "estate"].includes(l.property.ownerEntity) && <Badge tone="warn" className="ml-1">manual research likely</Badge>}</td>
                <td>{l.stage.replace(/_/g, " ")}</td>
              </tr>))}</tbody>
          </table>
          {needs.length === 0 && <div className="p-6 text-center text-[12px] text-muted">Every open lead has at least one usable contact point.</div>}
        </Card>
        <div className="space-y-3">
          <Card title="Recent results" bodyClass="p-0">{traced.map((a) => <div key={a.id} className="px-3 py-1.5 border-b border-border last:border-0 text-[12px]">{a.text}<span className="text-muted ml-2">{relative(a.at)}</span></div>)}{traced.length === 0 && <div className="p-4 text-[12px] text-muted">No skip traces run yet.</div>}</Card>
          <Card title="Contact quality" bodyClass="p-0 max-h-[320px] overflow-y-auto">
            {all.slice(0, 60).map(({ s, c }) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-1 border-b border-border last:border-0 text-[12px]">
                <span className="num">{c.kind === "phone" ? formatPhone(c.value) : c.value}</span><span className="text-muted truncate">{s.name}</span>
                <span className="ml-auto flex gap-1">{c.dnc && <Badge tone="bad">DNC</Badge>}<Badge tone={c.status === "verified" ? "good" : c.status === "likely" ? "accent" : c.status === "bad" ? "bad" : "neutral"}>{c.status}</Badge></span>
              </div>))}
          </Card>
        </div>
      </div>
    </div>
  );
}
