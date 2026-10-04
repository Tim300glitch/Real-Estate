"use client";
import { BookmarkPlus, Calculator, Footprints, ImagePlus, Map as MapIcon, Trash2 } from "lucide-react";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { LineChart } from "@/components/charts";
import { AssistantPanel } from "@/components/crm/Assistant";
import { CommTimeline, LogCommDialog, NotePhoto, NotesPanel } from "@/components/crm/Comms";
import { SellerCRM } from "@/components/crm/SellerCRM";
import { CompEngine } from "@/components/deal/CompEngine";
import { OfferBuilder } from "@/components/deal/OfferBuilder";
import { ArvPanel, DealCalculator, DealIndicator, DealScoreCard, MotivationCard } from "@/components/deal/panels";
import { RepairEstimator, useRepairEstimate } from "@/components/deal/RepairEstimator";
import { AddToListMenu, TagMenu, distressList, toSummaryClient } from "@/components/property/PropertyPanel";
import { StreetView } from "@/components/map/StreetView";
import { Badge, Button, Card, KV, PageHeader, Tabs, cx } from "@/components/ui";
import { SOURCE_META, SourceLegend, Sourced } from "@/components/ui/Provenance";
import { sortComps } from "@/lib/calc/comps";
import { dealScore, matchBuyers, motivationScore } from "@/lib/calc/scores";
import { api, useProperty } from "@/lib/client/api";
import { compReport, propertyAnalysisReport } from "@/lib/client/pdf";
import { savePhotos } from "@/lib/client/photos";
import { useAnalysis } from "@/lib/client/useAnalysis";
import { useCompSet } from "@/lib/client/useCompSet";
import { date, dateTime, num, pct100, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace, userName } from "@/lib/store/workspace";
import { PIN_STATUS, PROPERTY_TYPE_LABEL, STAGES, type LeadStage, type PinStatus, type PropertyRecord, type PropertySummary } from "@/lib/types";

const TABS = ["overview", "owner", "property", "seller", "comps", "arv", "analysis", "repairs", "offers", "communication", "photos", "documents", "activity", "sources", "assistant"] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { overview: "Overview", owner: "Owner", property: "Property", seller: "Seller CRM", comps: "Comps", arv: "ARV", analysis: "Deal Analysis", repairs: "Repairs", offers: "Offers", communication: "Communication", photos: "Photos", documents: "Documents", activity: "Activity", sources: "Data Sources", assistant: "Assistant" };

