"use client";
import { Ban, Download, Mail, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { HBars } from "@/components/charts";
import { Badge, Button, Card, Field, PageHeader, Stat } from "@/components/ui";
import { CHANNEL_LABEL, campaignStats } from "@/lib/calc/campaigns";
import { date, formatPhone, pct, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";

export default function Marketing() {
  const ws = useWorkspace();
  const toast = useUI((s) => s.toast);
  const [listId, setListId] = useState(ws.lists.find((l) => !l.dynamic)?.id ?? "");
  const [supp, setSupp] = useState({ kind: "phone" as "phone" | "email", value: "", reason: "Requested no contact" });
  const seller = ws.campaigns.filter((c) => c.audience === "seller");
  const byChannel = useMemo(() => {
    const m = new Map<string, { spend: number; leads: number; contracts: number; revenue: number }>();
    for (const c of seller) {
      const s = campaignStats(c, ws.leads, ws.dispositions);
      const r = m.get(c.channel) ?? { spend: 0, leads: 0, contracts: 0, revenue: 0 };
      r.spend += c.spend; r.leads += s.leads; r.contracts += s.contracts; r.revenue += s.revenue;
      m.set(c.channel, r);
    }
    return [...m.entries()];
  }, [seller, ws.leads, ws.dispositions]);
  const spend = seller.reduce((s, c) => s + c.spend, 0);
  const revenue = byChannel.reduce((s, [, r]) => s + r.revenue, 0);
  const contacts = ws.sellers.flatMap((s) => s.contacts);
  const phones = contacts.filter((c) => c.kind === "phone");

  const exportMail = () => {
    const l = ws.lists.find((x) => x.id === listId);
    if (!l) return;
    const rows = l.propertyIds.map((id) => l.members[id]).filter(Boolean);
    const csv = ["owner_name,property_address,property_city,property_zip", ...rows.map((r) => [r.ownerName, r.line1, r.city, r.zip].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `mail-merge-${l.name}.csv`; a.click();
    toast(`${rows.length} records exported. Mailing addresses come from the owner record on each property (provider).`);
  };

  return (
    <div>
      <PageHeader title="Marketing" subtitle="Seller lead generation performance and the compliance center" />
      <div className="px-5 grid grid-cols-2 md:grid-cols-5 gap-2 pb-3">
        <Stat label="Seller marketing spend" value={usd(spend)} />
        <Stat label="Attributed revenue" value={usd(revenue)} tone="good" />
        <Stat label="Marketing ROI" value={spend ? pct((revenue - spend) / spend) : "—"} />
        <Stat label="Suppressed contacts" value={ws.suppression.length} />
        <Stat label="Phones w/ SMS consent" value={`${phones.filter((p) => p.smsConsent).length} / ${phones.length}`} />
      </div>
      <div className="px-5 pb-6 grid lg:grid-cols-2 gap-3">
        <Card title="Revenue by channel" subtitle="attributed assignment fees">
          <HBars rows={byChannel.map(([ch, r]) => ({ label: CHANNEL_LABEL[ch as keyof typeof CHANNEL_LABEL], value: r.revenue, sub: `${r.leads} leads · ${usd(r.spend, { compact: true })} spend` }))} format={(v) => usd(v, { compact: true })} />
        </Card>
        <Card title="Channel efficiency" bodyClass="p-0">
          <table className="tbl text-[12.5px]"><thead><tr><th>Channel</th><th className="text-right">Spend</th><th className="text-right">Leads</th><th className="text-right">CPL</th><th className="text-right">Contracts</th><th className="text-right">Cost / contract</th></tr></thead>
            <tbody>{byChannel.map(([ch, r]) => <tr key={ch}><td>{CHANNEL_LABEL[ch as keyof typeof CHANNEL_LABEL]}</td><td className="text-right num">{usd(r.spend)}</td><td className="text-right num">{r.leads}</td><td className="text-right num">{usd(r.leads ? r.spend / r.leads : null)}</td><td className="text-right num">{r.contracts}</td><td className="text-right num">{usd(r.contracts ? r.spend / r.contracts : null)}</td></tr>)}</tbody></table>
        </Card>
        <Card title="Direct mail export" subtitle="mail-merge CSV for your print vendor" icon={<Mail size={14} />}>
          <div className="flex gap-2 items-end">
            <Field label="List" className="flex-1"><select className="input" value={listId} onChange={(e) => setListId(e.target.value)}>{ws.lists.filter((l) => !l.dynamic).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.propertyIds.length})</option>)}</select></Field>
            <Button icon={<Download size={13} />} onClick={exportMail}>Export</Button>
          </div>
          <p className="mt-2 text-[11px] text-muted">Direct-mail vendor APIs (e.g. Lob, PostGrid) plug in at the MessagingProvider interface; suppressed owners are excluded at send time.</p>
        </Card>
        <Card title="Compliance center" icon={<ShieldCheck size={14} />} actions={<Button size="xs" href="/settings?tab=compliance">Rules</Button>}>
          <div className="text-[12px] space-y-1 mb-3">
            <div>DNC enforcement for calls: <Badge tone={ws.settings.compliance.enforceDnc ? "good" : "warn"}>{ws.settings.compliance.enforceDnc ? "on" : "off"}</Badge></div>
            <div>SMS requires recorded consent: <Badge tone={ws.settings.compliance.requireSmsConsent ? "good" : "warn"}>{ws.settings.compliance.requireSmsConsent ? "on" : "off"}</Badge></div>
            <div>Quiet hours: {ws.settings.compliance.quietHoursStart}:00–{ws.settings.compliance.quietHoursEnd}:00 · max {ws.settings.compliance.maxAttemptsPerWeek} attempts/week</div>
            <div className="text-[11px] text-muted">Laws vary by jurisdiction (TCPA, TSR, CAN-SPAM, state mini-TCPA rules). These controls are configurable tools, not legal advice.</div>
          </div>
          <div className="flex gap-2 items-end">
            <select className="input input-sm w-[90px]" value={supp.kind} onChange={(e) => setSupp({ ...supp, kind: e.target.value as "phone" | "email" })}><option value="phone">Phone</option><option value="email">Email</option></select>
            <input className="input input-sm" placeholder="Number or email to suppress" value={supp.value} onChange={(e) => setSupp({ ...supp, value: e.target.value })} />
            <Button size="xs" icon={<Ban size={12} />} onClick={() => { if (supp.value) { ws.suppress(supp.kind, supp.value, supp.reason); setSupp({ ...supp, value: "" }); toast("Added to suppression list"); } }}>Suppress</Button>
          </div>
          <div className="mt-2 max-h-[180px] overflow-y-auto divide-y divide-border">
            {ws.suppression.map((s) => <div key={s.kind + s.value} className="flex items-center gap-2 py-1 text-[12px]"><Badge>{s.kind}</Badge><span className="num">{s.kind === "phone" ? formatPhone(s.value) : s.value}</span><span className="text-muted truncate">{s.reason}</span><span className="text-muted ml-auto">{date(s.at)}</span></div>)}
          </div>
        </Card>
      </div>
    </div>
  );
}
