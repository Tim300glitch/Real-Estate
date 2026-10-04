// Business KPIs derived from workspace records. Every metric documents its
// definition so dashboards never show an unexplained number.
import { usd } from "../format";
import type { Buyer, BuyerOffer, Campaign, Communication, Disposition, Lead, LeadStage, Offer, DealBlast, Appointment } from "../types";

const DAY = 86400000;
const reached = (l: Lead, s: LeadStage) => l.stageHistory.some((h) => h.stage === s) || l.stage === s;
const reachedUC = (l: Lead) => reached(l, "under_contract") || reached(l, "disposition") || reached(l, "closing") || reached(l, "closed");
const firstAt = (l: Lead, stages: LeadStage[]) => l.stageHistory.find((h) => stages.includes(h.stage))?.at;

export interface WorkspaceSlice {
  leads: Lead[]; offers: Offer[]; dispositions: Disposition[]; buyerOffers: BuyerOffer[]; campaigns: Campaign[];
  comms: Communication[]; blasts: DealBlast[]; buyers: Buyer[]; appointments: Appointment[];
  savedSearches: { newMatchIds: string[] }[];
}

export interface Metric { key: string; label: string; value: number | null; format: "int" | "usd" | "pct" | "days"; definition: string; href?: string }

export function computeKpis(w: WorkspaceSlice, now = new Date()) {
  const leads = w.leads.filter((l) => !l.deletedAt);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const d30 = new Date(now.getTime() - 30 * DAY);
  const d7 = new Date(now.getTime() - 7 * DAY);
  const after = (iso: string | undefined, d: Date) => !!iso && new Date(iso) >= d;

  const closedDisps = w.dispositions.filter((d) => d.status === "closed" && d.actualFee != null);
  const openDisps = w.dispositions.filter((d) => !["closed", "cancelled"].includes(d.status));
  const winning = (d: Disposition) => w.buyerOffers.find((o) => o.id === d.winningOfferId);
  const projected = openDisps.reduce((s, d) => s + ((winning(d)?.amount ?? d.askingPrice) - d.contractPrice), 0);
  const feesMonth = closedDisps.filter((d) => after(d.feeReceivedAt, monthStart)).reduce((s, d) => s + (d.actualFee ?? 0), 0);
  const revenueYtd = closedDisps.filter((d) => after(d.feeReceivedAt, new Date(now.getFullYear(), 0, 1))).reduce((s, d) => s + (d.actualFee ?? 0), 0);
  const revenueAll = closedDisps.reduce((s, d) => s + (d.actualFee ?? 0), 0);
  const ucLeads = leads.filter(reachedUC);
  const closedLeads = leads.filter((l) => l.stage === "closed");
  const toContract = ucLeads.map((l) => { const at = firstAt(l, ["under_contract", "disposition", "closing", "closed"]); return at ? (new Date(at).getTime() - new Date(l.createdAt).getTime()) / DAY : null; }).filter((x): x is number => x != null);
  const toClose = closedLeads.map((l) => (l.closedAt ? (new Date(l.closedAt).getTime() - new Date(l.createdAt).getTime()) / DAY : null)).filter((x): x is number => x != null);
  const sellerSpend = w.campaigns.filter((c) => c.audience === "seller").reduce((s, c) => s + c.spend, 0);
  const campaignLeads = leads.filter((l) => l.campaignId && w.campaigns.find((c) => c.id === l.campaignId)?.audience === "seller");
  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const in14 = new Date(now.getTime() + 14 * DAY).toISOString().slice(0, 10);

  const kpis: Metric[] = [
    { key: "newLeadsToday", label: "New leads today", value: leads.filter((l) => after(l.createdAt, today)).length, format: "int", definition: "Leads created since midnight.", href: "/leads" },
    { key: "newProps", label: "New properties found (7d)", value: leads.filter((l) => after(l.createdAt, d7)).length + w.savedSearches.reduce((s, x) => s + x.newMatchIds.length, 0), format: "int", definition: "Leads added in the last 7 days + new matches flagged on saved-search refresh.", href: "/deal-finder" },
    { key: "hot", label: "Hot leads", value: leads.filter((l) => l.status === "hot" && !["closed", "dead"].includes(l.stage)).length, format: "int", definition: "Open leads with status Hot.", href: "/leads?status=hot" },
    { key: "offersSent", label: "Offers sent (30d)", value: w.offers.filter((o) => after(o.sentAt, d30)).length, format: "int", definition: "Seller offers with a sent date in the last 30 days.", href: "/offers" },
    { key: "offersAccepted", label: "Offers accepted (30d)", value: w.offers.filter((o) => o.status === "accepted" && after(o.respondedAt, d30)).length, format: "int", definition: "Offers marked accepted in the last 30 days.", href: "/offers" },
    { key: "underContract", label: "Under contract", value: leads.filter((l) => ["under_contract", "disposition", "closing"].includes(l.stage)).length, format: "int", definition: "Leads in Under Contract, Disposition or Closing.", href: "/pipeline" },
    { key: "marketed", label: "Deals being marketed", value: w.dispositions.filter((d) => ["marketing", "reviewing_offers"].includes(d.status)).length, format: "int", definition: "Dispositions in Marketing or Reviewing Offers.", href: "/dispositions" },
    { key: "buyerInterest", label: "Buyer interest", value: w.blasts.filter((b) => openDisps.some((d) => d.id === b.dispositionId)).flatMap((b) => b.recipients).filter((r) => r.status === "interested" || r.status === "offer_submitted").length, format: "int", definition: "Buyers marked interested or who submitted offers on open deals.", href: "/dispositions" },
    { key: "closingSoon", label: "Closing in 14 days", value: openDisps.filter((d) => d.closingDate <= in14).length, format: "int", definition: "Open dispositions with a closing date within 14 days.", href: "/dispositions" },
    { key: "closedMonth", label: "Closed this month", value: closedDisps.filter((d) => after(d.feeReceivedAt, monthStart)).length, format: "int", definition: "Dispositions closed since the 1st of this month.", href: "/analytics" },
    { key: "projectedFees", label: "Projected assignment fees", value: projected, format: "usd", definition: "Σ (winning buyer offer, else assignment asking price) − contract price, over open dispositions." },
    { key: "actualFees", label: "Actual fees (month)", value: feesMonth, format: "usd", definition: "Σ recorded assignment fees received this month." },
    { key: "avgFee", label: "Avg assignment fee", value: avg(closedDisps.map((d) => d.actualFee!)), format: "usd", definition: "Mean recorded assignment fee, all closed deals." },
    { key: "leadToContract", label: "Lead → contract", value: leads.length ? ucLeads.length / leads.length : null, format: "pct", definition: "Leads that ever reached Under Contract ÷ all leads." },
    { key: "contractToClose", label: "Contract → close", value: ucLeads.length ? closedLeads.length / ucLeads.length : null, format: "pct", definition: "Closed leads ÷ leads that reached Under Contract." },
    { key: "daysToContract", label: "Avg days to contract", value: avg(toContract), format: "days", definition: "Mean days from lead creation to first Under Contract stage." },
    { key: "daysToClose", label: "Avg days to close", value: avg(toClose), format: "days", definition: "Mean days from lead creation to Closed." },
    { key: "spend", label: "Marketing spend", value: sellerSpend, format: "usd", definition: "Σ spend on seller-facing campaigns (all time)." },
    { key: "cpl", label: "Cost per lead", value: campaignLeads.length ? sellerSpend / campaignLeads.length : null, format: "usd", definition: "Seller campaign spend ÷ leads attributed to a seller campaign." },
    { key: "cpc", label: "Cost per contract", value: ucLeads.length ? sellerSpend / ucLeads.length : null, format: "usd", definition: "Seller campaign spend ÷ leads that reached Under Contract." },
    { key: "revenue", label: "Revenue (YTD)", value: revenueYtd, format: "usd", definition: "Σ assignment fees received this calendar year." },
    { key: "net", label: "Net profit (all time)", value: revenueAll - sellerSpend, format: "usd", definition: "All-time assignment fees − all-time seller marketing spend (excludes overhead)." },
  ];
  return { kpis, revenueAll, sellerSpend, closedDisps, ucLeads, closedLeads };
}