function PropertyRecordPage() {
  const { id } = useParams<{ id: string }>();
  const pid = decodeURIComponent(id);
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "overview");
  const { data: rec, error } = useProperty(pid);
  const subject = useMemo(() => (rec ? toSummaryClient(rec) : null), [rec]);
  const cs = useCompSet(subject);
  const an = useAnalysis(subject, cs);
  const ws = useWorkspace();
  const toast = useUI((s) => s.toast);
  const lead = an.lead;
  const [log, setLog] = useState(false);

  if (error) return <div className="p-6 text-bad">{error}</div>;
  if (!rec || !subject) return <div className="p-6 text-muted">Loading property…</div>;
  const counts: Partial<Record<Tab, number>> = {
    communication: lead ? ws.comms.filter((c) => c.leadId === lead.id).length : 0,
    offers: ws.offers.filter((o) => o.propertyId === pid).length,
    comps: cs.scored.filter((c) => c.included).length,
  };

  return (
    <div>
      <PageHeader title={<span className="flex items-center gap-2">{rec.address.line1}{subject.synthetic && <Badge tone="warn">Demo data</Badge>}</span>}
        subtitle={`${rec.address.city}, ${rec.address.state} ${rec.address.zip} · ${rec.neighborhood} · APN ${rec.apn} · ${PROPERTY_TYPE_LABEL[rec.propertyType]}`}
        actions={<>
          {lead ? (
            <>
              <select className="input input-sm w-auto" value={lead.stage} onChange={(e) => ws.moveStage(lead.id, e.target.value as LeadStage)}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
              <select className="input input-sm w-auto" value={lead.status} onChange={(e) => ws.updateLead(lead.id, { status: e.target.value as PinStatus })}>{(Object.keys(PIN_STATUS) as PinStatus[]).map((s) => <option key={s} value={s}>{PIN_STATUS[s].label}</option>)}</select>
              <TagMenu leadId={lead.id} />
            </>
          ) : <Button variant="primary" icon={<BookmarkPlus size={13} />} onClick={() => { ws.saveLead(subject, { source: "map" }); toast("Saved as lead"); }}>Save lead</Button>}
          <AddToListMenu summary={subject} size="sm" />
          <Button icon={<MapIcon size={13} />} href={`/map?focus=${pid}&lat=${rec.lat}&lng=${rec.lng}&z=16`}>Map</Button>
          <Button icon={<Footprints size={13} />} href={`/walkthrough/${pid}`}>Walkthrough</Button>
          <Button variant="primary" icon={<Calculator size={13} />} href={`/deal-desk/${pid}`}>Deal Desk</Button>
          {lead && <Button variant="ghost" icon={<Trash2 size={13} />} title="Archive lead (soft delete)" onClick={() => { if (confirm("Archive this lead? It can be restored from the audit log.")) { ws.deleteLead(lead.id); router.push("/leads"); } }} />}
        </>}>
        {lead && lead.tags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{lead.tags.map((t) => <Badge key={t} tone={t === "Do Not Contact" ? "bad" : "accent"}>{t}</Badge>)}</div>}
      </PageHeader>
      <div className="px-5"><Tabs tabs={TABS.map((t) => ({ id: t, label: LABEL[t], count: counts[t] || undefined }))} value={tab} onChange={setTab} /></div>
      <div className="p-5 pt-4">
        {tab === "overview" && <Overview rec={rec} subject={subject} an={an} cs={cs} onLog={() => setLog(true)} setTab={setTab} />}
        {tab === "owner" && <OwnerTab rec={rec} />}
        {tab === "property" && <PropertyTab rec={rec} />}
        {tab === "seller" && (lead ? <SellerCRM lead={lead} property={subject} /> : <NeedLead subject={subject} />)}
        {tab === "comps" && <CompEngine subject={subject} cs={cs} />}
        {tab === "arv" && <Card title="ARV calculator"><ArvPanel subject={subject} cs={cs} /></Card>}
        {tab === "analysis" && <AnalysisTab subject={subject} an={an} cs={cs} />}
        {tab === "repairs" && <Card title="Repair estimator" actions={<Button size="xs" href={`/walkthrough/${pid}`} icon={<Footprints size={12} />}>Walkthrough mode</Button>}><RepairEstimator subject={subject} /></Card>}
        {tab === "offers" && (lead ? <Card title="Offer builder"><OfferBuilder subject={subject} an={an} /></Card> : <NeedLead subject={subject} />)}
        {tab === "communication" && (lead ? (
          <Card title="Communication timeline" actions={<Button size="xs" variant="primary" onClick={() => setLog(true)}>Log communication</Button>}>
            <CommTimeline comms={ws.comms.filter((c) => c.leadId === lead.id)} />
          </Card>) : <NeedLead subject={subject} />)}
        {tab === "photos" && <PhotosTab subject={subject} />}
        {tab === "documents" && <DocumentsTab subject={subject} cs={cs} an={an} />}
        {tab === "activity" && <ActivityTab subject={subject} />}
        {tab === "sources" && <SourcesTab rec={rec} />}
        {tab === "assistant" && <Card title="Assistant" bodyClass="p-0"><AssistantPanel propertyId={pid} subject={subject} record={rec} /></Card>}
      </div>
      {lead && <LogCommDialog open={log} onClose={() => setLog(false)} leadId={lead.id} contact={ws.sellers.find((s) => s.id === lead.sellerId)?.contacts.find((c) => c.kind === "phone" && c.status !== "bad")} />}
    </div>
  );
}

