"use client";
import { AlertCircle, CheckCircle2, Circle, ListOrdered, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TaskForm } from "@/components/crm/forms";
import { Badge, Button, Card, Dialog, PageHeader, Segmented, cx } from "@/components/ui";
import { dateTime, relative } from "@/lib/format";
import { TEAM, useWorkspace, userName } from "@/lib/store/workspace";
import { TASK_TYPE_LABEL, type Task } from "@/lib/types";

export default function Tasks() {
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<string>("all");
  const [view, setView] = useState<"open" | "completed">("open");
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const tasks = ws.tasks.filter((t) => who === "all" || t.assignee === who);
  const open_ = tasks.filter((t) => !t.completedAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const groups: { title: string; tone: "bad" | "warn" | "neutral"; items: Task[] }[] = [
    { title: "Overdue", tone: "bad", items: open_.filter((t) => new Date(t.dueAt) < startToday) },
    { title: "Due today", tone: "warn", items: open_.filter((t) => new Date(t.dueAt) >= startToday && new Date(t.dueAt) <= endToday) },
    { title: "Upcoming", tone: "neutral", items: open_.filter((t) => new Date(t.dueAt) > endToday) },
  ];
  const done = tasks.filter((t) => t.completedAt).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const leadById = new Map(ws.leads.map((l) => [l.id, l]));

  const Row = ({ t }: { t: Task }) => {
    const l = t.leadId ? leadById.get(t.leadId) : null;
    return (
      <li className="flex items-center gap-2.5 px-3 py-2 hover:bg-hover">
        <button onClick={() => ws.completeTask(t.id, !t.completedAt)} className={cx(t.completedAt ? "text-good" : "text-muted hover:text-good")}>{t.completedAt ? <CheckCircle2 size={16} /> : <Circle size={16} />}</button>
        <div className="min-w-0 flex-1">
          <div className={cx("text-[12.5px]", t.completedAt && "line-through text-muted")}>{t.title}</div>
          <div className="text-[11px] text-muted">{TASK_TYPE_LABEL[t.type]}{l && <> · <Link href={`/properties/${l.propertyId}`} className="hover:text-accent">{l.property.line1}</Link></>}{t.sequenceId && " · sequence"} · {userName(t.assignee)}</div>
        </div>
        {t.priority === 1 && <Badge tone="bad">High</Badge>}
        <span className="text-[11.5px] text-muted w-[150px] text-right">{dateTime(t.dueAt)}<div>{relative(t.dueAt)}</div></span>
        <select className="input input-sm w-[120px]" value={t.assignee} onChange={(e) => ws.updateTask(t.id, { assignee: e.target.value })}>{TEAM.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <button onClick={() => ws.deleteTask(t.id)} className="text-muted hover:text-bad"><Trash2 size={13} /></button>
      </li>
    );
  };
  return (
    <div>
      <PageHeader title="Tasks & follow-ups" subtitle={`${groups[0].items.length} overdue · ${groups[1].items.length} due today · ${groups[2].items.length} upcoming`}
        actions={<>
          <select className="input input-sm w-auto" value={who} onChange={(e) => setWho(e.target.value)}><option value="all">Everyone</option>{TEAM.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          <Segmented value={view} onChange={setView} options={[{ value: "open", label: "Open" }, { value: "completed", label: `Completed (${done.length})` }]} />
          <Button href="/settings?tab=sequences" icon={<ListOrdered size={13} />}>Sequences</Button>
          <Button variant="primary" icon={<Plus size={13} />} onClick={() => setOpen(true)}>New task</Button>
        </>} />
      <div className="px-5 pb-6 space-y-3">
        {view === "open" ? groups.map((g) => (
          <Card key={g.title} title={<span className="flex items-center gap-1.5">{g.tone === "bad" && <AlertCircle size={13} className="text-bad" />}{g.title}</span>} subtitle={String(g.items.length)} bodyClass="p-0">
            <ul className="divide-y divide-border">{g.items.map((t) => <Row key={t.id} t={t} />)}</ul>
            {g.items.length === 0 && <div className="px-3 py-4 text-[12px] text-muted">Nothing here.</div>}
          </Card>
        )) : (
          <Card title="Completed" bodyClass="p-0"><ul className="divide-y divide-border">{done.map((t) => <Row key={t.id} t={t} />)}</ul></Card>
        )}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="New task"><TaskForm onDone={() => setOpen(false)} /></Dialog>
    </div>
  );
}
