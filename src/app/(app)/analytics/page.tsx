"use client";
import { useEffect, useMemo, useState } from "react";
import { BarChart, LineChart } from "@/components/charts";
import { PropertyMap, useGeoJsonLayer, useMap as useMapSafe } from "@/components/map/PropertyMap";
import { Badge, Card, PageHeader, Segmented, Stat, Tabs, cx } from "@/components/ui";
import { breakdown, computeKpis, fmtMetric, monthlyFees, type BreakdownRow } from "@/lib/calc/metrics";
import { api } from "@/lib/client/api";
import { pct, usd } from "@/lib/format";
import { useWorkspace, userName } from "@/lib/store/workspace";
import { LEAD_SOURCE_LABEL, PROPERTY_TYPE_LABEL, type Lead } from "@/lib/types";
import type { MarketStat } from "@/server/providers/types";

type Dim = "market" | "zip" | "source" | "campaign" | "rep" | "type" | "motivation";

export default function Analytics() {
  const [tab, setTab] = useState<"performance" | "market">("performance");
  return (
    <div>
      <PageHeader title="Analytics" subtitle="Every metric shows its definition on hover. Revenue = recorded assignment fees." />
      <div className="px-5"><Tabs tabs={[{ id: "performance", label: "Business performance" }, { id: "market", label: "Market analysis" }]} value={tab} onChange={setTab} /></div>
      <div className="p-5 pt-4">{tab === "performance" ? <Performance /> : <Market />}</div>
    </div>
  );
}