function NeedLead({ subject }: { subject: PropertySummary }) {
  const saveLead = useWorkspace((s) => s.saveLead);
  return <Card><div className="text-[12.5px]">This property isn’t a lead yet. <Button size="xs" variant="primary" onClick={() => saveLead(subject, { source: "map" })}>Save as lead</Button></div></Card>;
}

function Overview({ rec, subject, an, cs, onLog, setTab }: { rec: PropertyRecord; subject: PropertySummary; an: ReturnType<typeof useAnalysis>; cs: ReturnType<typeof useCompSet>; onLog: () => void; setTab: (t: Tab) => void }) {
  const ws = useWorkspace();
  const pv = rec.provenance;
  const m = motivationScore(subject, an.seller, ws.settings.motivationWeights);
  const included = cs.scored.filter((c) => c.included);
  const matches = an.outputs ? matchBuyers(ws.buyers, { zip: subject.zip, city: subject.city, propertyType: subject.propertyType, beds: subject.beds, price: an.outputs.offers[1].price + an.inputs.wholesaleFee, repairs: an.inputs.repairs, arv: an.inputs.arv }) : [];
  const score = dealScore({ equityPct: subject.equityPct, motivation: m.score, arv: an.inputs.arv || null, targetOffer: an.outputs?.offers[1].price ?? null, repairs: an.inputs.repairs, compsInArea: cs.scored.length || null,
    avgCompSimilarity: included.length ? included.reduce((s, c) => s + c.similarity, 0) / included.length : null, matchedBuyers: an.outputs ? matches.filter((x) => x.score >= 70).length : null,
    feeAtTarget: an.outputs?.offers[1].fee ?? null, desiredFee: an.inputs.wholesaleFee, dom: null, conditionRating: null, titleFlags: [subject.distress.probate && "probate", (subject.distress.liens ?? 0) > 0 && "liens"].filter(Boolean) as string[] }, ws.settings.dealWeights);
  const lead = an.lead;
  return (
    <div className="grid xl:grid-cols-3 gap-3">
      <div className="space-y-3">
        <Card title="Snapshot" bodyClass="p-3 space-y-0.5">
          <StreetView lat={rec.lat} lng={rec.lng} height={160} />
          <div className="pt-2" />
          <KV k="Beds / baths" v={<Sourced prov={pv.beds}>{rec.beds} / {rec.baths}</Sourced>} />
          <KV k="Living area" v={<Sourced prov={pv.sqft}>{num(rec.sqft)} sf</Sourced>} />
          <KV k="Lot" v={<Sourced prov={pv.lotSqft}>{num(rec.lotSqft)} sf</Sourced>} />
          <KV k="Year built" v={<Sourced prov={pv.yearBuilt}>{rec.yearBuilt}</Sourced>} />
          <KV k="Est. value" v={<Sourced prov={pv.estValue}>{usd(rec.estValue)}</Sourced>} />
          <KV k="Est. mortgage" v={<Sourced prov={pv.estMortgageBalance}>{rec.freeAndClear ? "none recorded" : usd(rec.estMortgageBalance)}</Sourced>} />
          <KV k="Est. equity" v={<Sourced prov={pv.estEquity}>{usd(rec.estEquity)} ({pct100(rec.equityPct)})</Sourced>} />
          <KV k="Owner" v={<Sourced prov={pv.owner}>{rec.owner.names.join(" & ")}</Sourced>} />
          <KV k="Owned" v={<Sourced prov={pv.yearsOwned}>{rec.yearsOwned?.toFixed(1)} yrs</Sourced>} />
          <div className="flex flex-wrap gap-1 pt-1">{distressList(subject).map((t) => <Badge key={t.label} tone={t.tone}>{t.label}</Badge>)}</div>
        </Card>
        <Card title="Seller motivation"><MotivationCard m={m} /></Card>
      </div>
      <div className="space-y-3">
        <Card title="Deal summary" actions={<Button size="xs" variant="ghost" onClick={() => setTab("analysis")}>Analyze</Button>}><DealIndicator an={an} /></Card>
        <Card title="Deal score"><DealScoreCard score={score} /></Card>
      </div>
      <div className="space-y-3">
        {lead && (
          <Card title="Recent communication" actions={<><Button size="xs" onClick={onLog}>Log</Button><Button size="xs" variant="ghost" onClick={() => setTab("communication")}>All</Button></>} bodyClass="p-3 max-h-[300px] overflow-y-auto">
            <CommTimeline comms={ws.comms.filter((c) => c.leadId === lead.id).slice(0, 8)} compact />
          </Card>
        )}
        <Card title="Notes">{lead ? <NotesPanel entityType="lead" entityId={lead.id} notes={ws.notes.filter((n) => n.entityId === lead.id)} /> : <NotesPanel entityType="property" entityId={subject.id} notes={ws.notes.filter((n) => n.entityId === subject.id)} />}</Card>
      </div>
    </div>
  );
}

