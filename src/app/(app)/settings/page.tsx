"use client";
import { Check, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Badge, Button, Card, Field, NumberInput, PageHeader, Tabs, Toggle } from "@/components/ui";
import { SourceLegend } from "@/components/ui/Provenance";
import { DEFAULT_CRITERIA, DEFAULT_WEIGHTS } from "@/lib/calc/comps";
import { DEFAULT_PRESETS } from "@/lib/calc/deal";
import { MARKET_COST_MULTIPLIERS, REPAIR_CATALOG } from "@/lib/calc/repairs";
import { DEFAULT_DEAL_WEIGHTS, DEFAULT_MOTIVATION_WEIGHTS } from "@/lib/calc/scores";
import { api } from "@/lib/client/api";
import { dateTime, uid } from "@/lib/format";
import { ROLE_LABEL, ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";
import { useUI } from "@/lib/store/ui";
import { DEFAULT_SETTINGS, SYSTEM_TAGS, TEAM, useWorkspace, userName } from "@/lib/store/workspace";
import { TASK_TYPE_LABEL, type MarketPreset, type Role, type TaskType } from "@/lib/types";

const TABS = ["team", "presets", "scoring", "repairs", "sequences", "tags", "compliance", "templates", "data", "audit", "demo"] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { team: "Team & roles", presets: "Market presets", scoring: "Scoring & comps", repairs: "Repair pricing", sequences: "Follow-up sequences", tags: "Tags", compliance: "Compliance", templates: "Offer templates", data: "Data sources", audit: "Audit log", demo: "Demo data" };

function Settings() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "team");
  return (
    <div>
      <PageHeader title="Settings" subtitle="Everything that drives a calculation is editable here — nothing is hard-coded." />
      <div className="px-5"><Tabs tabs={TABS.map((t) => ({ id: t, label: LABEL[t] }))} value={tab} onChange={setTab} /></div>
      <div className="p-5 pt-4 max-w-[1200px]">
        {tab === "team" && <TeamTab />}{tab === "presets" && <PresetsTab />}{tab === "scoring" && <ScoringTab />}{tab === "repairs" && <RepairsTab />}
        {tab === "sequences" && <SequencesTab />}{tab === "tags" && <TagsTab />}{tab === "compliance" && <ComplianceTab />}{tab === "templates" && <TemplatesTab />}
        {tab === "data" && <DataTab />}{tab === "audit" && <AuditTab />}{tab === "demo" && <DemoTab />}
      </div>
    </div>
  );
}

function TeamTab() {
  const user = useUI((s) => s.user);
  const all: Permission[] = ROLE_PERMISSIONS.owner;
  return (
    <div className="space-y-3">
      <Card title="Team" subtitle={`signed in as ${user?.email}`} bodyClass="p-0">
        <table className="tbl text-[12.5px]"><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>{TEAM.map((u) => <tr key={u.id}><td className="font-medium">{u.name}</td><td>{u.email}</td><td><Badge tone={u.role === "owner" ? "accent" : "neutral"}>{ROLE_LABEL[u.role]}</Badge></td></tr>)}</tbody></table>
        <div className="px-3 py-2 text-[11px] text-muted border-t border-border">Demo accounts. With a database configured, users live in the <code>users</code> table (or Supabase Auth) and roles are enforced by API middleware + row-level security.</div>
      </Card>
      <Card title="Role permissions" subtitle="enforced server-side on every API route" bodyClass="p-0">
        <div className="overflow-auto"><table className="tbl text-[12px]"><thead><tr><th>Permission</th>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <th key={r} className="text-center">{ROLE_LABEL[r]}</th>)}</tr></thead>
          <tbody>{all.map((p) => <tr key={p}><td className="font-mono text-[11.5px]">{p}</td>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <td key={r} className="text-center">{ROLE_PERMISSIONS[r].includes(p) ? <Check size={13} className="inline text-good" /> : <X size={12} className="inline text-muted" />}</td>)}</tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}