function Performance() {
  const ws = useWorkspace();
  const [dim, setDim] = useState<Dim>("source");
  const { kpis } = useMemo(() => computeKpis(ws), [ws]);
  const fees = useMemo(() => monthlyFees(ws.dispositions, 12), [ws.dispositions]);
  const leadsByMonth = useMemo(() => {
    const labels: string[] = [], vals: number[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1), e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      labels.push(s.toLocaleDateString("en-US", { month: "short" }));
      vals.push(ws.leads.filter((l) => new Date(l.createdAt) >= s && new Date(l.createdAt) < e).length);
    }
    return { labels, vals };
  }, [ws.leads]);

  const leads = ws.leads.filter((l) => !l.deletedAt);
  const contacted = leads.filter((l) => l.lastContactAt || ws.comms.some((c) => c.leadId === l.id && c.direction === "inbound"));
  const qualified = leads.filter((l) => ws.sellers.some((s) => s.id === l.sellerId && (s.timeline || s.askingPrice)));
  const daysToContact = leads.map((l) => { const c = ws.comms.filter((x) => x.leadId === l.id && x.direction !== "internal").sort((a, b) => a.at.localeCompare(b.at))[0]; return c ? (new Date(c.at).getTime() - new Date(l.createdAt).getTime()) / 86400000 : null; }).filter((x): x is number => x != null && x >= 0);
  const sent = ws.offers.filter((o) => o.status !== "draft");
  const closed = ws.dispositions.filter((d) => d.status === "closed");
  const spend = ws.campaigns.filter((c) => c.audience === "seller").reduce((s, c) => s + c.spend, 0);
  const revenue = closed.reduce((s, d) => s + (d.actualFee ?? 0), 0);
  const k = (key: string) => kpis.find((m) => m.key === key)!;

  const keyOf: Record<Dim, (l: Lead) => string> = {
    market: (l) => l.property.city, zip: (l) => l.property.zip, source: (l) => LEAD_SOURCE_LABEL[l.source],
    campaign: (l) => ws.campaigns.find((c) => c.id === l.campaignId)?.name ?? "No campaign", rep: (l) => userName(l.assignedTo),
    type: (l) => PROPERTY_TYPE_LABEL[l.property.propertyType],
    motivation: (l) => { const d = l.property.distress; return d.preForeclosure ? "Pre-foreclosure" : d.probate || d.inherited ? "Probate / inherited" : d.taxDelinquent ? "Tax delinquent" : d.vacant ? "Vacant" : d.tiredLandlord ? "Tired landlord" : l.property.absentee && (l.property.equityPct ?? 0) >= 60 ? "Absentee high-equity" : "Other / none"; },
  };
  const rows = useMemo(() => breakdown(ws, keyOf[dim], dim === "campaign" ? (key) => ws.campaigns.find((c) => c.name === key)?.spend ?? 0 : undefined), [ws, dim]); // eslint-disable-line react-hooks/exhaustive-deps

  const tot = useMemo(() => breakdown(ws, () => "all")[0], [ws]);
  const funnel: [string, number][] = tot ? [["Leads", tot.leads], ["Contacted", tot.contacted], ["Appointment", tot.appointments], ["Offer made", tot.offers], ["Under contract", tot.contracts], ["Closed", tot.closed]] : [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        <Stat label="Leads added" value={leads.length} />
        <Stat label="Contact rate" value={pct(leads.length ? contacted.length / leads.length : null)} title="Leads with any outbound/inbound communication ÷ leads" />
        <Stat label="Qualified rate" value={pct(leads.length ? qualified.length / leads.length : null)} title="Leads whose seller gave a timeline or asking price ÷ leads" />
        <Stat label="Appointments" value={ws.appointments.length} />
        <Stat label="Offers" value={sent.length} />
        <Stat label="Lead → contract" value={fmtMetric(k("leadToContract"))} title={k("leadToContract").definition} />
        <Stat label="Contract → close" value={fmtMetric(k("contractToClose"))} title={k("contractToClose").definition} />
        <Stat label="Closed deals" value={closed.length} />
        <Stat label="Avg offer discount" value={pct(sent.length ? sent.reduce((s, o) => s + (o.arv ? 1 - o.amount / o.arv : 0), 0) / sent.length : null, 1)} title="Mean (1 − offer ÷ ARV)" />
        <Stat label="Avg assignment fee" value={fmtMetric(k("avgFee"))} />
        <Stat label="Avg marketing / lead" value={fmtMetric(k("cpl"))} />
        <Stat label="Cost per contract" value={fmtMetric(k("cpc"))} />
        <Stat label="Cost per closed deal" value={usd(closed.length ? spend / closed.length : null)} />
        <Stat label="Revenue" value={usd(revenue, { compact: true })} tone="good" />
        <Stat label="Net revenue" value={usd(revenue - spend, { compact: true })} title="Fees − seller marketing spend" />
        <Stat label="Marketing ROI" value={pct(spend ? (revenue - spend) / spend : null)} />
        <Stat label="Avg days to contact" value={daysToContact.length ? `${(daysToContact.reduce((a, b) => a + b, 0) / daysToContact.length).toFixed(1)}d` : "—"} />
        <Stat label="Avg days to contract" value={fmtMetric(k("daysToContract"))} />
        <Stat label="Avg days to close" value={fmtMetric(k("daysToClose"))} />
      </div>
      <div className="grid lg:grid-cols-3 gap-3">
        <Card title="Funnel">
          <div className="space-y-1.5">{funnel.map(([label, v], i) => (
            <div key={label} className="grid grid-cols-[100px_1fr_70px] items-center gap-2 text-[12px]">
              <span className="text-fg-2">{label}</span>
              <div className="h-4 rounded-r bg-hover overflow-hidden"><div className="h-full rounded-r" style={{ width: `${(v / Math.max(1, funnel[0][1])) * 100}%`, background: "var(--series-1)" }} /></div>
              <span className="num text-right" title="share of the previous step">{v}{i > 0 && funnel[i - 1][1] ? <span className="text-muted text-[10.5px]"> {pct(Math.min(1, v / funnel[i - 1][1]))}</span> : null}</span>
            </div>))}</div>
        </Card>
        <Card title="Leads added per month"><BarChart labels={leadsByMonth.labels} series={[{ name: "Leads", values: leadsByMonth.vals }]} height={170} /></Card>
        <Card title="Assignment fees per month"><LineChart labels={fees.labels} series={[{ name: "Fees", values: fees.fees }]} format={(v) => usd(v, { compact: true })} height={170} area /></Card>
      </div>
      <Card title="Breakdown" actions={<Segmented size="xs" value={dim} onChange={setDim} options={[{ value: "market", label: "Market" }, { value: "zip", label: "ZIP" }, { value: "source", label: "Lead source" }, { value: "campaign", label: "Campaign" }, { value: "rep", label: "Rep" }, { value: "type", label: "Property type" }, { value: "motivation", label: "Motivation type" }]} />} bodyClass="p-0">
        <BreakdownTable rows={rows} showSpend={dim === "campaign"} />
      </Card>
    </div>
  );
}