function OwnerTab({ rec }: { rec: PropertyRecord }) {
  const [portfolio, setPortfolio] = useState<PropertySummary[] | null>(null);
  const openPanel = useUI((s) => s.openPanel);
  useEffect(() => { api.owner(rec.owner.ownerId).then((r) => setPortfolio(r.portfolio)).catch(() => setPortfolio([])); }, [rec.owner.ownerId]);
  const pv = rec.provenance;
  const purchase = rec.sales.find((s) => s.price != null);
  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-3">
      <Card title="Owner of record">
        <KV k="Owner name" v={<Sourced prov={pv.owner}>{rec.owner.names.join(" & ")}</Sourced>} />
        <KV k="Ownership entity" v={<span className="capitalize">{rec.owner.entityType}{["llc", "corporation"].includes(rec.owner.entityType) ? " (business entity)" : rec.owner.entityType === "individual" ? " (individual)" : ""}</span>} />
        <KV k="Mailing address" v={<Sourced prov={pv.mailing}>{rec.owner.mailing.line1}, {rec.owner.mailing.city} {rec.owner.mailing.state}</Sourced>} />
        <KV k="Owner occupied" v={<Sourced prov={pv.ownerOccupied}>{rec.owner.ownerOccupied ? "Yes" : "No"}{rec.owner.outOfState ? " · out of state" : ""}</Sourced>} />
        <KV k="Years owned" v={<Sourced prov={pv.yearsOwned}>{rec.yearsOwned?.toFixed(1) ?? "—"}</Sourced>} />
        <KV k="Previous transaction" v={<Sourced prov={pv.lastSale}>{rec.lastSale ? `${date(rec.lastSale.date)} · ${rec.lastSale.docType}` : "—"}</Sourced>} />
        <KV k="Purchase price" v={usd(purchase?.price ?? null)} />
        <KV k="Estimated equity" v={<Sourced prov={pv.estEquity}>{usd(rec.estEquity)}</Sourced>} />
        <KV k="Properties owned" v={rec.owner.portfolioCount ?? "—"} />
      </Card>
      <Card title="Owner portfolio" subtitle="associated properties where the provider supports owner matching" bodyClass="p-0">
        {!portfolio ? <div className="p-4 text-[12px] text-muted">Loading…</div> : (
          <table className="tbl text-[12.5px]">
            <thead><tr><th>Address</th><th>Type</th><th className="text-right">Est. value</th><th className="text-right">Equity</th><th className="text-right">Owned</th><th>Signals</th></tr></thead>
            <tbody>{portfolio.map((p) => (
              <tr key={p.id} className={cx("cursor-pointer", p.id === rec.id && "row-active")} onClick={() => openPanel(p.id)}>
                <td className="font-medium">{p.line1}<div className="text-[11px] text-muted">{p.city} {p.zip}</div></td><td>{PROPERTY_TYPE_LABEL[p.propertyType]}</td>
                <td className="text-right num">{usd(p.estValue, { compact: true })}</td><td className="text-right num">{pct100(p.equityPct)}</td><td className="text-right num">{p.yearsOwned?.toFixed(0)}y</td>
                <td className="flex gap-1">{distressList(p).slice(0, 3).map((t) => <Badge key={t.label} tone={t.tone}>{t.label}</Badge>)}</td>
              </tr>))}</tbody>
          </table>
        )}
        <div className="px-3 py-2 text-[10.5px] text-muted border-t border-border">Owner matching is name + mailing-address based and can produce false matches; verify before contact.</div>
      </Card>
    </div>
  );
}