function PresetsTab() {
  const { settings, updateSettings } = useWorkspace();
  const set = (id: string, patch: Partial<MarketPreset>) => updateSettings({ presets: settings.presets.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const pctCell = (p: MarketPreset, k: keyof MarketPreset) => <NumberInput size="sm" suffix="%" decimals={2} value={+((p[k] as number) * 100).toFixed(2)} onChange={(v) => set(p.id, { [k]: v / 100 } as Partial<MarketPreset>)} />;
  return (
    <Card title="Market presets" subtitle="drive MAO formulas, cost assumptions and offer cushions per market" actions={<>
      <Button size="xs" icon={<Plus size={12} />} onClick={() => updateSettings({ presets: [...settings.presets, { ...DEFAULT_PRESETS[0], id: uid("pr_"), name: "New market" }] })}>Add market</Button>
      <Button size="xs" variant="ghost" icon={<RotateCcw size={12} />} onClick={() => updateSettings({ presets: DEFAULT_PRESETS })}>Reset</Button>
    </>} bodyClass="p-0">
      <div className="overflow-auto"><table className="tbl text-[12px]">
        <thead><tr><th>Market</th><th>Default</th><th>Investor %</th><th>Fee</th><th>Buyer profit</th><th>Close buy</th><th>Close sell</th><th>Agent</th><th>Hold mo</th><th>Hold $/mo</th><th>Financing</th><th>Repair ×</th><th>Target cushion</th><th>Low cushion</th><th></th></tr></thead>
        <tbody>{settings.presets.map((p) => (
          <tr key={p.id}>
            <td><input className="input input-sm w-[160px]" value={p.name} onChange={(e) => set(p.id, { name: e.target.value })} /></td>
            <td><input type="radio" checked={settings.defaultPresetId === p.id} onChange={() => updateSettings({ defaultPresetId: p.id })} /></td>
            <td className="w-[90px]">{pctCell(p, "investorPct")}</td>
            <td className="w-[100px]"><NumberInput size="sm" prefix="$" value={p.wholesaleFee} onChange={(v) => set(p.id, { wholesaleFee: v })} /></td>
            <td className="w-[86px]">{pctCell(p, "buyerProfitPct")}</td><td className="w-[86px]">{pctCell(p, "closingCostsBuyPct")}</td><td className="w-[86px]">{pctCell(p, "closingCostsSellPct")}</td><td className="w-[86px]">{pctCell(p, "agentPct")}</td>
            <td className="w-[64px]"><NumberInput size="sm" value={p.holdingMonths} onChange={(v) => set(p.id, { holdingMonths: v })} /></td>
            <td className="w-[90px]"><NumberInput size="sm" prefix="$" value={p.holdingCostMonthly} onChange={(v) => set(p.id, { holdingCostMonthly: v })} /></td>
            <td className="w-[86px]">{pctCell(p, "financingPct")}</td>
            <td className="w-[70px]"><NumberInput size="sm" decimals={2} value={p.repairCostMultiplier} onChange={(v) => set(p.id, { repairCostMultiplier: v })} /></td>
            <td className="w-[86px]">{pctCell(p, "offerTargetPct")}</td><td className="w-[86px]">{pctCell(p, "offerLowPct")}</td>
            <td>{settings.presets.length > 1 && <button className="text-muted hover:text-bad" onClick={() => updateSettings({ presets: settings.presets.filter((x) => x.id !== p.id) })}><Trash2 size={13} /></button>}</td>
          </tr>))}</tbody>
      </table></div>
      <div className="px-3 py-2 text-[11px] text-muted border-t border-border">“% of ARV” formula: MAO = ARV × investor % − repairs − fee. Detailed model subtracts each cost explicitly. Target/low offers = MAO × (1 − cushion).</div>
    </Card>
  );
}

function WeightsEditor<T extends { [K in keyof T]: number }>({ title, value, defaults, labels, onChange, note }: { title: string; value: T; defaults: T; labels?: Partial<Record<keyof T, string>>; onChange: (v: T) => void; note?: string }) {
  return (
    <Card title={title} actions={<Button size="xs" variant="ghost" icon={<RotateCcw size={12} />} onClick={() => onChange(defaults)}>Defaults</Button>}>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
        {(Object.keys(value) as (keyof T)[]).map((k) => (
          <div key={String(k)} className="grid grid-cols-[1fr_120px_40px] items-center gap-2 text-[12px]">
            <span>{labels?.[k] ?? String(k).replace(/([A-Z])/g, " $1").toLowerCase()}</span>
            <input type="range" min={0} max={40} value={value[k]} onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })} />
            <span className="num text-right">{value[k]}</span>
          </div>
        ))}
      </div>
      {note && <p className="mt-2 text-[11px] text-muted">{note}</p>}
    </Card>
  );
}