function BreakdownTable({ rows, showSpend }: { rows: BreakdownRow[]; showSpend: boolean }) {
  return (
    <div className="overflow-auto"><table className="tbl text-[12.5px]">
      <thead><tr><th>Segment</th><th className="text-right">Leads</th><th className="text-right">Contacted</th><th className="text-right">Contact %</th><th className="text-right">Appts</th><th className="text-right">Offers</th><th className="text-right">Contracts</th><th className="text-right">Lead → contract</th><th className="text-right">Closed</th><th className="text-right">Revenue</th>{showSpend && <><th className="text-right">Spend</th><th className="text-right">ROI</th></>}</tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.key}>
          <td className="font-medium">{r.key}</td><td className="text-right num">{r.leads}</td><td className="text-right num">{r.contacted}</td><td className="text-right num">{pct(r.contacted / r.leads)}</td>
          <td className="text-right num">{r.appointments}</td><td className="text-right num">{r.offers}</td><td className="text-right num">{r.contracts}</td>
          <td className="text-right num">{pct(r.contracts / r.leads, 1)}</td><td className="text-right num">{r.closed}</td><td className="text-right num text-good">{usd(r.revenue)}</td>
          {showSpend && <><td className="text-right num">{usd(r.spend)}</td><td className={cx("text-right num", r.spend && r.revenue < r.spend ? "text-bad" : "text-good")}>{r.spend ? pct((r.revenue - r.spend) / r.spend) : "—"}</td></>}
        </tr>))}</tbody>
    </table></div>
  );
}

function MarketLayer({ stats, metric, onSelect }: { stats: MarketStat[]; metric: "medianPpsf" | "transactions" | "cashPct" | "priceTrendPct"; onSelect: (k: string) => void }) {
  const vals = stats.map((s) => (s[metric] as number | null) ?? 0);
  const min = Math.min(...vals), max = Math.max(...vals);
  const fc = useMemo<GeoJSON.FeatureCollection>(() => ({ type: "FeatureCollection", features: stats.map((s) => ({ type: "Feature", properties: { key: s.key, t: max > min ? (((s[metric] as number | null) ?? 0) - min) / (max - min) : 0.5, n: s.transactions }, geometry: { type: "Point", coordinates: [s.lng, s.lat] } })) }), [stats, metric, min, max]);
  useGeoJsonLayer("market", fc, () => [{
    id: "market-c", type: "circle", source: "market",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "n"], 0, 10, 60, 34],
      "circle-color": ["interpolate", ["linear"], ["get", "t"], 0, "#cfe0f7", 0.5, "#5b9be6", 1, "#123f7a"],
      "circle-opacity": 0.75, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5,
    },
  }] as never[], {}, [metric]);
  const { map } = useMapSafe();
  useEffect(() => {
    if (!map) return;
    const h = (e: import("maplibre-gl").MapLayerMouseEvent) => { const k = e.features?.[0]?.properties?.key; if (k) onSelect(String(k)); };
    map.on("click", "market-c", h);
    return () => { map.off("click", "market-c", h); };
  }, [map, onSelect]);
  return null;
}

