"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, PageHeader, Stat } from "@/components/ui";
import { dateTime, pct, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";
import type { OfferStatus } from "@/lib/types";

const TONE: Record<OfferStatus, "neutral" | "accent" | "warn" | "good" | "bad"> = { draft: "neutral", sent: "accent", countered: "warn", accepted: "good", rejected: "bad", expired: "neutral", withdrawn: "neutral" };

export default function Offers() {
  const ws = useWorkspace();
  const router = useRouter();
  const openQuick = useUI((s) => s.openQuick);
  const [status, setStatus] = useState<OfferStatus | "">("");
  const rows = useMemo(() => ws.offers.filter((o) => !status || o.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [ws.offers, status]);
  const sent = ws.offers.filter((o) => o.status !== "draft");
  const accepted = ws.offers.filter((o) => o.status === "accepted");
  const avgDiscount = sent.length ? sent.reduce((s, o) => s + (o.arv ? 1 - o.amount / o.arv : 0), 0) / sent.length : null;
  return (
    <div>
      <PageHeader title="Offers" subtitle="Seller offers created from deal analysis" actions={<>
        <select className="input input-sm w-auto" value={status} onChange={(e) => setStatus(e.target.value as OfferStatus)}><option value="">All statuses</option>{Object.keys(TONE).map((s) => <option key={s}>{s}</option>)}</select>
        <Button variant="primary" onClick={() => openQuick("offer")}>New offer</Button>
      </>} />
      <div className="px-5 grid grid-cols-2 md:grid-cols-4 gap-2 pb-3">
        <Stat label="Offers sent" value={sent.length} />
        <Stat label="Accepted" value={accepted.length} sub={sent.length ? `${pct(accepted.length / sent.length)} acceptance` : undefined} />
        <Stat label="Countered" value={ws.offers.filter((o) => o.status === "countered").length} />
        <Stat label="Avg offer discount to ARV" value={avgDiscount != null ? pct(avgDiscount, 1) : "—"} title="Mean of 1 − offer ÷ ARV across sent offers" />
      </div>
      <div className="mx-5 mb-6 rounded-lg border border-border bg-panel overflow-auto">
        <table className="tbl text-[12.5px]">
          <thead><tr><th>Property</th><th className="text-right">Offer</th><th>Status</th><th className="text-right">Seller ask</th><th className="text-right">ARV</th><th className="text-right">Repairs</th><th className="text-right">MAO</th><th className="text-right">Proj. fee</th><th className="text-right">% of ARV</th><th>Terms</th><th>Created</th><th>Sent</th></tr></thead>
          <tbody>{rows.map((o) => {
            const l = ws.leads.find((x) => x.id === o.leadId);
            return (
              <tr key={o.id} className="cursor-pointer" onClick={() => router.push(`/properties/${o.propertyId}?tab=offers`)}>
                <td className="font-medium">{l?.property.line1 ?? o.propertyId}</td>
                <td className="text-right num font-semibold">{usd(o.amount)}{o.counterAmount ? <div className="text-[11px] text-warn font-normal">counter {usd(o.counterAmount)}</div> : null}</td>
                <td><Badge tone={TONE[o.status]}>{o.status}</Badge></td>
                <td className="text-right num">{usd(o.sellerAsk ?? null)}</td><td className="text-right num">{usd(o.arv)}</td><td className="text-right num">{usd(o.repairs)}</td>
                <td className="text-right num">{usd(o.mao || null)}</td><td className="text-right num">{usd(o.projectedFee)}</td><td className="text-right num">{o.arv ? pct(o.amount / o.arv) : "—"}</td>
                <td className="text-fg-2">EMD {usd(o.earnestMoney, { compact: true })} · {o.closeDays}d · insp {o.inspectionDays}d</td>
                <td>{dateTime(o.createdAt)}</td><td>{dateTime(o.sentAt)}</td>
              </tr>);
          })}</tbody>
        </table>
        {rows.length === 0 && <div className="p-8 text-center text-muted text-[12.5px]">No offers.</div>}
      </div>
    </div>
  );
}
