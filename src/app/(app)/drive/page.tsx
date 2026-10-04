"use client";
import { Camera, Crosshair, History, LocateFixed, Play, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PropertyLayer, RouteLayer, UserLocation } from "@/components/map/layers";
import { PropertyMap } from "@/components/map/PropertyMap";
import { Badge, Button, cx } from "@/components/ui";
import { useSearch } from "@/lib/client/api";
import { savePhotos } from "@/lib/client/photos";
import { haversineMiles, type LngLat } from "@/lib/geo";
import { dateTime, relative } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";
import type { PinStatus, PropertySummary } from "@/lib/types";

const TAGS = ["Distressed", "Vacant", "Overgrown", "Boarded Windows", "Roof Damage", "Fire Damage", "Code Issue", "For Sale By Owner", "Other"];

export default function Drive() {
  const ws = useWorkspace();
  const toast = useUI((s) => s.toast);
  const [pos, setPos] = useState<LngLat | null>(null);
  const [gps, setGps] = useState<"off" | "on" | "denied" | "manual">("off");
  const [follow, setFollow] = useState(true);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<PropertySummary | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [history, setHistory] = useState(false);
  const [center, setCenter] = useState<LngLat>([-121.4405, 38.5165]);
  const watch = useRef<number | null>(null);
  const cam = useRef<HTMLInputElement>(null);
  const route = ws.routes.find((r) => r.id === routeId);

  const startGps = () => {
    if (!navigator.geolocation) { setGps("manual"); return; }
    watch.current = navigator.geolocation.watchPosition(
      (p) => { setPos([p.coords.longitude, p.coords.latitude]); setGps("on"); },
      () => { setGps("denied"); },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  };
  useEffect(() => { startGps(); return () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); }; }, []);
  const here: LngLat = gps === "on" && pos ? pos : center;
  useEffect(() => { if (routeId && gps === "on" && pos) ws.addRoutePoint(routeId, pos); }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data } = useSearch({ filters: {}, area: { type: "radius", center: here, miles: 0.25 }, limit: 400 }, 400);
  const nearby = useMemo(() => (data?.results ?? []).map((p) => ({ p, d: haversineMiles(here, [p.lng, p.lat]) })).sort((a, b) => a.d - b.d).slice(0, 12), [data, here]);
  const statusById = useMemo(() => new Map<string, PinStatus>(ws.leads.filter((l) => !l.deletedAt).map((l) => [l.propertyId, l.status])), [ws.leads]);
  const onSelect = useCallback((id: string) => { const p = data?.results.find((x) => x.id === id); if (p) { setSelected(p); setTags([]); setNote(""); setPhotos([]); } }, [data]);

  const save = () => {
    if (!selected) return;
    const existing = ws.leads.find((l) => l.propertyId === selected.id && !l.deletedAt);
    const lead = existing ?? ws.saveLead(selected, { source: "driving_for_dollars", campaignId: "cp_d4d", tags: ["Driving for Dollars"], status: "potential" });
    for (const t of ["Driving for Dollars", ...tags.filter((t) => ["Distressed", "Vacant"].includes(t))]) if (!useWorkspace.getState().leads.find((l) => l.id === lead.id)?.tags.includes(t)) ws.toggleTag(lead.id, t);
    ws.addNote({ entityType: "lead", entityId: lead.id, body: `D4D: ${tags.join(", ") || "added"}${note ? ` — ${note}` : ""}\n📍 ${here[1].toFixed(5)}, ${here[0].toFixed(5)} · ${dateTime(new Date().toISOString())}`, pinned: false, tags: ["d4d", ...tags.map((t) => t.toLowerCase())], viaVoice: false, photoIds: photos });
    if (routeId) ws.tagRouteProperty(routeId, selected.id);
    const list = ws.lists.find((l) => l.name === "Driving for Dollars");
    if (list) ws.addToList(list.id, [selected]);
    toast(`Saved — ${selected.line1}`);
    setSelected(null);
  };

  return (
    <div className="h-full relative">
      <PropertyMap center={here} zoom={16.5} onViewport={(_b, _z, c) => { if (gps !== "on") setCenter(c); }}>
        <PropertyLayer data={data?.results ?? []} colorMode="status" statusById={statusById} selectedId={selected?.id} onSelect={onSelect} cluster={false} />
        {route && <RouteLayer points={route.points.map((p) => [p[0], p[1]] as LngLat)} />}
        <UserLocation position={gps === "on" ? pos : null} follow={follow && gps === "on"} />
      </PropertyMap>
      {gps !== "on" && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 text-accent"><Crosshair size={28} /></div>}

      <div className="absolute top-2 left-2 right-2 z-10 flex flex-wrap items-center gap-2">
        <div className="rounded-lg border border-border bg-panel/95 backdrop-blur px-2.5 py-1.5 shadow-panel text-[12px] flex items-center gap-2">
          <LocateFixed size={14} className={gps === "on" ? "text-good" : "text-muted"} />
          {gps === "on" ? "GPS live" : gps === "denied" ? "GPS unavailable — pan the map; crosshair = your position" : "Locating…"}
          {gps === "on" && <button className={cx("text-[11px] rounded px-1.5", follow ? "bg-accent-soft text-accent-text" : "text-muted")} onClick={() => setFollow((f) => !f)}>follow</button>}
        </div>
        {routeId ? (
          <Button size="lg" variant="danger" icon={<Square size={16} />} onClick={() => { ws.endRoute(routeId); setRouteId(null); toast("Route saved"); }}>Stop route ({route?.points.length ?? 0} pts)</Button>
        ) : (
          <Button size="lg" variant="primary" icon={<Play size={16} />} onClick={() => setRouteId(ws.startRoute())}>Start drive</Button>
        )}
        <Button size="lg" icon={<History size={16} />} onClick={() => setHistory(true)}>Routes</Button>
      </div>

      {!selected && (
        <div className="absolute bottom-16 md:bottom-3 left-2 right-2 z-10 rounded-xl border border-border bg-panel/95 backdrop-blur shadow-pop max-h-[38%] overflow-y-auto">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted sticky top-0 bg-panel/95">Nearby — tap to tag</div>
          {nearby.map(({ p, d }) => (
            <button key={p.id} onClick={() => onSelect(p.id)} className="flex w-full items-center gap-3 px-3 h-14 border-t border-border text-left active:bg-hover">
              <div className="min-w-0 flex-1"><div className="text-[14px] font-medium truncate">{p.line1}</div><div className="text-[12px] text-muted truncate">{p.ownerName} · {Math.round(d * 5280)} ft</div></div>
              {statusById.has(p.id) && <Badge tone="accent">lead</Badge>}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-2xl border-t border-border bg-panel shadow-pop p-4 pb-20 md:pb-4 max-h-[78%] overflow-y-auto anim-fade">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1"><div className="text-[17px] font-semibold">{selected.line1}</div><div className="text-[13px] text-muted">{selected.ownerName} · {selected.absentee ? "absentee" : "owner occ."} · built {selected.yearBuilt}</div></div>
            <button onClick={() => setSelected(null)} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-hover"><X size={20} /></button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {TAGS.map((t) => (
              <button key={t} onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}
                className={cx("h-14 rounded-xl border text-[13px] font-medium", tags.includes(t) ? "bg-accent text-white border-accent" : "border-border bg-panel-2 active:bg-hover")}>{t}</button>
            ))}
          </div>
          <textarea className="input mt-3 text-[15px]" rows={2} placeholder="Notes (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="lg" icon={<Camera size={18} />} onClick={() => cam.current?.click()}>Photo{photos.length ? ` (${photos.length})` : ""}</Button>
            <Button size="lg" variant="primary" onClick={save}>Add property</Button>
          </div>
          <input ref={cam} type="file" accept="image/*" capture="environment" multiple hidden onChange={async (e) => { if (e.target.files) setPhotos([...photos, ...(await savePhotos(e.target.files))]); }} />
          <div className="mt-2 text-[11px] text-muted">Records property, GPS location, date/time, user and route automatically.</div>
        </div>
      )}

      {history && (
        <div className="absolute inset-0 z-30 bg-panel p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3"><div className="text-[17px] font-semibold">Route history</div><button onClick={() => setHistory(false)} className="h-10 w-10 flex items-center justify-center"><X size={20} /></button></div>
          {ws.routes.length === 0 && <div className="text-muted text-[13px]">No drives recorded yet.</div>}
          {ws.routes.map((r) => {
            let miles = 0;
            for (let i = 1; i < r.points.length; i++) miles += haversineMiles([r.points[i - 1][0], r.points[i - 1][1]], [r.points[i][0], r.points[i][1]]);
            return (
              <div key={r.id} className="rounded-lg border border-border p-3 mb-2 text-[13px]">
                <div className="font-medium">{dateTime(r.startedAt)}{!r.endedAt && <Badge tone="good" className="ml-2">active</Badge>}</div>
                <div className="text-muted">{miles.toFixed(2)} mi · {r.points.length} GPS points · {r.taggedPropertyIds.length} properties tagged · {r.endedAt ? `ended ${relative(r.endedAt)}` : "in progress"}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