export function monthlyFees(dispositions: Disposition[], months = 9, now = new Date()) {
  const labels: string[] = [], fees: number[] = [], deals: number[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    labels.push(d.toLocaleDateString("en-US", { month: "short" }));
    const inM = dispositions.filter((x) => x.status === "closed" && x.feeReceivedAt && new Date(x.feeReceivedAt) >= d && new Date(x.feeReceivedAt) < e);
    fees.push(inM.reduce((s, x) => s + (x.actualFee ?? 0), 0));
    deals.push(inM.length);
  }
  return { labels, fees, deals };
}

export interface BreakdownRow { key: string; leads: number; contacted: number; appointments: number; offers: number; contracts: number; closed: number; revenue: number; spend: number }

export function breakdown(w: WorkspaceSlice, keyOf: (l: Lead) => string, spendOf?: (key: string) => number): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const l of w.leads.filter((x) => !x.deletedAt)) {
    const k = keyOf(l) || "—";
    const r = map.get(k) ?? { key: k, leads: 0, contacted: 0, appointments: 0, offers: 0, contracts: 0, closed: 0, revenue: 0, spend: 0 };
    r.leads++;
    if (reached(l, "contacted") || ["follow_up", "appointment", "offer_prep", "offer_sent", "negotiating", "contract_sent"].some((s) => reached(l, s as LeadStage)) || reachedUC(l)) r.contacted++;
    if (reached(l, "appointment") || w.appointments.some((a) => a.leadId === l.id)) r.appointments++;
    if (w.offers.some((o) => o.leadId === l.id && o.status !== "draft") || reached(l, "offer_sent")) r.offers++;
    if (reachedUC(l)) r.contracts++;
    if (l.stage === "closed") {
      r.closed++;
      r.revenue += w.dispositions.find((d) => d.leadId === l.id)?.actualFee ?? 0;
    }
    map.set(k, r);
  }
  const rows = [...map.values()];
  if (spendOf) for (const r of rows) r.spend = spendOf(r.key);
  return rows.sort((a, b) => b.leads - a.leads);
}

export const fmtMetric = (m: Metric) =>
  m.value == null ? "—" : m.format === "usd" ? usd(m.value, { compact: Math.abs(m.value) >= 100000 }) : m.format === "pct" ? `${(m.value * 100).toFixed(1)}%` : m.format === "days" ? `${m.value.toFixed(0)}d` : m.value.toLocaleString();