function ScoringTab() {
  const { settings, updateSettings } = useWorkspace();
  const c = settings.compCriteria;
  return (
    <div className="space-y-3">
      <WeightsEditor title="Motivation score — indicator points" value={settings.motivationWeights} defaults={DEFAULT_MOTIVATION_WEIGHTS} onChange={(v) => updateSettings({ motivationWeights: v })} note="Points are added when an indicator is present in licensed data or stated by the seller; total capped at 100." />
      <WeightsEditor title="Deal score — factor weights" value={settings.dealWeights} defaults={DEFAULT_DEAL_WEIGHTS} onChange={(v) => updateSettings({ dealWeights: v })} note="Weighted average of 0–1 factor scores; factors without data are excluded and the rest re-normalised." />
      <WeightsEditor title="Comp similarity — default weights" value={settings.similarityWeights} defaults={DEFAULT_WEIGHTS} onChange={(v) => updateSettings({ similarityWeights: v })} />
      <Card title="Default comp criteria" actions={<Button size="xs" variant="ghost" onClick={() => updateSettings({ compCriteria: DEFAULT_CRITERIA })}>Defaults</Button>}>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          <Field label="Radius (mi)"><NumberInput decimals={2} value={c.radiusMiles} onChange={(v) => updateSettings({ compCriteria: { ...c, radiusMiles: v } })} /></Field>
          <Field label="Months"><NumberInput value={c.months} onChange={(v) => updateSettings({ compCriteria: { ...c, months: v } })} /></Field>
          <Field label="Sq ft ±%"><NumberInput value={c.sqftTolerancePct} onChange={(v) => updateSettings({ compCriteria: { ...c, sqftTolerancePct: v } })} /></Field>
          <Field label="Beds ±"><NumberInput value={c.bedTolerance} onChange={(v) => updateSettings({ compCriteria: { ...c, bedTolerance: v } })} /></Field>
          <Field label="Baths ±"><NumberInput decimals={1} value={c.bathTolerance} onChange={(v) => updateSettings({ compCriteria: { ...c, bathTolerance: v } })} /></Field>
          <Field label="Year ±"><NumberInput value={c.yearTolerance} onChange={(v) => updateSettings({ compCriteria: { ...c, yearTolerance: v } })} /></Field>
          <Field label="Lot ±%"><NumberInput value={c.lotTolerancePct} onChange={(v) => updateSettings({ compCriteria: { ...c, lotTolerancePct: v } })} /></Field>
          <Field label="Max results"><NumberInput value={c.maxResults} onChange={(v) => updateSettings({ compCriteria: { ...c, maxResults: v } })} /></Field>
          <div className="pt-5"><Toggle checked={c.sameType} onChange={(v) => updateSettings({ compCriteria: { ...c, sameType: v } })} label="Same type" /></div>
        </div>
      </Card>
    </div>
  );
}

