"use client";
import { Clock, Flame } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, PageHeader, Toggle, cx } from "@/components/ui";
import { computeDeal } from "@/lib/calc/deal";
import { motivationScore } from "@/lib/calc/scores";
import { relative, usd } from "@/lib/format";
import { TEAM, useWorkspace } from "@/lib/store/workspace";
import { LEAD_SOURCE_LABEL, PIN_STATUS, STAGES, type Lead, type LeadStage } from "@/lib/types";

export default function Pipeline() {
  const ws = useWorkspace();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [showDead, setShowDead] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [q, setQ] = useState("");
  const stages = STAGES.filter((s) => (showDead || s.id !== "dead") && (showClosed || s.id !== "closed"));
  const leads = ws.leads.filter((l) => !l.deletedAt && (!assignee || l.assignedTo === assignee) && (!q || `${l.property.line1} ${l.property.ownerName}`.toLowerCase().includes(q.toLowerCase())));

  const cardData = useMemo(() => {
    const m = new Map<string, { arv: number | null; offer: number | null; fee: number | null; motivation: number; seller: string; nextTask?: string; nextDue?: string }>();
    for (const l of ws.leads) {
      const a = ws.analyses.find((x) => x.propertyId === l.propertyId);
      const cs = ws.compSets.find((x) => x.propertyId === l.propertyId);
      const arv = cs?.userArv ?? cs?.calculatedArv ?? a?.inputs.arv ?? null;
      const o = a && arv ? computeDeal({ ...a.inputs, arv }) : null;
      const lastOffer = ws.offers.filter((x) => x.leadId === l.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
      const disp = ws.dispositions.find((d) => d.leadId === l.id);
      const win = disp && ws.buyerOffers.find((b) => b.id === disp.winningOfferId);
      const fee = disp ? (disp.actualFee ?? (win ? win.amount - disp.contractPrice : disp.askingPrice - disp.contractPrice)) : o ? o.buyerMaxPrice - (lastOffer?.amount ?? o.offers[1].price) : null;
      const seller = ws.sellers.find((s) => s.id === l.sellerId);
      const task = ws.tasks.filter((t) => t.leadId === l.id && !t.completedAt).sort((x, y) => x.dueAt.localeCompare(y.dueAt))[0];
      m.set(l.id, { arv, offer: disp?.contractPrice ?? lastOffer?.amount ?? null, fee, motivation: motivationScore(l.property, seller).score, seller: seller?.name ?? l.property.ownerName, nextTask: task?.title, nextDue: task?.dueAt });
    }
    return m;
  }, [ws.leads, ws.analyses, ws.compSets, ws.offers, ws.dispositions, ws.buyerOffers, ws.sellers, ws.tasks]);

  const total = (s: LeadStage) => leads.filter((l) => l.stage === s).reduce((sum, l) => sum + (cardData.get(l.id)?.fee ?? 0), 0);

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Pipeline" subtitle="Drag cards between stages. Stage changes are logged to the lead timeline and audit log."
        actions={<>
          <input className="input input-sm w-[200px]" placeholder="Filter address / seller" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input input-sm w-auto" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">All reps</option>{TEAM.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          <Toggle checked={showClosed} onChange={setShowClosed} label="Closed" />
          <Toggle checked={showDead} onChange={setShowDead} label="Dead" />
          <Button variant="primary" href="/deal-finder">Find leads</Button>
        </>} />
      <div className="flex-1 min-h-0 overflow-x-auto px-5 pb-5">
        <div className="flex gap-2.5 h-full min-h-[500px]">
          {stages.map((s) => {
            const items = leads.filter((l) => l.stage === s.id);
            return (
              <div key={s.id} onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver(null)}
                onDrop={() => { if (dragId) ws.moveStage(dragId, s.id); setDragId(null); setOver(null); }}
                className={cx("w-[248px] shrink-0 flex flex-col rounded-lg border bg-panel-2 transition", over === s.id ? "border-accent bg-accent-soft/40" : "border-border")}>
                <div className="flex items-center justify-between px-2.5 h-9 border-b border-border">
                  <span className="text-[12px] font-semibold">{s.label}</span>
                  <span className="text-[11px] text-muted num">{items.length}{total(s.id) > 0 && ` · ${usd(total(s.id), { compact: true })}`}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                  {items.map((l) => <PipeCard key={l.id} l={l} d={cardData.get(l.id)!} onDrag={setDragId} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PipeCard({ l, d, onDrag }: { l: Lead; d: { arv: number | null; offer: number | null; fee: number | null; motivation: number; seller: string; nextTask?: string; nextDue?: string }; onDrag: (id: string | null) => void }) {
  const moveStage = useWorkspace((s) => s.moveStage);
  const overdue = d.nextDue && new Date(d.nextDue) < new Date();
  return (
    <div draggable onDragStart={() => onDrag(l.id)} onDragEnd={() => onDrag(null)} className="rounded-md border border-border bg-panel p-2 shadow-panel cursor-grab active:cursor-grabbing hover:border-border-strong">
      <div className="flex items-start gap-1.5">
        <span className="mt-1 h-2 w-2 rounded-full shrink-0" style={{ background: PIN_STATUS[l.status].color }} title={PIN_STATUS[l.status].label} />
        <Link href={`/properties/${l.propertyId}`} className="text-[12.5px] font-semibold leading-tight hover:text-accent">{l.property.line1}</Link>
        {l.status === "hot" && <Flame size={12} className="text-bad shrink-0 ml-auto" />}
      </div>
      <div className="text-[11px] text-muted truncate pl-3.5">{d.seller}</div>
      <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10.5px]">
        <div><div className="text-muted">ARV</div><div className="num font-medium">{usd(d.arv, { compact: true })}</div></div>
        <div><div className="text-muted">Offer</div><div className="num font-medium">{usd(d.offer, { compact: true })}</div></div>
        <div><div className="text-muted">Fee</div><div className={cx("num font-medium", d.fee != null && d.fee > 0 ? "text-good" : "")}>{usd(d.fee, { compact: true })}</div></div>
      </div>
      <div className="mt-1.5 flex items-center gap-1 flex-wrap">
        <Badge title="Motivation score">M {d.motivation}</Badge>
        <span className="text-[10.5px] text-muted">{LEAD_SOURCE_LABEL[l.source]}</span>
        <span className="text-[10.5px] text-muted ml-auto" title="Last contact"><Clock size={10} className="inline -mt-0.5" /> {relative(l.lastContactAt)}</span>
      </div>
      {d.nextTask && <div className={cx("mt-1 text-[10.5px] truncate", overdue ? "text-bad" : "text-fg-2")} title={d.nextTask}>→ {d.nextTask}</div>}
      <select className="md:hidden input input-sm mt-1.5" value={l.stage} onChange={(e) => moveStage(l.id, e.target.value as LeadStage)}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
    </div>
  );
}