function PropertyTab({ rec }: { rec: PropertyRecord }) {
  const pv = rec.provenance;
  return (
    <div className="grid lg:grid-cols-2 gap-3">
      <Card title="Characteristics">
        <KV k="Property type" v={<Sourced prov={pv.propertyType}>{PROPERTY_TYPE_LABEL[rec.propertyType]} · {rec.units} unit{rec.units > 1 ? "s" : ""}</Sourced>} />
        <KV k="Beds / baths" v={<Sourced prov={pv.beds}>{rec.beds} / {rec.baths}</Sourced>} />
        <KV k="Living area" v={<Sourced prov={pv.sqft}>{num(rec.sqft)} sf</Sourced>} />
        <KV k="Lot size" v={<Sourced prov={pv.lotSqft}>{num(rec.lotSqft)} sf ({((rec.lotSqft ?? 0) / 43560).toFixed(2)} ac)</Sourced>} />
        <KV k="Year built" v={<Sourced prov={pv.yearBuilt}>{rec.yearBuilt} ({new Date().getFullYear() - (rec.yearBuilt ?? 0)} yrs old)</Sourced>} />
        <KV k="County / APN" v={<Sourced prov={pv.apn}>{rec.address.county} · {rec.apn}</Sourced>} />
        <KV k="Annual tax" v={<Sourced prov={pv.tax}>{usd(rec.tax?.annualTax)} ({rec.tax?.year})</Sourced>} />
        <KV k="Assessed value" v={<Sourced prov={pv.tax}>{usd(rec.tax?.assessedValue)}</Sourced>} />
        <KV k="Tax delinquent" v={<Sourced prov={pv.taxDelinquent}>{rec.tax?.delinquent ? `Yes — ${usd(rec.tax.delinquentAmount)}` : rec.tax?.delinquent === false ? "No" : "Unknown"}</Sourced>} />
      </Card>
      <Card title="Estimated value history" subtitle="kept — never silently overwritten">
        <LineChart labels={rec.valueHistory.map((v) => new Date(v.date).toLocaleDateString("en-US", { month: "short", year: "2-digit" }))} series={[{ name: "Est. value", values: rec.valueHistory.map((v) => v.value) }]} format={(v) => usd(v, { compact: true })} height={170} />
        <div className="mt-1 text-[10.5px] text-muted">Source: {rec.valueHistory[0]?.source ?? "—"} · each refresh appends a point (property_data_history)</div>
      </Card>
      <Card title="Sales & transfer history" bodyClass="p-0">
        <table className="tbl text-[12.5px]"><thead><tr><th>Recorded</th><th>Document</th><th className="text-right">Price</th><th>Cash</th><th>Source</th></tr></thead>
          <tbody>{rec.sales.map((s, i) => <tr key={i}><td>{date(s.date)}</td><td>{s.docType}</td><td className="text-right num">{usd(s.price)}</td><td>{s.cash == null ? "—" : s.cash ? "Yes" : "No"}</td><td><Sourced prov={s.source}>{s.source.source}</Sourced></td></tr>)}</tbody>
        </table>
      </Card>
      <Card title="Mortgages & liens" bodyClass="p-0">
        <table className="tbl text-[12.5px]"><thead><tr><th>Lender</th><th>Recorded</th><th className="text-right">Original</th><th className="text-right">Est. balance</th><th>Type</th></tr></thead>
          <tbody>{rec.mortgages.map((mm, i) => <tr key={i}><td>{mm.lender}</td><td>{date(mm.recordedOn)}</td><td className="text-right num">{usd(mm.originalAmount)}</td><td className="text-right num"><Sourced prov={mm.source}>{usd(mm.estBalance)}</Sourced></td><td>{mm.loanType}</td></tr>)}
            {rec.mortgages.length === 0 && <tr><td colSpan={5} className="text-muted text-center py-4">No open mortgage found in recorded documents (estimate)</td></tr>}</tbody>
        </table>
        <div className="px-3 py-2 text-[11px] text-muted border-t border-border">Liens on record: {rec.distress.liens ?? "unknown"} · Mortgage balances are estimates — obtain a payoff statement before contracting.</div>
      </Card>
    </div>
  );
}

