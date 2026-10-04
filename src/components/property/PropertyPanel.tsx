"use client";
import { AlertTriangle, BookmarkPlus, Calculator, CheckSquare, ExternalLink, FileSignature, Gavel, ListPlus, MessageSquarePlus, ScanSearch, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProperty } from "@/lib/client/api";
import { useDealNumbers, usePropertyWorkspace } from "@/lib/client/useDeal";
import { date, num, pct100, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { SYSTEM_TAGS, useWorkspace } from "@/lib/store/workspace";
import { PIN_STATUS, PROPERTY_TYPE_LABEL, type PropertyRecord, type PropertySummary } from "@/lib/types";
import { Badge, Button, Dialog, KV, Menu, MenuItem, ScoreBadge, SlideOver, cx } from "../ui";
import { Sourced } from "../ui/Provenance";
import { StreetView } from "../map/StreetView";
import { TaskForm } from "../crm/forms";

export function toSummaryClient(r: PropertyRecord): PropertySummary {
  return {
    id: r.id, apn: r.apn, line1: r.address.line1, city: r.address.city, state: r.address.state, zip: r.address.zip, county: r.address.county ?? "",
    neighborhood: r.neighborhood, lat: r.lat, lng: r.lng, propertyType: r.propertyType, beds: r.beds, baths: r.baths, sqft: r.sqft, lotSqft: r.lotSqft,
    yearBuilt: r.yearBuilt, estValue: r.estValue, equityPct: r.equityPct, estEquity: r.estEquity, yearsOwned: r.yearsOwned, ownerName: r.owner.names.join(" & "),
    ownerEntity: r.owner.entityType, absentee: r.owner.absentee, outOfState: r.owner.outOfState, ownerOccupied: r.owner.ownerOccupied, freeAndClear: r.freeAndClear,
    lastSalePrice: r.sales.find((s) => s.price != null)?.price ?? null, lastSaleDate: r.lastSale?.date ?? null, lastSaleCash: r.lastSale?.cash ?? null,
    distress: r.distress, motivationScore: r.motivationScore, synthetic: Object.values(r.provenance).some((p) => p.synthetic),
  };
}

export function distressList(r: Pick<PropertySummary, "distress" | "absentee" | "outOfState" | "freeAndClear">): { label: string; tone: "bad" | "warn" | "info" | "violet" }[] {
  const d = r.distress;
  const out: { label: string; tone: "bad" | "warn" | "info" | "violet" }[] = [];
  if (d.preForeclosure) out.push({ label: d.auctionDate ? `Pre-foreclosure · auction ${date(d.auctionDate)}` : "Pre-foreclosure", tone: "bad" });
  if (d.foreclosure) out.push({ label: "Foreclosure", tone: "bad" });
  if (d.taxDelinquent) out.push({ label: "Tax delinquent", tone: "bad" });
  if (d.probate) out.push({ label: "Probate", tone: "violet" });
  if (d.inherited && !d.probate) out.push({ label: "Inherited", tone: "violet" });
  if (d.vacant) out.push({ label: "Vacant", tone: "warn" });
  if ((d.codeViolations ?? 0) > 0) out.push({ label: `${d.codeViolations} code violation${d.codeViolations! > 1 ? "s" : ""}`, tone: "warn" });
  if ((d.liens ?? 0) > 0) out.push({ label: `${d.liens} lien${d.liens! > 1 ? "s" : ""}`, tone: "warn" });
  if (d.tiredLandlord) out.push({ label: "Tired landlord", tone: "info" });
  if (d.expiredListing) out.push({ label: "Expired listing", tone: "info" });
  if (r.outOfState) out.push({ label: "Out-of-state owner", tone: "info" });
  else if (r.absentee) out.push({ label: "Absentee owner", tone: "info" });
  if (r.freeAndClear) out.push({ label: "Free & clear", tone: "info" });
  return out;
}

/** Quick card shown beside the map — everything needed to decide "is this worth pursuing?" */
export function PropertyQuickCard({ id, onClose, compact }: { id: string; onClose?: () => void; compact?: boolean }) {
  const { data: rec, loading, error } = useProperty(id);
  const router = useRouter();
  const ws = useWorkspace();
  const { toast } = useUI();
  const { lead } = usePropertyWorkspace(id);
  const summary = rec ? toSummaryClient(rec) : null;
  const n = useDealNumbers(id, summary);
  const [noteOpen, setNoteOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [note, setNote] = useState("");
  const [dupOpen, setDupOpen] = useState(false);

  if (loading && !rec) return <div className="p-4 text-[12.5px] text-muted">Loading property…</div>;
  if (error) return <div className="p-4 text-[12.5px] text-bad">{error}</div>;
  if (!rec || !summary) return null;
  const pv = rec.provenance;

  const ensureLead = (silent = false) => {
    if (lead) return lead;
    const l = ws.saveLead(summary, { source: "map" });
    if (!silent) toast(`Saved as lead — ${summary.line1}`, "good", { label: "Open", href: `/properties/${id}` });
    return l;
  };
  const go = (href: string) => { onClose?.(); router.push(href); };
  const tags = distressList(summary);
  const mortgage = rec.mortgages[0];

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <Sourced prov={pv.address} className="text-[15px] font-semibold tracking-tight">{rec.address.line1}</Sourced>
            <div className="text-[12px] text-muted">{rec.address.city}, {rec.address.state} {rec.address.zip} · {rec.neighborhood} · APN {rec.apn}</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {lead ? <Badge dot={PIN_STATUS[lead.status].color}>{PIN_STATUS[lead.status].label} · {lead.stage.replace(/_/g, " ")}</Badge> : <Badge dot={PIN_STATUS.not_reviewed.color}>Not reviewed</Badge>}
              {summary.synthetic && <Badge tone="warn" title="All values on this record come from the synthetic demo provider">Demo data</Badge>}
            </div>
          </div>
          {n.motivation && <div title="Motivation score — see factors on the full record"><ScoreBadge score={n.motivation.score} size="lg" label="motivation" /></div>}
        </div>
      </div>

      {!compact && <div className="px-4"><StreetView lat={rec.lat} lng={rec.lng} height={150} /></div>}

      <div className="grid grid-cols-4 gap-px bg-border mx-4 mt-3 rounded-md overflow-hidden border border-border">
        {[
          ["Beds", <Sourced key="b" prov={pv.beds}>{rec.beds ?? "—"}</Sourced>],
          ["Baths", <Sourced key="ba" prov={pv.baths}>{rec.baths ?? "—"}</Sourced>],
          ["Sq ft", <Sourced key="s" prov={pv.sqft}>{num(rec.sqft)}</Sourced>],
          ["Built", <Sourced key="y" prov={pv.yearBuilt}>{rec.yearBuilt ?? "—"}</Sourced>],
        ].map(([k, v]) => (
          <div key={String(k)} className="bg-panel px-2 py-1.5">
            <div className="text-[10.5px] text-muted uppercase">{k}</div>
            <div className="text-[13px] font-semibold num">{v}</div>
          </div>
        ))}
      </div>

      <div className="px-4 py-2 grid grid-cols-2 gap-x-5">
        <div>
          <KV k="Type" v={<Sourced prov={pv.propertyType}>{PROPERTY_TYPE_LABEL[rec.propertyType]}{rec.units > 1 ? ` · ${rec.units} units` : ""}</Sourced>} />
          <KV k="Lot size" v={<Sourced prov={pv.lotSqft}>{num(rec.lotSqft)} sf</Sourced>} />
          <KV k="Est. value" v={<Sourced prov={pv.estValue}>{usd(rec.estValue)}</Sourced>} />
          <KV k="Est. ARV" v={n.arv ? <span title={n.arvKind === "user" ? "User override" : "Calculated from selected comps"}>{usd(n.arv)} <span className="text-muted text-[10.5px]">{n.arvKind === "user" ? "override" : "calc"}</span></span> : <span className="text-muted">run comps</span>} />
          <KV k="Last sale" v={<Sourced prov={pv.lastSale}>{rec.lastSale ? `${usd(rec.lastSale.price)} · ${date(rec.lastSale.date)}` : "—"}</Sourced>} />
        </div>
        <div>
          <KV k="Est. equity" v={<Sourced prov={pv.estEquity}>{usd(rec.estEquity)} ({pct100(rec.equityPct)})</Sourced>} />
          <KV k="Mortgage" v={<Sourced prov={pv.estMortgageBalance}>{rec.freeAndClear ? "None recorded" : mortgage ? `~${usd(mortgage.estBalance, { compact: true })} est.` : "Unknown"}</Sourced>} />
          <KV k="Annual tax" v={<Sourced prov={pv.tax}>{usd(rec.tax?.annualTax)}</Sourced>} />
          <KV k="Owned" v={<Sourced prov={pv.yearsOwned}>{rec.yearsOwned != null ? `${rec.yearsOwned.toFixed(1)} yrs` : "—"}</Sourced>} />
          <KV k="Occupancy" v={<Sourced prov={pv.ownerOccupied}>{rec.owner.ownerOccupied ? "Owner occupied" : rec.owner.outOfState ? "Absentee (out of state)" : "Absentee"}</Sourced>} />
        </div>
      </div>

      <div className="mx-4 rounded-md border border-border bg-panel-2 px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wide text-muted">Owner</div>
          {(rec.owner.portfolioCount ?? 1) > 1 && <button className="text-[11.5px] text-accent" onClick={() => go(`/properties/${id}?tab=owner`)}>{rec.owner.portfolioCount} properties →</button>}
        </div>
        <Sourced prov={pv.owner} className="text-[13px] font-medium">{rec.owner.names.join(" & ")}</Sourced>
        <div className="text-[11.5px] text-muted capitalize">{rec.owner.entityType} · mailing: {rec.owner.mailing.line1}, {rec.owner.mailing.city} {rec.owner.mailing.state} {rec.owner.mailing.zip}</div>
      </div>

      {tags.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-1">
          {tags.map((t) => <Badge key={t.label} tone={t.tone}>{t.label}</Badge>)}
        </div>
      )}
      {n.deal && (
        <div className="mx-4 mt-2 grid grid-cols-3 gap-px rounded-md overflow-hidden border border-border bg-border">
          {[["Max offer", usd(n.deal.offers[2].price)], ["Target", usd(n.deal.offers[1].price)], ["Fee @ target", usd(n.deal.offers[1].fee)]].map(([k, v]) => (
            <div key={k} className="bg-panel px-2 py-1.5"><div className="text-[10.5px] text-muted uppercase">{k}</div><div className="text-[13px] font-semibold num">{v}</div></div>
          ))}
        </div>
      )}

      <div className="px-4 py-3 grid grid-cols-2 gap-1.5">
        <Button variant={lead ? "secondary" : "primary"} icon={<BookmarkPlus size={14} />} onClick={() => {
          if (lead) return toast("Already a lead", "info", { label: "Open", href: `/properties/${id}` });
          const d = ws.findDuplicateLead(summary);
          if (d) return setDupOpen(true);
          ensureLead();
        }}>{lead ? "Saved as lead" : "Save lead"}</Button>
        <Button icon={<ScanSearch size={14} />} onClick={() => go(`/comps?id=${id}`)}>Run comps</Button>
        <Button icon={<Calculator size={14} />} onClick={() => go(`/deal-desk/${id}?tab=arv`)}>Calculate ARV</Button>
        <Button icon={<Calculator size={14} />} onClick={() => { ensureLead(true); go(`/deal-desk/${id}`); }}>Analyze deal</Button>
        <Button icon={<MessageSquarePlus size={14} />} onClick={() => setNoteOpen(true)}>Add note</Button>
        <Button icon={<CheckSquare size={14} />} onClick={() => { ensureLead(true); setTaskOpen(true); }}>Add task</Button>
        <Button icon={<Gavel size={14} />} onClick={() => { ensureLead(true); go(`/deal-desk/${id}?tab=offer`); }}>Make offer</Button>
        <Button variant="subtle" icon={<ExternalLink size={14} />} onClick={() => go(`/properties/${id}`)}>View full property</Button>
      </div>
      <div className="px-4 pb-3 flex items-center gap-1.5">
        <AddToListMenu summary={summary} />
        {lead && <TagMenu leadId={lead.id} />}
        {lead && <Button size="xs" variant="ghost" icon={<FileSignature size={12} />} onClick={() => go(`/properties/${id}?tab=seller`)}>Seller CRM</Button>}
      </div>

      <Dialog open={noteOpen} onClose={() => setNoteOpen(false)} title={`Note — ${rec.address.line1}`}
        footer={<><Button onClick={() => setNoteOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => {
          if (!note.trim()) return;
          const l = ensureLead(true);
          ws.addNote({ entityType: "lead", entityId: l.id, body: note.trim(), pinned: false, tags: [], viaVoice: false, photoIds: [] });
          setNote(""); setNoteOpen(false); toast("Note added");
        }}>Save note</Button></>}>
        <textarea autoFocus rows={5} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you notice? (saving a note also saves the lead)" />
      </Dialog>
      <Dialog open={taskOpen} onClose={() => setTaskOpen(false)} title="New task">
        <TaskForm leadId={lead?.id ?? ws.leads.find((l) => l.propertyId === id)?.id} onDone={() => setTaskOpen(false)} defaultTitle={`Call owner — ${rec.address.line1}`} />
      </Dialog>
      <Dialog open={dupOpen} onClose={() => setDupOpen(false)} title="Possible duplicate lead">
        <div className="flex gap-2 text-[12.5px]"><AlertTriangle size={16} className="text-warn shrink-0" />A lead already exists at this address: {ws.findDuplicateLead(summary)?.label}</div>
        <div className="mt-3 flex gap-2 justify-end">
          <Button onClick={() => { setDupOpen(false); go(`/properties/${id}`); }}>Link to existing</Button>
          <Button variant="primary" onClick={() => { ws.saveLead(summary, { source: "map", force: true }); setDupOpen(false); toast("Saved as separate lead"); }}>Keep separate</Button>
        </div>
      </Dialog>
    </div>
  );
}

