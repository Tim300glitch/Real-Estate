"use client";
import { Bot, Database, Lightbulb, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { calculateArv, scoreComps } from "@/lib/calc/comps";
import { computeDeal } from "@/lib/calc/deal";
import { repairTotals } from "@/lib/calc/repairs";
import { motivationScore } from "@/lib/calc/scores";
import { api } from "@/lib/client/api";
import { date, usd } from "@/lib/format";
import { useWorkspace } from "@/lib/store/workspace";
import type { PropertyRecord, PropertySummary } from "@/lib/types";
import { Badge, Button, cx } from "../ui";

export interface Fact { label: string; value: string; source: string }

const TASKS = [
  { id: "why_lead", label: "Why is this a strong (or weak) lead?" },
  { id: "summarize_conversations", label: "Summarize seller conversations" },
  { id: "explain_comps", label: "Explain the comps" },
  { id: "suspicious_assumptions", label: "Find suspicious assumptions" },
  { id: "draft_followup", label: "Draft a follow-up message" },
  { id: "deal_summary", label: "Create a deal summary" },
  { id: "analyze_rehab", label: "Analyze the rehab list" },
] as const;
type TaskId = (typeof TASKS)[number]["id"] | "ask" | "prioritize_leads";

/** Collects ONLY stored facts (with their sources). The assistant may not add any others. */
export function useFacts(propertyId: string, subject: PropertySummary, record?: PropertyRecord | null) {
  const ws = useWorkspace();
  return useMemo(() => {
    const f: Fact[] = [];
    const pv = record?.provenance ?? {};
    const src = (k: string, fallback = "Property data provider") => (pv[k] ? `${pv[k].source} (${pv[k].kind.replace("_", " ")}, ${pv[k].confidence} confidence)` : fallback);
    f.push({ label: "Address", value: `${subject.line1}, ${subject.city} ${subject.zip}`, source: src("address") });
    f.push({ label: "Property", value: `${subject.beds ?? "?"} bd / ${subject.baths ?? "?"} ba, ${subject.sqft ?? "?"} sf, built ${subject.yearBuilt ?? "?"}, ${subject.propertyType}`, source: src("sqft") });
    f.push({ label: "Owner", value: `${subject.ownerName} (${subject.ownerEntity})`, source: src("owner") });
    f.push({ label: "Ownership length", value: subject.yearsOwned != null ? `${subject.yearsOwned.toFixed(1)} years` : "unknown", source: src("yearsOwned") });
    f.push({ label: "Occupancy", value: subject.ownerOccupied ? "owner occupied" : subject.outOfState ? "absentee — mailing address out of state" : "absentee", source: src("ownerOccupied") });
    f.push({ label: "Estimated value", value: usd(subject.estValue), source: src("estValue") });
    f.push({ label: "Equity", value: subject.equityPct != null ? `${subject.equityPct.toFixed(0)}% (${usd(subject.estEquity)}) — estimate` : "unknown", source: src("estEquity") });
    if (subject.lastSaleDate) f.push({ label: "Last transfer", value: `${date(subject.lastSaleDate)} for ${usd(subject.lastSalePrice)}`, source: src("lastSale") });
    const d = subject.distress;
    const flags = [d.vacant && "vacancy indicator", d.taxDelinquent && "tax delinquent", d.preForeclosure && `pre-foreclosure${d.auctionDate ? ` (auction ${date(d.auctionDate)})` : ""}`, d.probate && "probate filing", d.inherited && "inherited transfer", (d.codeViolations ?? 0) > 0 && `${d.codeViolations} code violation(s)`, (d.liens ?? 0) > 0 && `${d.liens} lien(s)`, d.tiredLandlord && "tired-landlord indicators"].filter(Boolean);
    f.push({ label: "Distress indicators", value: flags.length ? flags.join(", ") : "none on record", source: "Public records / provider (see each field)" });
    const lead = ws.leads.find((l) => l.propertyId === propertyId && !l.deletedAt);
    if (lead) {
      f.push({ label: "Lead stage", value: lead.stage.replace(/_/g, " "), source: "CRM (user-entered)" });
      const seller = ws.sellers.find((s) => s.id === lead.sellerId);
      if (seller) {
        f.push({ label: "Seller timeline", value: seller.timeline || "not asked", source: "Seller CRM (seller-stated)" });
        f.push({ label: "Reason for selling", value: seller.reasonForSelling || "not asked", source: "Seller CRM (seller-stated)" });
        f.push({ label: "Seller asking price", value: usd(seller.askingPrice ?? null), source: "Seller CRM (seller-stated)" });
        f.push({ label: "Stated condition", value: seller.condition || "not asked", source: "Seller CRM (seller-stated)" });
        f.push({ label: "Seller motivation (rep rating)", value: `${seller.motivation}/5`, source: "CRM (user-entered)" });
      }
      const comms = ws.comms.filter((c) => c.leadId === lead.id).slice(0, 15);
      comms.forEach((c, i) => f.push({ label: `Conversation ${comms.length - i}`, value: `${date(c.at)} ${c.direction} ${c.type}${c.outcome ? ` (${c.outcome})` : ""}${c.body ? `: ${c.body}` : ""}`, source: "Communication log" }));
    }
    const cs = ws.compSets.find((c) => c.propertyId === propertyId);
    if (cs) {
      const sc = scoreComps(subject, cs.comps, cs.weights, cs.criteria).filter((c) => c.included);
      const a = calculateArv(subject, sc, cs.arvMethod);
      f.push({ label: "ARV (calculated)", value: `${usd(a.likely)} via ${cs.arvMethod} from ${sc.length} comps; range ${usd(a.conservative)}–${usd(a.aggressive)}`, source: "Calculated" });
      if (cs.userArv) f.push({ label: "ARV (user override)", value: `${usd(cs.userArv)}${cs.userArvReason ? ` — ${cs.userArvReason}` : ""}`, source: "User-entered" });
      sc.slice(0, 8).forEach((c, i) => f.push({ label: `Comp ${i + 1}`, value: `${c.line1}: ${usd(c.salePrice)} on ${date(c.saleDate)}, ${c.sqft} sf ($${Math.round(c.ppsf ?? 0)}/sf), ${c.sim.distanceMiles.toFixed(2)} mi, ${c.similarity}% match${c.conditionNotes ? `, notes: ${c.conditionNotes}` : ""}`, source: c.source.source }));
      if (a.warnings.length) f.push({ label: "Comp warnings", value: a.warnings.join(" "), source: "Calculated" });
    }
    const rep = ws.repairs.find((r) => r.propertyId === propertyId);
    if (rep) {
      const t = repairTotals(rep.items, rep.contingencyPct);
      f.push({ label: "Repair estimate", value: `${usd(t.expected)} expected (${usd(t.low)}–${usd(t.high)}); items: ${rep.items.map((i) => `${i.category} ${i.condition} ${usd(i.quantity * i.unitCost)}`).join("; ")}`, source: "Repair estimator (user assumptions)" });
    }
    const an = ws.analyses.find((a) => a.propertyId === propertyId);
    if (an) {
      const o = computeDeal(an.inputs);
      f.push({ label: "Underwriting", value: `${an.inputs.formula === "percent_of_arv" ? `${(an.inputs.investorPct * 100).toFixed(0)}% of ARV` : "detailed model"}, fee goal ${usd(an.inputs.wholesaleFee)}; MAO ${usd(o.mao)}, target ${usd(o.offers[1].price)}, quality ${o.quality}`, source: "Deal analyzer (calculated from user inputs)" });
    }
    return f;
  }, [ws, propertyId, subject, record]);
}

/** Deterministic, offline interpretation used when no AI key is configured. */
function ruleBased(task: TaskId, subject: PropertySummary, facts: Fact[], seller?: { name: string } | null): string {
  const m = motivationScore(subject);
  const get = (l: string) => facts.find((f) => f.label === l)?.value;
  switch (task) {
    case "why_lead": {
      const pos = m.factors.filter((x) => x.points > 0).map((x) => `• ${x.label} — ${x.detail} [${x.label}]`);
      const missing = m.factors.filter((x) => !x.available).map((x) => x.label);
      return [`Motivation score ${m.score}/100 (${m.label}).`, ...(pos.length ? ["Signals present:", ...pos] : ["No motivation signals found in the connected data."]),
        get("Seller timeline") ? `• Seller-stated timeline: ${get("Seller timeline")} [Seller timeline]` : "", missing.length ? `Unknown (not available): ${missing.join(", ")}.` : ""].filter(Boolean).join("\n");
    }
    case "summarize_conversations": {
      const conv = facts.filter((f) => f.label.startsWith("Conversation"));
      if (!conv.length) return "No logged conversations yet.";
      const inbound = conv.filter((c) => c.value.includes(" inbound ")).length;
      return [`${conv.length} logged touches (${inbound} inbound).`, `Most recent: ${conv[0].value}`, get("Reason for selling") ? `Reason: ${get("Reason for selling")}` : "", get("Seller asking price") ? `Asking: ${get("Seller asking price")}` : "", "Next step: confirm timeline and decision makers, then present the offer range."].filter(Boolean).join("\n");
    }
    case "explain_comps": {
      const comps = facts.filter((f) => /^Comp \d/.test(f.label));
      if (!comps.length) return "No comps selected yet — run comps first.";
      return [`ARV: ${get("ARV (calculated)")}`, ...comps.map((c) => `• ${c.value}`), get("Comp warnings") ? `Caveats: ${get("Comp warnings")}` : "Caveats: no time or condition adjustments are applied — check condition notes."].join("\n");
    }
    case "suspicious_assumptions": {
      const out: string[] = [];
      if (get("Comp warnings")) out.push(`• Comps: ${get("Comp warnings")}`);
      if (!get("Repair estimate")) out.push("• No repair estimate saved — MAO may be using $0 repairs.");
      if (get("ARV (user override)")) out.push(`• ARV is overridden (${get("ARV (user override)")}); confirm the override is supported by comps.`);
      if ((subject.yearBuilt ?? 2000) < 1960 && !/Electrical|Plumbing/.test(get("Repair estimate") ?? "")) out.push("• Pre-1960 home with no electrical/plumbing line items.");
      if (subject.equityPct != null && subject.equityPct > 90 && !subject.freeAndClear) out.push("• Equity >90% with a recorded loan — mortgage balance is an estimate; get a payoff.");
      if (/unknown|not asked/.test(get("Seller timeline") ?? "unknown")) out.push("• Seller timeline unknown — motivation may be overstated.");
      return out.length ? out.join("\n") : "No obvious inconsistencies found in the stored data.";
    }
    case "draft_followup":
      return `Hi ${seller?.name?.split(" ")[0] ?? "there"}, thanks again for talking with me about ${subject.line1}. I wanted to follow up and see if you had any questions about the numbers we discussed or the timeline that works best for you. No pressure either way — happy to help however is most useful.\n\nReply STOP to opt out.`;
    case "deal_summary":
      return [`${subject.line1}, ${subject.city} — ${get("Property")}.`, `Owner: ${get("Owner")}; ${get("Occupancy")}; owned ${get("Ownership length")}.`, get("ARV (calculated)") ? `ARV: ${get("ARV (calculated)")}` : "ARV: not yet calculated.", get("Repair estimate") ? `Repairs: ${get("Repair estimate")?.split(";")[0]}` : "", get("Underwriting") ?? "", `Motivation ${m.score}/100. Distress: ${get("Distress indicators")}.`].filter(Boolean).join("\n");
    case "analyze_rehab": {
      const r = get("Repair estimate");
      if (!r) return "No repair estimate saved.";
      const missing = ["Roof", "HVAC", "Electrical", "Plumbing", "Kitchen", "Bathrooms", "Flooring", "Interior paint"].filter((c) => !r.includes(c));
      return [`Current estimate: ${r.split(";")[0]}`, missing.length ? `Not included: ${missing.join(", ")} — confirm on walkthrough.` : "Core systems are covered.", subject.sqft ? `Expected cost per sqft is shown in the estimator; compare against your recent rehabs.` : ""].join("\n");
    }
    default:
      return "Ask about this property; answers use only the facts listed.";
  }
}

export function AssistantPanel({ propertyId, subject, record }: { propertyId: string; subject: PropertySummary; record?: PropertyRecord | null }) {
  const facts = useFacts(propertyId, subject, record);
  const lead = useWorkspace((s) => s.leads.find((l) => l.propertyId === propertyId && !l.deletedAt));
  const seller = useWorkspace((s) => s.sellers.find((x) => x.id === lead?.sellerId));
  const [task, setTask] = useState<TaskId>("why_lead");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ text: string; mode: "ai" | "rules"; model?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showFacts, setShowFacts] = useState(true);

  async function run(t: TaskId) {
    setTask(t);
    setBusy(true);
    try {
      const res = await api.ai({ task: t, question: t === "ask" ? question : undefined, facts: facts.slice(0, 200) });
      if (res.configured && res.interpretation) setAnswer({ text: res.interpretation, mode: "ai", model: res.model });
      else setAnswer({ text: t === "ask" ? "AI is not configured (set ANTHROPIC_API_KEY). Use the preset analyses, which run offline on the same facts." : ruleBased(t, subject, facts, seller), mode: "rules", error: res.error });
    } catch (e) {
      setAnswer({ text: ruleBased(t, subject, facts, seller), mode: "rules", error: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {TASKS.map((t) => <Button key={t.id} size="xs" variant={task === t.id ? "subtle" : "secondary"} onClick={() => run(t.id)} disabled={busy}>{t.label}</Button>)}
      </div>
      <div className="flex gap-2">
        <input className="input" placeholder="Ask about this property (answers use only the facts below)…" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && question && run("ask")} />
        <Button variant="primary" icon={<Send size={13} />} disabled={!question || busy} onClick={() => run("ask")}>Ask</Button>
      </div>
      {busy && <div className="text-[12px] text-muted">Thinking…</div>}
      {answer && (
        <div className="rounded-lg border border-violet/40 bg-violet-soft/40 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-violet">
            {answer.mode === "ai" ? <Bot size={13} /> : <Lightbulb size={13} />}
            Interpretation — {answer.mode === "ai" ? `AI${answer.model ? ` (${answer.model})` : ""}` : "rule-based (offline)"}
            <Badge tone="violet" className="ml-auto normal-case tracking-normal">not a fact</Badge>
          </div>
          <div className="mt-2 text-[12.5px] whitespace-pre-wrap leading-relaxed">{answer.text}</div>
          {answer.error && <div className="mt-1 text-[11px] text-bad">{answer.error}</div>}
        </div>
      )}
      <div className="rounded-lg border border-border">
        <button onClick={() => setShowFacts((s) => !s)} className="flex w-full items-center gap-2 px-3 h-9 text-[11px] font-semibold uppercase tracking-wide text-muted border-b border-border">
          <Database size={13} /> Facts available to the assistant ({facts.length}) <span className="ml-auto normal-case font-normal">{showFacts ? "hide" : "show"}</span>
        </button>
        {showFacts && (
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
            {facts.map((f, i) => (
              <div key={i} className={cx("grid grid-cols-[130px_1fr] gap-2 px-3 py-1.5 text-[11.5px]")}>
                <span className="text-muted">{f.label}</span>
                <span>{f.value}<span className="block text-[10.5px] text-muted">{f.source}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[10.5px] text-muted">The assistant never invents property facts: it receives only the records above (each with its source) and its output is labeled as interpretation. Configure ANTHROPIC_API_KEY on the server to enable AI; otherwise deterministic rules run offline.</p>
    </div>
  );
}
