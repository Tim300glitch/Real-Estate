"use client";
import { Ban, CalendarPlus, ListOrdered, Mail, MessageSquare, Phone, PhoneCall, Plus, ScanSearch, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { dateTime, formatPhone, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";
import { SELLER_QUESTIONS, type CommType, type ContactPoint, type Lead, type PropertySummary } from "@/lib/types";
import { Badge, Button, Card, Dialog, Field, NumberInput, Segmented, cx } from "../ui";
import { toLocalInput } from "./forms";
import { LogCommDialog, useContactCompliance } from "./Comms";

const STATUS_TONE = { verified: "good", likely: "accent", unverified: "neutral", bad: "bad" } as const;

export function ContactRow({ cp, onAction, onUpdate }: { cp: ContactPoint; onAction: (t: CommType, cp: ContactPoint) => void; onUpdate: (patch: Partial<ContactPoint>) => void }) {
  const check = useContactCompliance();
  const callGate = check("call", cp), smsGate = check("sms", cp), emailGate = check("email", cp);
  return (
    <div className={cx("flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-1.5", (cp.optedOut || cp.status === "bad") && "opacity-60")}>
      {cp.kind === "phone" ? <Phone size={13} className="text-muted" /> : <Mail size={13} className="text-muted" />}
      <span className="text-[12.5px] font-medium num">{cp.kind === "phone" ? formatPhone(cp.value) : cp.value}</span>
      {cp.phoneType && <span className="text-[11px] text-muted">{cp.phoneType}</span>}
      <select className="input input-sm w-auto h-5 text-[11px] py-0" value={cp.status} onChange={(e) => onUpdate({ status: e.target.value as ContactPoint["status"] })}>
        <option value="verified">Verified</option><option value="likely">Likely</option><option value="unverified">Unverified</option><option value="bad">Bad number</option>
      </select>
      <Badge tone={STATUS_TONE[cp.status]}>{cp.status}</Badge>
      {cp.dnc && <Badge tone="bad" title="On a Do-Not-Call registry per scrub">DNC</Badge>}
      {cp.optedOut && <Badge tone="bad">Opted out</Badge>}
      {cp.kind === "phone" && <button className={cx("text-[10.5px] rounded px-1 border", cp.smsConsent ? "border-good text-good" : "border-border text-muted")} title="Toggle recorded SMS consent" onClick={() => onUpdate({ smsConsent: !cp.smsConsent })}>SMS consent {cp.smsConsent ? "✓" : "✗"}</button>}
      <span className="text-[10.5px] text-muted">src: {cp.source}</span>
      <div className="ml-auto flex gap-1">
        {cp.kind === "phone" && <>
          <Button size="xs" icon={<PhoneCall size={11} />} disabled={!!callGate.block} title={callGate.block ?? callGate.warn} onClick={() => onAction("call", cp)}>Call</Button>
          <Button size="xs" icon={<MessageSquare size={11} />} disabled={!!smsGate.block} title={smsGate.block ?? smsGate.warn} onClick={() => onAction("sms", cp)}>SMS</Button>
        </>}
        {cp.kind === "email" && <Button size="xs" icon={<Mail size={11} />} disabled={!!emailGate.block} title={emailGate.block} onClick={() => onAction("email", cp)}>Email</Button>}
        <Button size="xs" variant="ghost" onClick={() => onAction(cp.kind === "phone" ? "call" : "email", cp)}>Log attempt</Button>
        {!cp.optedOut && <Button size="xs" variant="ghost" icon={<Ban size={11} />} title="Record opt-out (adds to suppression list)" onClick={() => onUpdate({ optedOut: true })}>Opt-out</Button>}
      </div>
    </div>
  );
}

export function SellerCRM({ lead, property }: { lead: Lead; property: PropertySummary }) {
  const ws = useWorkspace();
  const toast = useUI((s) => s.toast);
  const seller = ws.sellers.find((s) => s.id === lead.sellerId);
  const [log, setLog] = useState<{ type: CommType; cp: ContactPoint | null } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newCp, setNewCp] = useState({ kind: "phone" as "phone" | "email", value: "", status: "unverified" as ContactPoint["status"], phoneType: "mobile" as ContactPoint["phoneType"], smsConsent: false });
  const [apptOpen, setApptOpen] = useState(false);
  const [appt, setAppt] = useState({ title: `Walkthrough — ${property.line1}`, kind: "walkthrough" as const, at: toLocalInput(new Date(Date.now() + 2 * 86400000)), duration: 45 });
  const [tracing, setTracing] = useState(false);

  if (!seller) {
    return (
      <Card title="Seller CRM">
        <div className="text-[12.5px] text-muted mb-2">No seller profile yet. Create one to track conversations, motivation and qualification answers.</div>
        <Button variant="primary" onClick={() => ws.upsertSeller({ leadId: lead.id })}>Create seller from owner of record ({property.ownerName})</Button>
      </Card>
    );
  }
  const set = (patch: Partial<typeof seller>) => ws.upsertSeller({ ...patch, id: seller.id, leadId: lead.id });

  async function skipTrace() {
    setTracing(true);
    try {
      const r = await api.skipTrace({ ownerName: property.ownerName, propertyAddress: { line1: property.line1, city: property.city, state: property.state, zip: property.zip } });
      let added = 0;
      for (const p of r.phones) { const res = ws.addContact(seller!.id, { kind: "phone", value: p.number, phoneType: p.type, status: p.confidence, source: r.provider, dnc: !!p.dnc, optedOut: false, smsConsent: false }); if (res.added) added++; }
      for (const e of r.emails) { const res = ws.addContact(seller!.id, { kind: "email", value: e.address, status: e.confidence, source: r.provider, dnc: false, optedOut: false, smsConsent: false }); if (res.added) added++; }
      ws.log("skiptrace", `Skip trace — ${added} new contact point(s) for ${property.line1}`, { leadId: lead.id });
      toast(added ? `${added} contact point(s) added (${r.synthetic ? "synthetic demo" : r.provider})` : r.phones.length + r.emails.length ? "No new contacts (duplicates skipped)" : "No contacts found — entity owners often need manual research", added ? "good" : "info");
    } catch (e) { toast(e instanceof Error ? e.message : "Skip trace failed", "bad"); }
    setTracing(false);
  }

  return (
    <div className="grid lg:grid-cols-[1.1fr_1fr] gap-3">
      <div className="space-y-3">
        <Card title="Seller profile" subtitle={`since ${dateTime(seller.createdAt)}`}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><input className="input" value={seller.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Property"><input className="input" value={`${property.line1}, ${property.city}`} readOnly /></Field>
            <Field label="Motivation (1–5)"><Segmented value={String(seller.motivation)} onChange={(v) => set({ motivation: Number(v) })} options={["1", "2", "3", "4", "5"].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Preferred communication"><select className="input" value={seller.preferredComm} onChange={(e) => set({ preferredComm: e.target.value as typeof seller.preferredComm })}><option value="any">Any</option><option value="call">Call</option><option value="sms">SMS</option><option value="email">Email</option></select></Field>
            <Field label="Timeline"><input className="input" value={seller.timeline} onChange={(e) => set({ timeline: e.target.value })} placeholder="e.g. within 60 days" /></Field>
            <Field label="Asking price"><NumberInput prefix="$" value={seller.askingPrice ?? null} onChange={(v) => { set({ askingPrice: v || undefined }); ws.updateLead(lead.id, { askingPrice: v || undefined }); }} /></Field>
            <Field label="Mortgage estimate (seller-stated)"><NumberInput prefix="$" value={seller.mortgageEstimate ?? null} onChange={(v) => set({ mortgageEstimate: v || undefined })} /></Field>
            <Field label="Occupancy"><input className="input" value={seller.occupancy} onChange={(e) => set({ occupancy: e.target.value })} /></Field>
            <Field label="Reason for selling" className="col-span-2"><input className="input" value={seller.reasonForSelling} onChange={(e) => set({ reasonForSelling: e.target.value })} /></Field>
            <Field label="Condition" className="col-span-2"><input className="input" value={seller.condition} onChange={(e) => set({ condition: e.target.value })} /></Field>
            <Field label="Decision makers" className="col-span-2"><input className="input" value={seller.decisionMakers} onChange={(e) => set({ decisionMakers: e.target.value })} /></Field>
          </div>
        </Card>
        <Card title="Discovery questions" subtitle="optional — never required">
          <div className="space-y-2.5">
            {SELLER_QUESTIONS.map((q) => (
              <Field key={q.key} label={q.q}><input className="input" value={seller.answers[q.key] ?? ""} onChange={(e) => set({ answers: { ...seller.answers, [q.key]: e.target.value } })} placeholder="—" /></Field>
            ))}
          </div>
        </Card>
      </div>
      <div className="space-y-3">
        <Card title="Contact points" subtitle={`${seller.contacts.length}`} actions={<>
          <Button size="xs" icon={<ScanSearch size={12} />} onClick={skipTrace} disabled={tracing}>{tracing ? "Tracing…" : "Skip trace"}</Button>
          <Button size="xs" icon={<Plus size={12} />} onClick={() => setAddOpen(true)}>Add</Button>
        </>}>
          <div className="space-y-1.5">
            {seller.contacts.map((cp) => <ContactRow key={cp.id} cp={cp} onAction={(type, c) => setLog({ type, cp: c })} onUpdate={(p) => ws.updateContact(seller.id, cp.id, p)} />)}
            {seller.contacts.length === 0 && <div className="text-[12px] text-muted">No phone or email yet. Run a skip trace or add one manually.</div>}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-muted"><ShieldCheck size={12} />Calls blocked for DNC numbers and SMS blocked without consent per Settings → Compliance. Skip-trace data is probabilistic — never guaranteed accurate.</div>
        </Card>
        <Card title="Follow-up" actions={<Button size="xs" icon={<CalendarPlus size={12} />} onClick={() => setApptOpen(true)}>Appointment</Button>}>
          <div className="text-[12px] text-muted mb-2">Start an automatic follow-up sequence (creates dated tasks):</div>
          <div className="flex flex-wrap gap-1.5">
            {ws.settings.sequences.map((s) => (
              <Button key={s.id} size="xs" icon={<ListOrdered size={12} />} onClick={() => { const n = ws.applySequence(lead.id, s.id); toast(`${n} follow-up tasks scheduled`); }}>{s.name} <span className="text-muted">({s.steps.map((x) => `D${x.day}`).join(" ")})</span></Button>
            ))}
          </div>
          <div className="mt-3 space-y-1">
            {ws.appointments.filter((a) => a.leadId === lead.id).map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-[12px]"><CalendarPlus size={12} className="text-muted" />{a.title}<span className="text-muted ml-auto">{dateTime(a.startsAt)}</span><Badge tone={a.status === "completed" ? "good" : a.status === "scheduled" ? "accent" : "neutral"}>{a.status}</Badge></div>
            ))}
            {ws.offers.filter((o) => o.leadId === lead.id).map((o) => (
              <div key={o.id} className="flex items-center gap-2 text-[12px]"><span className="text-muted">Offer</span><span className="num">{usd(o.amount)}</span><Badge>{o.status}</Badge><span className="text-muted ml-auto">{dateTime(o.createdAt)}</span></div>
            ))}
          </div>
        </Card>
      </div>

      <LogCommDialog open={!!log} onClose={() => setLog(null)} leadId={lead.id} contact={log?.cp} defaultType={log?.type ?? "call"} />
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add contact point" footer={<><Button onClick={() => setAddOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => {
        if (!newCp.value) return;
        const r = ws.addContact(seller.id, { kind: newCp.kind, value: newCp.value, status: newCp.status, phoneType: newCp.kind === "phone" ? newCp.phoneType : undefined, source: "User-entered", dnc: false, optedOut: false, smsConsent: newCp.smsConsent });
        if (!r.added) return toast(`Duplicate — ${r.duplicate?.label}`, "bad");
        if (r.duplicate) toast(`Added — note: ${r.duplicate.label}`, "info"); else toast("Contact added");
        setNewCp({ ...newCp, value: "" }); setAddOpen(false);
      }}>Add</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><Segmented value={newCp.kind} onChange={(k) => setNewCp({ ...newCp, kind: k })} options={[{ value: "phone", label: "Phone" }, { value: "email", label: "Email" }]} /></Field>
          <Field label="Status"><select className="input" value={newCp.status} onChange={(e) => setNewCp({ ...newCp, status: e.target.value as ContactPoint["status"] })}><option value="verified">Verified</option><option value="likely">Likely</option><option value="unverified">Unverified</option></select></Field>
          <Field label={newCp.kind === "phone" ? "Phone number" : "Email"} className="col-span-2"><input className="input" value={newCp.value} onChange={(e) => setNewCp({ ...newCp, value: e.target.value })} /></Field>
          {newCp.kind === "phone" && <label className="col-span-2 flex items-center gap-2 text-[12px]"><input type="checkbox" checked={newCp.smsConsent} onChange={(e) => setNewCp({ ...newCp, smsConsent: e.target.checked })} />Seller gave consent to receive SMS (record evidence in notes)</label>}
        </div>
      </Dialog>
      <Dialog open={apptOpen} onClose={() => setApptOpen(false)} title="Schedule appointment" footer={<><Button onClick={() => setApptOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => {
        ws.addAppointment({ leadId: lead.id, title: appt.title, kind: appt.kind, startsAt: new Date(appt.at).toISOString(), durationMin: appt.duration, location: `${property.line1}, ${property.city}`, status: "scheduled" });
        ws.logComm({ leadId: lead.id, type: "appointment", direction: "outbound", outcome: "Scheduled", body: appt.title });
        toast("Appointment scheduled"); setApptOpen(false);
      }}>Schedule</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" className="col-span-2"><input className="input" value={appt.title} onChange={(e) => setAppt({ ...appt, title: e.target.value })} /></Field>
          <Field label="When"><input type="datetime-local" className="input" value={appt.at} onChange={(e) => setAppt({ ...appt, at: e.target.value })} /></Field>
          <Field label="Duration (min)"><NumberInput value={appt.duration} onChange={(v) => setAppt({ ...appt, duration: v })} /></Field>
        </div>
      </Dialog>
    </div>
  );
}
