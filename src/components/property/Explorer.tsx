"use client";
import { BookmarkPlus, Circle, Eraser, Flame, Layers, PanelLeftClose, PanelLeftOpen, PanelRightClose, Pentagon, Save, Search, SquareDashed, Download } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearch } from "@/lib/client/api";
import { describeFilters } from "@/lib/filters";
import { num, pct100, usd } from "@/lib/format";
import { ringAreaSqMiles } from "@/lib/geo";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";
import { PIN_STATUS, PROPERTY_TYPE_LABEL, type PinStatus, type PropertyFilters, type PropertySummary, type SearchArea, type SearchRequest } from "@/lib/types";
import { DrawingTools, MapLegend, ParcelLayer, PropertyLayer, SearchAreaLayer, type ColorMode } from "../map/layers";
import { PropertyMap, type Basemap } from "../map/PropertyMap";
import { Badge, Button, Dialog, Menu, MenuItem, Segmented, Toggle, cx } from "../ui";
import { AddToListMenu, PropertyQuickCard } from "./PropertyPanel";
import { FilterPanel } from "./FilterPanel";

const ZIPS = ["95608", "95610", "95660", "95670", "95758", "95817", "95818", "95820", "95821", "95822", "95823", "95824", "95827", "95828", "95832", "95834", "95838"];
const CITIES = ["Sacramento", "Carmichael", "Citrus Heights", "Elk Grove", "North Highlands", "Rancho Cordova"];

const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: "status", label: "Lead status" }, { value: "motivation", label: "Seller motivation" }, { value: "equity", label: "Equity" },
  { value: "value", label: "Estimated value" }, { value: "years_owned", label: "Ownership length" }, { value: "absentee", label: "Absentee ownership" },
  { value: "last_sale", label: "Last sale" }, { value: "deal_score", label: "Motivation × equity" }, { value: "list", label: "Saved list" },
];

