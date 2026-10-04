// ════════════════════════════════════════════════════════════════════
// Repair estimator. Unit costs are DEFAULT ASSUMPTIONS for a baseline
// market (multiplier 1.0) and are fully editable per item and per market.
// They are not quotes — always verify with contractors.
// ════════════════════════════════════════════════════════════════════
import type { Condition, RepairItem, RepairUnit } from "../types";

export const CONDITIONS: { id: Condition; label: string }[] = [
  { id: "good", label: "Good" },
  { id: "minor", label: "Minor" },
  { id: "moderate", label: "Moderate" },
  { id: "major", label: "Major" },
  { id: "full", label: "Full Replacement" },
];

export const UNIT_LABEL: Record<RepairUnit, string> = {
  sqft: "sq ft", unit: "unit", room: "room", linear_ft: "linear ft", flat: "flat",
};

export interface CatalogEntry {
  category: string;
  unit: RepairUnit;
  /** default quantity given subject facts */
  qty: (p: { sqft: number; beds: number; baths: number; lotSqft: number }) => number;
  /** cost per unit by condition (good is always 0) */
  cost: Record<Exclude<Condition, "good">, number>;
}

export const REPAIR_CATALOG: CatalogEntry[] = [
  { category: "Roof", unit: "sqft", qty: (p) => Math.round(p.sqft * 1.15), cost: { minor: 0.75, moderate: 2.5, major: 5, full: 7 } },
  { category: "HVAC", unit: "unit", qty: () => 1, cost: { minor: 450, moderate: 2500, major: 6500, full: 11000 } },
  { category: "Electrical", unit: "sqft", qty: (p) => p.sqft, cost: { minor: 0.75, moderate: 2.5, major: 5, full: 8 } },
  { category: "Plumbing", unit: "sqft", qty: (p) => p.sqft, cost: { minor: 0.6, moderate: 2, major: 4.5, full: 7.5 } },
  { category: "Foundation", unit: "flat", qty: () => 1, cost: { minor: 1500, moderate: 6000, major: 15000, full: 35000 } },
  { category: "Windows", unit: "unit", qty: (p) => Math.max(6, Math.round(p.sqft / 120)), cost: { minor: 150, moderate: 450, major: 700, full: 950 } },
  { category: "Doors", unit: "unit", qty: (p) => Math.max(5, p.beds + p.baths + 3), cost: { minor: 100, moderate: 350, major: 600, full: 900 } },
  { category: "Flooring", unit: "sqft", qty: (p) => p.sqft, cost: { minor: 1.5, moderate: 3.5, major: 5.5, full: 7.5 } },
  { category: "Interior paint", unit: "sqft", qty: (p) => p.sqft, cost: { minor: 1.25, moderate: 3.25, major: 4.25, full: 5 } },
  { category: "Exterior paint", unit: "sqft", qty: (p) => p.sqft, cost: { minor: 1, moderate: 2.25, major: 3.5, full: 4.25 } },
  { category: "Kitchen", unit: "flat", qty: () => 1, cost: { minor: 2500, moderate: 9000, major: 18000, full: 32000 } },
  { category: "Bathrooms", unit: "room", qty: (p) => Math.max(1, Math.round(p.baths)), cost: { minor: 1200, moderate: 4500, major: 9000, full: 15000 } },
  { category: "Drywall", unit: "sqft", qty: (p) => p.sqft, cost: { minor: 0.5, moderate: 1.5, major: 3, full: 5 } },
  { category: "Insulation", unit: "sqft", qty: (p) => p.sqft, cost: { minor: 0.5, moderate: 1.25, major: 2, full: 3 } },
  { category: "Landscaping", unit: "flat", qty: () => 1, cost: { minor: 750, moderate: 2000, major: 4500, full: 8000 } },
  { category: "Fencing", unit: "linear_ft", qty: (p) => Math.round(Math.sqrt(p.lotSqft || 6000) * 2.2), cost: { minor: 8, moderate: 22, major: 38, full: 52 } },
  { category: "Concrete", unit: "sqft", qty: () => 400, cost: { minor: 4, moderate: 8, major: 12, full: 16 } },
  { category: "Garage", unit: "flat", qty: () => 1, cost: { minor: 500, moderate: 1500, major: 4000, full: 9000 } },
  { category: "Pool", unit: "flat", qty: () => 1, cost: { minor: 1000, moderate: 4000, major: 12000, full: 25000 } },
  { category: "Appliances", unit: "flat", qty: () => 1, cost: { minor: 600, moderate: 2500, major: 4000, full: 6500 } },
  { category: "Trash removal", unit: "unit", qty: () => 2, cost: { minor: 450, moderate: 550, major: 650, full: 750 } },
  { category: "Demo", unit: "sqft", qty: (p) => p.sqft, cost: { minor: 0.5, moderate: 1.5, major: 3, full: 6 } },
  { category: "Permits", unit: "flat", qty: () => 1, cost: { minor: 300, moderate: 1000, major: 2500, full: 5000 } },
  { category: "Miscellaneous", unit: "flat", qty: () => 1, cost: { minor: 500, moderate: 1500, major: 3000, full: 6000 } },
];

