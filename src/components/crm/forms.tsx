"use client";
import { useState } from "react";
import { useWorkspace } from "@/lib/store/workspace";
import { useUI } from "@/lib/store/ui";
import { PROPERTY_TYPE_LABEL, TASK_TYPE_LABEL, type Buyer, type BuyerStrategy, type PropertyType, type RehabTolerance, type TaskType, type PropertyFilters } from "@/lib/types";
import { Button, Field, NumberInput, Segmented, cx } from "../ui";

export function TaskForm({ leadId, onDone, defaultTitle = "" }: { leadId?: string; onDone: () => void; defaultTitle?: string }) {
  const addTask = useWorkspace((s) => s.addTask);
  const leads = useWorkspace((s) => s.leads);
  const toast = useUI((s) => s.toast);
  const [title, setTitle] = useState(defaultTitle);
  const [type, setType] = useState<TaskType>("follow_up");
  const [lead, setLead] = useState(leadId ?? "");
  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setHours(10, 0, 0, 0);
  const [due, setDue] = useState(toLocalInput(tomorrow));
  const [priority, setPriority] = useState<"1" | "2" | "3">("2");
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      if (!title.trim()) return;
      addTask({ title: title.trim(), type, leadId: lead || undefined, dueAt: new Date(due).toISOString(), priority: Number(priority) as 1 | 2 | 3 });
      toast("Task created");
      onDone();
    }}>
      <Field label="Task"><input autoFocus className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call seller about walkthrough" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select className="input" value={type} onChange={(e) => { setType(e.target.value as TaskType); if (!title) setTitle(TASK_TYPE_LABEL[e.target.value as TaskType]); }}>
            {Object.entries(TASK_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Due"><input type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Related lead">
          <select className="input" value={lead} onChange={(e) => setLead(e.target.value)}>
            <option value="">— none —</option>
            {leads.filter((l) => !l.deletedAt && l.stage !== "dead").map((l) => <option key={l.id} value={l.id}>{l.property.line1}</option>)}
          </select>
        </Field>
        <Field label="Priority"><Segmented value={priority} onChange={setPriority} options={[{ value: "1", label: "High" }, { value: "2", label: "Normal" }, { value: "3", label: "Low" }]} /></Field>
      </div>
      <div className="flex justify-end gap-2 pt-1"><Button onClick={onDone}>Cancel</Button><Button type="submit" variant="primary">Create task</Button></div>
    </form>
  );
}

export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STRATS: { id: BuyerStrategy; label: string }[] = [
  { id: "flip", label: "Fix & flip" }, { id: "hold", label: "Buy & hold" }, { id: "brrrr", label: "BRRRR" }, { id: "land", label: "Land" }, { id: "multifamily", label: "Multifamily" },
];