function AnalysisTab({ subject, an, cs }: { subject: PropertySummary; an: ReturnType<typeof useAnalysis>; cs: ReturnType<typeof useCompSet> }) {
  void subject; void cs;
  return (
    <div className="grid xl:grid-cols-[1.5fr_1fr] gap-3">
      <Card title="Deal analyzer & MAO"><DealCalculator an={an} /></Card>
      <Card title="Visual deal indicator"><DealIndicator an={an} /></Card>
    </div>
  );
}

function PhotosTab({ subject }: { subject: PropertySummary }) {
  const ws = useWorkspace();
  const lead = ws.leads.find((l) => l.propertyId === subject.id && !l.deletedAt);
  const rep = ws.repairs.find((r) => r.propertyId === subject.id);
  const file = useRef<HTMLInputElement>(null);
  const ids = [...ws.notes.filter((n) => n.entityId === lead?.id || n.entityId === subject.id).flatMap((n) => n.photoIds), ...(rep?.walkthrough.flatMap((r) => r.photoIds) ?? [])];
  return (
    <Card title="Photos" subtitle="your own photos only — listing photos require a licensed source" actions={<Button size="xs" variant="primary" icon={<ImagePlus size={12} />} onClick={() => file.current?.click()}>Upload</Button>}>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={async (e) => {
        if (!e.target.files) return;
        const p = await savePhotos(e.target.files);
        ws.addNote({ entityType: lead ? "lead" : "property", entityId: lead?.id ?? subject.id, body: `${p.length} photo(s) uploaded`, pinned: false, tags: ["photos"], viaVoice: false, photoIds: p });
      }} />
      <div className="flex flex-wrap gap-2">{ids.map((p) => <NotePhoto key={p} id={p} />)}</div>
      {ids.length === 0 && <div className="text-[12px] text-muted py-6 text-center">No photos yet. Upload, add photos to notes, or capture them in walkthrough / driving mode.</div>}
      <div className="mt-3"><StreetView lat={subject.lat} lng={subject.lng} height={240} /></div>
    </Card>
  );
}

