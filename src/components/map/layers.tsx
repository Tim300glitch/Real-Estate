"use client";
import type { MapLayerMouseEvent, Marker, Popup } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { circlePolygon, haversineMiles, type LngLat } from "@/lib/geo";
import { PIN_STATUS, type PinStatus, type PropertySummary, type SearchArea } from "@/lib/types";
import { usd } from "@/lib/format";
import { FONT, useGeoJsonLayer, useMap } from "./PropertyMap";

// ─── colour scales ──────────────────────────────────────────────────
export type ColorMode = "status" | "motivation" | "equity" | "value" | "years_owned" | "absentee" | "last_sale" | "deal_score" | "list";

const ramp = (t: number) => {
  // perceptually ordered low→high: slate → blue → amber → red
  const stops = ["#64748b", "#3b82f6", "#22c55e", "#eab308", "#ef4444"];
  const x = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
  return stops[Math.floor(x)];
};

export const LEGENDS: Record<ColorMode, { label: string; items: { color: string; label: string }[] }> = {
  status: { label: "Lead status", items: (Object.keys(PIN_STATUS) as PinStatus[]).map((k) => ({ color: PIN_STATUS[k].color, label: PIN_STATUS[k].label })) },
  motivation: { label: "Seller motivation", items: [["#64748b", "0–19"], ["#3b82f6", "20–39"], ["#22c55e", "40–59"], ["#eab308", "60–79"], ["#ef4444", "80+"]].map(([color, label]) => ({ color, label })) },
  equity: { label: "Est. equity %", items: [["#64748b", "< 20%"], ["#3b82f6", "20–40%"], ["#22c55e", "40–60%"], ["#eab308", "60–80%"], ["#ef4444", "80%+"]].map(([color, label]) => ({ color, label })) },
  value: { label: "Est. value", items: [["#64748b", "< $250k"], ["#3b82f6", "$250–350k"], ["#22c55e", "$350–450k"], ["#eab308", "$450–600k"], ["#ef4444", "$600k+"]].map(([color, label]) => ({ color, label })) },
  years_owned: { label: "Ownership length", items: [["#64748b", "< 5 yrs"], ["#3b82f6", "5–10"], ["#22c55e", "10–20"], ["#eab308", "20–30"], ["#ef4444", "30+ yrs"]].map(([color, label]) => ({ color, label })) },
  absentee: { label: "Occupancy", items: [{ color: "#3b82f6", label: "Owner occupied" }, { color: "#eab308", label: "Absentee (in state)" }, { color: "#ef4444", label: "Out-of-state" }] },
  last_sale: { label: "Last sale", items: [["#ef4444", "< 1 yr"], ["#eab308", "1–3 yrs"], ["#22c55e", "3–10 yrs"], ["#3b82f6", "10–20 yrs"], ["#64748b", "20+ yrs"]].map(([color, label]) => ({ color, label })) },
  deal_score: { label: "Motivation × equity", items: [["#64748b", "low"], ["#3b82f6", ""], ["#22c55e", "medium"], ["#eab308", ""], ["#ef4444", "high"]].map(([color, label]) => ({ color, label })) },
  list: { label: "Saved list", items: [{ color: "#a855f7", label: "In selected list" }, { color: "#64748b", label: "Other" }] },
};

export function colorFor(p: PropertySummary, mode: ColorMode, status?: PinStatus, inList?: boolean): string {
  switch (mode) {
    case "status": return PIN_STATUS[status ?? "not_reviewed"].color;
    case "motivation": return ramp(p.motivationScore / 100);
    case "equity": return p.equityPct == null ? "#64748b" : ramp(p.equityPct / 100);
    case "value": { const v = p.estValue ?? 0; return v < 250000 ? "#64748b" : v < 350000 ? "#3b82f6" : v < 450000 ? "#22c55e" : v < 600000 ? "#eab308" : "#ef4444"; }
    case "years_owned": { const y = p.yearsOwned ?? 0; return y < 5 ? "#64748b" : y < 10 ? "#3b82f6" : y < 20 ? "#22c55e" : y < 30 ? "#eab308" : "#ef4444"; }
    case "absentee": return p.outOfState ? "#ef4444" : p.absentee ? "#eab308" : "#3b82f6";
    case "last_sale": { const y = p.lastSaleDate ? (Date.now() - new Date(p.lastSaleDate).getTime()) / 3.156e10 : 99; return y < 1 ? "#ef4444" : y < 3 ? "#eab308" : y < 10 ? "#22c55e" : y < 20 ? "#3b82f6" : "#64748b"; }
    case "deal_score": return ramp(((p.motivationScore / 100) * 0.6 + ((p.equityPct ?? 0) / 100) * 0.4));
    case "list": return inList ? "#a855f7" : "#64748b";
  }
}

