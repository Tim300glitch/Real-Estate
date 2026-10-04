"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, Field, NumberInput } from "@/components/ui";
import { date, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";

/** Buyer-facing private deal page (preview). In production this is served at a signed, expiring URL per buyer. */
export default function Portal() {
  const { id } = useParams<{ id: string }>();
  const ws = useWorkspace();
  const toast = useUI((s) => s.toast);
  const d = ws.dispositions.find((x) => x.id === id);
  const lead = ws.leads.find((l) => l.id === d?.leadId);
  const a = ws.analyses.find((x) => x.propertyId === lead?.propertyId);
  const cs = ws.compSets.find((x) => x.propertyId === lead?.propertyId);
  const [buyerId, setBuyerId] = useState(d?.selectedBuyerIds[0] ?? "");
  const [amount, setAmount] = useState(d?.askingPrice ?? 0);
  if (!d || !lead) return <div className="p-6 text-muted">Deal not found.</div>;
  const p = lead.property;
  const addr = d.showFullAddress ? p.line1 : p.line1.replace(/^\d+/, "XXXX");
  const arv = cs?.userArv ?? cs?.calculatedArv ?? a?.inputs.arv;
  return (
    <div className="max-w-3xl mx-auto p-5 space-y-3">
      <div className="rounded-md bg-info-soft text-info px-3 py-2 text-[12px]">Preview of the private buyer portal. In production each buyer receives a signed, expiring link; views and offers are tracked per buyer.</div>
      <Card title={`${addr}, ${p.city} ${p.zip}`} subtitle="Off-market assignment opportunity">
        <div className="grid grid-cols-3 gap-2 text-[12.5px]">
          {[["Asking", usd(d.askingPrice)], ["Est. ARV", usd(arv ?? null)], ["Est. repairs", usd(a?.inputs.repairs ?? null)], ["Beds / baths", `${p.beds}/${p.baths}`], ["Sq ft", p.sqft?.toLocaleString()], ["Year", p.yearBuilt], ["Lot", `${p.lotSqft?.toLocaleString()} sf`], ["Closing", date(d.closingDate)], ["Comps", `${cs?.comps.filter((c) => c.included).length ?? 0}`]].map(([k, v]) => (
            <div key={k as string} className="rounded border border-border px-2 py-1.5"><div className="text-[10px] uppercase text-muted">{k}</div><div className="num font-semibold">{v}</div></div>
          ))}
        </div>
        <div className="mt-3 text-[12.5px]"><span className="text-muted">Access:</span> {d.accessInstructions || "by appointment"}</div>
        <div className="mt-3 rounded bg-warn-soft text-warn px-2 py-1.5 text-[11px]">{ws.settings.compliance.blastDisclaimer}</div>
      </Card>
      <Card title="Submit an offer">
        <div className="grid grid-cols-2 gap-3">
          <Field label="You are (preview: pick buyer)"><select className="input" value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>{ws.buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Offer"><NumberInput prefix="$" value={amount} onChange={setAmount} /></Field>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={() => { if (!buyerId) return; ws.addBuyerOffer({ dispositionId: d.id, buyerId, amount, closeDays: 14, emd: 5000, pofVerified: false, notes: "via portal" }); toast("Offer submitted"); }}>Submit offer</Button>
          <Button onClick={() => { const b = ws.blasts.find((x) => x.dispositionId === d.id && x.recipients.some((r) => r.buyerId === buyerId)); if (b) ws.setBlastRecipient(b.id, buyerId, "interested"); toast("Marked interested"); }}>I'm interested</Button>
        </div>
        <div className="mt-2"><Badge>Views and actions are logged to the deal's engagement tracking</Badge></div>
      </Card>
    </div>
  );
}