function DocumentsTab({ subject, cs, an }: { subject: PropertySummary; cs: ReturnType<typeof useCompSet>; an: ReturnType<typeof useAnalysis> }) {
  const ws = useWorkspace();
  const rep = useRepairEstimate(subject);
  const docs = ws.documents.filter((d) => d.propertyId === subject.id);
  const contracts = ws.contracts.filter((c) => c.leadId === an.lead?.id);
  const data = () => ({ subject, comps: sortComps(cs.scored.filter((c) => c.included), "similar"), arv: cs.arv, userArv: cs.compSet?.userArv, radiusMiles: cs.criteria.radiusMiles, repairs: rep.items.length ? { items: rep.items, totals: rep.totals } : null, inputs: an.inputs, outputs: an.outputs });
  return (
    <div className="grid lg:grid-cols-2 gap-3">
      <Card title="Generate">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { propertyAnalysisReport(data()); ws.addDocument({ name: `Property Analysis — ${subject.line1}.pdf`, kind: "property_report", propertyId: subject.id, leadId: an.lead?.id, generated: true }); }}>Property analysis report</Button>
          <Button onClick={() => { compReport(data()); ws.addDocument({ name: `Comp Report — ${subject.line1}.pdf`, kind: "comp_report", propertyId: subject.id, leadId: an.lead?.id, generated: true }); }}>Comp report</Button>
        </div>
        <div className="mt-3 text-[11px] text-muted">PDFs are regenerated from current data each time. Deal packages are generated from the disposition.</div>
      </Card>
      <Card title="Documents & contracts" bodyClass="p-0">
        <table className="tbl text-[12.5px]"><tbody>
          {docs.map((d) => <tr key={d.id}><td>{d.name}</td><td><Badge>{d.kind.replace("_", " ")}</Badge></td><td className="text-muted">{dateTime(d.createdAt)}</td></tr>)}
          {contracts.map((c) => <tr key={c.id}><td>{c.title}</td><td><Badge tone="accent">{c.status}</Badge></td><td className="text-muted">{dateTime(c.createdAt)}</td></tr>)}
          {docs.length + contracts.length === 0 && <tr><td className="text-muted text-center py-4">No documents yet</td></tr>}
        </tbody></table>
      </Card>
    </div>
  );
}