function Market() {
  const [stats, setStats] = useState<MarketStat[]>([]);
  const [months, setMonths] = useState(12);
  const [metric, setMetric] = useState<"medianPpsf" | "transactions" | "cashPct" | "priceTrendPct">("medianPpsf");
  const [compare, setCompare] = useState<string[]>([]);
  useEffect(() => { api.market(months).then((r) => setStats(r.stats)).catch(() => {}); }, [months]);
  const toggle = (k: string) => setCompare((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k].slice(-3)));
  const cmp = stats.filter((s) => compare.includes(s.key));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="xs" value={String(months)} onChange={(v) => setMonths(Number(v))} options={[{ value: "6", label: "6 mo" }, { value: "12", label: "12 mo" }, { value: "24", label: "24 mo" }]} />
        <Segmented size="xs" value={metric} onChange={setMetric} options={[{ value: "medianPpsf", label: "Median $/sf" }, { value: "transactions", label: "Volume" }, { value: "cashPct", label: "Cash %" }, { value: "priceTrendPct", label: "Price trend" }]} />
        {stats[0]?.synthetic && <Badge tone="warn">Synthetic demo statistics</Badge>}
        <span className="text-[11.5px] text-muted">{stats[0]?.source}</span>
      </div>
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-3">
        <Card title="Sales heat map by ZIP" subtitle="circle size = transaction volume · shade = selected metric · click to compare" bodyClass="p-0">
          <div className="relative h-[420px]">
            <PropertyMap center={[-121.41, 38.57]} zoom={10.3}>
              <MarketLayer stats={stats} metric={metric} onSelect={toggle} />
            </PropertyMap>
          </div>
          <div className="px-3 py-1.5 text-[10.5px] text-muted border-t border-border">Neighborhood boundary polygons require a boundary dataset (e.g. Regrid / county GIS) — points are ZIP centroids in this build.</div>
        </Card>
        <Card title={compare.length ? "Market comparison" : "Compare markets"} subtitle={compare.length ? undefined : "select up to 3 ZIPs from the table or map"} bodyClass="p-0">
          {cmp.length > 0 ? (
            <table className="tbl text-[12.5px]"><thead><tr><th></th>{cmp.map((s) => <th key={s.key}>{s.key}</th>)}</tr></thead><tbody>
              {([["Median sale price", (s: MarketStat) => usd(s.medianSalePrice)], ["Median $/sqft", (s: MarketStat) => usd(s.medianPpsf)], ["Transactions", (s: MarketStat) => String(s.transactions)], ["Avg DOM", (s: MarketStat) => s.avgDom != null ? `${s.avgDom}d` : "MLS req."], ["Investor purchases", (s: MarketStat) => pct(s.investorPct)], ["Cash sales", (s: MarketStat) => pct(s.cashPct)], ["Price trend (YoY $/sf)", (s: MarketStat) => s.priceTrendPct != null ? pct(s.priceTrendPct, 1) : "—"], ["Inventory", (s: MarketStat) => s.inventory != null ? String(s.inventory) : "MLS req."]] as [string, (s: MarketStat) => string][]).map(([label, f]) => (
                <tr key={label}><td className="text-muted">{label}</td>{cmp.map((s) => <td key={s.key} className="num">{f(s)}</td>)}</tr>
              ))}
            </tbody></table>
          ) : <div className="p-4 text-[12px] text-muted">Pick markets to compare side by side.</div>}
        </Card>
      </div>
      <Card title="Markets" bodyClass="p-0">
        <table className="tbl text-[12.5px]">
          <thead><tr><th></th><th>ZIP / area</th><th className="text-right">Median price</th><th className="text-right">Median $/sf</th><th className="text-right">Volume</th><th className="text-right">Avg DOM</th><th className="text-right">Investor %</th><th className="text-right">Cash %</th><th className="text-right">Trend</th></tr></thead>
          <tbody>{stats.map((s) => (
            <tr key={s.key} className={cx("cursor-pointer", compare.includes(s.key) && "row-active")} onClick={() => toggle(s.key)}>
              <td><input type="checkbox" readOnly checked={compare.includes(s.key)} /></td><td className="font-medium">{s.label}</td>
              <td className="text-right num">{usd(s.medianSalePrice, { compact: true })}</td><td className="text-right num">{usd(s.medianPpsf)}</td><td className="text-right num">{s.transactions}</td>
              <td className="text-right num">{s.avgDom ?? "—"}</td><td className="text-right num">{pct(s.investorPct)}</td><td className="text-right num">{pct(s.cashPct)}</td>
              <td className={cx("text-right num", (s.priceTrendPct ?? 0) >= 0 ? "text-good" : "text-bad")}>{s.priceTrendPct != null ? pct(s.priceTrendPct, 1) : "—"}</td>
            </tr>))}</tbody>
        </table>
      </Card>
    </div>
  );
}
