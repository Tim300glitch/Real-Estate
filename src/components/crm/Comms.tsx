"use client";
import { Calendar, FileSignature, Gavel, Mail, MessageSquare, Mic, MicOff, Phone, PhoneMissed, Pin, PinOff, StickyNote, Trash2, Voicemail, ImagePlus, Bot, Send } from "lucide-react";
import { useRef, useState } from "react";
import { savePhotos, speechSupported, startDictation, useMedia } from "@/lib/client/photos";
import { dateTime, formatPhone } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace, userName } from "@/lib/store/workspace";
import type { CommType, Communication, ContactPoint, Note } from "@/lib/types";
import { Badge, Button, Dialog, Field, Segmented, cx } from "../ui";

export const COMM_ICON: Record<CommType, typeof Phone> = {
  call: Phone, sms: MessageSquare, email: Mail, voicemail: Voicemail, note: StickyNote, appointment: Calendar, offer: Gavel, contract: FileSignature, automation: Bot, mail: Send,
};

/** Compliance gate for outbound contact. Returns a reason when contact must be blocked or warned. */
export function useContactCompliance() {
  const { settings, isSuppressed } = useWorkspace();
  return (type: CommType, cp?: ContactPoint | null): { block?: string; warn?: string } => {
    if (!cp) return {};
    const c = settings.compliance;
    if (cp.optedOut || isSuppressed(cp.kind, cp.value)) return { block: "Contact opted out / on suppression list" };
    if (type === "call" && c.enforceDnc && cp.dnc) return { block: "Number is on a Do-Not-Call registry (scrub result). Enable a lawful basis or disable enforcement in Settings → Compliance." };
    if (type === "sms" && c.requireSmsConsent && !cp.smsConsent) return { block: "No SMS consent recorded for this number (Settings → Compliance)." };
    if (cp.status === "bad") return { warn: "Marked as bad number" };
    const h = new Date().getHours();
    const quiet = c.quietHoursStart > c.quietHoursEnd ? h >= c.quietHoursStart || h < c.quietHoursEnd : h >= c.quietHoursStart && h < c.quietHoursEnd;
    if ((type === "call" || type === "sms") && quiet) return { warn: `Inside quiet hours (${c.quietHoursStart}:00–${c.quietHoursEnd}:00 local)` };
    return {};
  };
}