function RepairsTab() {
  const { settings, updateSettings } = useWorkspace();
  return (
    <div className="space-y-3">
      <Card title="Default pricing market">
        <select className="input w-auto" value={settings.repairMarketId} onChange={(e) => updateSettings({ repairMarketId: e.target.value })}>{MARKET_COST_MULTIPLIERS.map((m) => <option key={m.id} value={m.id}>{m.name} (×{m.multiplier})</option>)}</select>
        <p className="mt-2 text-[11px] text-muted">Market multipliers scale the base price book. Any line can be overridden per estimate.</p>
      </Card>
      <Card title="Base price book (multiplier 1.0)" subtitle="default assumptions — not quotes" bodyClass="p-0">
        <table className="tbl text-[12px]"><thead><tr><th>Category</th><th>Unit</th><th className="text-right">Minor</th><th className="text-right">Moderate</th><th className="text-right">Major</th><th className="text-right">Full replacement</th></tr></thead>
          <tbody>{REPAIR_CATALOG.map((r) => <tr key={r.category}><td className="font-medium">{r.category}</td><td>{r.unit.replace("_", " ")}</td>{(["minor", "moderate", "major", "full"] as const).map((k) => <td key={k} className="text-right num">${r.cost[k].toLocaleString()}</td>)}</tr>)}</tbody></table>
      </Card>
    </div>
  );
}