export const MARKET_COST_MULTIPLIERS: { id: string; name: string; multiplier: number }[] = [
  { id: "sacramento", name: "Sacramento, CA", multiplier: 1.0 },
  { id: "bay_area", name: "Bay Area, CA", multiplier: 1.35 },
  { id: "stockton", name: "Stockton / Central Valley", multiplier: 0.92 },
  { id: "conservative", name: "Conservative (+10%)", multiplier: 1.1 },
];

export function catalogUnitCost(category: string, condition: Condition, multiplier = 1): number {
  const e = REPAIR_CATALOG.find((c) => c.category === category);
  if (!e || condition === "good") return 0;
  return +(e.cost[condition] * multiplier).toFixed(2);
}

export function newRepairItem(category: string, condition: Condition, subject: { sqft: number; beds: number; baths: number; lotSqft: number }, multiplier = 1, room?: string): RepairItem {
  const e = REPAIR_CATALOG.find((c) => c.category === category);
  return {
    id: Math.random().toString(36).slice(2, 10),
    category,
    room,
    condition,
    unit: e?.unit ?? "flat",
    quantity: e ? e.qty(subject) : 1,
    unitCost: catalogUnitCost(category, condition, multiplier),
  };
}

export const itemTotal = (i: RepairItem) => i.quantity * i.unitCost;

export interface RepairTotals {
  subtotal: number;
  contingency: number;
  low: number;
  expected: number;
  high: number;
  byCategory: { category: string; total: number }[];
  explanation: string;
}

/** Low = subtotal × 0.85 (no contingency); Expected = subtotal × (1 + contingency); High = subtotal × 1.25 × (1 + contingency) */
export function repairTotals(items: RepairItem[], contingencyPct: number): RepairTotals {
  const subtotal = items.reduce((s, i) => s + itemTotal(i), 0);
  const c = contingencyPct / 100;
  const map = new Map<string, number>();
  for (const i of items) map.set(i.category, (map.get(i.category) ?? 0) + itemTotal(i));
  return {
    subtotal,
    contingency: subtotal * c,
    low: Math.round(subtotal * 0.85),
    expected: Math.round(subtotal * (1 + c)),
    high: Math.round(subtotal * 1.25 * (1 + c)),
    byCategory: [...map.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total),
    explanation: `Low = subtotal × 0.85 · Expected = subtotal × (1 + ${contingencyPct}% contingency) · High = subtotal × 1.25 × (1 + ${contingencyPct}%)`,
  };
}

export const WALKTHROUGH_ROOMS = [
  "Exterior", "Roof", "Living Room", "Kitchen", "Bedroom 1", "Bedroom 2", "Bedroom 3",
  "Bathroom", "Garage", "Backyard", "Mechanical", "Foundation",
];

/** Suggested repair categories per room, used by walkthrough mode */
export const ROOM_CATEGORIES: Record<string, string[]> = {
  Exterior: ["Exterior paint", "Windows", "Doors", "Concrete"],
  Roof: ["Roof"],
  "Living Room": ["Flooring", "Interior paint", "Drywall"],
  Kitchen: ["Kitchen", "Appliances", "Flooring"],
  "Bedroom 1": ["Flooring", "Interior paint"],
  "Bedroom 2": ["Flooring", "Interior paint"],
  "Bedroom 3": ["Flooring", "Interior paint"],
  Bathroom: ["Bathrooms", "Plumbing"],
  Garage: ["Garage"],
  Backyard: ["Landscaping", "Fencing", "Pool", "Trash removal"],
  Mechanical: ["HVAC", "Electrical", "Plumbing"],
  Foundation: ["Foundation"],
};