export function Explorer({ variant }: { variant: "map" | "finder" }) {
  const params = useSearchParams();
  const router = useRouter();
  const ws = useWorkspace();
  const { toast } = useUI();
  const [filters, setFilters] = useState<PropertyFilters>(() => {
    try { return params.get("filters") ? JSON.parse(params.get("filters")!) : variant === "finder" ? { absentee: "yes", minYearsOwned: 15, minEquityPct: 60, propertyTypes: ["sfr"], maxYearBuilt: 1990 } : {}; } catch { return {}; }
  });
  const [area, setArea] = useState<SearchArea | null>(null);
  const [viewport, setViewport] = useState<{ bbox: [number, number, number, number]; zoom: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(params.get("focus"));
  const [basemap, setBasemap] = useState<Basemap>("street");
  const [colorMode, setColorMode] = useState<ColorMode>("status");
  const [heatmap, setHeatmap] = useState(false);
  const [heatMetric, setHeatMetric] = useState<"density" | "motivation" | "value" | "equity">("density");
  const [parcels, setParcels] = useState(true);
  const [pins, setPins] = useState(true);
  const [draw, setDraw] = useState<"polygon" | "radius" | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [listOverlay, setListOverlay] = useState<string>("");
  const [saveOpen, setSaveOpen] = useState<"search" | "area" | null>(null);
  const [saveName, setSaveName] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SearchRequest["sort"]>("motivation");
  const [fitTo, setFitTo] = useState<[number, number, number, number] | null>(null);

  const request = useMemo<SearchRequest | null>(() => {
    if (!viewport && !area) return null;
    return { filters, area: area ?? undefined, bbox: area ? undefined : viewport?.bbox, limit: 5000, sort };
  }, [filters, area, viewport, sort]);
  const { data, loading, error } = useSearch(request, 200);
  const results = useMemo(() => data?.results ?? [], [data]);

  const statusById = useMemo(() => {
    const m = new Map<string, PinStatus>();
    for (const l of ws.leads) if (!l.deletedAt) m.set(l.propertyId, l.status);
    return m;
  }, [ws.leads]);
  const listIds = useMemo(() => new Set(ws.lists.find((l) => l.id === listOverlay)?.propertyIds ?? []), [ws.lists, listOverlay]);

  useEffect(() => { if (selected) setRightOpen(true); }, [selected]);
  const onSelect = useCallback((id: string) => { setSelected(id); }, []);
  const onComplete = useCallback((a: SearchArea) => { setArea(a); setDraw(null); }, []);
  const onCancel = useCallback(() => setDraw(null), []);

  const focus = params.get("focus");
  const initialCenter: [number, number] = [Number(params.get("lng")) || -121.425, Number(params.get("lat")) || 38.565];
  const initialZoom = Number(params.get("z")) || (focus ? 16 : 11.2);

  const saveLeads = (rows: PropertySummary[]) => {
    let n = 0;
    for (const r of rows) if (!statusById.has(r.id)) { ws.saveLead(r, { source: "deal_finder" }); n++; }
    toast(n ? `${n} lead${n === 1 ? "" : "s"} saved` : "All selected are already leads", n ? "good" : "info");
    setChecked(new Set());
  };
  const exportCsv = (rows: PropertySummary[]) => {
    const head = ["address", "city", "zip", "apn", "owner", "type", "beds", "baths", "sqft", "year_built", "est_value", "equity_pct", "years_owned", "absentee", "motivation", "source"];
    const lines = rows.map((r) => [r.line1, r.city, r.zip, r.apn, r.ownerName, r.propertyType, r.beds, r.baths, r.sqft, r.yearBuilt, r.estValue, r.equityPct, r.yearsOwned, r.absentee, r.motivationScore, r.synthetic ? "demo-synthetic" : "provider"].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `properties-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const checkedRows = results.filter((r) => checked.has(r.id));
  const areaLabel = area?.type === "polygon" ? `Polygon · ${ringAreaSqMiles(area.ring).toFixed(2)} sq mi` : area?.type === "radius" ? `Radius · ${area.miles.toFixed(2)} mi` : null;

  const toolbar = (
    <div className="absolute left-2 right-2 top-2 z-10 flex flex-wrap items-center gap-1.5 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-panel/95 backdrop-blur p-1 shadow-panel">
        <button onClick={() => setLeftOpen((o) => !o)} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-hover text-fg-2" title="Toggle filters">{leftOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}</button>
        <Segmented size="xs" value={basemap} onChange={setBasemap} options={[{ value: "street", label: "Street" }, { value: "satellite", label: "Satellite" }, { value: "hybrid", label: "Hybrid" }]} />
      </div>
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-panel/95 backdrop-blur p-1 shadow-panel">
        <button onClick={() => setDraw(draw === "polygon" ? null : "polygon")} className={cx("h-7 px-2 inline-flex items-center gap-1 rounded text-[12px]", draw === "polygon" ? "bg-accent text-white" : "hover:bg-hover text-fg-2")} title="Draw polygon (click points, double-click/Enter to finish)"><Pentagon size={14} />Polygon</button>
        <button onClick={() => setDraw(draw === "radius" ? null : "radius")} className={cx("h-7 px-2 inline-flex items-center gap-1 rounded text-[12px]", draw === "radius" ? "bg-accent text-white" : "hover:bg-hover text-fg-2")} title="Draw radius (click center, click edge)"><Circle size={14} />Radius</button>
        {area && <button onClick={() => setArea(null)} className="h-7 px-2 inline-flex items-center gap-1 rounded text-[12px] hover:bg-hover text-fg-2" title="Clear area"><Eraser size={14} />Clear</button>}
        <Menu align="left" trigger={(t) => <button onClick={t} className="h-7 px-2 inline-flex items-center gap-1 rounded text-[12px] hover:bg-hover text-fg-2"><SquareDashed size={14} />Areas</button>}>
          {(close) => (
            <>
              {ws.savedAreas.length === 0 && <div className="px-2 py-1.5 text-[12px] text-muted">No saved areas yet</div>}
              {ws.savedAreas.map((a) => <MenuItem key={a.id} onClick={() => { setArea({ type: "polygon", ring: a.ring }); const xs = a.ring.map((p) => p[0]), ys = a.ring.map((p) => p[1]); setFitTo([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]); close(); }}>{a.name}</MenuItem>)}
              {area?.type === "polygon" && <MenuItem icon={<Save size={13} />} onClick={() => { close(); setSaveOpen("area"); }}>Save current polygon as territory…</MenuItem>}
            </>
          )}
        </Menu>
      </div>
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-panel/95 backdrop-blur p-1 shadow-panel">
        <Menu align="left" trigger={(t) => <button onClick={t} className="h-7 px-2 inline-flex items-center gap-1 rounded text-[12px] hover:bg-hover text-fg-2"><Layers size={14} />Layers</button>}>
          {() => (
            <div className="p-1.5 space-y-2 w-60">
              <div className="text-[10.5px] uppercase tracking-wide text-muted">Color pins by</div>
              <select className="input input-sm" value={colorMode} onChange={(e) => setColorMode(e.target.value as ColorMode)}>{COLOR_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
              {colorMode === "list" && (
                <select className="input input-sm" value={listOverlay} onChange={(e) => setListOverlay(e.target.value)}>
                  <option value="">Choose list…</option>{ws.lists.filter((l) => !l.dynamic).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
              <div className="border-t border-border pt-2 space-y-1.5">
                <Toggle checked={pins} onChange={setPins} label="Property pins (clustered)" />
                <Toggle checked={parcels} onChange={setParcels} label="Parcel boundaries (zoom 16+)" />
                <Toggle checked={heatmap} onChange={setHeatmap} label="Heat map" />
                {heatmap && (
                  <select className="input input-sm" value={heatMetric} onChange={(e) => setHeatMetric(e.target.value as typeof heatMetric)}>
                    <option value="density">Lead / property density</option><option value="motivation">Seller motivation</option><option value="value">Property value</option><option value="equity">Equity</option>
                  </select>
                )}
              </div>
            </div>
          )}
        </Menu>
        <button onClick={() => setHeatmap((h) => !h)} className={cx("h-7 w-7 inline-flex items-center justify-center rounded", heatmap ? "bg-warn-soft text-warn" : "hover:bg-hover text-fg-2")} title="Heat map"><Flame size={14} /></button>
      </div>
      <div className="pointer-events-auto ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-panel/95 backdrop-blur px-2 h-9 shadow-panel text-[12px]">
        {loading ? <span className="text-muted">Searching…</span> : error ? <span className="text-bad">{error}</span> : data ? (
          <span><b className="num">{num(data.total)}</b> <span className="text-muted">properties{data.truncated ? ` (showing ${num(results.length)})` : ""} · {data.tookMs}ms</span></span>
        ) : <span className="text-muted">Move the map to search</span>}
        {areaLabel && <Badge tone="accent">{areaLabel}</Badge>}
      </div>
    </div>
  );

  const drawHint = draw && (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-10 rounded-lg bg-accent text-white px-3 py-1.5 text-[12px] shadow-pop">
      {draw === "polygon" ? "Click to add points · double-click or Enter to finish · Esc to cancel" : "Click the center, then click the edge · Esc to cancel"}
    </div>
  );

  const mapEl = (
    <div className="relative h-full w-full">
      <PropertyMap center={initialCenter} zoom={initialZoom} basemap={basemap} fitTo={fitTo}
        onViewport={(bbox, zoom) => setViewport({ bbox, zoom })}>
        <SearchAreaLayer area={area} />
        <ParcelLayer enabled={parcels} selectedId={selected} onSelect={onSelect} />
        <PropertyLayer data={results} colorMode={colorMode} statusById={statusById} listIds={listIds} selectedId={selected} onSelect={onSelect} heatmap={heatmap} heatMetric={heatMetric} showPins={pins} />
        <DrawingTools mode={draw} onComplete={onComplete} onCancel={onCancel} />
      </PropertyMap>
      {toolbar}
      {drawHint}
      <div className="absolute left-2 bottom-8 z-10"><MapLegend mode={colorMode} /></div>
    </div>
  );

  const left = leftOpen && (
    <aside className="w-[268px] shrink-0 border-r border-border bg-panel overflow-y-auto hidden md:block">
      <FilterPanel filters={filters} onChange={setFilters} zipOptions={ZIPS} cityOptions={CITIES} />
      <div className="p-3 space-y-1.5">
        <Button className="w-full" icon={<BookmarkPlus size={14} />} onClick={() => setSaveOpen("search")}>Save search</Button>
        {ws.savedSearches.length > 0 && <div className="text-[10.5px] uppercase tracking-wide text-muted pt-2">Saved searches</div>}
        {ws.savedSearches.map((s) => (
          <button key={s.id} onClick={() => { setFilters(s.filters); setArea(s.area ?? null); }} className="flex w-full items-center justify-between rounded px-2 py-1 text-[12px] hover:bg-hover text-left">
            <span className="truncate">{s.name}</span>{s.newMatchIds.length > 0 && <Badge tone="good">{s.newMatchIds.length} new</Badge>}
          </button>
        ))}
      </div>
    </aside>
  );

  const right = rightOpen && selected && (
    <aside className="anim-slide w-full md:w-[400px] shrink-0 border-l border-border bg-panel overflow-y-auto absolute md:static inset-0 md:inset-auto z-20">
      <div className="flex items-center justify-between h-10 px-3 border-b border-border sticky top-0 bg-panel z-10">
        <span className="text-[12px] font-semibold">Property</span>
        <button onClick={() => { setSelected(null); setRightOpen(false); }} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-hover text-fg-2" title="Collapse panel"><PanelRightClose size={15} /></button>
      </div>
      <PropertyQuickCard id={selected} />
    </aside>
  );

  const saveDialog = (
    <Dialog open={!!saveOpen} onClose={() => setSaveOpen(null)} title={saveOpen === "area" ? "Save territory" : "Save search"}
      footer={<><Button onClick={() => setSaveOpen(null)}>Cancel</Button><Button variant="primary" onClick={() => {
        if (!saveName.trim()) return;
        if (saveOpen === "area" && area?.type === "polygon") { ws.saveArea(saveName.trim(), area.ring); toast("Territory saved"); }
        else { ws.saveSearch({ name: saveName.trim(), filters, area: area ?? undefined, resultIds: results.map((r) => r.id) }); toast("Search saved — new matches will be flagged on refresh"); }
        setSaveName(""); setSaveOpen(null);
      }}>Save</Button></>}>
      <input autoFocus className="input" placeholder={saveOpen === "area" ? "e.g. South Sac farm area" : "e.g. Sacramento Absentee Equity"} value={saveName} onChange={(e) => setSaveName(e.target.value)} />
      {saveOpen === "search" && <div className="mt-2 flex flex-wrap gap-1">{describeFilters(filters).map((d) => <Badge key={d}>{d}</Badge>)}{areaLabel && <Badge tone="accent">{areaLabel}</Badge>}</div>}
    </Dialog>
  );

  if (variant === "map") {
    return (
      <div className="h-full flex relative">
        {left}
        <div className="flex-1 min-w-0 relative">{mapEl}</div>
        {right}
        {saveDialog}
      </div>
    );
  }

  // Deal Finder: map on top, results table below
  return (
    <div className="h-full flex relative">
      {left}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-[46%] min-h-[240px] relative border-b border-border">{mapEl}</div>
        <div className="flex-1 min-h-0 flex flex-col bg-panel">
          <div className="flex flex-wrap items-center gap-2 px-3 h-11 border-b border-border">
            <Search size={14} className="text-muted" />
            <div className="flex flex-wrap gap-1 min-w-0">{describeFilters(filters).slice(0, 8).map((d) => <Badge key={d}>{d}</Badge>)}{describeFilters(filters).length === 0 && <span className="text-[12px] text-muted">No filters — all properties in view</span>}</div>
            <div className="ml-auto flex items-center gap-1.5">
              {checked.size > 0 && <span className="text-[12px] text-muted">{checked.size} selected</span>}
              <Button size="xs" variant="primary" icon={<BookmarkPlus size={12} />} disabled={!checked.size} onClick={() => saveLeads(checkedRows)}>Save as leads</Button>
              {checked.size > 0 && <AddToListMenu summary={checkedRows} />}
              <Button size="xs" variant="ghost" icon={<Download size={12} />} onClick={() => exportCsv(checked.size ? checkedRows : results)}>CSV</Button>
              <select className="input input-sm w-auto" value={sort} onChange={(e) => setSort(e.target.value as SearchRequest["sort"])}>
                <option value="motivation">Sort: motivation</option><option value="equity">Sort: equity</option><option value="value">Sort: value</option><option value="years_owned">Sort: years owned</option><option value="recent_sale">Sort: recent sale</option>
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="tbl text-[12.5px]">
              <thead><tr>
                <th className="w-8"><input type="checkbox" checked={checked.size > 0 && checked.size === Math.min(results.length, 300)} onChange={(e) => setChecked(e.target.checked ? new Set(results.slice(0, 300).map((r) => r.id)) : new Set())} /></th>
                <th>Address</th><th>Owner</th><th>Type</th><th className="text-right">Bd/Ba</th><th className="text-right">Sq ft</th><th className="text-right">Built</th><th className="text-right">Est. value</th><th className="text-right">Equity</th><th className="text-right">Owned</th><th>Signals</th><th className="text-right">Motivation</th><th>Status</th>
              </tr></thead>
              <tbody>
                {results.slice(0, 300).map((r) => {
                  const st = statusById.get(r.id);
                  return (
                    <tr key={r.id} className={cx("cursor-pointer", r.id === selected && "row-active")} onClick={() => setSelected(r.id)} onDoubleClick={() => router.push(`/properties/${r.id}`)}>
                      <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked.has(r.id)} onChange={(e) => { const n = new Set(checked); if (e.target.checked) n.add(r.id); else n.delete(r.id); setChecked(n); }} /></td>
                      <td className="font-medium">{r.line1}<div className="text-[11px] text-muted font-normal">{r.city} {r.zip}</div></td>
                      <td className="max-w-[180px] truncate">{r.ownerName}</td>
                      <td>{PROPERTY_TYPE_LABEL[r.propertyType]}</td>
                      <td className="text-right num">{r.beds ?? "—"}/{r.baths ?? "—"}</td>
                      <td className="text-right num">{num(r.sqft)}</td>
                      <td className="text-right num">{r.yearBuilt ?? "—"}</td>
                      <td className="text-right num">{usd(r.estValue, { compact: true })}</td>
                      <td className="text-right num">{pct100(r.equityPct)}</td>
                      <td className="text-right num">{r.yearsOwned != null ? `${Math.round(r.yearsOwned)}y` : "—"}</td>
                      <td><div className="flex gap-1">{r.outOfState ? <Badge tone="info">Out of state</Badge> : r.absentee ? <Badge tone="info">Absentee</Badge> : null}{r.distress.vacant && <Badge tone="warn">Vacant</Badge>}{r.distress.taxDelinquent && <Badge tone="bad">Tax</Badge>}{r.distress.preForeclosure && <Badge tone="bad">NOD</Badge>}{r.distress.probate && <Badge tone="violet">Probate</Badge>}</div></td>
                      <td className="text-right num font-semibold">{r.motivationScore}</td>
                      <td>{st ? <Badge dot={PIN_STATUS[st].color}>{PIN_STATUS[st].label}</Badge> : <span className="text-muted text-[11.5px]">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {results.length > 300 && <div className="p-3 text-center text-[12px] text-muted">Showing first 300 of {num(data?.total)} — narrow filters or draw an area (server-side pagination applies in production).</div>}
            {!loading && results.length === 0 && data && <div className="p-8 text-center text-[12.5px] text-muted">No properties match these filters in this area. Zoom out, move the map, or loosen filters.</div>}
          </div>
        </div>
      </div>
      {right}
      {saveDialog}
    </div>
  );
}
