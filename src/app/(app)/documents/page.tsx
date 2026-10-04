"use client";
import { FileText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { useWorkspace } from "@/lib/store/workspace";
import { CONTRACT_KIND_LABEL } from "@/lib/types";

const KIND: Record<string, string> = { property_report: "Property analysis", comp_report: "Comp report", deal_package: "Deal package", offer: "Offer", contract: "Contract", upload: "Upload" };

export default function Documents() {
  const ws = useWorkspace();
  const [kind, setKind] = useState("");
  const docs = ws.documents.filter((d) => !kind || d.kind === kind);
  return (
    <div>
      <PageHeader title="Documents" subtitle="Generated reports, offers and deal packages (regenerated from live data), plus contract records"
        actions={<select className="input input-sm w-auto" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All types</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>} />
      <div className="px-5 pb-6 grid lg:grid-cols-2 gap-3">
        <Card title="Generated documents" bodyClass="p-0">
          {docs.map((d) => {
            const l = ws.leads.find((x) => x.id === d.leadId);
            const pid = d.propertyId ?? l?.propertyId;
            return (
              <div key={d.id} className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-0 text-[12.5px]">
                <FileText size={14} className="text-muted shrink-0" />
                <div className="min-w-0 flex-1"><div className="truncate">{d.name}</div><div className="text-[11px] text-muted">{KIND[d.kind]} · {dateTime(d.createdAt)}</div></div>
                {pid && <Button size="xs" href={d.kind === "deal_package" && d.dispositionId ? `/dispositions/${d.dispositionId}?tab=package` : `/properties/${pid}?tab=documents`}>Regenerate</Button>}
                <button onClick={() => ws.deleteDocument(d.id)} className="text-muted hover:text-bad"><Trash2 size={13} /></button>
              </div>);
          })}
          {docs.length === 0 && <div className="p-6 text-center text-[12px] text-muted">No documents generated yet. Use Reports on the Deal Desk, a property’s Documents tab, or a disposition’s Deal Package.</div>}
        </Card>
        <Card title="Contracts & transaction documents" actions={<Button size="xs" href="/contracts">Manage</Button>} bodyClass="p-0">
          {ws.contracts.slice(0, 40).map((c) => {
            const l = ws.leads.find((x) => x.id === c.leadId);
            return (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-0 text-[12.5px]">
                <div className="min-w-0 flex-1"><div className="truncate">{c.title}</div><div className="text-[11px] text-muted">{CONTRACT_KIND_LABEL[c.kind]}{l && <> · <Link className="hover:text-accent" href={`/properties/${l.propertyId}`}>{l.property.line1}</Link></>}</div></div>
                <Badge tone={c.status === "executed" ? "good" : "accent"}>{c.status}</Badge>
              </div>);
          })}
        </Card>
      </div>
    </div>
  );
}
