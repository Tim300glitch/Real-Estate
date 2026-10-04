"use client";
import { ArrowLeft, BookmarkPlus, FileDown, Gavel, Map as MapIcon, ScanSearch, Sigma, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AssistantPanel } from "@/components/crm/Assistant";
import { CompEngine, SimilarityBadge } from "@/components/deal/CompEngine";
import { OfferBuilder } from "@/components/deal/OfferBuilder";
import { ArvPanel, DealCalculator, DealIndicator, DealScoreCard, MotivationCard } from "@/components/deal/panels";
import { RepairEstimator, useRepairEstimate } from "@/components/deal/RepairEstimator";
import { CompLayer } from "@/components/map/layers";
import { PropertyMap } from "@/components/map/PropertyMap";
import { distressList, toSummaryClient } from "@/components/property/PropertyPanel";
import { Badge, Button, Card, KV, Menu, MenuItem, ScoreBadge, SlideOver, Toggle, cx } from "@/components/ui";
import { Sourced } from "@/components/ui/Provenance";
import { sortComps } from "@/lib/calc/comps";
import { dealScore, matchBuyers, motivationScore } from "@/lib/calc/scores";
import { useProperty } from "@/lib/client/api";
import { useAnalysis } from "@/lib/client/useAnalysis";
import { useCompSet } from "@/lib/client/useCompSet";
import { compReport, propertyAnalysisReport } from "@/lib/client/pdf";
import { date, num, pct100, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";
import { PIN_STATUS, PROPERTY_TYPE_LABEL } from "@/lib/types";

type Drawer = "comps" | "arv" | "offer" | "scores" | "ai" | null;

function DealDesk() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { data: rec, error } = useProperty(decodeURIComponent(id));
  const subject = useMemo(() => (rec ? toSummaryClient(rec) : null), [rec]);
  const cs = useCompSet(subject);
  const an = useAnalysis(subject, cs);
  const ws = useWorkspace();
  const toast = useUI((s) => s.toast);
  const [drawer, setDrawer] = useState<Drawer>((params.get("tab") as Drawer) ?? null);
  const [showLines, setShowLines] = useState(true);
  const lead = an.lead;
  const seller = an.seller;

  const motivation = useMemo(() => (subject ? motivationScore(subject, seller, ws.settings.motivationWeights) : null), [subject, seller, ws.settings.motivationWeights]);
  const included = cs.scored.filter((c) => c.included);
  const matches = useMemo(() => (subject && an.outputs ? matchBuyers(ws.buyers, { zip: subject.zip, city: subject.city, propertyType: subject.propertyType, beds: subject.beds, price: an.outputs.offers[1].price + an.inputs.wholesaleFee, repairs: an.inputs.repairs, arv: an.inputs.arv }) : []), [subject, an.outputs, an.inputs, ws.buyers]);
  const score = useMemo(() => subject ? dealScore({
    equityPct: subject.equityPct, motivation: motivation?.score ?? null, arv: an.inputs.arv || null, targetOffer: an.outputs?.offers[1].price ?? null,
    repairs: an.inputs.repairs, compsInArea: cs.scored.length || null, avgCompSimilarity: included.length ? included.reduce((s, c) => s + c.similarity, 0) / included.length : null,
    matchedBuyers: matches.filter((m) => m.score >= 70).length, feeAtTarget: an.outputs?.offers[1].fee ?? null, desiredFee: an.inputs.wholesaleFee,
    dom: null, conditionRating: null,
    titleFlags: [subject.distress.probate && "probate", (subject.distress.liens ?? 0) > 0 && "liens", subject.distress.preForeclosure && "pre-foreclosure"].filter(Boolean) as string[],
  }, ws.settings.dealWeights) : null, [subject, motivation, an, cs.scored, included, matches, ws.settings.dealWeights]);
  const rep = useRepairEstimate(subject ?? ({ id: "", sqft: 0 } as never));

  if (error) return <div className="p-6 text-bad">{error}</div>;
  if (!rec || !subject) return <div className="p-6 text-muted">Loading deal desk…</div>;

  const reportData = () => ({ subject, comps: sortComps(included, "similar"), arv: cs.arv, userArv: cs.compSet?.userArv, radiusMiles: cs.criteria.radiusMiles,
    repairs: rep.items.length ? { items: rep.items, totals: rep.totals } : null, inputs: an.inputs, outputs: an.outputs, motivation: motivation?.score, dealScore: score?.score });
  const pins = cs.scored.map((r, i) => ({ id: r.id, lat: r.lat, lng: r.lng, price: r.salePrice, included: r.included, label: r.line1, similarity: r.similarity, index: i + 1 })).filter((p) => p.included);

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 h-12 border-b border-border bg-panel shrink-0">
        <button onClick={() => router.back()} className="text-muted hover:text-fg"><ArrowLeft size={16} /></button>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold truncate">Deal Desk · {subject.line1}</div>
        </div>
        <span className="text-[12px] text-muted hidden md:inline">{subject.city} {subject.zip}</span>
        {lead ? <Badge dot={PIN_STATUS[lead.status].color}>{lead.stage.replace(/_/g, " ")}</Badge> : <Button size="xs" variant="primary" icon={<BookmarkPlus size={12} />} onClick={() => { ws.saveLead(subject, { source: "deal_finder" }); toast("Saved as lead"); }}>Save lead</Button>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="xs" icon={<ScanSearch size={12} />} onClick={() => setDrawer("comps")}>Comp engine</Button>
          <Button size="xs" icon={<Sigma size={12} />} onClick={() => setDrawer("arv")}>ARV detail</Button>
          <Button size="xs" icon={<Sparkles size={12} />} onClick={() => setDrawer("ai")}>Assistant</Button>
          <Menu trigger={(t) => <Button size="xs" icon={<FileDown size={12} />} onClick={t}>Reports</Button>}>
            {(close) => (<>
              <MenuItem onClick={() => { close(); propertyAnalysisReport(reportData()); ws.addDocument({ name: `Property Analysis — ${subject.line1}.pdf`, kind: "property_report", propertyId: subject.id, leadId: lead?.id, generated: true }); }}>Property analysis report</MenuItem>
              <MenuItem onClick={() => { close(); compReport(reportData()); ws.addDocument({ name: `Comp Report — ${subject.line1}.pdf`, kind: "comp_report", propertyId: subject.id, leadId: lead?.id, generated: true }); }}>Comp report</MenuItem>
            </>)}
          </Menu>
          <Button size="xs" href={`/properties/${subject.id}`}>Full record</Button>
          <Button size="xs" variant="primary" icon={<Gavel size={12} />} onClick={() => setDrawer("offer")}>Make offer</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(280px,0.9fr)_minmax(360px,1.3fr)_minmax(320px,1fr)]">
          {/* TOP LEFT — subject, seller, motivation */}
          <Card title="Subject property" actions={<Link href={`/map?focus=${subject.id}&lat=${subject.lat}&lng=${subject.lng}&z=16`} className="text-muted hover:text-fg" title="View on map"><MapIcon size={14} /></Link>} bodyClass="p-3 space-y-2">
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {[["Bd", subject.beds], ["Ba", subject.baths], ["Sq ft", num(subject.sqft)], ["Built", subject.yearBuilt]].map(([k, v]) => (
                <div key={k as string} className="rounded border border-border py-1"><div className="text-[10px] text-muted">{k}</div><div className="text-[13px] font-semibold num">{v ?? "—"}</div></div>
              ))}
            </div>
            <KV k="Type / lot" v={`${PROPERTY_TYPE_LABEL[subject.propertyType]} · ${num(subject.lotSqft)} sf`} />
            <KV k="Est. value" v={<Sourced prov={rec.provenance.estValue}>{usd(subject.estValue)}</Sourced>} />
            <KV k="Est. equity" v={<Sourced prov={rec.provenance.estEquity}>{usd(subject.estEquity)} ({pct100(subject.equityPct)})</Sourced>} />
            <KV k="Last sale" v={<Sourced prov={rec.provenance.lastSale}>{rec.lastSale ? `${usd(rec.lastSale.price)} · ${date(rec.lastSale.date)}` : "—"}</Sourced>} />
            <KV k="Owner" v={<Sourced prov={rec.provenance.owner}>{subject.ownerName}</Sourced>} />
            <div className="flex flex-wrap gap-1">{distressList(subject).map((t) => <Badge key={t.label} tone={t.tone}>{t.label}</Badge>)}</div>
            <div className="rounded-md border border-border bg-panel-2 p-2 text-[12px]">
              <div className="flex items-center justify-between"><span className="text-[10.5px] uppercase tracking-wide text-muted">Seller</span>{lead && <Link className="text-[11.5px] text-accent" href={`/properties/${subject.id}?tab=seller`}>Seller CRM →</Link>}</div>
              {seller ? (<>
                <div className="font-medium">{seller.name}</div>
                <div className="text-muted text-[11.5px]">Asking {usd(seller.askingPrice ?? null)} · timeline: {seller.timeline || "—"}</div>
                <div className="text-muted text-[11.5px] truncate">Reason: {seller.reasonForSelling || "—"}</div>
                <div className="text-muted text-[11.5px] truncate">Condition: {seller.condition || "—"}</div>
              </>) : <div className="text-muted">No seller conversation logged yet.</div>}
            </div>
            {motivation && <button onClick={() => setDrawer("scores")} className="w-full flex items-center gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-hover text-left">
              <ScoreBadge score={motivation.score} /><span className="text-[12px]">{motivation.label} motivation</span>
              {score && <><ScoreBadge score={score.score} /><span className="text-[12px]">{score.label}</span></>}
              <span className="ml-auto text-[11px] text-accent">why?</span>
            </button>}
          </Card>

          {/* TOP CENTER — map */}
          <Card title="Subject + comps" subtitle={`${included.length} selected · ${cs.criteria.radiusMiles} mi · ${cs.criteria.months} mo`} bodyClass="p-0" actions={<Toggle checked={showLines} onChange={setShowLines} label={<span className="text-[11.5px]">Lines</span>} />}>
            <div className="relative h-[330px]">
              <PropertyMap center={[subject.lng, subject.lat]} zoom={14.4}>
                <CompLayer subject={{ lat: subject.lat, lng: subject.lng, label: subject.line1 }} comps={pins} radiusMiles={cs.criteria.radiusMiles} showLines={showLines} onSelect={() => setDrawer("comps")} />
              </PropertyMap>
            </div>
          </Card>

          {/* TOP RIGHT — numbers */}
          <Card title="The numbers" subtitle="updates instantly" actions={score && <ScoreBadge score={score.score} label="deal" />}>
            <DealIndicator an={an} />
            {cs.arv && cs.arv.warnings.length > 0 && <div className="mt-2 text-[11px] text-warn">⚠ {cs.arv.warnings[0]}</div>}
            <div className="mt-2 flex items-center gap-2 text-[11.5px] text-muted">
              <span>Buyers matching ≥70%: <b className="text-fg">{matches.filter((m) => m.score >= 70).length}</b></span>
              {lead && <Link className="text-accent ml-auto" href={`/dispositions?lead=${lead.id}`}>Match buyers →</Link>}
            </div>
          </Card>

          {/* BOTTOM LEFT — selected comps */}
          <Card title="Selected comps" subtitle={cs.arv?.likely ? `ARV ${usd(cs.arv.likely)}${cs.compSet?.userArv ? ` · override ${usd(cs.compSet.userArv)}` : ""}` : undefined} bodyClass="p-0" actions={<Button size="xs" variant="ghost" onClick={() => setDrawer("comps")}>Edit</Button>}>
            <div className="max-h-[360px] overflow-y-auto divide-y divide-border">
              {cs.loading && cs.scored.length === 0 && <div className="p-3 text-[12px] text-muted">Searching sales…</div>}
              {sortComps(cs.scored, "similar").map((c) => (
                <div key={c.id} className={cx("flex items-center gap-2 px-3 py-1.5", !c.included && "opacity-45")}>
                  <Toggle checked={c.included} onChange={() => cs.toggle(c.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium truncate">{c.line1}</div>
                    <div className="text-[11px] text-muted num">{usd(c.salePrice, { compact: true })} · {usd(c.ppsf)}/sf · {c.sim.distanceMiles.toFixed(2)} mi · {date(c.saleDate)}</div>
                  </div>
                  <SimilarityBadge c={c} />
                </div>
              ))}
            </div>
          </Card>

          {/* BOTTOM CENTER — repairs */}
          <Card title="Repair estimator" subtitle={`expected ${usd(rep.totals.expected)}`}>
            <RepairEstimator subject={subject} compact />
          </Card>

          {/* BOTTOM RIGHT — calculator */}
          <Card title="Deal calculator" subtitle={an.outputs ? `MAO ${usd(an.outputs.mao)}` : undefined}>
            <DealCalculator an={an} compact />
          </Card>
        </div>
      </div>

      <SlideOver open={drawer === "comps"} onClose={() => setDrawer(null)} title={`Comp engine — ${subject.line1}`} width={1180}>
        <div className="p-4"><CompEngine subject={subject} cs={cs} /></div>
      </SlideOver>
      <SlideOver open={drawer === "arv"} onClose={() => setDrawer(null)} title="ARV calculation" width={760}>
        <div className="p-4"><ArvPanel subject={subject} cs={cs} /></div>
      </SlideOver>
      <SlideOver open={drawer === "offer"} onClose={() => setDrawer(null)} title={`Offer builder — ${subject.line1}`} width={900}>
        <div className="p-4">{lead ? <OfferBuilder subject={subject} an={an} /> : <div className="text-[12.5px]">Save this property as a lead to create offers. <Button size="xs" variant="primary" onClick={() => ws.saveLead(subject, { source: "deal_finder" })}>Save lead</Button></div>}</div>
      </SlideOver>
      <SlideOver open={drawer === "scores"} onClose={() => setDrawer(null)} title="Why this score?" width={620}>
        <div className="p-4 space-y-6">{motivation && <MotivationCard m={motivation} />}{score && <DealScoreCard score={score} />}</div>
      </SlideOver>
      <SlideOver open={drawer === "ai"} onClose={() => setDrawer(null)} title="Assistant" width={640}>
        <AssistantPanel propertyId={subject.id} subject={subject} record={rec} />
      </SlideOver>
    </div>
  );
}

export default function Page() {
  return <Suspense><DealDesk /></Suspense>;
}
