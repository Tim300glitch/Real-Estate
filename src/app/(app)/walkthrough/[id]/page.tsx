"use client";
import { ArrowLeft, Camera, Check, Mic, MicOff, Video } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { NotePhoto } from "@/components/crm/Comms";
import { useRepairEstimate } from "@/components/deal/RepairEstimator";
import { toSummaryClient } from "@/components/property/PropertyPanel";
import { Badge, Button, cx } from "@/components/ui";
import { CONDITIONS, ROOM_CATEGORIES, WALKTHROUGH_ROOMS, catalogUnitCost, newRepairItem } from "@/lib/calc/repairs";
import { useProperty } from "@/lib/client/api";
import { putMedia, savePhotos, speechSupported, startDictation } from "@/lib/client/photos";
import { usd } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import type { Condition, WalkthroughRoom } from "@/lib/types";

// share of whole-house square footage a room represents (for per-sf items)
const ROOM_SHARE: Record<string, number> = { "Living Room": 0.2, Kitchen: 0.12, "Bedroom 1": 0.12, "Bedroom 2": 0.11, "Bedroom 3": 0.1, Bathroom: 0.06 };

export default function Walkthrough() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useUI((s) => s.toast);
  const { data: rec } = useProperty(decodeURIComponent(id));
  const subject = useMemo(() => (rec ? toSummaryClient(rec) : null), [rec]);
  const r = useRepairEstimate(subject ?? ({ id: "", sqft: 0 } as never));
  const [roomName, setRoomName] = useState(WALKTHROUGH_ROOMS[0]);
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop(): void } | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  if (!subject) return <div className="p-6 text-muted">Loading…</div>;

  const rooms: WalkthroughRoom[] = WALKTHROUGH_ROOMS.map((n) => r.est?.walkthrough.find((x) => x.name === n) ?? { id: n, name: n, notes: "", photoIds: [], voiceNotes: [], repairItemIds: [] });
  const room = rooms.find((x) => x.name === roomName)!;
  const saveRoom = (patch: Partial<WalkthroughRoom>, items = r.items) => {
    const next = rooms.map((x) => (x.name === roomName ? { ...x, ...patch } : x)).filter((x) => x.rating || x.notes || x.photoIds.length || x.voiceNotes.length || x.repairItemIds.length || x.name === roomName);
    r.save({ walkthrough: next, items });
  };
  const roomItems = r.items.filter((i) => i.room === roomName);

  const toggleRepair = (category: string, condition: Condition) => {
    const existing = roomItems.find((i) => i.category === category);
    if (existing && existing.condition === condition) {
      saveRoom({ repairItemIds: room.repairItemIds.filter((x) => x !== existing.id) }, r.items.filter((i) => i.id !== existing.id));
      return;
    }
    if (existing) {
      const items = r.items.map((i) => (i.id === existing.id ? { ...i, condition, unitCost: catalogUnitCost(category, condition, r.multiplier) } : i));
      saveRoom({}, items);
      return;
    }
    const item = newRepairItem(category, condition, r.ctx, r.multiplier, roomName);
    if (item.unit === "sqft" && ROOM_SHARE[roomName]) item.quantity = Math.round((subject.sqft ?? 1500) * ROOM_SHARE[roomName]);
    saveRoom({ repairItemIds: [...room.repairItemIds, item.id] }, [...r.items, item]);
  };

  return (
    <div className="max-w-[760px] mx-auto pb-24">
      <div className="sticky top-0 z-10 bg-panel border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-hover"><ArrowLeft size={20} /></button>
        <div className="min-w-0 flex-1"><div className="text-[15px] font-semibold truncate">Walkthrough · {subject.line1}</div><div className="text-[12px] text-muted">{subject.beds}bd/{subject.baths}ba · {subject.sqft?.toLocaleString()} sf</div></div>
        <div className="text-right"><div className="text-[10.5px] uppercase text-muted">Rehab (expected)</div><div className="text-[18px] font-semibold num">{usd(r.totals.expected)}</div></div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto px-4 py-3">
        {rooms.map((x) => (
          <button key={x.name} onClick={() => setRoomName(x.name)} className={cx("h-11 shrink-0 rounded-full border px-4 text-[13px] font-medium", x.name === roomName ? "bg-accent text-white border-accent" : "border-border bg-panel")}>
            {x.name}{(x.rating || x.repairItemIds.length > 0) && <Check size={13} className="inline ml-1 -mt-0.5" />}
          </button>
        ))}
      </div>
      <div className="px-4 space-y-4">
        <section>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2">Condition</div>
          <div className="grid grid-cols-5 gap-1.5">
            {CONDITIONS.map((c) => <button key={c.id} onClick={() => saveRoom({ rating: c.id })} className={cx("h-14 rounded-xl border text-[12.5px] font-medium", room.rating === c.id ? "bg-accent text-white border-accent" : "border-border bg-panel-2")}>{c.label}</button>)}
          </div>
        </section>
        <section>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2">Repairs needed — tap condition to add, tap again to remove</div>
          <div className="space-y-2">
            {(ROOM_CATEGORIES[roomName] ?? []).map((cat) => {
              const it = roomItems.find((i) => i.category === cat);
              return (
                <div key={cat} className="rounded-xl border border-border p-2.5">
                  <div className="flex items-center justify-between text-[14px] font-medium">{cat}{it && <span className="num text-good">{usd(it.quantity * it.unitCost)}</span>}</div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {CONDITIONS.filter((c) => c.id !== "good").map((c) => (
                      <button key={c.id} onClick={() => toggleRepair(cat, c.id)} className={cx("h-11 rounded-lg border text-[12px]", it?.condition === c.id ? "bg-accent-soft border-accent text-accent-text font-semibold" : "border-border")}>{c.label === "Full Replacement" ? "Replace" : c.label}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2">Notes</div>
          <textarea className="input text-[15px]" rows={3} value={room.notes} onChange={(e) => saveRoom({ notes: e.target.value })} placeholder={`What did you see in the ${roomName.toLowerCase()}?`} />
          {room.voiceNotes.map((v, i) => <div key={i} className="mt-1 text-[13px] rounded bg-violet-soft px-2 py-1"><Mic size={12} className="inline mr-1" />{v}</div>)}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Button size="lg" variant={listening ? "danger" : "secondary"} disabled={!speechSupported()} icon={listening ? <MicOff size={18} /> : <Mic size={18} />} onClick={() => {
              if (listening) { recRef.current?.stop(); return; }
              let last = "";
              recRef.current = startDictation((t, final) => { last = t; if (final) { saveRoom({ voiceNotes: [...room.voiceNotes, last] }); } }, () => setListening(false));
              setListening(true);
            }}>{listening ? "Stop" : "Voice note"}</Button>
            <Button size="lg" icon={<Camera size={18} />} onClick={() => photoRef.current?.click()}>Photo</Button>
            <Button size="lg" icon={<Video size={18} />} onClick={() => videoRef.current?.click()}>Video</Button>
          </div>
          {!speechSupported() && <div className="mt-1 text-[11px] text-muted">Voice-to-text uses the browser speech API (Chrome/Safari).</div>}
          <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={async (e) => { if (e.target.files) saveRoom({ photoIds: [...room.photoIds, ...(await savePhotos(e.target.files))] }); }} />
          <input ref={videoRef} type="file" accept="video/*" capture="environment" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 25 * 1024 * 1024) return toast("Video over 25 MB — in production videos upload to object storage", "bad");
            const id = `vid_${Date.now().toString(36)}`;
            const url = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(f); });
            await putMedia(id, url);
            saveRoom({ voiceNotes: [...room.voiceNotes, `🎥 video saved (${(f.size / 1e6).toFixed(1)} MB)`] });
            toast("Video saved");
          }} />
          {room.photoIds.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{room.photoIds.map((p) => <NotePhoto key={p} id={p} />)}</div>}
        </section>
        <section className="rounded-xl border border-border p-3">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-1">Estimate summary</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[["Low", r.totals.low], ["Expected", r.totals.expected], ["High", r.totals.high]].map(([k, v]) => <div key={k as string}><div className="text-[11px] text-muted">{k}</div><div className="text-[16px] font-semibold num">{usd(v as number)}</div></div>)}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">{r.items.map((i) => <Badge key={i.id}>{i.room ? `${i.room}: ` : ""}{i.category} {usd(i.quantity * i.unitCost, { compact: true })}</Badge>)}</div>
          <div className="mt-3 flex gap-2"><Button href={`/deal-desk/${subject.id}`} variant="primary">Open Deal Desk</Button><Button href={`/properties/${subject.id}?tab=repairs`}>Edit line items</Button></div>
        </section>
      </div>
    </div>
  );
}
