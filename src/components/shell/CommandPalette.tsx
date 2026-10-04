"use client";
import { Building2, Calculator, CheckSquare, Gavel, Handshake, Kanban, List, Map, MapPin, Phone, ScanSearch, Search, User, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearch } from "@/lib/client/api";
import { normalizePhone } from "@/lib/format";
import { useUI } from "@/lib/store/ui";
import { useWorkspace } from "@/lib/store/workspace";
import { Kbd, cx } from "../ui";
import { NAV } from "./nav";

interface Item { id: string; group: string; label: ReactNode; sub?: string; icon: ReactNode; run: () => void }

export function CommandPalette() {
  const { paletteOpen, setPalette, openQuick, openPanel } = useUI();
  const router = useRouter();
  const ws = useWorkspace();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  useEffect(() => { if (paletteOpen) { setQ(""); setIdx(0); } }, [paletteOpen]);
  const ql = q.trim().toLowerCase();
  const { data } = useSearch(paletteOpen && ql.length >= 2 ? { filters: { query: q.trim() }, limit: 6 } : null, 180);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => { setPalette(false); router.push(href); };
    const commands: Item[] = [
      { id: "c-search", group: "Commands", label: "Search property", icon: <Search size={14} />, run: () => openQuick("property") },
      { id: "c-lead", group: "Commands", label: "Add lead", icon: <UserPlus size={14} />, run: () => openQuick("lead") },
      { id: "c-comps", group: "Commands", label: "Run comps", icon: <ScanSearch size={14} />, run: () => openQuick("comps") },
      { id: "c-offer", group: "Commands", label: "Create offer", icon: <Gavel size={14} />, run: () => openQuick("offer") },
      { id: "c-seller", group: "Commands", label: "Add seller", icon: <User size={14} />, run: () => openQuick("seller") },
      { id: "c-buyer", group: "Commands", label: "Add buyer", icon: <Handshake size={14} />, run: () => openQuick("buyer") },
      { id: "c-task", group: "Commands", label: "Create task", icon: <CheckSquare size={14} />, run: () => openQuick("task") },
      { id: "c-map", group: "Commands", label: "Open map", icon: <Map size={14} />, run: go("/map") },
      { id: "c-pipe", group: "Commands", label: "Open pipeline", icon: <Kanban size={14} />, run: go("/pipeline") },
      { id: "c-analyze", group: "Commands", label: "Analyze deal (Deal Desk)", icon: <Calculator size={14} />, run: go("/deal-desk") },
      ...NAV.flatMap((s) => s.items).map((n) => ({ id: `nav-${n.href}`, group: "Go to", label: n.label, sub: n.key ? n.key.toUpperCase() : undefined, icon: <n.icon size={14} />, run: go(n.href) })),
    ];
    if (!ql) return commands;
    const match = (s: string | undefined | null) => !!s && s.toLowerCase().includes(ql);
    const digits = normalizePhone(ql);
    const out: Item[] = commands.filter((c) => match(typeof c.label === "string" ? c.label : ""));
    for (const l of ws.leads) {
      if (l.deletedAt) continue;
      const seller = ws.sellers.find((s) => s.id === l.sellerId);
      const phoneHit = digits.length >= 4 && seller?.contacts.some((c) => c.kind === "phone" && normalizePhone(c.value).includes(digits));
      const emailHit = seller?.contacts.some((c) => c.kind === "email" && match(c.value));
      if (match(l.property.line1) || match(l.property.ownerName) || match(l.property.apn) || match(l.property.zip) || match(l.property.city) || match(seller?.name) || match(l.id) || phoneHit || emailHit) {
        out.push({ id: `lead-${l.id}`, group: "Leads & sellers", label: `${l.property.line1}, ${l.property.city}`, sub: `${seller?.name ?? l.property.ownerName}${phoneHit ? " · phone match" : emailHit ? " · email match" : ""} · ${l.stage.replace(/_/g, " ")}`, icon: phoneHit ? <Phone size={14} /> : <Users size={14} />, run: go(`/properties/${l.propertyId}`) });
      }
    }
    for (const b of ws.buyers) {
      if (match(b.name) || match(b.company) || b.contacts.some((c) => match(c.value) || (digits.length >= 4 && normalizePhone(c.value).includes(digits))))
        out.push({ id: `buyer-${b.id}`, group: "Buyers", label: b.name, sub: b.company, icon: <Handshake size={14} />, run: go(`/buyers?id=${b.id}`) });
    }
    for (const l of ws.lists) if (match(l.name)) out.push({ id: `list-${l.id}`, group: "Lists", label: l.name, sub: `${l.dynamic ? "dynamic" : `${l.propertyIds.length} properties`}`, icon: <List size={14} />, run: go(`/lists?id=${l.id}`) });
    const leadProps = new Set(ws.leads.map((l) => l.propertyId));
    for (const p of data?.results ?? []) {
      if (leadProps.has(p.id)) continue;
      out.push({ id: `prop-${p.id}`, group: "Properties (data provider)", label: `${p.line1}, ${p.city} ${p.zip}`, sub: `${p.ownerName} · APN ${p.apn}`, icon: <MapPin size={14} />, run: () => { setPalette(false); openPanel(p.id); } });
    }
    return out.slice(0, 40);
  }, [ql, ws.leads, ws.sellers, ws.buyers, ws.lists, data, router, setPalette, openQuick, openPanel]);

  useEffect(() => setIdx(0), [ql]);
  if (!paletteOpen) return null;
  const groups = [...new Set(items.map((i) => i.group))];
  let flatIndex = -1;
  return (
    <div className="fixed inset-0 z-[85] bg-black/40 flex items-start justify-center pt-[12vh] px-4" onMouseDown={(e) => e.target === e.currentTarget && setPalette(false)}>
      <div className="anim-fade w-full max-w-[600px] rounded-xl border border-border bg-panel shadow-pop overflow-hidden">
        <div className="flex items-center gap-2 px-3 h-12 border-b border-border">
          <Search size={16} className="text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search address, owner, APN, phone, email, ZIP, buyer, list… or type a command"
            className="flex-1 bg-transparent outline-none text-[14px]"
            onKeyDown={(e) => {
              if (e.key === "Escape") setPalette(false);
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
              if (e.key === "Enter" && items[idx]) items[idx].run();
            }} />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[56vh] overflow-y-auto p-1">
          {items.length === 0 && <div className="p-6 text-center text-[12.5px] text-muted">No results</div>}
          {groups.map((g) => (
            <div key={g} className="py-1">
              <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">{g}</div>
              {items.filter((i) => i.group === g).map((it) => {
                flatIndex++;
                const my = flatIndex;
                return (
                  <button key={it.id} onMouseEnter={() => setIdx(my)} onClick={it.run}
                    className={cx("flex w-full items-center gap-2.5 rounded-md px-2.5 h-9 text-left", my === idx ? "bg-hover" : "")}>
                    <span className="text-muted">{it.icon}</span>
                    <span className="text-[13px] truncate">{it.label}</span>
                    {it.sub && <span className="ml-auto text-[11.5px] text-muted truncate pl-3">{it.sub}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 px-3 h-8 border-t border-border text-[11px] text-muted"><span><Kbd>↑↓</Kbd> navigate</span><span><Kbd>↵</Kbd> open</span><span><Kbd>G</Kbd> then <Kbd>M</Kbd> map · <Kbd>P</Kbd> pipeline</span><Building2 size={12} className="ml-auto" /></div>
      </div>
    </div>
  );
}
