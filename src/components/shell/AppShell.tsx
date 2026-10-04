"use client";
import { ChevronsLeft, ChevronsRight, LogOut, MapPinned, Moon, Plus, Search, Sun, X, Building2, UserPlus, User, ScanSearch, Gavel, Handshake, CheckSquare, ListPlus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import { ROLE_LABEL } from "@/lib/permissions";
import { useUI, type QuickAction } from "@/lib/store/ui";
import { SEED_VERSION, useWorkspace } from "@/lib/store/workspace";
import { Avatar, Button, Dialog, Kbd, Menu, MenuItem, cx } from "../ui";
import { BuyerForm, ListForm, TaskForm } from "../crm/forms";
import { PropertyPicker } from "../property/PropertyPicker";
import { PropertySlideOver } from "../property/PropertyPanel";
import { CommandPalette } from "./CommandPalette";
import { NAV } from "./nav";

export function AppShell({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const { theme, sidebarCollapsed, toggleSidebar, setPalette, setUser, user } = useUI();
  const seeded = useWorkspace((s) => s.seeded && s.seedVersion === SEED_VERSION);
  const loadSeed = useWorkspace((s) => s.loadSeed);
  const setCurrentUser = useWorkspace((s) => s.setCurrentUser);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => setMounted(true), []);
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); }, [theme]);
  useEffect(() => {
    api.me().then(({ user }) => { setUser(user); setCurrentUser(user.id); }).catch(() => {});
  }, [setUser, setCurrentUser]);
  useEffect(() => {
    if (!mounted || seeded) return;
    api.seed().then(({ seed }) => seed && loadSeed(seed)).catch((e) => setSeedError(e.message));
  }, [mounted, seeded, loadSeed]);

  // keyboard: ⌘K palette, g-prefixed navigation
  const gPressed = useRef(0);
  useEffect(() => {
    const keys = Object.fromEntries(NAV.flatMap((s) => s.items).filter((i) => i.key).map((i) => [i.key!.split(" ")[1], i.href]));
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); return; }
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "g") { gPressed.current = Date.now(); return; }
      if (Date.now() - gPressed.current < 900 && keys[e.key]) { router.push(keys[e.key]); gPressed.current = 0; }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [router, setPalette]);

  if (!mounted || !seeded) {
    return (
      <div className="h-screen flex items-center justify-center text-muted text-[13px] gap-2">
        <MapPinned size={16} className="text-accent animate-pulse" />
        {seedError ? <span className="text-bad">Could not load workspace: {seedError}</span> : "Loading workspace…"}
      </div>
    );
  }

  const fullBleed = pathname.startsWith("/map") || pathname.startsWith("/deal-finder") || pathname.startsWith("/drive") || pathname.startsWith("/deal-desk/");
  return (
    <div className="h-screen flex overflow-hidden">
      <aside className={cx("no-print hidden md:flex flex-col border-r border-border bg-panel shrink-0 transition-[width]", sidebarCollapsed ? "w-[52px]" : "w-[212px]")}>
        <div className="flex items-center h-12 px-3 gap-2 border-b border-border">
          <MapPinned size={18} className="text-accent shrink-0" />
          {!sidebarCollapsed && <span className="font-semibold text-[14px] tracking-tight">Parcel<span className="text-muted font-normal"> · Wholesale OS</span></span>}
        </div>
        <button onClick={() => setPalette(true)} className={cx("mx-2 mt-2 flex items-center gap-2 h-8 rounded-md border border-border bg-panel-2 text-muted text-[12.5px] hover:text-fg", sidebarCollapsed ? "justify-center" : "px-2")}>
          <Search size={14} />{!sidebarCollapsed && <><span className="flex-1 text-left">Search…</span><Kbd>⌘K</Kbd></>}
        </button>
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
          {NAV.map((sec) => (
            <div key={sec.section}>
              {!sidebarCollapsed && <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">{sec.section}</div>}
              {sec.items.map((it) => {
                const active = pathname === it.href || pathname.startsWith(it.href + "/");
                const Icon = it.icon;
                return (
                  <Link key={it.href} href={it.href} title={sidebarCollapsed ? it.label : undefined}
                    className={cx("flex items-center gap-2.5 h-[30px] rounded-md px-2 text-[12.5px] transition",
                      active ? "bg-accent-soft text-accent-text font-medium" : "text-fg-2 hover:bg-hover hover:text-fg", sidebarCollapsed && "justify-center")}>
                    <Icon size={15} className="shrink-0" />
                    {!sidebarCollapsed && <span className="truncate">{it.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-2 flex items-center gap-1">
          <button onClick={toggleSidebar} className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted hover:bg-hover" title="Collapse sidebar">
            {sidebarCollapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
          </button>
          {!sidebarCollapsed && <span className="text-[10.5px] text-muted ml-auto pr-1">Demo data · synthetic</span>}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar user={user} />
        <main className={cx("flex-1 min-h-0", fullBleed ? "overflow-hidden" : "overflow-y-auto pb-20 md:pb-6")}>{children}</main>
        <MobileNav />
      </div>

      <QuickAddButton />
      <QuickActions />
      <CommandPalette />
      <PropertySlideOver />
      <Toaster />
    </div>
  );
}

function TopBar({ user }: { user: ReturnType<typeof useUI.getState>["user"] }) {
  const { theme, setTheme, setPalette, openQuick } = useUI();
  const router = useRouter();
  const resetAll = useWorkspace((s) => s.resetAll);
  return (
    <header className="no-print flex items-center gap-2 h-12 px-3 md:px-4 border-b border-border bg-panel shrink-0">
      <Link href="/dashboard" className="md:hidden"><MapPinned size={18} className="text-accent" /></Link>
      <button onClick={() => setPalette(true)} className="flex items-center gap-2 h-8 w-full max-w-[420px] rounded-md border border-border bg-panel-2 px-2.5 text-[12.5px] text-muted hover:border-border-strong">
        <Search size={14} /><span className="flex-1 text-left truncate">Search address, owner, APN, phone, buyer…</span><span className="hidden sm:inline"><Kbd>⌘K</Kbd></span>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => openQuick("lead")} className="hidden sm:inline-flex">New lead</Button>
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-fg-2 hover:bg-hover" title="Toggle theme">
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <Menu trigger={(t) => <button onClick={t} className="h-8 px-1.5 inline-flex items-center gap-2 rounded-md hover:bg-hover"><Avatar name={user?.name ?? "User"} size={24} /></button>}>
          {(close) => (
            <>
              <div className="px-2 py-1.5 border-b border-border mb-1">
                <div className="text-[12.5px] font-medium">{user?.name}</div>
                <div className="text-[11px] text-muted">{user?.email} · {user ? ROLE_LABEL[user.role] : ""}</div>
              </div>
              <MenuItem icon={<User size={14} />} onClick={() => { close(); router.push("/settings"); }}>Settings</MenuItem>
              <MenuItem icon={<LogOut size={14} />} onClick={async () => { close(); await api.logout(); resetAll(); router.replace("/login"); }}>Sign out</MenuItem>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}

const MOBILE = [
  { href: "/dashboard", label: "Home" }, { href: "/map", label: "Map" }, { href: "/drive", label: "Drive" }, { href: "/leads", label: "Leads" }, { href: "/tasks", label: "Tasks" },
];
function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="no-print md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 border-t border-border bg-panel">
      {MOBILE.map((m) => (
        <Link key={m.href} href={m.href} className={cx("h-14 flex items-center justify-center text-[12px] font-medium", pathname.startsWith(m.href) ? "text-accent" : "text-muted")}>{m.label}</Link>
      ))}
    </nav>
  );
}

const QUICK: { id: Exclude<QuickAction, null>; label: string; icon: typeof Plus }[] = [
  { id: "property", label: "New Property", icon: Building2 }, { id: "lead", label: "New Lead", icon: UserPlus }, { id: "seller", label: "New Seller", icon: User },
  { id: "comps", label: "Run Comps", icon: ScanSearch }, { id: "offer", label: "New Offer", icon: Gavel }, { id: "buyer", label: "New Buyer", icon: Handshake },
  { id: "task", label: "New Task", icon: CheckSquare }, { id: "list", label: "New List", icon: ListPlus },
];

function QuickAddButton() {
  const [open, setOpen] = useState(false);
  const openQuick = useUI((s) => s.openQuick);
  const pathname = usePathname();
  if (pathname.startsWith("/drive")) return null;
  return (
    <div className="no-print fixed right-4 bottom-20 md:bottom-5 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="anim-fade rounded-xl border border-border bg-panel p-1 shadow-pop w-48">
          {QUICK.map((q) => (
            <button key={q.id} onClick={() => { setOpen(false); openQuick(q.id); }} className="flex w-full items-center gap-2 rounded-md px-2.5 h-8 text-[12.5px] hover:bg-hover">
              <q.icon size={14} className="text-muted" />{q.label}
            </button>
          ))}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-label="Quick actions" className="h-12 w-12 rounded-full bg-accent text-white shadow-pop flex items-center justify-center hover:brightness-110 transition">
        {open ? <X size={20} /> : <Plus size={22} />}
      </button>
    </div>
  );
}

function QuickActions() {
  const { quick, quickContext, openQuick, toast, openPanel } = useUI();
  const close = () => openQuick(null);
  const router = useRouter();
  const ws = useWorkspace();
  const [dup, setDup] = useState<{ label: string; existingId: string; p: import("@/lib/types").PropertySummary } | null>(null);
  const [sellerName, setSellerName] = useState("");
  const [sellerLead, setSellerLead] = useState("");

  const saveAsLead = (p: import("@/lib/types").PropertySummary, force = false) => {
    const d = ws.findDuplicateLead(p);
    if (d && !force) return setDup({ label: d.label, existingId: d.existingId, p });
    const l = ws.saveLead(p, { source: "other", force });
    toast(`Lead saved — ${p.line1}`, "good", { label: "Open", href: `/properties/${p.id}` });
    setDup(null);
    close();
    return l;
  };

  const titles: Record<Exclude<QuickAction, null>, string> = {
    property: "New property", lead: "New lead", seller: "New seller", comps: "Run comps", offer: "New offer", buyer: "New buyer", task: "New task", list: "New list",
  };
  if (!quick) return null;
  return (
    <Dialog open onClose={() => { setDup(null); close(); }} title={titles[quick]} width={quick === "buyer" ? 640 : 520}>
      {(quick === "lead" || quick === "property") && (
        <div className="space-y-3">
          <p className="text-[12px] text-muted">{quick === "property" ? "Look up a property from the connected data provider, then open it or save it." : "Find the property; the owner and property facts come from the data provider."}</p>
          <PropertyPicker autoFocus onPick={(p) => {
            if (quick === "property") { close(); openPanel(p.id); return; }
            saveAsLead(p);
          }} />
          {dup && (
            <div className="rounded-md border border-warn/40 bg-warn-soft p-2.5 text-[12.5px]">
              <div className="font-medium text-warn">Duplicate detected — this property is already a lead: {dup.label}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="xs" variant="primary" onClick={() => { close(); setDup(null); router.push(`/properties/${dup.p.id}`); }}>Open existing (link)</Button>
                <Button size="xs" onClick={() => saveAsLead(dup.p, true)}>Keep separate</Button>
              </div>
            </div>
          )}
        </div>
      )}
      {quick === "comps" && (
        <div className="space-y-2">
          <p className="text-[12px] text-muted">Choose the subject property.</p>
          <PropertyPicker autoFocus onPick={(p) => { close(); router.push(`/comps?id=${encodeURIComponent(p.id)}`); }} />
        </div>
      )}
      {quick === "offer" && (
        <div className="space-y-2">
          <p className="text-[12px] text-muted">Offers are built from the deal analysis. Choose a lead to open its Deal Desk.</p>
          <div className="max-h-80 overflow-y-auto divide-y divide-border rounded-md border border-border">
            {ws.leads.filter((l) => !l.deletedAt && !["closed", "dead"].includes(l.stage)).map((l) => (
              <button key={l.id} onClick={() => { close(); router.push(`/deal-desk/${l.propertyId}?tab=offer`); }} className="flex w-full justify-between px-3 py-2 text-left text-[12.5px] hover:bg-hover">
                <span>{l.property.line1}, {l.property.city}</span><span className="text-muted">{l.stage.replace(/_/g, " ")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {quick === "seller" && (
        <div className="space-y-3">
          <label className="block text-[12px] text-fg-2">Lead / property
            <select className="input mt-1" value={sellerLead || quickContext?.leadId || ""} onChange={(e) => setSellerLead(e.target.value)}>
              <option value="">Choose…</option>
              {ws.leads.filter((l) => !l.deletedAt && !l.sellerId).map((l) => <option key={l.id} value={l.id}>{l.property.line1} — {l.property.ownerName}</option>)}
            </select>
          </label>
          <label className="block text-[12px] text-fg-2">Seller name<input className="input mt-1" value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="Defaults to owner of record" /></label>
          <div className="flex justify-end gap-2"><Button onClick={close}>Cancel</Button>
            <Button variant="primary" onClick={() => {
              const leadId = sellerLead || quickContext?.leadId;
              if (!leadId) return;
              ws.upsertSeller({ leadId, ...(sellerName ? { name: sellerName } : {}) });
              const l = ws.leads.find((x) => x.id === leadId);
              toast("Seller created");
              close();
              if (l) router.push(`/properties/${l.propertyId}?tab=seller`);
            }}>Create seller</Button>
          </div>
        </div>
      )}
      {quick === "buyer" && <BuyerForm onDone={close} />}
      {quick === "task" && <TaskForm leadId={quickContext?.leadId} onDone={close} />}
      {quick === "list" && <ListForm onDone={close} />}
    </Dialog>
  );
}

function Toaster() {
  const { toasts, dismiss } = useUI();
  return (
    <div className="no-print fixed bottom-20 md:bottom-5 left-1/2 -translate-x-1/2 z-[90] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="anim-fade pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-panel px-3 py-2 shadow-pop text-[12.5px]">
          <span className={cx("h-1.5 w-1.5 rounded-full", t.tone === "bad" ? "bg-bad" : t.tone === "info" ? "bg-info" : "bg-good")} />
          {t.text}
          {t.action && <Link href={t.action.href} className="text-accent font-medium" onClick={() => dismiss(t.id)}>{t.action.label}</Link>}
        </div>
      ))}
    </div>
  );
}
