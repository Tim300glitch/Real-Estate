"use client";
import { X } from "lucide-react";
import Link from "next/link";
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ─── Button ─────────────────────────────────────────────────────────
type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:brightness-110 border border-transparent shadow-panel",
  secondary: "bg-panel text-fg border border-border hover:bg-hover shadow-panel",
  ghost: "text-fg-2 hover:bg-hover hover:text-fg border border-transparent",
  danger: "bg-bad text-white hover:brightness-110 border border-transparent",
  subtle: "bg-accent-soft text-accent-text hover:brightness-95 border border-transparent",
};

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "xs" | "sm" | "md" | "lg";
  icon?: ReactNode;
  href?: string;
}

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = "secondary", size = "sm", icon, className, children, href, ...rest }, ref) {
  const cls = cx(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition disabled:opacity-50 disabled:pointer-events-none select-none",
    size === "xs" && "h-6 px-2 text-[11px]",
    size === "sm" && "h-7 px-2.5 text-[12.5px]",
    size === "md" && "h-8 px-3 text-[13px]",
    size === "lg" && "h-11 px-4 text-[15px]",
    VARIANTS[variant],
    className,
  );
  if (href) return <Link href={href} className={cls}>{icon}{children}</Link>;
  return <button ref={ref} type="button" className={cls} {...rest}>{icon}{children}</button>;
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx("inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-2 hover:bg-hover hover:text-fg transition", className)} {...rest}>
      {children}
    </button>
  );
}

