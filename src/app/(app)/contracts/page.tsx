"use client";
import { FilePlus2, PenLine, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Dialog, Field, NumberInput, PageHeader } from "@/components/ui";
import { api } from "@/lib/client/api";
import { dateTime, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";
import { CONTRACT_KIND_LABEL, type ContractKind, type ContractStatus } from "@/lib/types";

const FLOW: ContractStatus[] = ["draft", "sent", "viewed", "signed", "executed"];
const TONE: Record<ContractStatus, "neutral" | "accent" | "info" | "violet" | "good" | "bad"> = { draft: "neutral", sent: "accent", viewed: "info", signed: "violet", executed: "good", cancelled: "bad", expired: "bad" };

export default function Contracts() {
  const ws = useWorkspace();
  const toast = useUI((s) => s.toast);
  const [kind, setKind] = useState<ContractKind | "">("");
  const [status, setStatus] = useState<ContractStatus | "">("");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ leadId: "", kind: "purchase_agreement" as ContractKind, title: "", amount: 0, party: "" });
  const [esign, setEsign] = useState<{ configured: boolean; provider?: string | null } | null>(null);
  useEffect(() => { api.providers().then((r) => setEsign(r.integrations.esign)).catch(() => {}); }, []);
  const rows = useMemo(() => ws.contracts.filter((c) => (!kind || c.kind === kind) && (!status || c.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [ws.contracts, kind, status]);
  const counts = FLOW.concat(["cancelled", "expired"]).map((s) => ({ s, n: ws.contracts.filter((c) => c.status === s).length }));
  return (
    <div>
      <PageHeader title="Contracts" subtitle="Purchase & assignment agreements, addenda, disclosures, title docs, proof of funds, seller & buyer documents"
        actions={<>
          <select className="input input-sm w-auto" value={kind} onChange={(e) => setKind(e.target.value as ContractKind)}><option value="">All types</option>{Object.entries(CONTRACT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="input input-sm w-auto" value={status} onChange={(e) => setStatus(e.target.value as ContractStatus)}><option value="">All statuses</option>{Object.keys(TONE).map((s) => <option key={s}>{s}</option>)}</select>
          <Button variant="primary" icon={<FilePlus2 size={13} />} onClick={() => setOpen(true)}>New document</Button>
        </>} />
      <div className="px-5 pb-3 flex flex-wrap gap-2">{counts.map(({ s, n }) => <button key={s} onClick={() => setStatus(status === s ? "" : s)}><Badge tone={TONE[s]}>{s} · {n}</Badge></button>)}</div>
      <div className="px-5 pb-3">
        <div className="rounded-lg border border-border bg-panel-2 px-3 py-2 text-[12px] flex items-center gap-2">
          <PenLine size={14} className="text-muted" />
          E-signature: {esign?.configured ? <b>{esign.provider} connected</b> : <span><b>not connected</b> — status changes below are tracked manually. Connect DocuSign / Dropbox Sign / PandaDoc via ESIGN_PROVIDER + ESIGN_API_KEY (adapter interface: <code className="font-mono text-[11px]">ESignProvider</code>); webhook events then drive these statuses automatically.</span>}
        </div>
      </div>
      <Card className="mx-5 mb-6" bodyClass="p-0">
        <table className="tbl text-[12.5px]">
          <thead><tr><th>Document</th><th>Type</th><th>Property</th><th>Party</th><th className="text-right">Amount</th><th>Status</th><th>Progress</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody>{rows.map((c) => {
            const l = ws.leads.find((x) => x.id === c.leadId);
            const idx = FLOW.indexOf(c.status);
            const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
            return (
              <tr key={c.id}>
                <td className="font-medium max-w-[260px] truncate">{c.title}</td><td>{CONTRACT_KIND_LABEL[c.kind]}</td>
                <td>{l ? <Link href={`/properties/${l.propertyId}`} className="hover:text-accent">{l.property.line1}</Link> : "—"}</td>
                <td className="text-fg-2">{c.party ?? "—"}</td><td className="text-right num">{usd(c.amount ?? null)}</td>
                <td><Badge tone={TONE[c.status]}>{c.status}</Badge></td>
                <td><div className="flex gap-0.5">{FLOW.map((s, i) => <span key={s} title={s} className="h-1.5 w-5 rounded-full" style={{ background: i <= idx ? "var(--good)" : "var(--border)" }} />)}</div></td>
                <td className="text-muted">{dateTime(c.history[c.history.length - 1]?.at)}</td>
                <td className="flex gap-1">
                  {next && <Button size="xs" onClick={() => { ws.setContractStatus(c.id, next); toast(`${c.title}: ${next}`); }}>Mark {next}</Button>}
                  {!["executed", "cancelled", "expired"].includes(c.status) && <Button size="xs" variant="ghost" onClick={() => ws.setContractStatus(c.id, "cancelled")}>Cancel</Button>}
                </td>
              </tr>);
          })}</tbody>
        </table>
        {rows.length === 0 && <div className="p-8 text-center text-muted text-[12.5px]">No documents.</div>}
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title="New contract / document" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => {
        if (!f.leadId) return;
        const l = ws.leads.find((x) => x.id === f.leadId)!;
        ws.createContract({ leadId: f.leadId, kind: f.kind, title: f.title || `${CONTRACT_KIND_LABEL[f.kind]} — ${l.property.line1}`, amount: f.amount || undefined, party: f.party || undefined });
        setOpen(false); toast("Document created");
      }}>Create</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lead"><select className="input" value={f.leadId} onChange={(e) => setF({ ...f, leadId: e.target.value })}><option value="">Choose…</option>{ws.leads.filter((l) => !l.deletedAt).map((l) => <option key={l.id} value={l.id}>{l.property.line1}</option>)}</select></Field>
          <Field label="Type"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ContractKind })}>{Object.entries(CONTRACT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Title" className="col-span-2"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Defaults to type — address" /></Field>
          <Field label="Amount"><NumberInput prefix="$" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
          <Field label="Counterparty"><input className="input" value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} /></Field>
        </div>
        <p className="mt-3 text-[11px] text-muted flex gap-1"><Upload size={12} />Contract templates are user/attorney-supplied. This app does not provide jurisdiction-specific legal language.</p>
      </Dialog>
    </div>
  );
}