function ActivityTab({ subject }: { subject: PropertySummary }) {
  const ws = useWorkspace();
  const lead = ws.leads.find((l) => l.propertyId === subject.id && !l.deletedAt);
  const events = useMemo(() => {
    const e: { at: string; text: string; kind: string; user?: string }[] = [];
    if (lead) {
      lead.stageHistory.forEach((h, i) => e.push({ at: h.at, text: i === 0 ? `Property discovered — lead created (${lead.source.replace(/_/g, " ")})` : `Stage → ${STAGES.find((s) => s.id === h.stage)?.label}`, kind: "stage" }));
      ws.comms.filter((c) => c.leadId === lead.id).forEach((c) => e.push({ at: c.at, text: `${c.direction === "inbound" ? "Inbound" : c.direction === "internal" ? "" : "Outbound"} ${c.type}${c.outcome ? ` — ${c.outcome}` : ""}${c.body ? `: ${c.body.slice(0, 120)}` : ""}`, kind: c.type, user: c.userId }));
      ws.offers.filter((o) => o.leadId === lead.id).forEach((o) => { e.push({ at: o.createdAt, text: `Offer created — ${usd(o.amount)}`, kind: "offer" }); if (o.sentAt) e.push({ at: o.sentAt, text: `Offer sent — ${usd(o.amount)}`, kind: "offer" }); if (o.respondedAt) e.push({ at: o.respondedAt, text: `Offer ${o.status}${o.counterAmount ? ` (counter ${usd(o.counterAmount)})` : ""}`, kind: "offer" }); });
      ws.contracts.filter((c) => c.leadId === lead.id).forEach((c) => c.history.forEach((h) => e.push({ at: h.at, text: `${c.title} — ${h.status}`, kind: "contract" })));
      ws.appointments.filter((a) => a.leadId === lead.id).forEach((a) => e.push({ at: a.startsAt, text: `${a.title} (${a.status})`, kind: "appointment" }));
      ws.notes.filter((n) => n.entityId === lead.id).forEach((n) => e.push({ at: n.at, text: `Note: ${n.body.slice(0, 120)}`, kind: "note", user: n.userId }));
    }
    ws.activities.filter((a) => (a.propertyId === subject.id || (lead && a.leadId === lead.id)) && !a.type.startsWith("comm.") && !a.type.startsWith("lead.stage") && a.type !== "lead.created").forEach((a) => e.push({ at: a.at, text: a.text, kind: a.type, user: a.userId }));
    ws.lists.filter((l) => l.propertyIds.includes(subject.id)).forEach((l) => e.push({ at: l.createdAt, text: `Added to list — ${l.name}`, kind: "list" }));
    return e.sort((a, b) => b.at.localeCompare(a.at));
  }, [ws, lead, subject.id]);
  return (
    <Card title="Complete timeline" subtitle={`${events.length} events`}>
      <ol className="relative border-l border-border ml-2">
        {events.map((ev, i) => (
          <li key={i} className="ml-4 pb-3">
            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-panel bg-accent" />
            <div className="text-[11px] text-muted">{dateTime(ev.at)}{ev.user ? ` · ${userName(ev.user)}` : ""}</div>
            <div className="text-[12.5px]">{ev.text}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function SourcesTab({ rec }: { rec: PropertyRecord }) {
  const rows = Object.entries(rec.provenance);
  const val = (k: string): string => {
    const r = rec as unknown as Record<string, unknown>;
    if (k === "owner") return rec.owner.names.join(" & ");
    if (k === "mailing") return `${rec.owner.mailing.line1}, ${rec.owner.mailing.city} ${rec.owner.mailing.state}`;
    if (k === "address") return rec.address.line1;
    if (k === "lastSale") return rec.lastSale ? `${usd(rec.lastSale.price)} on ${date(rec.lastSale.date)}` : "—";
    if (k === "tax") return usd(rec.tax?.annualTax);
    if (k === "ownerOccupied") return rec.owner.ownerOccupied ? "Yes" : "No";
    if (k in rec.distress) { const v = (rec.distress as unknown as Record<string, unknown>)[k]; return v == null ? "unknown" : String(v); }
    const v = r[k];
    if (v == null) return "—";
    if (typeof v === "number") return k.toLowerCase().includes("pct") ? `${v}%` : k.match(/value|equity|balance/i) ? usd(v) : num(v, 1);
    if (Array.isArray(v)) return `${v.length} points`;
    return String(v);
  };
  return (
    <Card title="Data source panel" subtitle="every field: source, recorded date and confidence" bodyClass="p-0">
      <div className="px-3 py-2 border-b border-border"><SourceLegend /></div>
      <table className="tbl text-[12.5px]">
        <thead><tr><th>Field</th><th>Value</th><th>Category</th><th>Source</th><th>Recorded / as of</th><th>Confidence</th><th>Note</th></tr></thead>
        <tbody>{rows.map(([k, p]) => (
          <tr key={k}>
            <td className="font-medium">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</td><td className="num">{val(k)}</td>
            <td><Badge dot={SOURCE_META[p.kind].color}>{SOURCE_META[p.kind].label}</Badge></td><td>{p.source}</td><td>{date(p.asOf)}</td>
            <td><Badge tone={p.confidence === "high" ? "good" : p.confidence === "medium" ? "warn" : "bad"}>{p.confidence}</Badge></td>
            <td className="text-muted whitespace-normal max-w-[320px]">{p.note}{p.synthetic && " (synthetic demo)"}</td>
          </tr>))}
          <tr><td className="font-medium">ARV</td><td colSpan={6} className="text-muted">Calculated from your selected comps — see ARV tab for formula, inputs and contributing comps.</td></tr>
          <tr><td className="font-medium">Seller answers</td><td colSpan={6} className="text-muted">User-entered / seller-stated — see Seller CRM.</td></tr>
        </tbody>
      </table>
    </Card>
  );
}

export default function Page() { return <Suspense><PropertyRecordPage /></Suspense>; }