// ─── PropertyLayer ──────────────────────────────────────────────────
export function PropertyLayer({ data, colorMode, statusById, listIds, selectedId, onSelect, heatmap, heatMetric = "density", cluster = true, showPins = true }: {
  data: PropertySummary[]; colorMode: ColorMode; statusById: Map<string, PinStatus>; listIds?: Set<string>; selectedId?: string | null;
  onSelect: (id: string) => void; heatmap?: boolean; heatMetric?: "density" | "motivation" | "value" | "equity"; cluster?: boolean; showPins?: boolean;
}) {
  const { map, ml } = useMap();
  const fc = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: data.map((p) => ({
      type: "Feature", id: p.id, geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id, color: colorFor(p, colorMode, statusById.get(p.id), listIds?.has(p.id)), line1: p.line1, value: p.estValue ?? 0,
        motivation: p.motivationScore, equity: p.equityPct ?? 0, lead: statusById.has(p.id) ? 1 : 0,
      },
    })),
  }), [data, colorMode, statusById, listIds]);

  const weightExpr = heatMetric === "motivation" ? ["/", ["get", "motivation"], 100] : heatMetric === "value" ? ["/", ["get", "value"], 800000] : heatMetric === "equity" ? ["/", ["get", "equity"], 100] : 0.6;

  // unclustered source for the heatmap (declared first so it renders beneath pins)
  useGeoJsonLayer("props-heat-src", fc, () => (heatmap ? [{
      id: "props-heat", type: "heatmap", source: "props-heat-src", maxzoom: 17,
      paint: {
        "heatmap-weight": weightExpr, "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 15, 1.4],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 10, 15, 26],
        "heatmap-opacity": 0.75,
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.2, "#3b82f6", 0.45, "#22c55e", 0.7, "#eab308", 1, "#ef4444"],
      },
} as never] : []), {}, [heatmap, heatMetric]);

  useGeoJsonLayer("props", fc, (glyphs) => [
    ...(showPins ? [
      { id: "props-cluster", type: "circle", source: "props", filter: ["has", "point_count"],
        paint: { "circle-color": "rgba(59,91,253,0.85)", "circle-stroke-color": "rgba(255,255,255,0.9)", "circle-stroke-width": 1.5,
          "circle-radius": ["step", ["get", "point_count"], 13, 25, 17, 100, 22, 400, 28] } },
      ...(glyphs ? [{ id: "props-cluster-count", type: "symbol", source: "props", filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": FONT, "text-size": 11 }, paint: { "text-color": "#fff" } } as never] : []),
      { id: "props-pt", type: "circle", source: "props", filter: ["!", ["has", "point_count"]],
        paint: { "circle-color": ["get", "color"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 3.5, 15, 6, 18, 9],
          "circle-stroke-color": ["case", ["==", ["get", "lead"], 1], "#ffffff", "rgba(10,12,18,0.55)"], "circle-stroke-width": ["case", ["==", ["get", "lead"], 1], 2, 1] } },
      { id: "props-sel", type: "circle", source: "props", filter: ["==", ["get", "id"], selectedId ?? "__none__"],
        paint: { "circle-color": "rgba(0,0,0,0)", "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 9, 16, 14], "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } },
    ] as never[] : []),
  ], cluster ? { cluster: true, clusterMaxZoom: 14, clusterRadius: 42 } : {}, [showPins, cluster]);


  // selection filter update without re-adding layers
  useEffect(() => {
    if (map?.getLayer("props-sel")) map.setFilter("props-sel", ["==", ["get", "id"], selectedId ?? "__none__"]);
  }, [map, selectedId]);

  // interactions
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  useEffect(() => {
    if (!map || !ml) return;
    let popup: Popup | null = null;
    const click = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (f?.properties?.id) onSelectRef.current(String(f.properties.id));
    };
    const clusterClick = async (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const src = map.getSource("props") as import("maplibre-gl").GeoJSONSource;
      const z = await src.getClusterExpansionZoom(f.properties!.cluster_id);
      map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z + 0.2 });
    };
    const enter = (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (!f || f.properties?.cluster) return;
      popup?.remove();
      popup = new ml.Popup({ closeButton: false, offset: 10, className: "pointer-events-none" })
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<div style="font-weight:600">${escapeHtml(String(f.properties?.line1))}</div><div style="opacity:.7">${usd(Number(f.properties?.value), { compact: true })} · motivation ${f.properties?.motivation}</div>`)
        .addTo(map);
    };
    const leave = () => { map.getCanvas().style.cursor = ""; popup?.remove(); popup = null; };
    map.on("click", "props-pt", click);
    map.on("click", "props-cluster", clusterClick);
    map.on("mouseenter", "props-pt", enter);
    map.on("mouseleave", "props-pt", leave);
    map.on("mouseenter", "props-cluster", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "props-cluster", leave);
    return () => {
      map.off("click", "props-pt", click);
      map.off("click", "props-cluster", clusterClick);
      map.off("mouseenter", "props-pt", enter);
      map.off("mouseleave", "props-pt", leave);
      popup?.remove();
    };
  }, [map, ml]);
  return null;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ─── ParcelLayer ────────────────────────────────────────────────────
export function ParcelLayer({ enabled, selectedId, onSelect }: { enabled: boolean; selectedId?: string | null; onSelect?: (id: string) => void }) {
  const { map } = useMap();
  const [fc, setFc] = useState<GeoJSON.FeatureCollection>({ type: "FeatureCollection", features: [] });
  const [zoomOk, setZoomOk] = useState(false);
  useEffect(() => {
    if (!map || !enabled) return;
    let t: ReturnType<typeof setTimeout>;
    const load = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const z = map.getZoom();
        setZoomOk(z >= 16);
        if (z < 16) return setFc({ type: "FeatureCollection", features: [] });
        const b = map.getBounds();
        try { setFc(await api.parcels([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])); } catch { /* ignore */ }
      }, 200);
    };
    load();
    map.on("moveend", load);
    return () => { map.off("moveend", load); clearTimeout(t); };
  }, [map, enabled]);
  useGeoJsonLayer("parcels", enabled ? fc : { type: "FeatureCollection", features: [] }, () => [
    { id: "parcel-fill", type: "fill", source: "parcels", paint: { "fill-color": ["case", ["==", ["get", "id"], selectedId ?? "__"], "rgba(59,91,253,0.28)", "rgba(255,255,255,0.04)"] } },
    { id: "parcel-line", type: "line", source: "parcels", paint: { "line-color": "#f59e0b", "line-width": ["interpolate", ["linear"], ["zoom"], 16, 0.6, 19, 1.6], "line-opacity": 0.85 } },
  ] as never[], {}, [selectedId]);
  useEffect(() => {
    if (!map || !onSelect) return;
    const click = (e: MapLayerMouseEvent) => { const id = e.features?.[0]?.properties?.id; if (id && !map.queryRenderedFeatures(e.point, { layers: ["props-pt"] }).length) onSelect(String(id)); };
    map.on("click", "parcel-fill", click);
    return () => { map.off("click", "parcel-fill", click); };
  }, [map, onSelect]);
  void zoomOk;
  return null;
}

// ─── SearchAreaLayer ────────────────────────────────────────────────
export function SearchAreaLayer({ area, color = "#3b5bfd" }: { area: SearchArea | null | undefined; color?: string }) {
  const fc = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!area || area.type === "bbox") return { type: "FeatureCollection", features: [] };
    const ring = area.type === "polygon" ? area.ring : circlePolygon(area.center, area.miles);
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
  }, [area]);
  useGeoJsonLayer("area", fc, () => [
    { id: "area-fill", type: "fill", source: "area", paint: { "fill-color": color, "fill-opacity": 0.07 } },
    { id: "area-line", type: "line", source: "area", paint: { "line-color": color, "line-width": 2, "line-dasharray": [2, 1.5] } },
  ] as never[], {}, [color]);
  return null;
}

// ─── DrawingTools ───────────────────────────────────────────────────
export function DrawingTools({ mode, onComplete, onCancel }: { mode: "polygon" | "radius" | null; onComplete: (a: SearchArea) => void; onCancel: () => void }) {
  const { map } = useMap();
  const [pts, setPts] = useState<LngLat[]>([]);
  const [cursor, setCursor] = useState<LngLat | null>(null);
  const fc = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    if (mode === "polygon" && pts.length) {
      const line = cursor ? [...pts, cursor] : pts;
      features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } });
      for (const p of pts) features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } });
    }
    if (mode === "radius" && pts.length === 1 && cursor) {
      const miles = haversineMiles(pts[0], cursor);
      features.push({ type: "Feature", properties: { label: `${miles.toFixed(2)} mi` }, geometry: { type: "Polygon", coordinates: [circlePolygon(pts[0], miles)] } });
      features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: pts[0] } });
    }
    return { type: "FeatureCollection", features };
  }, [mode, pts, cursor]);
  useGeoJsonLayer("draw", fc, () => [
    { id: "draw-fill", type: "fill", source: "draw", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#3b5bfd", "fill-opacity": 0.1 } },
    { id: "draw-line", type: "line", source: "draw", paint: { "line-color": "#3b5bfd", "line-width": 2 } },
    { id: "draw-pt", type: "circle", source: "draw", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#fff", "circle-stroke-color": "#3b5bfd", "circle-stroke-width": 2 } },
  ] as never[]);

  useEffect(() => { setPts([]); setCursor(null); }, [mode]);
  useEffect(() => {
    if (!map || !mode) return;
    map.doubleClickZoom.disable();
    map.getCanvas().style.cursor = "crosshair";
    const click = (e: import("maplibre-gl").MapMouseEvent) => {
      const p: LngLat = [e.lngLat.lng, e.lngLat.lat];
      if (mode === "radius") {
        setPts((cur) => {
          if (cur.length === 0) return [p];
          const miles = haversineMiles(cur[0], p);
          if (miles > 0.02) onComplete({ type: "radius", center: cur[0], miles: +miles.toFixed(3) });
          return [];
        });
      } else {
        setPts((cur) => {
          if (cur.length >= 3) {
            const first = map.project(cur[0] as [number, number]);
            if (Math.hypot(first.x - e.point.x, first.y - e.point.y) < 12) {
              onComplete({ type: "polygon", ring: [...cur, cur[0]] });
              return [];
            }
          }
          return [...cur, p];
        });
      }
    };
    const dbl = () => setPts((cur) => { if (cur.length >= 3) onComplete({ type: "polygon", ring: [...cur, cur[0]] }); return []; });
    const move = (e: import("maplibre-gl").MapMouseEvent) => setCursor([e.lngLat.lng, e.lngLat.lat]);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setPts([]); onCancel(); } if (e.key === "Enter" && mode === "polygon") dbl(); };
    map.on("click", click);
    map.on("dblclick", dbl);
    map.on("mousemove", move);
    window.addEventListener("keydown", key);
    return () => {
      map.off("click", click); map.off("dblclick", dbl); map.off("mousemove", move);
      window.removeEventListener("keydown", key);
      map.getCanvas().style.cursor = "";
      setTimeout(() => map.doubleClickZoom.enable(), 300);
    };
  }, [map, mode, onComplete, onCancel]);
  return null;
}

// ─── CompLayer ──────────────────────────────────────────────────────
export interface CompPin { id: string; lat: number; lng: number; price: number; included: boolean; label: string; similarity: number; index: number }

export function CompLayer({ subject, comps, radiusMiles, showLines = true, selectedId, onSelect }: {
  subject: { lat: number; lng: number; label: string }; comps: CompPin[]; radiusMiles?: number; showLines?: boolean; selectedId?: string | null; onSelect?: (id: string) => void;
}) {
  const { map, ml } = useMap();
  const fc = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: [
      ...(radiusMiles ? [{ type: "Feature" as const, properties: { kind: "radius" }, geometry: { type: "Polygon" as const, coordinates: [circlePolygon([subject.lng, subject.lat], radiusMiles)] } }] : []),
      ...(showLines ? comps.filter((c) => c.included).map((c) => ({ type: "Feature" as const, properties: { kind: "line" }, geometry: { type: "LineString" as const, coordinates: [[subject.lng, subject.lat], [c.lng, c.lat]] } })) : []),
    ],
  }), [subject.lat, subject.lng, comps, radiusMiles, showLines]);
  useGeoJsonLayer("comp-geo", fc, () => [
    { id: "comp-radius-fill", type: "fill", source: "comp-geo", filter: ["==", ["get", "kind"], "radius"], paint: { "fill-color": "#3b5bfd", "fill-opacity": 0.05 } },
    { id: "comp-radius-line", type: "line", source: "comp-geo", filter: ["==", ["get", "kind"], "radius"], paint: { "line-color": "#3b5bfd", "line-width": 1.5, "line-dasharray": [3, 2] } },
    { id: "comp-lines", type: "line", source: "comp-geo", filter: ["==", ["get", "kind"], "line"], paint: { "line-color": "#22c55e", "line-width": 1.2, "line-opacity": 0.6 } },
  ] as never[]);

  const markers = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  useEffect(() => {
    if (!map || !ml) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const subj = document.createElement("div");
    subj.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-6px)"><div style="background:#ef4444;color:#fff;font:600 11px Inter,system-ui;padding:2px 6px;border-radius:5px;box-shadow:0 2px 6px rgba(0,0,0,.35);white-space:nowrap">SUBJECT</div><div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:3px solid #fff;margin-top:2px;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div></div>`;
    markers.current.push(new ml.Marker({ element: subj, anchor: "bottom" }).setLngLat([subject.lng, subject.lat]).addTo(map));
    for (const c of comps) {
      const el = document.createElement("button");
      const sel = c.id === selectedId;
      el.style.cssText = `display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:999px;font:600 11px Inter,system-ui;white-space:nowrap;cursor:pointer;
        background:${c.included ? (sel ? "#3b5bfd" : "#16a34a") : "#6b7280"};color:#fff;border:2px solid ${sel ? "#fff" : "rgba(255,255,255,.85)"};
        box-shadow:0 1px 4px rgba(0,0,0,.4);opacity:${c.included ? 1 : 0.6}`;
      el.textContent = `${c.index} · ${usd(c.price, { compact: true })}`;
      el.title = `${c.label} — ${c.similarity}% match`;
      el.onclick = (ev) => { ev.stopPropagation(); onSelectRef.current?.(c.id); };
      markers.current.push(new ml.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map));
    }
    return () => { markers.current.forEach((m) => m.remove()); markers.current = []; };
  }, [map, ml, subject.lat, subject.lng, comps, selectedId]);
  return null;
}

