"use client";
import { Check, FileDown, Send, X } from "lucide-react";
import { useState } from "react";
import { computeDeal } from "@/lib/calc/deal";
import type { useAnalysis } from "@/lib/client/useAnalysis";
import { offerLetter } from "@/lib/client/pdf";
import { dateTime, pct, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";
import type { OfferStatus, PropertySummary } from "@/lib/types";
import { Badge, Button, Dialog, Field, NumberInput, Segmented } from "../ui";

const STATUS_TONE: Record<OfferStatus, "neutral" | "accent" | "warn" | "good" | "bad"> = {
  draft: "neutral", sent: "accent", countered: "warn", accepted: "good", rejected: "bad", expired: "neutral", withdrawn: "neutral",
};

export function fillTemplate(body: string, v: Record<string, string | number>) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in v ? (typeof v[k] === "number" ? Number(v[k]).toLocaleString("en-US") : String(v[k])) : `{{${k}}}`));
}

export function OfferBuilder({ subject, an }: { subject: PropertySummary; an: ReturnType<typeof useAnalysis> }) {
  const ws = useWorkspace();
  const toast = useUI((s) => s.toast);
  const o = an.outputs;
  const [amount, setAmount] = useState<number>(an.inputs.purchasePrice || o?.offers[1].price || 0);
  const [emd, setEmd] = useState(5000);
  const [closeDays, setCloseDays] = useState(21);
  const [inspection, setInspection] = useState(10);
  const [terms, setTerms] = useState("");
  const [tplId, setTplId] = useState(ws.settings.offerTemplates[0]?.id ?? "");
  const [counter, setCounter] = useState<{ id: string; amount: number } | null>(null);
  const tpl = ws.settings.offerTemplates.find((t) => t.id === tplId);
  const lead = an.lead;
  const offers = ws.offers.filter((x) => x.propertyId === subject.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const atAmount = o ? computeDeal({ ...an.inputs, purchasePrice: amount }) : null;
  const fee = o ? o.buyerMaxPrice - amount : null;
  const body = tpl ? fillTemplate(tpl.body, { offer: amount, emd, closeDays, inspectionDays: inspection, title: "a mutually agreed title/escrow company" }) : "";
  const sellerName = an.seller?.name ?? subject.ownerName;

  const save = (status: "draft" | "sent") => {
    if (!lead) return toast("Save the property as a lead first", "bad");
    if (!amount) return;
    const offer = ws.createOffer({ leadId: lead.id, propertyId: subject.id, amount, earnestMoney: emd, closeDays, inspectionDays: inspection, terms, templateId: tplId, status,
      arv: an.inputs.arv, repairs: an.inputs.repairs, mao: o?.offers[2].price ?? 0, projectedFee: fee ?? 0, sellerAsk: an.inputs.sellerAsk });
    an.update({ purchasePrice: amount });
    if (status === "sent") ws.logComm({ leadId: lead.id, type: "offer", direction: "outbound", outcome: "sent", body: `Offer ${usd(amount)} sent (EMD ${usd(emd)}, ${closeDays}-day close)` });
    toast(status === "sent" ? `Offer sent — ${usd(amount)}` : "Offer draft saved");
    return offer;
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 md:grid-cols-7 gap-px rounded-lg overflow-hidden border border-border bg-border">
        {[["ARV", usd(an.inputs.arv)], ["Repairs", usd(an.inputs.repairs)], ["MAO", usd(o?.offers[2].price)], ["Seller asking", usd(an.inputs.sellerAsk ?? null)],
          ["Proposed offer", usd(amount)], ["Projected fee", usd(fee)], ["Buyer margin", atAmount ? pct(atAmount.profitMargin, 1) : "—"]].map(([k, v]) => (
          <div key={k} className="bg-panel px-2.5 py-2"><div className="text-[10px] uppercase tracking-wide text-muted">{k}</div><div className={`text-[14px] font-semibold num ${k === "Projected fee" && fee != null && fee < 0 ? "text-bad" : ""}`}>{v}</div></div>
        ))}
      </div>
      {o && amount > o.offers[2].price && <div className="rounded-md bg-warn-soft text-warn px-2.5 py-1.5 text-[12px]">Offer is {usd(amount - o.offers[2].price)} above your MAO — fee falls below your {usd(an.inputs.wholesaleFee)} goal.</div>}

      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-2.5">
          {o && <Segmented value={amount === o.offers[0].price ? "low" : amount === o.offers[1].price ? "target" : amount === o.offers[2].price ? "max" : "custom"}
            onChange={(v) => setAmount(v === "low" ? o.offers[0].price : v === "target" ? o.offers[1].price : v === "max" ? o.offers[2].price : amount)}
            options={[{ value: "low", label: `Low ${usd(o.offers[0].price, { compact: true })}` }, { value: "target", label: `Target ${usd(o.offers[1].price, { compact: true })}` }, { value: "max", label: `Max ${usd(o.offers[2].price, { compact: true })}` }, { value: "custom", label: "Custom" }]} />}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Offer price"><NumberInput prefix="$" step={1000} value={amount} onChange={setAmount} /></Field>
            <Field label="Earnest money"><NumberInput prefix="$" step={500} value={emd} onChange={setEmd} /></Field>
            <Field label="Closing timeline (days)"><NumberInput value={closeDays} onChange={setCloseDays} /></Field>
            <Field label="Inspection / due diligence (days)"><NumberInput value={inspection} onChange={setInspection} /></Field>
          </div>
          <Field label="Template"><select className="input" value={tplId} onChange={(e) => setTplId(e.target.value)}>{ws.settings.offerTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Additional terms"><textarea className="input" rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. Seller may leave unwanted items; buyer covers escrow fees" /></Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save("draft")}>Save draft</Button>
            <Button variant="primary" icon={<Send size={13} />} onClick={() => save("sent")}>Mark as sent</Button>
            <Button icon={<FileDown size={13} />} onClick={() => {
              const offer = offers.find((x) => x.amount === amount) ?? save("draft");
              if (offer) { offerLetter(offer, subject, sellerName, body); ws.addDocument({ name: `Offer — ${subject.line1} (${usd(amount)}).pdf`, kind: "offer", leadId: lead?.id, propertyId: subject.id, generated: true }); }
            }}>Generate PDF</Button>
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Preview</div>
          <div className="rounded-lg border border-border bg-panel-2 p-3 text-[12px] leading-relaxed whitespace-pre-wrap max-h-[260px] overflow-y-auto">{body}{terms && `\n\nAdditional terms: ${terms}`}</div>
          <p className="mt-1.5 text-[10.5px] text-muted">Templates are yours to configure (Settings → Offer templates). They are not jurisdiction-specific legal language — have a licensed attorney or local professional review before use.</p>
        </div>
      </div>

      {offers.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="tbl text-[12px]">
            <thead><tr><th>Offer</th><th>Status</th><th>Created</th><th>Sent</th><th className="text-right">EMD</th><th className="text-right">Close</th><th className="text-right">Proj. fee</th><th>Actions</th></tr></thead>
            <tbody>
              {offers.map((x) => (
                <tr key={x.id}>
                  <td className="num font-semibold">{usd(x.amount)}{x.counterAmount ? <span className="text-warn font-normal"> · counter {usd(x.counterAmount)}</span> : null}</td>
                  <td><Badge tone={STATUS_TONE[x.status]}>{x.status}</Badge></td>
                  <td>{dateTime(x.createdAt)}</td><td>{dateTime(x.sentAt)}</td>
                  <td className="text-right num">{usd(x.earnestMoney)}</td><td className="text-right num">{x.closeDays}d</td><td className="text-right num">{usd(x.projectedFee)}</td>
                  <td className="flex gap-1">
                    {x.status === "draft" && <Button size="xs" onClick={() => ws.setOfferStatus(x.id, "sent")}>Send</Button>}
                    {["sent", "countered"].includes(x.status) && <>
                      <Button size="xs" icon={<Check size={11} />} onClick={() => {
                        ws.setOfferStatus(x.id, "accepted");
                        ws.createContract({ leadId: x.leadId, kind: "purchase_agreement", title: `Purchase agreement — ${subject.line1}`, amount: x.counterAmount ?? x.amount, party: sellerName });
                        toast("Offer accepted — purchase agreement drafted", "good", { label: "Contracts", href: "/contracts" });
                      }}>Accepted</Button>
                      <Button size="xs" onClick={() => setCounter({ id: x.id, amount: x.amount })}>Counter</Button>
                      <Button size="xs" icon={<X size={11} />} onClick={() => ws.setOfferStatus(x.id, "rejected")}>Rejected</Button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!counter} onClose={() => setCounter(null)} title="Record seller counter" footer={<><Button onClick={() => setCounter(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (counter) ws.setOfferStatus(counter.id, "countered", counter.amount); setCounter(null); }}>Save counter</Button></>}>
        <Field label="Seller's counter amount"><NumberInput prefix="$" value={counter?.amount ?? 0} onChange={(v) => setCounter((c) => (c ? { ...c, amount: v } : c))} /></Field>
        {o && counter && <div className="mt-2 text-[12px] text-muted">At {usd(counter.amount)} the spread to the buyer max ({usd(o.buyerMaxPrice)}) is <b className={o.buyerMaxPrice - counter.amount >= 0 ? "text-good" : "text-bad"}>{usd(o.buyerMaxPrice - counter.amount)}</b>.</div>}
      </Dialog>
    </div>
  );
}