function SequencesTab() {
  const { settings, updateSettings } = useWorkspace();
  const setSeq = (id: string, patch: Partial<(typeof settings.sequences)[number]>) => updateSettings({ sequences: settings.sequences.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  return (
    <div className="space-y-3">
      {settings.sequences.map((s) => (
        <Card key={s.id} title={<input className="input input-sm w-[300px]" value={s.name} onChange={(e) => setSeq(s.id, { name: e.target.value })} />} actions={<button className="text-muted hover:text-bad" onClick={() => updateSettings({ sequences: settings.sequences.filter((x) => x.id !== s.id) })}><Trash2 size={13} /></button>}>
          <div className="space-y-1.5">
            {s.steps.map((st, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="text-muted w-10">Day</span><NumberInput size="sm" className="w-[70px]" value={st.day} onChange={(v) => setSeq(s.id, { steps: s.steps.map((x, j) => (j === i ? { ...x, day: v } : x)) })} />
                <select className="input input-sm w-[180px]" value={st.type} onChange={(e) => setSeq(s.id, { steps: s.steps.map((x, j) => (j === i ? { ...x, type: e.target.value as TaskType } : x)) })}>{Object.entries(TASK_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <input className="input input-sm flex-1" placeholder="note" value={st.note ?? ""} onChange={(e) => setSeq(s.id, { steps: s.steps.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} />
                <button className="text-muted hover:text-bad" onClick={() => setSeq(s.id, { steps: s.steps.filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
              </div>
            ))}
            <Button size="xs" icon={<Plus size={12} />} onClick={() => setSeq(s.id, { steps: [...s.steps, { day: (s.steps.at(-1)?.day ?? 0) + 7, type: "follow_up" }] })}>Add step</Button>
          </div>
        </Card>
      ))}
      <Button icon={<Plus size={13} />} onClick={() => updateSettings({ sequences: [...settings.sequences, { id: uid("seq_"), name: "New sequence", steps: [{ day: 0, type: "call_seller" }] }] })}>New sequence</Button>
    </div>
  );
}

function TagsTab() {
  const { settings, updateSettings } = useWorkspace();
  const [t, setT] = useState("");
  return (
    <Card title="Tags">
      <div className="text-[11px] uppercase tracking-wide text-muted mb-1">System</div>
      <div className="flex flex-wrap gap-1 mb-3">{SYSTEM_TAGS.map((x) => <Badge key={x}>{x}</Badge>)}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted mb-1">Custom</div>
      <div className="flex flex-wrap gap-1 mb-3">{settings.customTags.map((x) => <Badge key={x} tone="accent">{x}<button onClick={() => updateSettings({ customTags: settings.customTags.filter((y) => y !== x) })}><X size={10} /></button></Badge>)}</div>
      <div className="flex gap-2"><input className="input w-[240px]" value={t} onChange={(e) => setT(e.target.value)} placeholder="New tag" /><Button onClick={() => { if (t.trim()) { updateSettings({ customTags: [...new Set([...settings.customTags, t.trim()])] }); setT(""); } }}>Add</Button></div>
    </Card>
  );
}

function ComplianceTab() {
  const { settings, updateSettings } = useWorkspace();
  const c = settings.compliance;
  const set = (p: Partial<typeof c>) => updateSettings({ compliance: { ...c, ...p } });
  return (
    <Card title="Compliance controls" subtitle="configurable because laws vary by jurisdiction — not legal advice">
      <div className="space-y-3">
        <Toggle checked={c.enforceDnc} onChange={(v) => set({ enforceDnc: v })} label="Block calls to numbers flagged on Do-Not-Call registries" />
        <Toggle checked={c.requireSmsConsent} onChange={(v) => set({ requireSmsConsent: v })} label="Require recorded consent before SMS" />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Quiet hours start (0–23)"><NumberInput value={c.quietHoursStart} min={0} max={23} onChange={(v) => set({ quietHoursStart: v })} /></Field>
          <Field label="Quiet hours end (0–23)"><NumberInput value={c.quietHoursEnd} min={0} max={23} onChange={(v) => set({ quietHoursEnd: v })} /></Field>
          <Field label="Max contact attempts / week"><NumberInput value={c.maxAttemptsPerWeek} onChange={(v) => set({ maxAttemptsPerWeek: v })} /></Field>
        </div>
        <Field label="Email footer (unsubscribe language)"><textarea className="input" rows={2} value={c.emailFooter} onChange={(e) => set({ emailFooter: e.target.value })} /></Field>
        <Field label="SMS opt-out text"><input className="input" value={c.smsOptOutText} onChange={(e) => set({ smsOptOutText: e.target.value })} /></Field>
        <Field label="Deal blast disclaimer"><textarea className="input" rows={3} value={c.blastDisclaimer} onChange={(e) => set({ blastDisclaimer: e.target.value })} /></Field>
        <p className="text-[11px] text-muted">Opt-outs recorded anywhere are added to the org-wide suppression list (Marketing → Compliance center) and blocked across all channels. Communication history is retained per lead and buyer.</p>
      </div>
    </Card>
  );
}

function TemplatesTab() {
  const { settings, updateSettings } = useWorkspace();
  const set = (id: string, patch: Partial<(typeof settings.offerTemplates)[number]>) => updateSettings({ offerTemplates: settings.offerTemplates.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-warn/40 bg-warn-soft/40 px-3 py-2 text-[12px]">Templates are yours to supply. Have a licensed attorney or local real-estate professional review them; nothing here is presented as legally valid in any jurisdiction. Placeholders: <code>{"{{offer}} {{emd}} {{closeDays}} {{inspectionDays}} {{title}}"}</code></div>
      {settings.offerTemplates.map((t) => (
        <Card key={t.id} title={<input className="input input-sm w-[300px]" value={t.name} onChange={(e) => set(t.id, { name: e.target.value })} />} actions={<button className="text-muted hover:text-bad" onClick={() => updateSettings({ offerTemplates: settings.offerTemplates.filter((x) => x.id !== t.id) })}><Trash2 size={13} /></button>}>
          <textarea className="input font-mono text-[12px]" rows={5} value={t.body} onChange={(e) => set(t.id, { body: e.target.value })} />
        </Card>
      ))}
      <Button icon={<Plus size={13} />} onClick={() => updateSettings({ offerTemplates: [...settings.offerTemplates, { id: uid("tpl_"), name: "New template", body: "Buyer offers ${{offer}}…" }] })}>New template</Button>
    </div>
  );
}

function DataTab() {
  const [d, setD] = useState<Awaited<ReturnType<typeof api.providers>> | null>(null);
  useEffect(() => { api.providers().then(setD).catch(() => {}); }, []);
  if (!d) return <div className="text-muted text-[12.5px]">Loading…</div>;
  return (
    <div className="space-y-3">
      <Card title="How data is labeled"><SourceLegend /><p className="mt-2 text-[11.5px] text-muted">Every field carries its source, as-of date and confidence (click the dot next to any value). Estimates are never presented as confirmed facts.</p></Card>
      <Card title="Capability routing" subtitle="set via PROPERTY_PROVIDER / COMPS_PROVIDER / PARCEL_PROVIDER" bodyClass="p-0">
        <table className="tbl text-[12.5px]"><thead><tr><th>Capability</th><th>Served by</th><th>Kind</th></tr></thead>
          <tbody>{d.routing.map((r) => <tr key={r.capability}><td className="font-mono text-[12px]">{r.capability}</td><td>{r.provider}</td><td><Badge tone={r.kind === "demo" ? "warn" : "good"}>{r.kind}</Badge></td></tr>)}</tbody></table>
      </Card>
      <Card title="Providers" bodyClass="p-0">
        <table className="tbl text-[12.5px]"><thead><tr><th>Provider</th><th>Status</th><th>Capabilities</th><th>Licence / usage notes</th></tr></thead>
          <tbody>{d.providers.map((p) => <tr key={p.id}><td className="font-medium">{p.name}{p.docsUrl && <a className="block text-[11px] text-accent" href={p.docsUrl} target="_blank" rel="noreferrer">docs</a>}</td><td><Badge tone={p.configured ? "good" : "neutral"}>{p.configured ? "configured" : "no key"}</Badge></td><td className="whitespace-normal max-w-[260px] text-[11.5px]">{p.capabilities.join(", ")}</td><td className="whitespace-normal max-w-[380px] text-[11.5px] text-muted">{p.licenseNotes}</td></tr>)}</tbody></table>
        <div className="px-3 py-2 text-[11px] text-muted border-t border-border">MLS data requires a licensed IDX/VOW or broker feed; add an adapter implementing <code>PropertyDataProvider</code> for comps/DOM/inventory. API keys stay server-side (env vars) and are never sent to the browser.</div>
      </Card>
      <Card title="Other integrations" bodyClass="p-0">
        <table className="tbl text-[12.5px]"><tbody>{Object.entries(d.integrations).map(([k, v]) => <tr key={k}><td className="font-medium capitalize">{k.replace(/([A-Z])/g, " $1")}</td><td><Badge tone={v.configured ? "good" : "neutral"}>{v.configured ? "configured" : "not configured"}</Badge></td><td className="text-muted text-[11.5px] whitespace-normal">{v.provider ?? v.note ?? ""}</td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}

function AuditTab() {
  const audit = useWorkspace((s) => s.audit);
  return (
    <Card title="Audit log" subtitle="who changed what — append-only (DB: audit_log via triggers)" bodyClass="p-0">
      <div className="max-h-[70vh] overflow-y-auto"><table className="tbl text-[12px]"><thead><tr><th>When</th><th>User</th><th>Entity</th><th>Action</th><th>Changes</th></tr></thead>
        <tbody>{audit.slice(0, 400).map((a) => <tr key={a.id}><td>{dateTime(a.at)}</td><td>{userName(a.userId)}</td><td className="font-mono text-[11px]">{a.entity}:{a.entityId}</td><td><Badge>{a.action}</Badge></td>
          <td className="whitespace-normal text-[11px] text-muted max-w-[520px]">{a.changes ? Object.entries(a.changes).map(([k, v]) => `${k}: ${JSON.stringify(v.from)?.slice(0, 40)} → ${JSON.stringify(v.to)?.slice(0, 40)}`).join(" · ") : ""}</td></tr>)}</tbody></table></div>
      {audit.length === 0 && <div className="p-6 text-center text-[12px] text-muted">No changes recorded yet in this session.</div>}
    </Card>
  );
}

function DemoTab() {
  const { resetAll, updateSettings } = useWorkspace();
  return (
    <Card title="Demo data">
      <p className="text-[12.5px] mb-3">This build runs in demo mode: property data comes from a seeded synthetic provider (Sacramento region) and CRM records are stored in your browser. All names, addresses and numbers are fictional.</p>
      <div className="flex gap-2">
        <Button variant="danger" onClick={() => { if (confirm("Reset all workspace data to the original demo seed?")) { resetAll(); location.reload(); } }}>Reset demo workspace</Button>
        <Button onClick={() => updateSettings(DEFAULT_SETTINGS)}>Restore default settings</Button>
      </div>
    </Card>
  );
}

export default function Page() { return <Suspense><Settings /></Suspense>; }
