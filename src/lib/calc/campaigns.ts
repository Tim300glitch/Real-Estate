import type { Campaign, Disposition, Lead } from "../types";

export function campaignStats(c: Campaign, leads: Lead[], dispositions: Disposition[]) {
  const ls = leads.filter((l) => !l.deletedAt && l.campaignId === c.id);
  const uc = ls.filter((l) => l.stageHistory.some((h) => ["under_contract", "disposition", "closing", "closed"].includes(h.stage)) || ["under_contract", "disposition", "closing", "closed"].includes(l.stage));
  const closed = ls.filter((l) => l.stage === "closed");
  const revenue = closed.reduce((s, l) => s + (dispositions.find((d) => d.leadId === l.id)?.actualFee ?? 0), 0);
  return {
    leads: ls.length, contracts: uc.length, closed: closed.length, revenue,
    cpl: ls.length ? c.spend / ls.length : null, cpc: uc.length ? c.spend / uc.length : null, cpd: closed.length ? c.spend / closed.length : null,
    roi: c.spend ? (revenue - c.spend) / c.spend : null, responseRate: c.sent ? c.responses / c.sent : null,
  };
}

export const CHANNEL_LABEL: Record<Campaign["channel"], string> = {
  direct_mail: "Direct mail", cold_call: "Cold calling", sms: "SMS", email: "Email", ppc: "PPC / paid search", driving_for_dollars: "Driving for dollars", deal_blast: "Deal blast", referral: "Referral",
};
