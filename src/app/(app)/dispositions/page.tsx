"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Badge, Button, Card, PageHeader, Stat } from "@/components/ui";
import { date, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";
import { DISP_TONE } from "@/components/buyers/shared";


function Dispositions() {
  const ws = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useUI((s) => s.toast);
  const leadParam = params.get("lead");
  useEffect(() => {
    if (!leadParam) return;
    const existing = ws.dispositions.find((d) => d.leadId === leadParam);
    const d = existing ?? ws.createDisposition(leadParam, {});
    router.replace(`/dispositions/${d.id}?tab=matching`);
  }, [leadParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = ws.dispositions.filter((d) => d.status !== "closed" && d.status !== "cancelled");
  const closed = ws.dispositions.filter((d) => d.status === "closed").sort((a, b) => (b.feeReceivedAt ?? "").localeCompare(a.feeReceivedAt ?? ""));
  const ready = ws.leads.filter((l) => !l.deletedAt && ["under_contract", "contract_sent"].includes(l.stage) && !ws.dispositions.some((d) => d.leadId === l.id));
  const row = (d: (typeof ws.dispositions)[number]) => {
    const l = ws.leads.find((x) => x.id === d.leadId);
    const win = ws.buyerOffers.find((o) => o.id === d.winningOfferId);
    const offers = ws.buyerOffers.filter((o) => o.dispositionId === d.id);
    const blast = ws.blasts.filter((b) => b.dispositionId === d.id).flatMap((b) => b.recipients);
    const fee = d.actualFee ?? (win ? win.amount - d.contractPrice : d.askingPrice - d.contractPrice);
    return (
      <tr key={d.id} className="cursor-pointer" onClick={() => router.push(`/dispositions/${d.id}`)}>
        <td className="font-medium">{l?.property.line1}<div className="text-[11px] text-muted font-normal">{l?.property.city} {l?.property.zip}</div></td>
        <td><Badge tone={DISP_TONE[d.status]}>{d.status.replace("_", " ")}</Badge></td>
        <td className="text-right num">{usd(d.contractPrice)}</td><td className="text-right num">{usd(d.askingPrice)}</td><td className="text-right num">{usd(d.minimumPrice)}</td>
        <td className="text-right num">{blast.length ? `${blast.filter((r) => ["interested", "offer_submitted"].includes(r.status)).length}/${blast.length}` : "—"}</td>
        <td className="text-right num">{offers.length ? `${offers.length} · best ${usd(Math.max(...offers.map((o) => o.amount)), { compact: true })}` : "—"}</td>
        <td className="text-right num text-good font-semibold">{usd(fee)}{d.actualFee != null ? "" : <span className="text-muted font-normal text-[10.5px]"> proj.</span>}</td>
        <td>{date(d.closingDate)}</td>
      </tr>
    );
  };
  return (
    <div>
      <PageHeader title="Dispositions" subtitle="Market contracted deals to buyers, collect offers, assign and close" />
      <div className="px-5 grid grid-cols-2 md:grid-cols-4 gap-2 pb-3">
        <Stat label="Active dispositions" value={open.length} />
        <Stat label="Projected fees" value={usd(open.reduce((s, d) => { const w = ws.buyerOffers.find((o) => o.id === d.winningOfferId); return s + (w ? w.amount : d.askingPrice) - d.contractPrice; }, 0), { compact: true })} />
        <Stat label="Closed" value={closed.length} />
        <Stat label="Fees collected" value={usd(closed.reduce((s, d) => s + (d.actualFee ?? 0), 0), { compact: true })} tone="good" />
      </div>
      {ready.length > 0 && (
        <Card className="mx-5 mb-3" title="Under contract — ready for dispositions" bodyClass="p-0">
          {ready.map((l) => (
            <div key={l.id} className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-0 text-[12.5px]">
              <span className="font-medium">{l.property.line1}</span><span className="text-muted">{l.stage.replace("_", " ")}</span>
              <Button size="xs" variant="primary" className="ml-auto" onClick={() => { const d = ws.createDisposition(l.id, {}); toast("Disposition created"); router.push(`/dispositions/${d.id}`); }}>Create disposition</Button>
            </div>
          ))}
        </Card>
      )}
      {[["Active", open], ["Closed", closed]].map(([title, list]) => (
        <Card key={title as string} className="mx-5 mb-3" title={title as string} subtitle={String((list as unknown[]).length)} bodyClass="p-0">
          <table className="tbl text-[12.5px]">
            <thead><tr><th>Property</th><th>Status</th><th className="text-right">Contract</th><th className="text-right">Asking</th><th className="text-right">Minimum</th><th className="text-right">Interest</th><th className="text-right">Offers</th><th className="text-right">Fee</th><th>Closing</th></tr></thead>
            <tbody>{(list as typeof ws.dispositions).map(row)}</tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

export default function Page() { return <Suspense><Dispositions /></Suspense>; }
