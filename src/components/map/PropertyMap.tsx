"use client";
// ════════════════════════════════════════════════════════════════════
// Map architecture
//   PropertyMap      – owns the map instance + basemap; provides context
//   PropertyLayer    – clustered pins / heatmap for search results
//   ParcelLayer      – parcel polygons at high zoom (lazy, bbox-loaded)
//   CompLayer        – subject + comps, radius ring, connector lines
//   SearchAreaLayer  – renders the active polygon / radius search area
//   DrawingTools     – polygon + radius drawing
//   UserLocation     – live GPS dot (driving for dollars)
// Only this folder imports maplibre-gl. Swapping to Google Maps / Mapbox
// means re-implementing these components against the same props.
// ════════════════════════════════════════════════════════════════════
import type { Map as MLMap, StyleSpecification } from "maplibre-gl";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../ui";

type ML = typeof import("maplibre-gl");
interface Ctx { map: MLMap | null; ml: ML | null; styleRev: number; hasGlyphs: boolean }
const MapCtx = createContext<Ctx>({ map: null, ml: null, styleRev: 0, hasGlyphs: false });
export const useMap = () => useContext(MapCtx);

export type Basemap = "street" | "satellite" | "hybrid";

const STREET = process.env.NEXT_PUBLIC_MAP_STREET_STYLE || "https://tiles.openfreemap.org/styles/liberty";
const SAT_TILES = process.env.NEXT_PUBLIC_MAP_SATELLITE_TILES || "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const FONT = ["Noto Sans Regular"];
const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs"; // copied from node_modules by scripts/copy-maplibre-worker.mjs

function rasterStyle(hybrid: boolean): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      sat: { type: "raster", tiles: [SAT_TILES], tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
      ...(hybrid ? {
        roads: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19 },
        labels: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19 },
      } : {}),
    },
    layers: [
      { id: "sat", type: "raster", source: "sat" },
      ...(hybrid ? [{ id: "roads", type: "raster" as const, source: "roads" }, { id: "labels", type: "raster" as const, source: "labels" }] : []),
    ],
  };
}

/** Used when basemap tiles can't be reached (offline / blocked network): data layers keep working. */
function offlineStyle(dark: boolean): StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": dark ? "#10141b" : "#eef0f3" } }] };
}

export function PropertyMap({ center, zoom, basemap = "street", onViewport, onReady, children, className, interactive = true, fitTo }: {
  center: [number, number]; zoom: number; basemap?: Basemap; className?: string; interactive?: boolean;
  onViewport?: (bbox: [number, number, number, number], zoom: number, center: [number, number]) => void;
  onReady?: (map: MLMap) => void; children?: ReactNode; fitTo?: [number, number, number, number] | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<Ctx>({ map: null, ml: null, styleRev: 0, hasGlyphs: false });
  const [offline, setOffline] = useState(false);
  const onViewportRef = useRef(onViewport);
  onViewportRef.current = onViewport;

  useEffect(() => {
    let map: MLMap | null = null;
    let cancelled = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !el.current) return;
      if (ml.getWorkerUrl() !== WORKER_URL) ml.setWorkerUrl(WORKER_URL);
      const dark = document.documentElement.classList.contains("dark");
      map = new ml.Map({
        container: el.current, style: basemap === "street" ? STREET : rasterStyle(basemap === "hybrid"), center, zoom,
        attributionControl: { compact: true }, interactive, maxZoom: 20, dragRotate: false, pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      (window as unknown as { __wosMap?: MLMap }).__wosMap = map; // handy for debugging / e2e tests
      if (interactive) {
        map.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
        map.addControl(new ml.ScaleControl({ unit: "imperial" }), "bottom-left");
      }
      let loaded = false;
      const fallback = () => {
        if (loaded || cancelled || !map) return;
        loaded = true;
        setOffline(true);
        map.setStyle(offlineStyle(dark));
      };
      const timer = setTimeout(fallback, 7000);
      map.on("error", (e) => {
        const msg = String((e as { error?: { message?: string } }).error?.message ?? "");
        if (!loaded && /style|Failed to fetch|NetworkError|load/i.test(msg)) { clearTimeout(timer); fallback(); }
      });
      let inited = false;
      map.on("style.load", () => {
        loaded = true;
        clearTimeout(timer);
        if (!inited) {
          inited = true;
          setCtx({ map, ml, styleRev: 1, hasGlyphs: !!map!.getStyle()?.glyphs });
          onReady?.(map!);
          setTimeout(emit, 0);
        } else {
          setCtx((c) => ({ ...c, styleRev: c.styleRev + 1, hasGlyphs: !!map?.getStyle()?.glyphs }));
        }
      });
      const emit = () => {
        if (!map) return;
        const b = map.getBounds();
        const c = map.getCenter();
        onViewportRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom(), [c.lng, c.lat]);
      };
      map.on("moveend", emit);
    })();
    return () => { cancelled = true; map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // basemap switching
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!ctx.map || offline) return;
    ctx.map.setStyle(basemap === "street" ? STREET : rasterStyle(basemap === "hybrid"));
  }, [basemap, ctx.map, offline]);

  useEffect(() => {
    if (ctx.map && fitTo) ctx.map.fitBounds([[fitTo[0], fitTo[1]], [fitTo[2], fitTo[3]]], { padding: 60, maxZoom: 16, duration: 600 });
  }, [ctx.map, fitTo]);

  return (
    <div className={cx("relative h-full w-full", className)}>
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
      {offline && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-2 z-10 rounded-md border border-border bg-panel/95 px-2.5 py-1 text-[11px] text-muted shadow-panel">
          Basemap tiles unreachable from this network — showing data layers only
        </div>
      )}
      <MapCtx.Provider value={ctx}>{ctx.map && children}</MapCtx.Provider>
    </div>
  );
}

/** Helper: (re)create a GeoJSON source + layers whenever the style reloads. */
export function useGeoJsonLayer(
  sourceId: string,
  data: GeoJSON.FeatureCollection,
  layers: (hasGlyphs: boolean) => import("maplibre-gl").AddLayerObject[],
  sourceOptions: Record<string, unknown> = {},
  deps: unknown[] = [],
) {
  const { map, styleRev, hasGlyphs } = useMap();
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    if (!map) return;
    const add = () => {
      if (!map.getStyle()) return;
      if (!map.getSource(sourceId)) map.addSource(sourceId, { type: "geojson", data: dataRef.current, ...sourceOptions } as never);
      for (const l of layers(hasGlyphs)) if (!map.getLayer(l.id)) map.addLayer(l);
    };
    if (map.isStyleLoaded()) add(); else map.once("idle", add);
    return () => {
      if (!map.getStyle()) return;
      for (const l of layers(hasGlyphs)) if (map.getLayer(l.id)) map.removeLayer(l.id);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, styleRev, hasGlyphs, ...deps]);
  useEffect(() => {
    const src = map?.getSource(sourceId) as import("maplibre-gl").GeoJSONSource | undefined;
    src?.setData(data);
  }, [map, data, sourceId]);
}