// ─── UserLocation ───────────────────────────────────────────────────
export function UserLocation({ position, follow }: { position: LngLat | null; follow?: boolean }) {
  const { map, ml } = useMap();
  const marker = useRef<Marker | null>(null);
  useEffect(() => {
    if (!map || !ml || !position) return;
    if (!marker.current) {
      const el = document.createElement("div");
      el.style.cssText = "width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 6px rgba(59,130,246,.25)";
      marker.current = new ml.Marker({ element: el }).setLngLat(position).addTo(map);
    } else marker.current.setLngLat(position);
    if (follow) map.easeTo({ center: position, duration: 500 });
  }, [map, ml, position, follow]);
  useEffect(() => () => { marker.current?.remove(); marker.current = null; }, []);
  return null;
}

export function RouteLayer({ points }: { points: LngLat[] }) {
  const fc = useMemo<GeoJSON.FeatureCollection>(() => ({ type: "FeatureCollection", features: points.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points } }] : [] }), [points]);
  useGeoJsonLayer("route", fc, () => [{ id: "route-line", type: "line", source: "route", paint: { "line-color": "#06b6d4", "line-width": 3, "line-opacity": 0.8 } }] as never[]);
  return null;
}

export function MapLegend({ mode, extra }: { mode: ColorMode; extra?: React.ReactNode }) {
  const l = LEGENDS[mode];
  return (
    <div className="rounded-lg border border-border bg-panel/95 backdrop-blur px-2.5 py-2 shadow-panel text-[11px] max-w-[200px]">
      <div className="font-semibold text-[10.5px] uppercase tracking-wide text-muted mb-1">{l.label}</div>
      <div className="space-y-0.5">
        {l.items.filter((i) => i.label).map((i) => (
          <div key={i.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-white/60" style={{ background: i.color }} />{i.label}</div>
        ))}
      </div>
      {extra}
    </div>
  );
}
