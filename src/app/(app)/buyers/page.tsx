"use client";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { CommTimeline, LogCommDialog, NotesPanel } from "@/components/crm/Comms";
import { BuyerForm } from "@/components/crm/forms";
import { ContactRow } from "@/components/crm/SellerCRM";
import { Badge, Button, Card, Dialog, KV, PageHeader, SlideOver, Stat } from "@/components/ui";
import { date, relative, usd } from "@/lib/format";
import { useWorkspace } from "@/lib/store/workspace";
import { PROPERTY_TYPE_LABEL, type Buyer, type CommType, type ContactPoint, type PropertyType } from "@/lib/types";

const STRAT: Record<string, string> = { flip: "Fix & flip", hold: "Buy & hold", brrrr: "BRRRR", land: "Land", multifamily: "Multifamily" };

function Buyers() {
  const ws = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [zip, setZip] = useState("");
  const [type, setType] = useState<PropertyType | "">("");
  const [strategy, setStrategy] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const openId = params.get("id");
  const rows = useMemo(() => ws.buyers.filter((b) => (!q || `${b.name} ${b.company ?? ""} ${b.markets.join(" ")}`.toLowerCase().includes(q.toLowerCase())) && (!zip || b.zips.includes(zip)) && (!type || b.propertyTypes.includes(type)) && (!strategy || b.strategies.includes(strategy as never)))
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)), [ws.buyers, q, zip, type, strategy]);
  const active30 = ws.buyers.filter((b) => Date.now() - new Date(b.lastActivityAt).getTime() < 30 * 86400000).length;
  const pof = ws.buyers.filter((b) => b.pofVerifiedAt).length;
  return (
    <div>
      <PageHeader title="Cash buyers" subtitle="Buy boxes, reliability and proof of funds — used for automatic buyer matching"
        actions={<Button variant="primary" icon={<Plus size={13} />} onClick={() => setAddOpen(true)}>Add buyer</Button>} />
      <div className="px-5 grid grid-cols-2 md:grid-cols-4 gap-2 pb-3">
        <Stat label="Buyers" value={ws.buyers.length} /><Stat label="Active (30d)" value={active30} /><Stat label="POF verified" value={pof} />
        <Stat label="Deals purchased (all)" value={ws.buyers.reduce((s, b) => s + b.dealsPurchased, 0)} />
      </div>
      <div className="px-5 pb-3 flex flex-wrap gap-2">
        <input className="input input-sm w-[220px]" placeholder="Search name, company, market" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="input input-sm w-[100px]" placeholder="ZIP" value={zip} onChange={(e) => setZip(e.target.value.trim())} />
        <select className="input input-sm w-auto" value={type} onChange={(e) => setType(e.target.value as PropertyType)}><option value="">Any type</option>{Object.entries(PROPERTY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input input-sm w-auto" value={strategy} onChange={(e) => setStrategy(e.target.value)}><option value="">Any strategy</option>{Object.entries(STRAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <Card className="mx-5 mb-6" bodyClass="p-0">
        <div className="overflow-auto"><table className="tbl text-[12.5px]">
          <thead><tr><th>Buyer</th><th>Markets / ZIPs</th><th>Types</th><th>Strategy</th><th className="text-right">Price range</th><th>Rehab</th><th className="text-right">Margin</th><th className="text-right">Deals</th><th className="text-right">Avg price</th><th>Reliability</th><th>POF</th><th>Last activity</th></tr></thead>
          <tbody>{rows.map((b) => (
            <tr key={b.id} className="cursor-pointer" onClick={() => router.push(`/buyers?id=${b.id}`)}>
              <td className="font-medium">{b.name}<div className="text-[11px] text-muted font-normal">{b.company}</div></td>
              <td className="max-w-[200px] truncate text-fg-2">{b.markets.join(", ")}<div className="text-[11px] text-muted">{b.zips.slice(0, 5).join(" ")}{b.zips.length > 5 ? "…" : ""}</div></td>
              <td className="text-fg-2">{b.propertyTypes.map((t) => t.toUpperCase()).join(", ")}</td>
              <td>{b.strategies.map((s) => <Badge key={s} className="mr-1">{STRAT[s]}</Badge>)}</td>
              <td className="text-right num">{usd(b.minPrice, { compact: true })}–{usd(b.maxPrice, { compact: true })}</td>
              <td className="capitalize">{b.rehabTolerance.replace("_", " ")}</td><td className="text-right num">{b.desiredMarginPct}%</td>
              <td className="text-right num">{b.dealsPurchased}</td><td className="text-right num">{usd(b.avgPurchasePrice, { compact: true })}</td>
              <td>{"★".repeat(b.reliability)}<span className="text-muted">{"★".repeat(5 - b.reliability)}</span></td>
              <td>{b.pofVerifiedAt ? <Badge tone="good"><ShieldCheck size={10} />{usd(b.pofAmount ?? null, { compact: true })}</Badge> : <Badge tone="warn">none</Badge>}</td>
              <td className="text-muted">{relative(b.lastActivityAt)}</td>
            </tr>))}</tbody>
        </table></div>
      </Card>
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add buyer" width={640}><BuyerForm onDone={() => setAddOpen(false)} /></Dialog>
      <BuyerProfile id={openId} onClose={() => router.push("/buyers")} />
    </div>
  );
}

function BuyerProfile({ id, onClose }: { id: string | null; onClose: () => void }) {
  const ws = useWorkspace();
  const b = ws.buyers.find((x) => x.id === id);
  const [edit, setEdit] = useState(false);
  const [log, setLog] = useState<{ type: CommType; cp: ContactPoint } | null>(null);
  if (!b) return null;
  const offers = ws.buyerOffers.filter((o) => o.buyerId === b.id);
  const blasts = ws.blasts.flatMap((bl) => bl.recipients.filter((r) => r.buyerId === b.id).map((r) => ({ bl, r })));
  const dispAddr = (dispId: string) => { const d = ws.dispositions.find((x) => x.id === dispId); return ws.leads.find((l) => l.id === d?.leadId)?.property.line1 ?? "—"; };
  return (
    <SlideOver open onClose={onClose} title={b.name} width={680} actions={<>
      <Button size="xs" icon={<Pencil size={12} />} onClick={() => setEdit(true)}>Edit</Button>
      <Button size="xs" variant="ghost" icon={<Trash2 size={12} />} onClick={() => { if (confirm("Delete buyer?")) { ws.deleteBuyer(b.id); onClose(); } }} />
    </>}>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Card title="Profile">
            <KV k="Company" v={b.company ?? "—"} /><KV k="Markets" v={b.markets.join(", ")} /><KV k="ZIPs" v={b.zips.join(", ") || "—"} />
            <KV k="Types" v={b.propertyTypes.map((t) => PROPERTY_TYPE_LABEL[t]).join(", ")} /><KV k="Strategies" v={b.strategies.map((s) => STRAT[s]).join(", ")} />
            <KV k="Price range" v={`${usd(b.minPrice)} – ${usd(b.maxPrice)}`} /><KV k="Min beds" v={b.minBeds} /><KV k="Rehab tolerance" v={b.rehabTolerance.replace("_", " ")} />
            <KV k="Desired margin" v={`${b.desiredMarginPct}%`} />
          </Card>
          <Card title="Track record">
            <KV k="Deals purchased" v={b.dealsPurchased} /><KV k="Avg purchase price" v={usd(b.avgPurchasePrice)} />
            <KV k="Reliability" v={`${b.reliability}/5`} /><KV k="Proof of funds" v={b.pofVerifiedAt ? `${usd(b.pofAmount ?? null)} · verified ${date(b.pofVerifiedAt)}` : "Not verified"} />
            <KV k="Last activity" v={relative(b.lastActivityAt)} /><KV k="Offers submitted" v={offers.length} /><KV k="Blasts received" v={blasts.length} />
          </Card>
        </div>
        <Card title="Contact">
          <div className="space-y-1.5">{b.contacts.map((cp) => <ContactRow key={cp.id} cp={cp} onAction={(t, c) => setLog({ type: t, cp: c })} onUpdate={(p) => ws.updateBuyer(b.id, { contacts: b.contacts.map((x) => (x.id === cp.id ? { ...x, ...p } : x)) })} />)}</div>
        </Card>
        <Card title="Offers & deal activity" bodyClass="p-0">
          <table className="tbl text-[12px]"><tbody>
            {offers.map((o) => <tr key={o.id}><td>Offer on <Link className="hover:text-accent" href={`/dispositions/${o.dispositionId}`}>{dispAddr(o.dispositionId)}</Link></td><td className="text-right num">{usd(o.amount)}</td><td><Badge tone={o.status === "accepted" ? "good" : o.status === "declined" ? "neutral" : "accent"}>{o.status}</Badge></td><td className="text-muted">{date(o.at)}</td></tr>)}
            {blasts.map(({ bl, r }) => <tr key={bl.id}><td>Deal blast — {dispAddr(bl.dispositionId)} ({bl.channel})</td><td></td><td><Badge>{r.status.replace("_", " ")}</Badge></td><td className="text-muted">{date(bl.sentAt)}</td></tr>)}
            {offers.length + blasts.length === 0 && <tr><td className="text-muted text-center py-4">No activity yet</td></tr>}
          </tbody></table>
        </Card>
        <Card title="Communication"><CommTimeline comms={ws.comms.filter((c) => c.buyerId === b.id)} compact /></Card>
        <Card title="Notes"><NotesPanel entityType="buyer" entityId={b.id} notes={ws.notes.filter((n) => n.entityId === b.id)} /></Card>
      </div>
      <Dialog open={edit} onClose={() => setEdit(false)} title={`Edit ${b.name}`} width={640}><BuyerForm buyer={b as Buyer} onDone={() => setEdit(false)} /></Dialog>
      <LogCommDialog open={!!log} onClose={() => setLog(null)} buyerId={b.id} contact={log?.cp} defaultType={log?.type} />
    </SlideOver>
  );
}

export default function Page() { return <Suspense><Buyers /></Suspense>; }