export function BuyerForm({ buyer, onDone }: { buyer?: Buyer; onDone: (b?: Buyer) => void }) {
  const { addBuyer, updateBuyer } = useWorkspace();
  const toast = useUI((s) => s.toast);
  const [b, setB] = useState<Omit<Buyer, "id" | "createdAt">>(buyer ?? {
    name: "", company: "", contacts: [], markets: ["Sacramento"], zips: [], propertyTypes: ["sfr"], minPrice: 150000, maxPrice: 450000, minBeds: 2,
    rehabTolerance: "moderate", strategies: ["flip"], desiredMarginPct: 15, dealsPurchased: 0, avgPurchasePrice: 0, reliability: 3,
    lastActivityAt: new Date().toISOString(), tags: [],
  });
  const [phone, setPhone] = useState(buyer?.contacts.find((c) => c.kind === "phone")?.value ?? "");
  const [email, setEmail] = useState(buyer?.contacts.find((c) => c.kind === "email")?.value ?? "");
  const [dup, setDup] = useState<string | null>(null);
  const set = (p: Partial<typeof b>) => setB((x) => ({ ...x, ...p }));

  function save(force = false) {
    if (!b.name.trim()) return;
    const contacts = [
      ...(phone ? [{ id: "p", kind: "phone" as const, value: phone, phoneType: "mobile" as const, status: "verified" as const, source: "User-entered", dnc: false, optedOut: false, smsConsent: false, addedAt: new Date().toISOString() }] : []),
      ...(email ? [{ id: "e", kind: "email" as const, value: email, status: "verified" as const, source: "User-entered", dnc: false, optedOut: false, smsConsent: false, addedAt: new Date().toISOString() }] : []),
    ];
    if (buyer) {
      const merged = buyer.contacts.filter((c) => !(c.kind === "phone" && phone) && !(c.kind === "email" && email));
      updateBuyer(buyer.id, { ...b, contacts: [...merged, ...contacts.map((c) => ({ ...c, id: `${c.id}${Date.now()}` }))] });
      toast("Buyer updated");
      return onDone();
    }
    const res = addBuyer({ ...b, contacts: contacts.map((c) => ({ ...c, id: `${c.id}${Date.now()}` })) }, force);
    if (res.duplicate) return setDup(res.duplicate.label);
    toast(`Buyer added — ${b.name}`);
    onDone(res.buyer);
  }

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input autoFocus className="input" value={b.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Company"><input className="input" value={b.company ?? ""} onChange={(e) => set({ company: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="916-555-0100" /></Field>
        <Field label="Email"><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Markets (comma separated)"><input className="input" value={b.markets.join(", ")} onChange={(e) => set({ markets: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></Field>
        <Field label="ZIP codes"><input className="input" value={b.zips.join(", ")} onChange={(e) => set({ zips: e.target.value.split(/[ ,]+/).map((s) => s.trim()).filter((z) => /^\d{5}$/.test(z)) })} placeholder="95820, 95824" /></Field>
        <Field label="Min price"><NumberInput prefix="$" value={b.minPrice} onChange={(v) => set({ minPrice: v })} /></Field>
        <Field label="Max price"><NumberInput prefix="$" value={b.maxPrice} onChange={(v) => set({ maxPrice: v })} /></Field>
        <Field label="Min bedrooms"><NumberInput value={b.minBeds} onChange={(v) => set({ minBeds: v })} /></Field>
        <Field label="Desired margin"><NumberInput suffix="%" value={b.desiredMarginPct} onChange={(v) => set({ desiredMarginPct: v })} /></Field>
        <Field label="Rehab tolerance">
          <select className="input" value={b.rehabTolerance} onChange={(e) => set({ rehabTolerance: e.target.value as RehabTolerance })}>
            <option value="cosmetic">Cosmetic only</option><option value="moderate">Moderate</option><option value="heavy">Heavy</option><option value="full_gut">Full gut</option>
          </select>
        </Field>
        <Field label="Reliability (1–5)"><Segmented value={String(b.reliability)} onChange={(v) => set({ reliability: Number(v) })} options={["1", "2", "3", "4", "5"].map((x) => ({ value: x, label: x }))} /></Field>
        <Field label="Proof of funds amount"><NumberInput prefix="$" value={b.pofAmount ?? 0} onChange={(v) => set({ pofAmount: v || undefined })} /></Field>
        <Field label="POF verified">
          <select className="input" value={b.pofVerifiedAt ? "yes" : "no"} onChange={(e) => set({ pofVerifiedAt: e.target.value === "yes" ? new Date().toISOString() : undefined })}>
            <option value="no">Not verified</option><option value="yes">Verified today</option>
          </select>
        </Field>
      </div>
      <Field label="Property types">
        <div className="flex flex-wrap gap-1">
          {(Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[]).map((t) => (
            <button key={t} type="button" onClick={() => set({ propertyTypes: toggle(b.propertyTypes, t) })}
              className={cx("h-6 px-2 rounded border text-[11.5px]", b.propertyTypes.includes(t) ? "bg-accent-soft border-transparent text-accent-text" : "border-border text-muted")}>{PROPERTY_TYPE_LABEL[t]}</button>
          ))}
        </div>
      </Field>
      <Field label="Strategies">
        <div className="flex flex-wrap gap-1">
          {STRATS.map((s) => (
            <button key={s.id} type="button" onClick={() => set({ strategies: toggle(b.strategies, s.id) })}
              className={cx("h-6 px-2 rounded border text-[11.5px]", b.strategies.includes(s.id) ? "bg-accent-soft border-transparent text-accent-text" : "border-border text-muted")}>{s.label}</button>
          ))}
        </div>
      </Field>
      {dup && (
        <div className="rounded-md border border-warn/40 bg-warn-soft p-2.5 text-[12.5px]">
          <div className="font-medium text-warn">Possible duplicate: {dup}</div>
          <div className="mt-2 flex gap-2"><Button size="xs" onClick={() => onDone()}>Cancel (keep existing)</Button><Button size="xs" variant="primary" onClick={() => save(true)}>Keep separate</Button></div>
        </div>
      )}
      <div className="flex justify-end gap-2"><Button onClick={() => onDone()}>Cancel</Button><Button variant="primary" onClick={() => save(false)}>{buyer ? "Save buyer" : "Add buyer"}</Button></div>
    </div>
  );
}

export function ListForm({ onDone, initialRules }: { onDone: () => void; initialRules?: PropertyFilters }) {
  const createList = useWorkspace((s) => s.createList);
  const toast = useUI((s) => s.toast);
  const [name, setName] = useState("");
  const [dynamic, setDynamic] = useState(!!initialRules);
  const COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ef4444", "#eab308", "#06b6d4"];
  const [color, setColor] = useState(COLORS[0]);
  return (
    <div className="space-y-3">
      <Field label="List name"><input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tired Landlords — North Highlands" /></Field>
      <Field label="Type" hint={dynamic ? "Dynamic lists re-run their rules against the property provider whenever opened." : "Static lists hold the properties you add."}>
        <Segmented value={dynamic ? "d" : "s"} onChange={(v) => setDynamic(v === "d")} options={[{ value: "s", label: "Static" }, { value: "d", label: "Dynamic (rules)" }]} />
      </Field>
      <Field label="Color">
        <div className="flex gap-1.5">{COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={cx("h-5 w-5 rounded-full border-2", color === c ? "border-fg" : "border-transparent")} style={{ background: c }} />)}</div>
      </Field>
      <div className="flex justify-end gap-2"><Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" onClick={() => {
          if (!name.trim()) return;
          createList({ name: name.trim(), dynamic, rules: dynamic ? initialRules ?? { absentee: "yes", minEquityPct: 60, minYearsOwned: 10 } : undefined, color });
          toast(`List created — ${name}`);
          onDone();
        }}>Create list</Button>
      </div>
    </div>
  );
}