export function LogCommDialog({ open, onClose, leadId, buyerId, contact, defaultType = "call" }: { open: boolean; onClose: () => void; leadId?: string; buyerId?: string; contact?: ContactPoint | null; defaultType?: CommType }) {
  const logComm = useWorkspace((s) => s.logComm);
  const toast = useUI((s) => s.toast);
  const check = useContactCompliance();
  const [type, setType] = useState<CommType>(defaultType);
  const [direction, setDirection] = useState<"outbound" | "inbound" | "internal">("outbound");
  const [outcome, setOutcome] = useState("Connected");
  const [body, setBody] = useState("");
  const gate = check(type, contact);
  const OUTCOMES: Partial<Record<CommType, string[]>> = {
    call: ["Connected", "No answer", "Voicemail", "Wrong number", "Not interested", "Call back later"],
    sms: ["Delivered", "Replied", "Failed"], email: ["Sent", "Replied", "Bounced"], voicemail: ["Left voicemail"], mail: ["Mailed"],
  };
  return (
    <Dialog open={open} onClose={onClose} title={`Log ${type}${contact ? ` · ${contact.kind === "phone" ? formatPhone(contact.value) : contact.value}` : ""}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!!gate.block && direction === "outbound"} onClick={() => {
        logComm({ leadId, buyerId, type, direction, outcome: OUTCOMES[type] ? outcome : undefined, body: body || undefined, contact: contact?.value });
        if (type === "call" && outcome === "Wrong number" && contact && leadId) toast("Tip: mark this number as bad in the seller's contacts", "info");
        toast("Logged"); setBody(""); onClose();
      }}>Log</Button></>}>
      <div className="space-y-3">
        <Segmented value={type} onChange={(t) => { setType(t); setOutcome(OUTCOMES[t]?.[0] ?? ""); }} options={(["call", "sms", "email", "voicemail", "note", "mail"] as CommType[]).map((t) => ({ value: t, label: t.toUpperCase() }))} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Direction"><select className="input" value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}><option value="outbound">Outbound</option><option value="inbound">Inbound</option><option value="internal">Internal note</option></select></Field>
          {OUTCOMES[type] && <Field label="Outcome"><select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUTCOMES[type]!.map((o) => <option key={o}>{o}</option>)}</select></Field>}
        </div>
        <Field label={type === "sms" || type === "email" ? "Message" : "Notes"}><textarea className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        {gate.block && direction === "outbound" && <div className="rounded-md bg-bad-soft text-bad px-2.5 py-1.5 text-[12px]">Blocked: {gate.block}</div>}
        {gate.warn && <div className="rounded-md bg-warn-soft text-warn px-2.5 py-1.5 text-[12px]">Warning: {gate.warn}</div>}
        {type === "sms" && <p className="text-[11px] text-muted">Messaging providers are an integration point; in demo mode this logs the message without sending. Include opt-out language where required.</p>}
      </div>
    </Dialog>
  );
}

export function CommTimeline({ comms, compact }: { comms: Communication[]; compact?: boolean }) {
  if (!comms.length) return <div className="text-[12px] text-muted py-4 text-center">No communications logged yet.</div>;
  let lastDay = "";
  return (
    <ol className="relative space-y-0">
      {comms.map((c) => {
        const Icon = c.type === "call" && /no answer|wrong/i.test(c.outcome ?? "") ? PhoneMissed : COMM_ICON[c.type];
        const day = new Date(c.at).toDateString();
        const showDay = day !== lastDay;
        lastDay = day;
        return (
          <li key={c.id}>
            {showDay && !compact && <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted pt-2 pb-1">{new Date(c.at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>}
            <div className="flex gap-2.5 py-1.5">
              <span className={cx("mt-0.5 h-6 w-6 shrink-0 rounded-full flex items-center justify-center", c.direction === "inbound" ? "bg-good-soft text-good" : c.direction === "internal" ? "bg-hover text-muted" : "bg-accent-soft text-accent-text")}><Icon size={12} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px]"><span className="font-medium capitalize">{c.direction === "internal" ? "" : `${c.direction} `}{c.type}</span>{c.outcome && <span className="text-muted"> · {c.outcome}</span>}<span className="text-muted text-[11px] ml-2">{dateTime(c.at)} · {userName(c.userId).split(" ")[0]}</span></div>
                {c.body && <div className="text-[12px] text-fg-2 whitespace-pre-wrap">{c.body}</div>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function NotePhoto({ id }: { id: string }) {
  const url = useMedia(id);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className="h-20 w-28 object-cover rounded border border-border" /></a> : <div className="h-20 w-28 rounded bg-hover" />;
}

export function NotesPanel({ entityType, entityId, notes }: { entityType: Note["entityType"]; entityId: string; notes: Note[] }) {
  const { addNote, updateNote, deleteNote } = useWorkspace();
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [viaVoice, setViaVoice] = useState(false);
  const rec = useRef<{ stop(): void } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const base = useRef("");
  const sorted = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at));
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border p-2.5 space-y-2">
        <textarea className="input" rows={3} placeholder="Add a note… (supports voice-to-text and photos)" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <input className="input input-sm w-[200px]" placeholder="tags, comma separated" value={tags} onChange={(e) => setTags(e.target.value)} />
          {speechSupported() && (
            <Button size="xs" variant={listening ? "danger" : "secondary"} icon={listening ? <MicOff size={12} /> : <Mic size={12} />} onClick={() => {
              if (listening) { rec.current?.stop(); return; }
              base.current = body ? body + " " : "";
              rec.current = startDictation((t) => { setBody(base.current + t); setViaVoice(true); }, () => setListening(false));
              setListening(true);
            }}>{listening ? "Stop" : "Dictate"}</Button>
          )}
          <Button size="xs" icon={<ImagePlus size={12} />} onClick={() => file.current?.click()}>Photo</Button>
          <input ref={file} type="file" accept="image/*" capture="environment" multiple hidden onChange={async (e) => { if (e.target.files) setPhotos([...photos, ...(await savePhotos(e.target.files))]); }} />
          {photos.length > 0 && <Badge tone="accent">{photos.length} photo{photos.length > 1 ? "s" : ""}</Badge>}
          <Button size="xs" variant="primary" className="ml-auto" disabled={!body.trim() && !photos.length} onClick={() => {
            addNote({ entityType, entityId, body: body.trim() || "(photo)", pinned: false, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), viaVoice, photoIds: photos });
            setBody(""); setTags(""); setPhotos([]); setViaVoice(false);
          }}>Save note</Button>
        </div>
      </div>
      {sorted.map((n) => (
        <div key={n.id} className={cx("rounded-lg border p-2.5", n.pinned ? "border-warn/50 bg-warn-soft/30" : "border-border")}>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            {n.pinned && <Pin size={11} className="text-warn" />}{userName(n.userId)} · {dateTime(n.at)}{n.viaVoice && <Badge tone="violet"><Mic size={9} />voice</Badge>}
            {n.tags.map((t) => <Badge key={t}>{t}</Badge>)}
            <div className="ml-auto flex gap-1">
              <button onClick={() => updateNote(n.id, { pinned: !n.pinned })} title={n.pinned ? "Unpin" : "Pin"} className="hover:text-fg">{n.pinned ? <PinOff size={12} /> : <Pin size={12} />}</button>
              <button onClick={() => deleteNote(n.id)} title="Delete" className="hover:text-bad"><Trash2 size={12} /></button>
            </div>
          </div>
          <div className="mt-1 text-[12.5px] whitespace-pre-wrap">{n.body}</div>
          {n.photoIds.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{n.photoIds.map((p) => <NotePhoto key={p} id={p} />)}</div>}
        </div>
      ))}
    </div>
  );
}

export { NotePhoto };
