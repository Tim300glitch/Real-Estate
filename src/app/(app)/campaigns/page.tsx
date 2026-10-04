"use client";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Dialog, Field, NumberInput, PageHeader } from "@/components/ui";
import { CHANNEL_LABEL, campaignStats } from "@/lib/calc/campaigns";
import { date, pct, usd } from "@/lib/format";
import { useWorkspace } from "@/lib/store/workspace";
import type { Campaign } from "@/lib/types";

export default function Campaigns() {
  const ws = useWorkspace();
  const [edit, setEdit] = useState<Partial<Campaign> | null>(null);
  return (
    <div>
      <PageHeader title="Campaigns" subtitle="Seller acquisition and buyer campaigns with attribution: leads, contracts, closings, revenue, ROI"
        actions={<Button variant="primary" icon={<Plus size={13} />} onClick={() => setEdit({ name: "", audience: "seller", channel: "direct_mail", spend: 0, status: "active", sent: 0, responses: 0, startDate: new Date().toISOString().slice(0, 10) })}>New campaign</Button>} />
      <Card className="mx-5 mb-6" bodyClass="p-0">
        <div className="overflow-auto"><table className="tbl text-[12.5px]">
          <thead><tr><th>Campaign</th><th>Channel</th><th>Audience</th><th>Status</th><th className="text-right">Spend</th><th className="text-right">Sent</th><th className="text-right">Response</th><th className="text-right">Leads</th><th className="text-right">Cost / lead</th><th className="text-right">Contracts</th><th className="text-right">Cost / contract</th><th className="text-right">Closed</th><th className="text-right">Revenue</th><th className="text-right">ROI</th><th></th></tr></thead>
          <tbody>{ws.campaigns.map((c) => {
            const s = campaignStats(c, ws.leads, ws.dispositions);
            return (
              <tr key={c.id}>
                <td className="font-medium">{c.name}<div className="text-[11px] text-muted font-normal">since {date(c.startDate)}</div></td>
                <td>{CHANNEL_LABEL[c.channel]}</td><td className="capitalize">{c.audience}</td><td><Badge tone={c.status === "active" ? "good" : "neutral"}>{c.status}</Badge></td>
                <td className="text-right num">{usd(c.spend)}</td><td className="text-right num">{c.sent || "—"}</td><td className="text-right num">{s.responseRate != null ? pct(s.responseRate, 1) : c.responses || "—"}</td>
                <td className="text-right num">{s.leads}</td><td className="text-right num">{usd(s.cpl)}</td><td className="text-right num">{s.contracts}</td><td className="text-right num">{usd(s.cpc)}</td>
                <td className="text-right num">{s.closed}</td><td className="text-right num text-good">{usd(s.revenue)}</td>
                <td className={`text-right num font-semibold ${s.roi != null && s.roi < 0 ? "text-bad" : "text-good"}`}>{s.roi != null ? pct(s.roi) : "—"}</td>
                <td className="flex gap-1"><button className="text-muted hover:text-fg" onClick={() => setEdit(c)}><Pencil size={13} /></button><button className="text-muted hover:text-bad" onClick={() => confirm("Delete campaign?") && ws.deleteCampaign(c.id)}><Trash2 size={13} /></button></td>
              </tr>);
          })}</tbody>
        </table></div>
        <div className="px-3 py-2 text-[10.5px] text-muted border-t border-border">Attribution: a lead counts toward the campaign stored on the lead. ROI = (assignment fees from closed attributed leads − spend) ÷ spend.</div>
      </Card>
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit campaign" : "New campaign"} footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (edit?.name) { ws.upsertCampaign(edit as Campaign); setEdit(null); } }}>Save</Button></>}>
        {edit && <div className="grid grid-cols-2 gap-3">
          <Field label="Name" className="col-span-2"><input className="input" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Channel"><select className="input" value={edit.channel} onChange={(e) => setEdit({ ...edit, channel: e.target.value as Campaign["channel"] })}>{Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Audience"><select className="input" value={edit.audience} onChange={(e) => setEdit({ ...edit, audience: e.target.value as Campaign["audience"] })}><option value="seller">Seller</option><option value="buyer">Buyer</option></select></Field>
          <Field label="Spend"><NumberInput prefix="$" value={edit.spend ?? 0} onChange={(v) => setEdit({ ...edit, spend: v })} /></Field>
          <Field label="Status"><select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Campaign["status"] })}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option></select></Field>
          <Field label="Pieces / messages sent"><NumberInput value={edit.sent ?? 0} onChange={(v) => setEdit({ ...edit, sent: v })} /></Field>
          <Field label="Responses"><NumberInput value={edit.responses ?? 0} onChange={(v) => setEdit({ ...edit, responses: v })} /></Field>
          <Field label="Target list"><select className="input" value={edit.listId ?? ""} onChange={(e) => setEdit({ ...edit, listId: e.target.value || undefined })}><option value="">—</option>{ws.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Start date"><input type="date" className="input" value={edit.startDate} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} /></Field>
        </div>}
      </Dialog>
    </div>
  );
}
