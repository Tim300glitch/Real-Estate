"use client";
import { FileDown } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { CompEngine } from "@/components/deal/CompEngine";
import { ArvPanel } from "@/components/deal/panels";
import { PropertyPicker } from "@/components/property/PropertyPicker";
import { toSummaryClient } from "@/components/property/PropertyPanel";
import { Button, Card, PageHeader } from "@/components/ui";
import { sortComps } from "@/lib/calc/comps";
import { useProperty } from "@/lib/client/api";
import { compReport } from "@/lib/client/pdf";
import { useCompSet } from "@/lib/client/useCompSet";
import { useWorkspace } from "@/lib/store/workspace";

function Comps() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const { data: rec } = useProperty(id);
  const subject = useMemo(() => (rec ? toSummaryClient(rec) : null), [rec]);
  const cs = useCompSet(subject);
  const addDocument = useWorkspace((s) => s.addDocument);
  const recent = useWorkspace((s) => s.compSets).slice(0, 8);
  const leads = useWorkspace((s) => s.leads);
  if (!id) {
    return (
      <div>
        <PageHeader title="Comps" subtitle="Choose a subject property to search comparable sold properties from the connected comps provider." />
        <div className="px-5 grid lg:grid-cols-2 gap-3">
          <Card title="Subject property"><PropertyPicker autoFocus onPick={(p) => router.push(`/comps?id=${p.id}`)} /></Card>
          <Card title="Recent comp sets" bodyClass="p-0">
            {recent.length === 0 && <div className="p-4 text-[12px] text-muted">None yet.</div>}
            {recent.map((c) => { const l = leads.find((x) => x.propertyId === c.propertyId); return (
              <button key={c.id} onClick={() => router.push(`/comps?id=${c.propertyId}`)} className="flex w-full justify-between px-3 py-2 text-[12.5px] hover:bg-hover border-b border-border">
                <span>{l?.property.line1 ?? c.propertyId}</span><span className="text-muted">{c.comps.filter((x) => x.included).length} comps · ARV ${(c.userArv ?? c.calculatedArv ?? 0).toLocaleString()}</span>
              </button>); })}
          </Card>
        </div>
      </div>
    );
  }
  if (!subject) return <div className="p-6 text-muted">Loading subject…</div>;
  return (
    <div>
      <PageHeader title={`Comps · ${subject.line1}`} subtitle={`${subject.city} ${subject.zip} · ${subject.beds}bd/${subject.baths}ba · ${subject.sqft?.toLocaleString()} sf · built ${subject.yearBuilt}`}
        actions={<>
          <Button icon={<FileDown size={13} />} onClick={() => { compReport({ subject, comps: sortComps(cs.scored.filter((c) => c.included), "similar"), arv: cs.arv, userArv: cs.compSet?.userArv, radiusMiles: cs.criteria.radiusMiles, repairs: null, inputs: null, outputs: null }); addDocument({ name: `Comp Report — ${subject.line1}.pdf`, kind: "comp_report", propertyId: subject.id, generated: true }); }}>Comp report PDF</Button>
          <Button variant="primary" href={`/deal-desk/${subject.id}`}>Open Deal Desk</Button>
        </>} />
      <div className="px-5 pb-6 space-y-3">
        <CompEngine subject={subject} cs={cs} mapHeight={380} />
        <Card title="ARV calculator" subtitle="transparent methods — choose one, override if needed"><ArvPanel subject={subject} cs={cs} /></Card>
      </div>
    </div>
  );
}

export default function Page() { return <Suspense><Comps /></Suspense>; }