export function AddToListMenu({ summary, size = "xs" }: { summary: PropertySummary | PropertySummary[]; size?: "xs" | "sm" }) {
  const allLists = useWorkspace((s) => s.lists);
  const lists = allLists.filter((l) => !l.dynamic);
  const addToList = useWorkspace((s) => s.addToList);
  const toast = useUI((s) => s.toast);
  const openQuick = useUI((s) => s.openQuick);
  const items = Array.isArray(summary) ? summary : [summary];
  return (
    <Menu align="left" trigger={(t) => <Button size={size} variant="ghost" icon={<ListPlus size={12} />} onClick={t}>Add to list</Button>}>
      {(close) => (
        <>
          {lists.map((l) => (
            <MenuItem key={l.id} icon={<span className="h-2 w-2 rounded-full inline-block" style={{ background: l.color }} />} onClick={() => { const n = addToList(l.id, items); toast(n ? `Added ${n} to ${l.name}` : `Already in ${l.name}`, n ? "good" : "info"); close(); }}>{l.name}</MenuItem>
          ))}
          <MenuItem icon={<ListPlus size={13} />} onClick={() => { close(); openQuick("list"); }}>New list…</MenuItem>
        </>
      )}
    </Menu>
  );
}

export function TagMenu({ leadId }: { leadId: string }) {
  const lead = useWorkspace((s) => s.leads.find((l) => l.id === leadId));
  const toggleTag = useWorkspace((s) => s.toggleTag);
  const custom = useWorkspace((s) => s.settings.customTags);
  if (!lead) return null;
  return (
    <Menu align="left" trigger={(t) => <Button size="xs" variant="ghost" icon={<Tag size={12} />} onClick={t}>Tags{lead.tags.length ? ` (${lead.tags.length})` : ""}</Button>}>
      {() => (
        <div className="max-h-72 overflow-y-auto">
          {[...SYSTEM_TAGS, ...custom].map((tag) => (
            <MenuItem key={tag} onClick={() => toggleTag(leadId, tag)}>
              <span className={cx("h-3 w-3 rounded border inline-flex items-center justify-center text-[9px]", lead.tags.includes(tag) ? "bg-accent border-accent text-white" : "border-border-strong")}>{lead.tags.includes(tag) ? "✓" : ""}</span>
              {tag}
            </MenuItem>
          ))}
        </div>
      )}
    </Menu>
  );
}

/** Global slide-over used outside the map (palette, tables, lists). */
export function PropertySlideOver() {
  const { panelPropertyId, openPanel } = useUI();
  return (
    <SlideOver open={!!panelPropertyId} onClose={() => openPanel(null)} title="Property" width={460}>
      {panelPropertyId && <PropertyQuickCard id={panelPropertyId} onClose={() => openPanel(null)} />}
    </SlideOver>
  );
}
