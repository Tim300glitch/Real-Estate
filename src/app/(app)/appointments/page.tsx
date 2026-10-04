"use client";
import { CalendarPlus, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toLocalInput } from "@/components/crm/forms";
import { Badge, Button, Card, Dialog, Field, NumberInput, PageHeader } from "@/components/ui";
import { time } from "@/lib/format";
import { useWorkspace, userName } from "@/lib/store/workspace";
import type { Appointment } from "@/lib/types";

export default function Appointments() {
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", kind: "walkthrough" as Appointment["kind"], leadId: "", at: toLocalInput(new Date(Date.now() + 86400000)), duration: 45, location: "", notes: "" });
  const sorted = [...ws.appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = sorted.filter((a) => new Date(a.startsAt) >= today);
  const past = sorted.filter((a) => new Date(a.startsAt) < today).reverse();
  const days = [...new Set(upcoming.map((a) => new Date(a.startsAt).toDateString()))];
  const leadOf = (id?: string) => ws.leads.find((l) => l.id === id);
  const Item = ({ a }: { a: Appointment }) => {
    const l = leadOf(a.leadId);
    return (
      <div className="flex items-start gap-3 px-3 py-2.5 border-b border-border last:border-0">
        <div className="w-16 text-[12px] num font-semibold">{time(a.startsAt)}<div className="text-[10.5px] text-muted font-normal">{a.durationMin} min</div></div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-medium">{a.title}</div>
          <div className="text-[11.5px] text-muted flex items-center gap-1"><MapPin size={11} />{a.location || "—"}{l && <> · <Link className="hover:text-accent" href={`/properties/${l.propertyId}`}>open lead</Link></>} · {userName(a.assignee)}</div>
        </div>
        <Badge tone={a.kind === "closing" ? "good" : a.kind === "walkthrough" ? "accent" : "neutral"}>{a.kind.replace("_", " ")}</Badge>
        <select className="input input-sm w-[120px]" value={a.status} onChange={(e) => ws.updateAppointment(a.id, { status: e.target.value as Appointment["status"] })}>
          <option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No-show</option>
        </select>
        {a.kind === "walkthrough" && l && <Button size="xs" href={`/walkthrough/${l.propertyId}`}>Walkthrough</Button>}
      </div>
    );
  };
  return (
    <div>
      <PageHeader title="Appointments" subtitle={`${upcoming.length} upcoming`} actions={<Button variant="primary" icon={<CalendarPlus size={13} />} onClick={() => setOpen(true)}>New appointment</Button>} />
      <div className="px-5 pb-6 grid lg:grid-cols-[1.4fr_1fr] gap-3">
        <div className="space-y-3">
          {days.map((d) => (
            <Card key={d} title={new Date(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} bodyClass="p-0">
              {upcoming.filter((a) => new Date(a.startsAt).toDateString() === d).map((a) => <Item key={a.id} a={a} />)}
            </Card>
          ))}
          {days.length === 0 && <Card><div className="text-[12.5px] text-muted">No upcoming appointments.</div></Card>}
        </div>
        <Card title="Past" bodyClass="p-0">{past.map((a) => <Item key={a.id} a={a} />)}</Card>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="New appointment" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => {
        if (!f.title) return;
        const l = leadOf(f.leadId);
        ws.addAppointment({ title: f.title, kind: f.kind, leadId: f.leadId || undefined, startsAt: new Date(f.at).toISOString(), durationMin: f.duration, location: f.location || (l ? `${l.property.line1}, ${l.property.city}` : ""), notes: f.notes, status: "scheduled" });
        setOpen(false);
      }}>Schedule</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" className="col-span-2"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Type"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Appointment["kind"] })}><option value="walkthrough">Walkthrough</option><option value="seller_call">Seller call</option><option value="buyer_showing">Buyer showing</option><option value="closing">Closing</option><option value="other">Other</option></select></Field>
          <Field label="Lead"><select className="input" value={f.leadId} onChange={(e) => setF({ ...f, leadId: e.target.value })}><option value="">—</option>{ws.leads.filter((l) => !l.deletedAt).map((l) => <option key={l.id} value={l.id}>{l.property.line1}</option>)}</select></Field>
          <Field label="When"><input type="datetime-local" className="input" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></Field>
          <Field label="Duration (min)"><NumberInput value={f.duration} onChange={(v) => setF({ ...f, duration: v })} /></Field>
          <Field label="Location" className="col-span-2"><input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Defaults to the property address" /></Field>
        </div>
      </Dialog>
    </div>
  );
}
