"use client";
import { Check, Copy, FileDown, Link2, Mail, MessageSquare, Plus, Send, ShieldCheck, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { DISP_TONE } from "@/components/buyers/shared";
import { CommTimeline, NotesPanel } from "@/components/crm/Comms";
import { toSummaryClient } from "@/components/property/PropertyPanel";
import { Badge, Bar, Button, Card, Dialog, Field, KV, NumberInput, PageHeader, Segmented, Tabs, Toggle, cx } from "@/components/ui";
import { sortComps } from "@/lib/calc/comps";
import { matchBuyers } from "@/lib/calc/scores";
import { useProperty } from "@/lib/client/api";
import { dealPackage } from "@/lib/client/pdf";
import { useAnalysis } from "@/lib/client/useAnalysis";
import { useCompSet } from "@/lib/client/useCompSet";
import { useRepairEstimate } from "@/components/deal/RepairEstimator";
import { date, dateTime, relative, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";
import type { BlastRecipientStatus, DispositionStatus } from "@/lib/types";

const TABS = ["room", "package", "matching", "blast", "offers", "closing"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = { room: "Deal Room", package: "Deal Package", matching: "Buyer Matching", blast: "Deal Blast", offers: "Buyer Offers", closing: "Closing" };
const R_TONE: Record<BlastRecipientStatus, "neutral" | "accent" | "info" | "good" | "bad" | "violet" | "warn"> = { sent: "neutral", opened: "info", clicked: "accent", interested: "good", passed: "bad", offer_submitted: "violet", suppressed: "warn" };

function DealRoom() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const ws = useWorkspace();
  const d = ws.dispositions.find((x) => x.id === id);
  const lead = ws.leads.find((l) => l.id === d?.leadId);
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "room");
  const { data: rec } = useProperty(lead?.propertyId);
  const subject = useMemo(() => (rec ? toSummaryClient(rec) : lead?.property ?? null), [rec, lead]);
  const cs = useCompSet(subject);
  const an = useAnalysis(subject, cs);
  const rep = useRepairEstimate(subject ?? ({ id: "", sqft: 0 } as never));
  if (!d || !lead || !subject) return <div className="p-6 text-muted">Disposition not found.</div>;

  const seller = ws.sellers.find((s) => s.id === lead.sellerId);
  const offers = ws.buyerOffers.filter((o) => o.dispositionId === d.id).sort((a, b) => b.amount - a.amount);
  const winner = offers.find((o) => o.id === d.winningOfferId);
  const winBuyer = winner && ws.buyers.find((b) => b.id === winner.buyerId);
  const fee = d.actualFee ?? (winner ? winner.amount - d.contractPrice : d.askingPrice - d.contractPrice);
  const arv = cs.compSet?.userArv ?? cs.arv?.likely ?? an.inputs.arv;
  const repairs = rep.items.length ? rep.totals.expected : an.inputs.repairs;
  const matches = matchBuyers(ws.buyers, { zip: subject.zip, city: subject.city, propertyType: subject.propertyType, beds: subject.beds, price: d.askingPrice, repairs, arv });
  const set = (p: Partial<typeof d>) => ws.updateDisposition(d.id, p);
  const counts: Partial<Record<Tab, number>> = { offers: offers.length, matching: d.selectedBuyerIds.length };

  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2">{subject.line1}<Badge tone={DISP_TONE[d.status]}>{d.status.replace("_", " ")}</Badge></span>}
        subtitle={`${subject.city} ${subject.zip} · contract ${usd(d.contractPrice)} · asking ${usd(d.askingPrice)} · closing ${date(d.closingDate)}`}
        actions={<>
          <select className="input input-sm w-auto" value={d.status} onChange={(e) => set({ status: e.target.value as DispositionStatus })}>{Object.keys(DISP_TONE).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
          <Button href={`/properties/${subject.id}`}>Property</Button>
          <Button href={`/deal-desk/${subject.id}`}>Deal Desk</Button>
        </>} />
      <div className="px-5"><Tabs tabs={TABS.map((t) => ({ id: t, label: LABELS[t], count: counts[t] || undefined }))} value={tab} onChange={setTab} /></div>
      <div className="p-5 pt-4">
        {tab === "room" && (
          <div className="grid xl:grid-cols-3 gap-3">
            <div className="space-y-3">
              <Card title="Property">
                <KV k="Address" v={`${subject.line1}, ${subject.city}`} /><KV k="Beds / baths / sf" v={`${subject.beds} / ${subject.baths} / ${subject.sqft?.toLocaleString()}`} />
                <KV k="ARV" v={usd(arv)} /><KV k="Repairs" v={usd(repairs)} /><KV k="Access" v={<span className="whitespace-normal">{d.accessInstructions || "—"}</span>} />
              </Card>
              <Card title="Seller"><KV k="Name" v={seller?.name ?? subject.ownerName} /><KV k="Phone" v={seller?.contacts.find((c) => c.kind === "phone")?.value ?? "—"} /><KV k="Contract price" v={usd(d.contractPrice)} /></Card>
              <Card title="Buyer">{winBuyer ? <><KV k="Name" v={<Link className="hover:text-accent" href={`/buyers?id=${winBuyer.id}`}>{winBuyer.name}</Link>} /><KV k="Company" v={winBuyer.company ?? "—"} /><KV k="Price" v={usd(winner!.amount)} /><KV k="EMD" v={usd(winner!.emd)} /><KV k="POF" v={winner!.pofVerified ? "Verified" : "Not verified"} /></> : <div className="text-[12px] text-muted">No buyer selected yet — see Buyer Offers.</div>}</Card>
              <Card title="Title / closing company"><KV k="Company" v={d.titleCompany || "—"} /><KV k="Contact" v={d.titleContact || "—"} /><KV k="Closing date" v={date(d.closingDate)} /><KV k="Earnest money" v={usd(d.earnestMoney)} /></Card>
            </div>
            <div className="space-y-3">
              <Card title="Assignment fee"><div className="text-[26px] font-semibold num text-good">{usd(fee)}</div><div className="text-[11.5px] text-muted">{d.actualFee != null ? `Recorded ${date(d.feeReceivedAt)}` : winner ? "Buyer price − contract price (projected)" : "Asking − contract price (projected)"}</div></Card>
              <Card title="Status timeline">
                <ol className="space-y-1.5 text-[12px]">
                  {lead.stageHistory.slice().reverse().map((h, i) => <li key={i} className="flex justify-between"><span className="capitalize">{h.stage.replace(/_/g, " ")}</span><span className="text-muted">{dateTime(h.at)}</span></li>)}
                </ol>
              </Card>
              <Card title="Contracts & documents" bodyClass="p-0">
                {ws.contracts.filter((c) => c.leadId === lead.id).map((c) => <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-border last:border-0 text-[12px]"><span className="truncate">{c.title}</span><Badge tone={c.status === "executed" ? "good" : "accent"} className="ml-auto">{c.status}</Badge></div>)}
                {ws.documents.filter((x) => x.leadId === lead.id || x.dispositionId === d.id).map((x) => <div key={x.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-border last:border-0 text-[12px]"><span className="truncate">{x.name}</span><span className="ml-auto text-muted">{date(x.createdAt)}</span></div>)}
              </Card>
              <Card title="Tasks" bodyClass="p-0">
                {ws.tasks.filter((t) => t.leadId === lead.id && !t.completedAt).map((t) => <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-border last:border-0 text-[12px]"><button onClick={() => ws.completeTask(t.id)} className="text-muted hover:text-good"><Check size={13} /></button>{t.title}<span className="ml-auto text-muted">{relative(t.dueAt)}</span></div>)}
                <div className="p-2"><Button size="xs" icon={<Plus size={12} />} onClick={() => useUI.getState().openQuick("task", { leadId: lead.id })}>Add task</Button></div>
              </Card>
            </div>
            <div className="space-y-3">
              <Card title="Messages" bodyClass="p-3 max-h-[360px] overflow-y-auto"><CommTimeline comms={ws.comms.filter((c) => c.leadId === lead.id || offers.some((o) => o.buyerId === c.buyerId))} compact /></Card>
              <Card title="Deal notes"><NotesPanel entityType="disposition" entityId={d.id} notes={ws.notes.filter((n) => n.entityId === d.id)} /></Card>
            </div>
          </div>
        )}

        {tab === "package" && (
          <div className="grid lg:grid-cols-[1fr_1fr] gap-3">
            <Card title="Pricing & access">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contract price"><NumberInput prefix="$" value={d.contractPrice} onChange={(v) => set({ contractPrice: v })} /></Field>
                <Field label="Assignment asking price" hint={`fee at ask ${usd(d.askingPrice - d.contractPrice)}`}><NumberInput prefix="$" step={1000} value={d.askingPrice} onChange={(v) => set({ askingPrice: v })} /></Field>
                <Field label="Minimum assignment price" hint={`min fee ${usd(d.minimumPrice - d.contractPrice)}`}><NumberInput prefix="$" step={1000} value={d.minimumPrice} onChange={(v) => set({ minimumPrice: v })} /></Field>
                <Field label="Closing date"><input type="date" className="input" value={d.closingDate} onChange={(e) => set({ closingDate: e.target.value })} /></Field>
                <Field label="Access instructions" className="col-span-2"><textarea className="input" rows={3} value={d.accessInstructions} onChange={(e) => set({ accessInstructions: e.target.value })} /></Field>
                <div className="col-span-2"><Toggle checked={d.showFullAddress} onChange={(v) => set({ showFullAddress: v })} label="Show full address in marketing (otherwise house number hidden)" /></div>
              </div>
            </Card>
            <Card title="Package preview" actions={<Button size="xs" variant="primary" icon={<FileDown size={12} />} onClick={() => {
              dealPackage({ subject, comps: sortComps(cs.scored.filter((c) => c.included), "similar"), arv: cs.arv, userArv: cs.compSet?.userArv, radiusMiles: cs.criteria.radiusMiles,
                repairs: rep.items.length ? { items: rep.items, totals: rep.totals } : null, inputs: an.inputs, outputs: an.outputs, askingPrice: d.askingPrice, closingDate: d.closingDate,
                showFullAddress: d.showFullAddress, access: d.accessInstructions, disclaimer: ws.settings.compliance.blastDisclaimer });
              ws.addDocument({ name: `Deal Package — ${subject.line1}.pdf`, kind: "deal_package", leadId: lead.id, propertyId: subject.id, dispositionId: d.id, generated: true });
            }}>Generate PDF</Button>}>
              <PackagePreview d={d} subject={subject} arv={arv} repairs={repairs} comps={cs.scored.filter((c) => c.included).length} disclaimer={ws.settings.compliance.blastDisclaimer} />
            </Card>
          </div>
        )}

        {tab === "matching" && (
          <Card title="Buyer matching" subtitle={`deal: ${subject.zip} · ${subject.propertyType.toUpperCase()} · ${usd(d.askingPrice, { compact: true })} price · ${usd(repairs, { compact: true })} rehab · ${usd(arv, { compact: true })} ARV`}
            actions={<><Button size="xs" onClick={() => set({ selectedBuyerIds: matches.filter((m) => m.score >= 70).map((m) => m.buyer.id) })}>Select all ≥70%</Button><Button size="xs" variant="primary" icon={<Send size={12} />} onClick={() => setTab("blast")} disabled={!d.selectedBuyerIds.length}>Market to {d.selectedBuyerIds.length}</Button></>} bodyClass="p-0">
            <table className="tbl text-[12.5px]">
              <thead><tr><th></th><th>Buyer</th><th>Match</th><th>Why</th><th>Reliability</th><th>POF</th><th>Last active</th></tr></thead>
              <tbody>{matches.map((m) => (
                <tr key={m.buyer.id}>
                  <td><input type="checkbox" checked={d.selectedBuyerIds.includes(m.buyer.id)} onChange={(e) => set({ selectedBuyerIds: e.target.checked ? [...d.selectedBuyerIds, m.buyer.id] : d.selectedBuyerIds.filter((x) => x !== m.buyer.id) })} /></td>
                  <td className="font-medium">{m.buyer.name}<div className="text-[11px] text-muted font-normal">{m.buyer.company}</div></td>
                  <td><div className="flex items-center gap-2 w-[110px]"><span className={cx("num font-semibold w-9", m.score >= 85 ? "text-good" : m.score >= 70 ? "text-accent" : m.score >= 50 ? "text-warn" : "text-muted")}>{m.score}%</span><Bar value={m.score} max={100} /></div></td>
                  <td className="whitespace-normal"><div className="flex flex-wrap gap-1">{m.reasons.map((r) => <Badge key={r.label} tone={r.ok === true ? "good" : r.ok === "partial" ? "warn" : "neutral"} title={r.detail}>{r.ok === true ? "✓" : r.ok === "partial" ? "~" : "✗"} {r.label}: {r.detail}</Badge>)}</div></td>
                  <td>{m.buyer.reliability}/5</td><td>{m.buyer.pofVerifiedAt ? <ShieldCheck size={14} className="text-good" /> : "—"}</td><td className="text-muted">{relative(m.buyer.lastActivityAt)}</td>
                </tr>))}</tbody>
            </table>
            <div className="px-3 py-2 text-[10.5px] text-muted border-t border-border">Score = location 30 + type 20 + price 20 + rehab tolerance 15 + recent activity 10 + beds/POF/reliability 5. Buy boxes are buyer-provided.</div>
          </Card>
        )}

        {tab === "blast" && <BlastTab dispositionId={d.id} subject={subject} arv={arv} repairs={repairs} />}

        {tab === "offers" && <OffersTab dispositionId={d.id} />}

        {tab === "closing" && (
          <div className="grid lg:grid-cols-2 gap-3">
            <Card title="Closing details">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Title / escrow company"><input className="input" value={d.titleCompany} onChange={(e) => set({ titleCompany: e.target.value })} /></Field>
                <Field label="Escrow officer / contact"><input className="input" value={d.titleContact} onChange={(e) => set({ titleContact: e.target.value })} /></Field>
                <Field label="Closing date"><input type="date" className="input" value={d.closingDate} onChange={(e) => set({ closingDate: e.target.value })} /></Field>
                <Field label="Earnest money (seller contract)"><NumberInput prefix="$" value={d.earnestMoney} onChange={(v) => set({ earnestMoney: v })} /></Field>
              </div>
              <div className="mt-3 space-y-1.5 text-[12.5px]">
                {[
                  ["Purchase agreement executed", ws.contracts.some((c) => c.leadId === lead.id && c.kind === "purchase_agreement" && c.status === "executed")],
                  ["Buyer selected", !!winner],
                  ["Assignment agreement executed", ws.contracts.some((c) => c.leadId === lead.id && c.kind === "assignment_agreement" && c.status === "executed")],
                  ["Buyer proof of funds verified", !!winner?.pofVerified],
                  ["Title company assigned", !!d.titleCompany],
                  ["Closing date set", !!d.closingDate],
                ].map(([k, ok]) => <div key={k as string} className="flex items-center gap-2"><span className={cx("h-4 w-4 rounded-full flex items-center justify-center", ok ? "bg-good text-white" : "border border-border-strong")}>{ok ? <Check size={10} /> : null}</span>{k}</div>)}
              </div>
            </Card>
            <CloseCard dispositionId={d.id} projected={fee} />
          </div>
        )}
      </div>
    </div>
  );
}

function PackagePreview({ d, subject, arv, repairs, comps, disclaimer }: { d: { showFullAddress: boolean; askingPrice: number; closingDate: string; accessInstructions: string }; subject: { line1: string; city: string; zip: string; beds: number | null; baths: number | null; sqft: number | null; lotSqft: number | null; yearBuilt: number | null }; arv: number; repairs: number; comps: number; disclaimer: string }) {
  const addr = d.showFullAddress ? `${subject.line1}, ${subject.city} ${subject.zip}` : `${subject.line1.replace(/^\d+/, "XXXX")}, ${subject.city} ${subject.zip}`;
  return (
    <div className="text-[12.5px] space-y-2">
      <div className="text-[15px] font-semibold">{addr}</div>
      <div className="grid grid-cols-3 gap-2">
        {[["Asking", usd(d.askingPrice)], ["ARV (est.)", usd(arv)], ["Repairs (est.)", usd(repairs)], ["Beds / Baths", `${subject.beds}/${subject.baths}`], ["Sq ft / Lot", `${subject.sqft?.toLocaleString()} / ${subject.lotSqft?.toLocaleString()}`], ["Year", subject.yearBuilt], ["Closing", date(d.closingDate)], ["Comps", `${comps} selected`], ["Spread (est.)", usd(arv - d.askingPrice - repairs)]].map(([k, v]) => (
          <div key={k as string} className="rounded border border-border px-2 py-1"><div className="text-[10px] uppercase text-muted">{k}</div><div className="num font-semibold">{v}</div></div>
        ))}
      </div>
      <div><span className="text-muted">Access:</span> {d.accessInstructions || "—"}</div>
      <div className="rounded bg-warn-soft text-warn px-2 py-1.5 text-[11px]">{disclaimer}</div>
    </div>
  );
}

function BlastTab({ dispositionId, subject, arv, repairs }: { dispositionId: string; subject: { line1: string; city: string; zip: string; beds: number | null; baths: number | null; sqft: number | null; yearBuilt: number | null; lotSqft: number | null }; arv: number; repairs: number }) {
  const ws = useWorkspace();
  const toast = useUI((s) => s.toast);
  const d = ws.dispositions.find((x) => x.id === dispositionId)!;
  const [channel, setChannel] = useState<"email" | "sms" | "portal">("email");
  const addr = d.showFullAddress ? subject.line1 : subject.line1.replace(/^\d+/, "XXXX");
  const [subject_, setSubject] = useState(`Off-market ${subject.beds}/${subject.baths} in ${subject.city} — ${usd(d.askingPrice, { compact: true })} · ARV ~${usd(arv, { compact: true })}`);
  const defaultBody = `${addr}, ${subject.city} ${subject.zip}\n${subject.beds} bd · ${subject.baths} ba · ${subject.sqft?.toLocaleString()} sf · lot ${subject.lotSqft?.toLocaleString()} sf · built ${subject.yearBuilt}\n\nAsking: ${usd(d.askingPrice)}\nEst. ARV: ${usd(arv)}\nEst. repairs: ${usd(repairs)}\nClosing: ${date(d.closingDate)}\nAccess: ${d.accessInstructions || "by appointment"}\n\nReply with questions or your offer.\n\n${ws.settings.compliance.blastDisclaimer}`;
  const [body, setBody] = useState(defaultBody);
  const blasts = ws.blasts.filter((b) => b.dispositionId === dispositionId);
  const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/portal/${dispositionId}` : "";
  return (
    <div className="grid lg:grid-cols-[1fr_1.1fr] gap-3">
      <Card title="Compose" actions={<Segmented size="xs" value={channel} onChange={setChannel} options={[{ value: "email", label: "Email" }, { value: "sms", label: "SMS" }, { value: "portal", label: "Private portal" }]} />}>
        <div className="space-y-2.5">
          <div className="text-[12px] text-muted">{d.selectedBuyerIds.length} buyers selected (Buyer Matching tab). Opted-out contacts and SMS without consent are suppressed automatically.</div>
          {channel === "email" && <Field label="Subject"><input className="input" value={subject_} onChange={(e) => setSubject(e.target.value)} /></Field>}
          <Field label={channel === "sms" ? "Message (keep it short)" : "Body"}><textarea className="input font-mono text-[12px]" rows={12} value={channel === "sms" ? `${addr}, ${subject.city}: ${subject.beds}/${subject.baths}, ${usd(d.askingPrice, { compact: true })} ask, ARV ~${usd(arv, { compact: true })}, rehab ~${usd(repairs, { compact: true })}. Reply INFO for details. ${ws.settings.compliance.smsOptOutText}` : body} onChange={(e) => setBody(e.target.value)} readOnly={channel === "sms"} /></Field>
          {channel === "email" && <div className="text-[11px] text-muted">Footer appended: “{ws.settings.compliance.emailFooter}” + unsubscribe link.</div>}
          {channel === "portal" && <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[12px]"><Link2 size={13} /><span className="truncate">{portalUrl}</span><button onClick={() => { navigator.clipboard?.writeText(portalUrl); toast("Link copied"); }}><Copy size={13} /></button></div>}
          <Button variant="primary" icon={channel === "sms" ? <MessageSquare size={13} /> : <Mail size={13} />} disabled={!d.selectedBuyerIds.length} onClick={() => {
            ws.sendBlast({ dispositionId, channel, subject: subject_, body, buyerIds: d.selectedBuyerIds });
            toast(`Blast recorded for ${d.selectedBuyerIds.length} buyers (delivery requires a messaging provider)`);
          }}>Send to {d.selectedBuyerIds.length} buyers</Button>
        </div>
      </Card>
      <Card title="Engagement tracking" bodyClass="p-0">
        {blasts.length === 0 && <div className="p-4 text-[12px] text-muted">No blasts yet.</div>}
        {blasts.map((b) => (
          <div key={b.id} className="border-b border-border last:border-0">
            <div className="flex items-center gap-2 px-3 h-9 text-[12px] bg-panel-2"><Badge tone="accent">{b.channel}</Badge><span className="truncate">{b.subject}</span><span className="ml-auto text-muted">{dateTime(b.sentAt)}</span></div>
            <div className="px-3 py-1.5 flex flex-wrap gap-1.5 text-[11px]">{(["sent", "opened", "clicked", "interested", "passed", "offer_submitted", "suppressed"] as BlastRecipientStatus[]).map((s) => { const n = b.recipients.filter((r) => r.status === s).length; return n ? <Badge key={s} tone={R_TONE[s]}>{s.replace("_", " ")} {n}</Badge> : null; })}</div>
            <table className="tbl text-[12px]"><tbody>{b.recipients.map((r) => {
              const buyer = ws.buyers.find((x) => x.id === r.buyerId);
              return (
                <tr key={r.buyerId}><td>{buyer?.name}</td><td><Badge tone={R_TONE[r.status]}>{r.status.replace("_", " ")}</Badge></td>
                  <td className="text-right"><select className="input input-sm w-[140px]" value={r.status} onChange={(e) => ws.setBlastRecipient(b.id, r.buyerId, e.target.value as BlastRecipientStatus)}>
                    {(["sent", "opened", "clicked", "interested", "passed", "offer_submitted"] as BlastRecipientStatus[]).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></td></tr>);
            })}</tbody></table>
          </div>
        ))}
      </Card>
    </div>
  );
}

function OffersTab({ dispositionId }: { dispositionId: string }) {
  const ws = useWorkspace();
  const toast = useUI((s) => s.toast);
  const d = ws.dispositions.find((x) => x.id === dispositionId)!;
  const offers = ws.buyerOffers.filter((o) => o.dispositionId === dispositionId).sort((a, b) => b.amount - a.amount);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ buyerId: "", amount: d.askingPrice, closeDays: 14, emd: 5000, pofVerified: false, notes: "" });
  return (
    <Card title="Buyer offers" subtitle={`contract ${usd(d.contractPrice)} · min ${usd(d.minimumPrice)}`} actions={<Button size="xs" variant="primary" icon={<Plus size={12} />} onClick={() => setOpen(true)}>Record offer</Button>} bodyClass="p-0">
      <table className="tbl text-[12.5px]">
        <thead><tr><th>Buyer</th><th className="text-right">Offer</th><th className="text-right">Expected fee</th><th>Reliability</th><th>Proof of funds</th><th className="text-right">Close</th><th className="text-right">EMD</th><th>Status</th><th>Received</th><th></th></tr></thead>
        <tbody>{offers.map((o) => {
          const b = ws.buyers.find((x) => x.id === o.buyerId);
          const fee = o.amount - d.contractPrice;
          return (
            <tr key={o.id} className={cx(o.status === "accepted" && "row-active", o.status === "declined" && "row-muted")}>
              <td className="font-medium">{b?.name}<div className="text-[11px] text-muted font-normal">{b?.company}{o.notes ? ` · ${o.notes}` : ""}</div></td>
              <td className="text-right num font-semibold">{usd(o.amount)}</td>
              <td className={cx("text-right num", fee >= d.minimumPrice - d.contractPrice ? "text-good" : "text-warn")}>{usd(fee)}</td>
              <td>{b ? `${b.reliability}/5 · ${b.dealsPurchased} deals` : "—"}</td>
              <td>{o.pofVerified ? <Badge tone="good"><ShieldCheck size={10} />verified</Badge> : <Badge tone="warn">pending</Badge>}</td>
              <td className="text-right num">{o.closeDays}d</td><td className="text-right num">{usd(o.emd)}</td>
              <td><Badge tone={o.status === "accepted" ? "good" : o.status === "declined" ? "neutral" : "accent"}>{o.status}</Badge></td>
              <td className="text-muted">{relative(o.at)}</td>
              <td>{o.status === "pending" && !d.winningOfferId && <Button size="xs" variant="primary" icon={<Trophy size={11} />} onClick={() => { ws.acceptBuyerOffer(o.id); toast("Winning buyer selected — assignment agreement drafted"); }}>Select winner</Button>}</td>
            </tr>);
        })}</tbody>
      </table>
      {offers.length === 0 && <div className="p-6 text-center text-[12px] text-muted">No buyer offers yet.</div>}
      <Dialog open={open} onClose={() => setOpen(false)} title="Record buyer offer" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { if (!f.buyerId) return; ws.addBuyerOffer({ dispositionId, ...f }); setOpen(false); toast("Offer recorded"); }}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Buyer" className="col-span-2"><select className="input" value={f.buyerId} onChange={(e) => setF({ ...f, buyerId: e.target.value })}><option value="">Choose…</option>{ws.buyers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.company ? ` — ${b.company}` : ""}</option>)}</select></Field>
          <Field label="Offer amount" hint={`fee ${usd(f.amount - d.contractPrice)}`}><NumberInput prefix="$" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
          <Field label="Close (days)"><NumberInput value={f.closeDays} onChange={(v) => setF({ ...f, closeDays: v })} /></Field>
          <Field label="EMD"><NumberInput prefix="$" value={f.emd} onChange={(v) => setF({ ...f, emd: v })} /></Field>
          <Field label="Proof of funds"><select className="input" value={f.pofVerified ? "y" : "n"} onChange={(e) => setF({ ...f, pofVerified: e.target.value === "y" })}><option value="n">Pending</option><option value="y">Verified</option></select></Field>
          <Field label="Notes" className="col-span-2"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
      </Dialog>
    </Card>
  );
}

function CloseCard({ dispositionId, projected }: { dispositionId: string; projected: number }) {
  const ws = useWorkspace();
  const toast = useUI((s) => s.toast);
  const d = ws.dispositions.find((x) => x.id === dispositionId)!;
  const [fee, setFee] = useState(d.actualFee ?? projected);
  const [at, setAt] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Card title="Record closing & assignment fee">
      {d.status === "closed" ? (
        <div className="text-[13px]"><div className="text-[26px] font-semibold num text-good">{usd(d.actualFee ?? 0)}</div>Closed {date(d.feeReceivedAt)} — fee recorded and counted in analytics.</div>
      ) : (
        <div className="space-y-3">
          <Field label="Actual assignment fee received" hint={`projected ${usd(projected)}`}><NumberInput prefix="$" value={fee} onChange={setFee} /></Field>
          <Field label="Closed on"><input type="date" className="input" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
          <Button variant="primary" icon={<Check size={13} />} onClick={() => { ws.closeDeal(dispositionId, fee, new Date(at + "T15:00:00").toISOString()); toast(`Closed — ${usd(fee)} recorded`); }}>Mark closed & record fee</Button>
        </div>
      )}
    </Card>
  );
}

export default function Page() { return <Suspense><DealRoom /></Suspense>; }
