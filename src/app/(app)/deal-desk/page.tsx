"use client";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { PropertyPicker } from "@/components/property/PropertyPicker";
import { Badge, Card, PageHeader } from "@/components/ui";
import { computeDeal } from "@/lib/calc/deal";
import { usd } from "@/lib/format";
import { useWorkspace } from "@/lib/store/workspace";
import { PIN_STATUS } from "@/lib/types";

export default function DealDeskIndex() {
  const router = useRouter();
  const leads = useWorkspace((s) => s.leads);
  const analyses = useWorkspace((s) => s.analyses);
  const rows = useMemo(() => leads.filter((l) => !l.deletedAt && !["closed", "dead"].includes(l.stage)).map((l) => {
    const a = analyses.find((x) => x.propertyId === l.propertyId);
    return { l, o: a && a.inputs.arv > 0 ? computeDeal(a.inputs) : null, a };
  }), [leads, analyses]);
  return (
    <div>
      <PageHeader title="Deal Desk" subtitle="Evaluate a property before deciding to pursue it — subject, comps, ARV, repairs, MAO and offer on one screen." />
      <div className="px-5 grid lg:grid-cols-[380px_1fr] gap-3 pb-6">
        <Card title="Analyze any property"><PropertyPicker onPick={(p) => router.push(`/deal-desk/${p.id}`)} /></Card>
        <Card title="Active leads" bodyClass="p-0">
          <table className="tbl text-[12.5px]">
            <thead><tr><th>Property</th><th>Stage</th><th className="text-right">ARV</th><th className="text-right">Repairs</th><th className="text-right">MAO</th><th className="text-right">Target</th><th className="text-right">Fee @ target</th><th>Quality</th></tr></thead>
            <tbody>
              {rows.map(({ l, o, a }) => (
                <tr key={l.id} className="cursor-pointer" onClick={() => router.push(`/deal-desk/${l.propertyId}`)}>
                  <td className="font-medium">{l.property.line1}<div className="text-[11px] text-muted font-normal">{l.property.city}</div></td>
                  <td><Badge dot={PIN_STATUS[l.status].color}>{l.stage.replace(/_/g, " ")}</Badge></td>
                  <td className="text-right num">{usd(a?.inputs.arv ?? null, { compact: true })}</td>
                  <td className="text-right num">{usd(a?.inputs.repairs ?? null, { compact: true })}</td>
                  <td className="text-right num">{usd(o?.mao ?? null, { compact: true })}</td>
                  <td className="text-right num">{usd(o?.offers[1].price ?? null, { compact: true })}</td>
                  <td className="text-right num">{usd(o?.offers[1].fee ?? null, { compact: true })}</td>
                  <td>{o ? <Badge tone={o.quality === "Strong" ? "good" : o.quality === "Good" ? "accent" : o.quality === "Marginal" ? "warn" : "bad"}>{o.quality}</Badge> : <span className="text-muted text-[11.5px]">not analyzed</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
