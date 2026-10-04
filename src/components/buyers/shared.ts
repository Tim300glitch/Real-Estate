import type { DispositionStatus } from "@/lib/types";

export const DISP_TONE: Record<DispositionStatus, "neutral" | "accent" | "warn" | "good" | "violet" | "bad" | "info"> = {
  preparing: "neutral", marketing: "accent", reviewing_offers: "warn", assigned: "violet", closing: "info", closed: "good", cancelled: "bad",
};