// ─── Badge ──────────────────────────────────────────────────────────
type Tone = "neutral" | "accent" | "good" | "warn" | "bad" | "info" | "violet";
const TONES: Record<Tone, string> = {
  neutral: "bg-hover text-fg-2 border-border",
  accent: "bg-accent-soft text-accent-text border-transparent",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
  info: "bg-info-soft text-info border-transparent",
  violet: "bg-violet-soft text-violet border-transparent",
};
export function Badge({ tone = "neutral", children, className, dot, title }: { tone?: Tone; children: ReactNode; className?: string; dot?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded px-1.5 h-[19px] text-[11px] font-medium border whitespace-nowrap", TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

// ─── Card / Panel ───────────────────────────────────────────────────
export function Card({ title, actions, children, className, bodyClass, subtitle, icon }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; icon?: ReactNode }) {
  return (
    <section className={cx("rounded-lg border border-border bg-panel shadow-panel min-w-0", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 px-3 h-10 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="text-muted">{icon}</span>}
            <h3 className="text-[12.5px] font-semibold truncate">{title}</h3>
            {subtitle && <span className="text-[11.5px] text-muted truncate">{subtitle}</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">{actions}</div>
        </header>
      )}
      <div className={cx(bodyClass ?? "p-3")}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h1 className="text-[18px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-[12.5px] text-muted mt-0.5">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

// ─── Form fields ────────────────────────────────────────────────────
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1 min-w-0", className)}>
      <span className="text-[11.5px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

/** Numeric input that formats with thousands separators but stores a number */
export function NumberInput({ value, onChange, prefix, suffix, step, min, max, className, placeholder, decimals = 0, size }: {
  value: number | null | undefined; onChange: (v: number) => void; prefix?: string; suffix?: string; step?: number; min?: number; max?: number;
  className?: string; placeholder?: string; decimals?: number; size?: "sm";
}) {
  const fmt = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "" : v.toLocaleString("en-US", { maximumFractionDigits: decimals }));
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(fmt(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={cx("relative flex items-center", className)}>
      {prefix && <span className="absolute left-2 text-muted text-[12px] pointer-events-none">{prefix}</span>}
      <input
        inputMode="decimal"
        className={cx("input num text-right", size === "sm" && "input-sm", prefix && "pl-5", suffix && "pr-7")}
        value={text}
        placeholder={placeholder}
        onFocus={() => (focused.current = true)}
        onBlur={() => { focused.current = false; setText(fmt(value)); }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
          if (!Number.isNaN(n)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
          else if (e.target.value === "") onChange(0);
        }}
        onKeyDown={(e) => {
          if (!step) return;
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(+(((value ?? 0) + (e.key === "ArrowUp" ? step : -step)).toFixed(decimals)));
          }
        }}
      />
      {suffix && <span className="absolute right-2 text-muted text-[12px] pointer-events-none">{suffix}</span>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "sm", className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; size?: "xs" | "sm"; className?: string }) {
  return (
    <div className={cx("inline-flex rounded-md border border-border bg-panel-2 p-0.5", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" title={o.title} onClick={() => onChange(o.value)}
          className={cx("rounded px-2 font-medium transition whitespace-nowrap", size === "xs" ? "h-5 text-[11px]" : "h-6 text-[12px]",
            o.value === value ? "bg-panel text-fg shadow-panel" : "text-muted hover:text-fg")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx("relative h-[18px] w-[30px] rounded-full transition", checked ? "bg-accent" : "bg-border-strong")}>
        <span className={cx("absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition", checked ? "left-[14px]" : "left-[2px]")} />
      </button>
      {label && <span className="text-[12.5px]">{label}</span>}
    </label>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (t: T) => void; className?: string }) {
  return (
    <div className={cx("flex items-center gap-0.5 border-b border-border overflow-x-auto", className)}>
      {tabs.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={cx("relative h-9 px-3 text-[12.5px] font-medium whitespace-nowrap transition",
            value === t.id ? "text-fg" : "text-muted hover:text-fg")}>
          {t.label}
          {t.count != null && <span className="ml-1.5 text-[11px] text-muted num">{t.count}</span>}
          {value === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-accent" />}
        </button>
      ))}
    </div>
  );
}

// ─── Overlays ───────────────────────────────────────────────────────
function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

export function useEscape(onEsc: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onEsc(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onEsc, active]);
}

export function Dialog({ open, onClose, title, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 p-4 pt-[8vh] overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="anim-fade w-full rounded-xl border border-border bg-panel shadow-pop" style={{ maxWidth: width }}>
          <div className="flex items-center justify-between h-11 px-4 border-b border-border">
            <h2 className="text-[13.5px] font-semibold">{title}</h2>
            <IconButton label="Close" onClick={onClose}><X size={15} /></IconButton>
          </div>
          <div className="p-4 max-h-[70vh] overflow-y-auto">{children}</div>
          {footer && <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-panel-2 rounded-b-xl">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

export function SlideOver({ open, onClose, title, children, width = 520, actions }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number; actions?: ReactNode }) {
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[70] bg-black/30" onMouseDown={onClose} />
      <aside className="anim-slide fixed right-0 top-0 bottom-0 z-[71] flex flex-col border-l border-border bg-panel shadow-pop w-full" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between h-12 px-4 border-b border-border shrink-0">
          <h2 className="text-[13.5px] font-semibold truncate">{title}</h2>
          <div className="flex items-center gap-1">{actions}<IconButton label="Close" onClick={onClose}><X size={15} /></IconButton></div>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </Portal>
  );
}

export function Menu({ trigger, children, align = "right" }: { trigger: (toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block">
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div className={cx("anim-fade absolute z-[60] mt-1 min-w-[180px] rounded-lg border border-border bg-panel p-1 shadow-pop", align === "right" ? "right-0" : "left-0")}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ onClick, children, icon, danger, disabled }: { onClick: () => void; children: ReactNode; icon?: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={cx("flex w-full items-center gap-2 rounded-md px-2 h-7 text-[12.5px] text-left hover:bg-hover disabled:opacity-40", danger ? "text-bad" : "text-fg")}>
      {icon && <span className="text-muted">{icon}</span>}
      {children}
    </button>
  );
}

// ─── Data display ───────────────────────────────────────────────────
export function Stat({ label, value, sub, tone, href, title }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "warn"; href?: string; title?: string }) {
  const inner = (
    <div title={title} className="rounded-lg border border-border bg-panel px-3 py-2.5 shadow-panel h-full hover:border-border-strong transition">
      <div className="text-[11px] font-medium text-muted uppercase tracking-wide truncate">{label}</div>
      <div className={cx("mt-1 text-[19px] font-semibold num tracking-tight", tone === "good" && "text-good", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>{value}</div>
      {sub && <div className="text-[11.5px] text-muted mt-0.5 truncate">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function KV({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3 py-1 min-w-0", className)}>
      <span className="text-[12px] text-muted shrink-0">{k}</span>
      <span className="text-[12.5px] text-right num min-w-0 truncate">{v}</span>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4 gap-2">
      {icon && <div className="text-muted">{icon}</div>}
      <div className="text-[13px] font-medium">{title}</div>
      {children && <div className="text-[12px] text-muted max-w-sm">{children}</div>}
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex items-center rounded border border-border bg-panel-2 px-1 h-[18px] text-[10.5px] font-mono text-muted">{children}</kbd>;
}

export function ScoreBadge({ score, label, size = "sm" }: { score: number; label?: string; size?: "sm" | "lg" }) {
  const color = score >= 80 ? "var(--good)" : score >= 65 ? "var(--accent)" : score >= 50 ? "var(--warn)" : "var(--bad)";
  if (size === "lg") {
    const r = 26, c = 2 * Math.PI * r;
    return (
      <div className="relative h-[64px] w-[64px] shrink-0">
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[17px] font-semibold num leading-none">{score}</span>
          {label && <span className="text-[9px] text-muted">{label}</span>}
        </div>
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 h-[19px] text-[11px] font-semibold num border border-border" style={{ color }}>
      {score}
      {label && <span className="font-normal text-muted">{label}</span>}
    </span>
  );
}

export function Bar({ value, max = 1, color = "var(--accent)", className }: { value: number; max?: number; color?: string; className?: string }) {
  return (
    <div className={cx("h-1.5 w-full rounded-full bg-hover overflow-hidden", className)}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} />
    </div>
  );
}

export function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold text-white shrink-0" style={{ width: size, height: size, background: `hsl(${h} 45% 48%)` }} title={name}>
      {initials}
    </span>
  );
}
