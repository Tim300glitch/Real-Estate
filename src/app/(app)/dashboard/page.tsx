"use client";
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, Circle, Flame } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { BarChart, HBars } from "@/components/charts";
import { Badge, Button, Card, PageHeader, Stat } from "@/components/ui";
import { computeKpis, fmtMetric, monthlyFees } from "@/lib/calc/metrics";
import { date, relative, shortDate, time, usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace, userName } from "@/lib/store/workspace";
import { STAGES } from "@/lib/types";

export default function Dashboard() {
  const ws = useWorkspace();
  const user = useUI((s) => s.user);
  const { kpis } = useMemo(() => computeKpis(ws), [ws]);
  const fees = useMemo(() => monthlyFees(ws.dispositions, 9), [ws.dispositions]);
  const now = Date.now();
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const openTasks = ws.tasks.filter((t) => !t.completedAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const dueNow = openTasks.filter((t) => new Date(t.dueAt) <= endToday);
  const leadById = new Map(ws.leads.map((l) => [l.id, l]));
  const pipeline = STAGES.filter((s) => s.id !== "dead" && s.id !== "closed").map((s) => ({ label: s.label, value: ws.leads.filter((l) => !l.deletedAt && l.stage === s.id).length }));
  const hot = ws.leads.filter((l) => !l.deletedAt && l.status === "hot" && !["closed", "dead"].includes(l.stage)).slice(0, 6);
  const closing = ws.dispositions.filter((d) => !["closed", "cancelled"].includes(d.status)).sort((a, b) => a.closingDate.localeCompare(b.closingDate));
  const k = (key: string) => kpis.find((m) => m.key === key)!;

  const groups: { title: string; keys: string[] }[] = [
    { title: "Acquisitions", keys: ["newLeadsToday", "newProps", "hot", "offersSent", "offersAccepted", "underContract"] },
    { title: "Dispositions", keys: ["marketed", "buyerInterest", "closingSoon", "closedMonth", "projectedFees", "actualFees"] },
    { title: "Efficiency", keys: ["avgFee", "leadToContract", "contractToClose", "daysToContract", "daysToClose", "spend"] },
    { title: "Economics", keys: ["cpl", "cpc", "revenue", "net"] },
  ];

  return (
    <div>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}${user ? `, ${user.name.split(" ")[0]}` : ""}`}
        subtitle={`${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · ${dueNow.length} tasks due · ${k("closingSoon").value} closing in 14 days`}
        actions={<><Button href="/map">Open map</Button><Button href="/pipeline">Pipeline</Button><Button variant="primary" href="/deal-finder">Find deals</Button></>} />
      <div className="px-5 space-y-4">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted mb-1.5">{g.title}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {g.keys.map((key) => { const m = k(key); return <Stat key={key} label={m.label} value={fmtMetric(m)} title={m.definition} href={m.href} sub={m.definition.length > 60 ? undefined : m.definition} />; })}
            </div>
          </div>
        ))}

        <div className="grid lg:grid-cols-3 gap-3">
          <Card title="Assignment fees by month" subtitle="recorded at closing" className="lg:col-span-2" actions={<Button size="xs" variant="ghost" href="/analytics">Analytics <ArrowRight size={12} /></Button>}>
            <BarChart labels={fees.labels} series={[{ name: "Fees", values: fees.fees }]} format={(v) => usd(v, { compact: true })} height={190} />
          </Card>
          <Card title="Activity" subtitle="today & recent" bodyClass="p-3 max-h-[260px] overflow-y-auto">
            <ol className="space-y-2.5">
              {ws.activities.slice(0, 30).map((a) => (
                <li key={a.id} className="grid grid-cols-[62px_1fr] gap-2 text-[12px]">
                  <span className="text-muted num">{new Date(a.at).toDateString() === new Date().toDateString() ? time(a.at) : shortDate(a.at)}</span>
                  <span>{a.leadId && leadById.get(a.leadId) ? <Link className="hover:text-accent" href={`/properties/${leadById.get(a.leadId)!.propertyId}`}>{a.text}</Link> : a.text}<span className="text-muted"> · {userName(a.userId).split(" ")[0]}</span></span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-3 pb-4">
          <Card title="Due today & overdue" subtitle={`${dueNow.length}`} actions={<Button size="xs" variant="ghost" href="/tasks">All tasks</Button>} bodyClass="p-0">
            <ul className="divide-y divide-border">
              {dueNow.slice(0, 8).map((t) => {
                const overdue = new Date(t.dueAt).getTime() < now - 3600000 && new Date(t.dueAt) < new Date(new Date().setHours(0, 0, 0, 0));
                const l = t.leadId ? leadById.get(t.leadId) : null;
                return (
                  <li key={t.id} className="flex items-start gap-2 px-3 py-2 text-[12.5px]">
                    <button onClick={() => ws.completeTask(t.id)} className="mt-0.5 text-muted hover:text-good" title="Complete"><Circle size={14} /></button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{t.title}</div>
                      <div className="text-[11px] text-muted">{l ? <Link href={`/properties/${l.propertyId}`} className="hover:text-accent">{l.property.line1}</Link> : "General"} · {userName(t.assignee).split(" ")[0]}</div>
                    </div>
                    {overdue ? <Badge tone="bad"><AlertCircle size={10} />{relative(t.dueAt)}</Badge> : <Badge>{time(t.dueAt)}</Badge>}
                  </li>
                );
              })}
              {dueNow.length === 0 && <li className="px-3 py-6 text-center text-[12px] text-muted"><CheckCircle2 size={16} className="mx-auto mb-1 text-good" />Nothing due — nice.</li>}
            </ul>
          </Card>
          <Card title="Hot leads" actions={<Button size="xs" variant="ghost" href="/leads">All leads</Button>} bodyClass="p-0">
            <ul className="divide-y divide-border">
              {hot.map((l) => (
                <li key={l.id}><Link href={`/properties/${l.propertyId}`} className="flex items-center gap-2 px-3 py-2 hover:bg-hover">
                  <Flame size={14} className="text-bad shrink-0" />
                  <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{l.property.line1}</div><div className="text-[11px] text-muted">{l.stage.replace(/_/g, " ")} · last contact {relative(l.lastContactAt)}</div></div>
                  <Badge>{l.property.motivationScore}</Badge>
                </Link></li>
              ))}
            </ul>
          </Card>
          <Card title="Deals closing" bodyClass="p-0" actions={<Button size="xs" variant="ghost" href="/dispositions">Dispositions</Button>}>
            <ul className="divide-y divide-border">
              {closing.map((d) => {
                const l = leadById.get(d.leadId);
                const win = ws.buyerOffers.find((o) => o.id === d.winningOfferId);
                return (
                  <li key={d.id}><Link href={`/dispositions/${d.id}`} className="flex items-center gap-2 px-3 py-2 hover:bg-hover">
                    <CalendarClock size={14} className="text-muted shrink-0" />
                    <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium truncate">{l?.property.line1}</div><div className="text-[11px] text-muted">{d.status.replace(/_/g, " ")} · close {date(d.closingDate)}</div></div>
                    <span className="text-[12px] num text-good">{usd((win?.amount ?? d.askingPrice) - d.contractPrice, { compact: true })}</span>
                  </Link></li>
                );
              })}
            </ul>
            <div className="p-3 border-t border-border">
              <div className="text-[10.5px] uppercase tracking-wide text-muted mb-2">Pipeline snapshot</div>
              <HBars rows={pipeline.filter((p) => p.value > 0)} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
