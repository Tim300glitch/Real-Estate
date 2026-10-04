"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type QuickAction = "property" | "lead" | "seller" | "comps" | "offer" | "buyer" | "task" | "list" | null;

interface Toast { id: number; text: string; tone?: "good" | "bad" | "info"; action?: { label: string; href: string } }

interface UIState {
  theme: "light" | "dark";
  sidebarCollapsed: boolean;
  paletteOpen: boolean;
  quick: QuickAction;
  quickContext: { leadId?: string; propertyId?: string } | null;
  panelPropertyId: string | null;
  toasts: Toast[];
  user: { id: string; name: string; email: string; role: import("../types").Role } | null;
  setTheme(t: "light" | "dark"): void;
  toggleSidebar(): void;
  setPalette(open: boolean): void;
  openQuick(q: QuickAction, ctx?: UIState["quickContext"]): void;
  openPanel(id: string | null): void;
  toast(text: string, tone?: Toast["tone"], action?: Toast["action"]): void;
  dismiss(id: number): void;
  setUser(u: UIState["user"]): void;
}

let tid = 0;
export const useUI = create<UIState>()(
  persist(
    (set) => ({
      theme: "dark",
      sidebarCollapsed: false,
      paletteOpen: false,
      quick: null,
      quickContext: null,
      panelPropertyId: null,
      toasts: [],
      user: null,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setPalette: (paletteOpen) => set({ paletteOpen }),
      openQuick: (quick, quickContext = null) => set({ quick, quickContext, paletteOpen: false }),
      openPanel: (panelPropertyId) => set({ panelPropertyId }),
      toast: (text, tone = "good", action) => {
        const id = ++tid;
        set((s) => ({ toasts: [...s.toasts, { id, text, tone, action }].slice(-4) }));
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
      },
      dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      setUser: (user) => set({ user }),
    }),
    { name: "wholesale-os-ui", partialize: (s) => ({ theme: s.theme, sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);
