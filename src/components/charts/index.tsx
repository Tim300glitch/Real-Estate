"use client";
// Small dependency-free SVG charts. One y-axis each, recessive grid, thin
// marks with rounded data ends, hover tooltips, legend for ≥2 series.
import { useMemo, useRef, useState, type ReactNode } from "react";

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

function Tooltip({ x, y, children, width }: { x: number; y: number; children: ReactNode; width: number }) {
  const left = Math.min(Math.max(8, x + 12), width - 168);
  return (
    <div className="pointer-events-none absolute z-10 rounded-md border border-border bg-panel px-2 py-1.5 text-[11.5px] shadow-pop min-w-[120px]" style={{ left, top: Math.max(0, y - 8) }}>
      {children}
    </div>
  );
}

export interface Series { name: string; values: number[] }

/** Vertical bars. Multiple series render grouped (≤3). */
export function BarChart({ labels, series, height = 180, format = (v: number) => String(v) }: { labels: string[]; series: Series[]; height?: number; format?: (v: number) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = height, padL = 44, padB = 22, padT = 8;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const band = (W - padL) / Math.max(1, labels.length);
  const gap = 2;
  const barW = Math.max(3, Math.min(28, (band * 0.7 - gap * (series.length - 1)) / series.length));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, 0.5, 1].map((t) => t * max);
  return (
    <div ref={ref} className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--muted)">{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => {
          const x0 = padL + i * band + (band - (barW * series.length + gap * (series.length - 1))) / 2;
          return (
            <g key={l + i} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * band} y={padT} width={band} height={H - padT - padB} fill={hover === i ? "var(--hover)" : "transparent"} />
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const top = y(v), bottom = y(0);
                const h = Math.max(0, bottom - top);
                const r = Math.min(4, barW / 2, h);
                const x = x0 + si * (barW + gap);
                return <path key={s.name} d={`M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${bottom} Z`} fill={SERIES[si % 3]} />;
              })}
              {(labels.length <= 14 || i % Math.ceil(labels.length / 12) === 0) && (
                <text x={padL + i * band + band / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">{l}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && ref.current && (
        <Tooltip x={((padL + hover * band + band / 2) / W) * ref.current.clientWidth} y={10} width={ref.current.clientWidth}>
          <div className="font-medium mb-0.5">{labels[hover]}</div>
          {series.map((s, si) => (
            <div key={s.name} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: SERIES[si % 3] }} /><span className="text-muted">{s.name}</span><span className="ml-auto num font-medium">{format(s.values[hover] ?? 0)}</span></div>
          ))}
        </Tooltip>
      )}
      {series.length > 1 && <Legend names={series.map((s) => s.name)} />}
    </div>
  );
}

/** Line chart with crosshair tooltip. */
export function LineChart({ labels, series, height = 180, format = (v: number) => String(v), area = false }: { labels: string[]; series: Series[]; height?: number; format?: (v: number) => string; area?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = height, padL = 44, padB = 22, padT = 10;
  const all = series.flatMap((s) => s.values);
  const max = niceMax(Math.max(1, ...all));
  const x = (i: number) => padL + (labels.length <= 1 ? 0 : (i / (labels.length - 1)) * (W - padL - 8));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const paths = useMemo(() => series.map((s) => s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")), [series, labels.length, max]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - padL) / (W - padL - 8)) * (labels.length - 1));
          setHover(Math.max(0, Math.min(labels.length - 1, i)));
        }} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t * max)} y2={y(t * max)} stroke="var(--grid)" vectorEffect="non-scaling-stroke" />
            <text x={padL - 6} y={y(t * max) + 3} textAnchor="end" fontSize={10} fill="var(--muted)">{format(t * max)}</text>
          </g>
        ))}
        {labels.map((l, i) => (labels.length <= 13 || i % Math.ceil(labels.length / 12) === 0) && (
          <text key={l + i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">{l}</text>
        ))}
        {area && series[0] && <path d={`${paths[0]} L${x(labels.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={SERIES[0]} opacity={0.12} />}
        {paths.map((d, si) => <path key={si} d={d} fill="none" stroke={SERIES[si % 3]} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--border-strong)" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hover != null && ref.current && series.map((s, si) => (
        <span key={si} className="pointer-events-none absolute h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: "var(--panel)", background: SERIES[si % 3], left: (x(hover) / W) * ref.current!.clientWidth - 5, top: (y(s.values[hover] ?? 0) / H) * height - 5 }} />
      ))}
      {hover != null && ref.current && (
        <Tooltip x={(x(hover) / W) * ref.current.clientWidth} y={6} width={ref.current.clientWidth}>
          <div className="font-medium mb-0.5">{labels[hover]}</div>
          {series.map((s, si) => (
            <div key={s.name} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: SERIES[si % 3] }} /><span className="text-muted">{s.name}</span><span className="ml-auto num font-medium">{format(s.values[hover] ?? 0)}</span></div>
          ))}
        </Tooltip>
      )}
      {series.length > 1 && <Legend names={series.map((s) => s.name)} />}
    </div>
  );
}

export function Legend({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap gap-3 mt-1 text-[11px] text-fg-2">
      {names.map((n, i) => <span key={n} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: SERIES[i % 3] }} />{n}</span>)}
    </div>
  );
}

/** Horizontal bars with labels and values (good for breakdowns / funnels). */
export function HBars({ rows, format = (v: number) => String(v), max }: { rows: { label: ReactNode; value: number; sub?: ReactNode }[]; format?: (v: number) => string; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(90px,140px)_1fr_auto] items-center gap-2 text-[12px]" title={`${format(r.value)}`}>
          <span className="truncate text-fg-2">{r.label}</span>
          <div className="h-3 rounded-r bg-hover overflow-hidden"><div className="h-full rounded-r" style={{ width: `${(r.value / m) * 100}%`, background: SERIES[0] }} /></div>
          <span className="num text-right min-w-[56px]">{format(r.value)}{r.sub && <span className="text-muted text-[11px] ml-1">{r.sub}</span>}</span>
        </div>
      ))}
    </div>
  );
}
