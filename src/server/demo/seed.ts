import "server-only";
// Builds the fictional demo workspace (CRM records) on top of the synthetic
// provider dataset so every lead points at a real (synthetic) provider record.
import { DEFAULT_PRESETS, inputsFromPreset } from "@/lib/calc/deal";
import { newRepairItem } from "@/lib/calc/repairs";
import type { SeedData } from "@/lib/store/workspace";
import type {
  Activity, Appointment, Buyer, BuyerOffer, Campaign, Communication, ContactPoint, Contract, DealAnalysis, DealBlast,
  Disposition, DocumentRecord, Lead, LeadList, LeadSource, LeadStage, Note, Offer, PinStatus, PropertySummary,
  RepairEstimate, SavedSearch, Seller, Task, Condition,
} from "@/lib/types";
import { PROPERTIES } from "../providers/demo/dataset";
import { demoSummary } from "../providers/demo/provider";

const DAY = 86400000;
const at = (daysAgo: number, hour = 10, min = 0) => {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};
let n = 0;
const id = (p: string) => `${p}${(++n).toString(36).padStart(4, "0")}`;

const phone = (v: string, status: ContactPoint["status"], type: ContactPoint["phoneType"] = "mobile", extra: Partial<ContactPoint> = {}): ContactPoint =>
  ({ id: id("cp_"), kind: "phone", value: v, phoneType: type, status, source: "Demo Skip Trace (synthetic)", dnc: false, optedOut: false, smsConsent: false, addedAt: at(20), ...extra });
const email = (v: string, status: ContactPoint["status"]): ContactPoint =>
  ({ id: id("cp_"), kind: "email", value: v, status, source: "Demo Skip Trace (synthetic)", dnc: false, optedOut: false, smsConsent: false, addedAt: at(20) });

export function buildSeed(): SeedData {
  n = 0;
  const leads: Lead[] = [], sellers: Seller[] = [], comms: Communication[] = [], tasks: Task[] = [], appointments: Appointment[] = [];
  const notes: Note[] = [], repairs: RepairEstimate[] = [], analyses: DealAnalysis[] = [], offers: Offer[] = [], contracts: Contract[] = [];
  const dispositions: Disposition[] = [], blasts: DealBlast[] = [], buyerOffers: BuyerOffer[] = [], activities: Activity[] = [], documents: DocumentRecord[] = [];

  const S = (pid: string) => {
    const s = demoSummary(pid);
    if (!s) throw new Error(`seed: missing property ${pid}`);
    return s;
  };
  const act = (daysAgo: number, hour: number, min: number, type: string, text: string, leadId?: string, propertyId?: string, userId = "u-acq") =>
    activities.push({ id: id("ac_"), at: at(daysAgo, hour, min), type, text, leadId, propertyId, userId });

  function lead(pid: string, stage: LeadStage, status: PinStatus, source: LeadSource, createdDaysAgo: number, tags: string[], extra: Partial<Lead> = {}): Lead {
    const p = S(pid);
    const flow: LeadStage[] = ["new_lead", "researching", "contact_attempted", "contacted", "follow_up", "appointment", "offer_prep", "offer_sent", "negotiating", "contract_sent", "under_contract", "disposition", "closing", "closed"];
    const idx = stage === "dead" ? 3 : flow.indexOf(stage);
    const hist = flow.slice(0, idx + 1).map((s, i) => ({ stage: s, at: at(createdDaysAgo - (createdDaysAgo * i) / Math.max(1, idx + 1), 9 + (i % 7)) }));
    if (stage === "dead") hist.push({ stage: "dead", at: at(Math.max(0, createdDaysAgo - 10)) });
    const l: Lead = {
      id: id("ld_"), propertyId: pid, property: p, stage, status, source, assignedTo: "u-acq", tags, createdAt: at(createdDaysAgo, 9),
      updatedAt: hist[hist.length - 1].at, stageChangedAt: hist[hist.length - 1].at, stageHistory: hist, ...extra,
    };
    leads.push(l);
    act(createdDaysAgo, 9, 12, "lead.created", `Seller lead added — ${p.line1}`, l.id, pid);
    return l;
  }
  function seller(l: Lead, s: Partial<Seller>): Seller {
    const r: Seller = { id: id("sl_"), leadId: l.id, name: l.property.ownerName, contacts: [], motivation: 3, timeline: "", reasonForSelling: "", condition: "", occupancy: "", decisionMakers: "", preferredComm: "any", answers: {}, createdAt: l.createdAt, ...s };
    sellers.push(r);
    l.sellerId = r.id;
    return r;
  }
  function comm(l: Lead, daysAgo: number, hour: number, min: number, type: Communication["type"], direction: Communication["direction"], outcome: string | undefined, body?: string, user = "u-acq") {
    comms.push({ id: id("cm_"), leadId: l.id, type, direction, outcome, body, at: at(daysAgo, hour, min), userId: user });
    if (direction !== "internal" && (!l.lastContactAt || at(daysAgo, hour, min) > l.lastContactAt)) l.lastContactAt = at(daysAgo, hour, min);
  }
  function analysis(pid: string, arv: number, repairsAmt: number, sellerAsk: number | undefined, purchase: number, overrides: Partial<ReturnType<typeof inputsFromPreset>> = {}) {
    const preset = DEFAULT_PRESETS[0];
    analyses.push({ id: id("da_"), propertyId: pid, updatedAt: at(2), inputs: inputsFromPreset(preset, { arv, arvSource: "calculated", repairs: repairsAmt, repairsSource: "estimator", sellerAsk, purchasePrice: purchase, ...overrides }) });
  }
  function repairEst(pid: string, items: [string, Condition][], contingency = 10) {
    const p = S(pid);
    const subj = { sqft: p.sqft ?? 1500, beds: p.beds ?? 3, baths: p.baths ?? 2, lotSqft: p.lotSqft ?? 6000 };
    repairs.push({ id: id("re_"), propertyId: pid, marketId: "sacramento", contingencyPct: contingency, items: items.map(([c, cond]) => ({ ...newRepairItem(c, cond, subj), id: id("ri_") })), walkthrough: [], updatedAt: at(3) });
  }
  function task(l: Lead | null, title: string, type: Task["type"], dueDaysFromNow: number, hour = 10, done = false, assignee = "u-acq", priority: Task["priority"] = 2) {
    tasks.push({ id: id("tk_"), title, type, leadId: l?.id, dueAt: at(-dueDaysFromNow, hour), completedAt: done ? at(-dueDaysFromNow, hour + 1) : undefined, assignee, priority, createdAt: at(Math.max(1, 3 - dueDaysFromNow)) });
  }

  // ── 1. Good deal: 7428 Alder Grove Way ───────────────────────────
  const alder = lead("f-alder-grove", "offer_sent", "hot", "direct_mail", 12, ["Hot Lead", "High Equity", "Motivated - Relocation"], { askingPrice: 335000, campaignId: "cp_dm_q3" });
  seller(alder, {
    contacts: [phone("916-555-0142", "verified", "mobile", { smsConsent: true }), phone("916-555-0187", "unverified", "landline"), email("dolores.whitfield@example.com", "likely")],
    motivation: 4, timeline: "Within 60 days — moving near daughter in Boise", askingPrice: 335000, mortgageEstimate: 41000,
    reasonForSelling: "Relocating to be closer to family; doesn't want to deal with repairs or showings", condition: "Original 1971 kitchen and baths, roof ~22 years old, HVAC replaced 2012, some dry rot at eaves",
    occupancy: "Owner occupied — can be vacant by closing", decisionMakers: "Dolores (sole owner); daughter Karen helping", preferredComm: "call",
    answers: { why: "Moving to Boise to be near her daughter.", timeline: "Ideally closed before the holidays.", repairs: "Kitchen/baths dated, roof older, some rot.", occupied: "Yes, by owner.", mortgage: "Small balance with Golden 1, around $41k.", price: "Hoping for $335k — a neighbor listed for $460k.", ifnot: "Would list with an agent in spring, but dreads showings." },
  });
  comm(alder, 11, 9, 21, "call", "outbound", "No answer");
  comm(alder, 11, 9, 23, "sms", "outbound", "Delivered", "Hi Dolores, this is Sam with Capitol Home Partners following up on the letter about your home on Alder Grove Way. Is now a good time to chat? Reply STOP to opt out.");
  comm(alder, 11, 14, 40, "sms", "inbound", "Replied", "Yes this is Dolores, you can call after 3.");
  comm(alder, 11, 15, 12, "call", "outbound", "Connected", "18 min. Relocating to Boise, wants simple sale, dated interior, asks $335k.");
  comm(alder, 9, 11, 0, "appointment", "outbound", "Scheduled", "Walkthrough booked");
  comm(alder, 7, 11, 5, "note", "internal", undefined, "Walkthrough done: kitchen/baths original, roof near end of life, eaves rot on south side. Good bones, 2-car garage.");
  comm(alder, 2, 16, 10, "call", "outbound", "Connected", "Presented offer verbally at $285k, explained repair math. She'll discuss with daughter.");
  appointments.push({ id: id("ap_"), leadId: alder.id, title: "Walkthrough — 7428 Alder Grove Way", kind: "walkthrough", startsAt: at(7, 11), durationMin: 45, location: "7428 Alder Grove Way, Sacramento", status: "completed", assignee: "u-acq" });
  repairEst("f-alder-grove", [["Kitchen", "moderate"], ["Bathrooms", "moderate"], ["Roof", "full"], ["Interior paint", "moderate"], ["Flooring", "minor"], ["Exterior paint", "minor"], ["Landscaping", "minor"], ["Trash removal", "minor"]]);
  analysis("f-alder-grove", 465000, 48000, 335000, 285000, { investorPct: 0.8, wholesaleFee: 22000, offerTargetPct: 0.056, offerLowPct: 0.105 });
  offers.push({ id: id("of_"), leadId: alder.id, propertyId: "f-alder-grove", amount: 285000, earnestMoney: 5000, closeDays: 21, inspectionDays: 10, terms: "All cash, as-is. Seller may remain 14 days post-close.", templateId: "tpl-flex", status: "sent", arv: 465000, repairs: 48000, mao: 302000, projectedFee: 39000, sellerAsk: 335000, createdAt: at(2, 15, 50), sentAt: at(2, 16, 15) });
  task(alder, "Follow up with Dolores on $285k offer", "follow_up", 0, 15, false, "u-acq", 1);
  task(alder, "Send written offer PDF to daughter (Karen)", "send_offer", -1, 10, true);
  notes.push({ id: id("nt_"), entityType: "lead", entityId: alder.id, body: "Daughter Karen is the real decision influencer — loop her in on every call. Dolores wants to leave the patio furniture.", pinned: true, tags: ["decision maker"], viaVoice: false, photoIds: [], userId: "u-acq", at: at(10, 16) });
  act(9, 11, 7, "arv.calculated", "ARV calculated — $465,000 (6 comps) — 7428 Alder Grove Way", alder.id, "f-alder-grove");
  act(2, 11, 18, "offer.created", "Offer created — $285,000 · 7428 Alder Grove Way", alder.id, "f-alder-grove");

  // ── 2. Marginal deal: 2219 Bellhaven Ct ──────────────────────────
  const bell = lead("f-bellhaven", "appointment", "potential", "cold_call", 6, ["Follow Up"], { askingPrice: 395000, campaignId: "cp_cc_td" });
  seller(bell, {
    contacts: [phone("916-555-0119", "likely", "mobile"), phone("916-555-0164", "unverified", "landline")],
    motivation: 3, timeline: "3–6 months", askingPrice: 395000, mortgageEstimate: 118000, reasonForSelling: "Kids moved out; considering downsizing but not urgent",
    condition: "Partially updated 2008 (windows), foundation crack reported by Raymond", occupancy: "Owner occupied", decisionMakers: "Raymond & Inez (both on title)", preferredComm: "call",
    answers: { why: "Downsizing, maybe.", price: "Around $395k.", ifnot: "Stay put." },
  });
  comm(bell, 6, 13, 30, "call", "outbound", "Connected", "Warm-ish. Wants to see an offer before deciding.");
  comm(bell, 5, 10, 0, "sms", "outbound", "Delivered", "Thanks Raymond — confirming Thursday 4pm walkthrough. Reply STOP to opt out.");
  appointments.push({ id: id("ap_"), leadId: bell.id, title: "Walkthrough — 2219 Bellhaven Ct", kind: "walkthrough", startsAt: at(-1, 16), durationMin: 60, location: "2219 Bellhaven Ct, Sacramento", status: "scheduled", assignee: "u-acq" });
  repairEst("f-bellhaven", [["Foundation", "moderate"], ["Kitchen", "major"], ["Bathrooms", "moderate"], ["Flooring", "moderate"], ["Interior paint", "moderate"], ["Electrical", "minor"], ["HVAC", "major"]]);
  analysis("f-bellhaven", 528000, 85000, 395000, 0);
  task(bell, "Walkthrough prep: pull foundation permit history", "other", 0, 13, false, "u-va");

  // ── 3. Bad deal: 4810 Marlow Ave ─────────────────────────────────
  const marlow = lead("f-marlow", "follow_up", "potential", "website", 18, [], { askingPrice: 575000 });
  seller(marlow, {
    contacts: [phone("916-555-0133", "verified", "mobile", { smsConsent: true }), email("praman.home@example.com", "verified")],
    motivation: 2, timeline: "No rush", askingPrice: 575000, mortgageEstimate: 418000, reasonForSelling: "Curious what cash buyers pay; considering relocation for work",
    condition: "Updated 2021, light cosmetic only", occupancy: "Owner occupied", decisionMakers: "Priya & Vikram", preferredComm: "email",
  });
  comm(marlow, 18, 19, 4, "email", "inbound", "Web form", "Interested in a cash offer, house is in great shape.");
  comm(marlow, 17, 10, 30, "call", "outbound", "Connected", "Retail-condition home, wants near-retail price. Low motivation.");
  analysis("f-marlow", 612000, 18000, 575000, 0);
  repairEst("f-marlow", [["Interior paint", "minor"], ["Landscaping", "minor"], ["Miscellaneous", "minor"]]);
  task(marlow, "Quarterly check-in (nurture)", "follow_up", 30, 10, false, "u-va", 3);

  // ── 4. High-equity absentee: 3316 Cedar Ridge Dr ─────────────────
  const cedar = lead("f-cedar-ridge", "contact_attempted", "potential", "list", 9, ["Absentee", "High Equity"], { campaignId: "cp_dm_q3" });
  seller(cedar, {
    contacts: [phone("602-555-0177", "likely", "mobile"), phone("602-555-0121", "unverified", "landline", { dnc: true }), email("hpettersen@example.com", "unverified")],
    motivation: 3, timeline: "", reasonForSelling: "", condition: "Tenant-occupied, deferred maintenance (per drive-by)", occupancy: "Tenant", decisionMakers: "Harold", preferredComm: "any",
  });
  comm(cedar, 8, 11, 2, "call", "outbound", "Voicemail", "Left VM #1");
  comm(cedar, 6, 17, 45, "call", "outbound", "No answer");
  comm(cedar, 3, 12, 15, "call", "outbound", "Voicemail", "Left VM #2 (mentioned tenant-occupied OK)");
  comm(cedar, 3, 12, 20, "mail", "outbound", "Mailed", "Handwritten letter to Phoenix mailing address");
  task(cedar, "Call Harold (attempt #4)", "call_seller", 0, 11, false, "u-acq", 2);
  analysis("f-cedar-ridge", 418000, 42000, undefined, 0);

  // ── 5. Probate: 5527 Juniper Hollow Rd ───────────────────────────
  const jun = lead("f-juniper", "researching", "potential", "probate_list", 4, ["Probate", "Vacant", "Tax Delinquent"]);
  seller(jun, { name: "Estate of Margaret L. Okafor (Adm.: Daniel Okafor)", contacts: [], motivation: 4, timeline: "", reasonForSelling: "Estate administration", condition: "Vacant since early 2025; overgrown yard", occupancy: "Vacant", decisionMakers: "Court-appointed administrator", preferredComm: "any" });
  comm(jun, 4, 9, 40, "note", "internal", undefined, "Probate case filed ~6 months ago. Administrator: Daniel Okafor (son). Attorney of record listed on docket — contact through attorney first.");
  task(jun, "Skip trace administrator Daniel Okafor", "other", 0, 9, false, "u-va", 1);
  task(jun, "Send probate condolence letter via attorney", "other", 1, 10);
  notes.push({ id: id("nt_"), entityType: "lead", entityId: jun.id, body: "Be respectful — family lost their mother in Dec. Court confirmation may be required for sale; factor 45–60 day close.", pinned: true, tags: ["probate"], viaVoice: false, photoIds: [], userId: "u-owner", at: at(4, 10) });
  analysis("f-juniper", 389000, 61000, undefined, 0);
  repairEst("f-juniper", [["Kitchen", "major"], ["Bathrooms", "major"], ["Roof", "major"], ["Flooring", "major"], ["Interior paint", "moderate"], ["Electrical", "moderate"], ["Landscaping", "moderate"], ["Trash removal", "major"]]);

  // ── 6. Tired landlord: 1408 Fremont Terrace ──────────────────────
  const fre = lead("f-fremont-terrace", "negotiating", "hot", "direct_mail", 25, ["Hot Lead", "Tax Delinquent", "Distressed"], { askingPrice: 360000, campaignId: "cp_dm_q3" });
  seller(fre, {
    name: "Victor Delgado (Delgado Rental Holdings LLC)", contacts: [phone("916-555-0158", "verified", "mobile", { smsConsent: true }), email("vdelgado.rentals@example.com", "verified")],
    motivation: 5, timeline: "ASAP — tired of tenants", askingPrice: 360000, mortgageEstimate: 96000,
    reasonForSelling: "Problem tenant in unit B, two code cases, behind on property taxes", condition: "Both units dated; unit B needs full turn", occupancy: "Unit A tenant (month-to-month), Unit B vacant", decisionMakers: "Victor (managing member)", preferredComm: "sms",
    answers: { why: "Done being a landlord.", timeline: "Yesterday.", mortgage: "About $96k left with BofA.", price: "Started at $360k, flexible." },
  });
  comm(fre, 25, 10, 5, "call", "inbound", "Connected", "Called from mailer. Very motivated.");
  comm(fre, 20, 14, 0, "note", "internal", undefined, "Walked both units. Unit B: trashed, needs full turn. Unit A ok.");
  comm(fre, 14, 9, 0, "offer", "outbound", "sent", "Offer $318,000");
  comm(fre, 13, 18, 22, "sms", "inbound", "Replied", "Can you do 340? That covers taxes and the loan with some left.");
  comm(fre, 1, 11, 30, "call", "outbound", "Connected", "Discussed meeting at $329k with 14-day close. He's considering.");
  repairEst("f-fremont-terrace", [["Kitchen", "moderate"], ["Bathrooms", "moderate"], ["Flooring", "major"], ["Interior paint", "major"], ["Drywall", "moderate"], ["Doors", "moderate"], ["Trash removal", "full"], ["Permits", "moderate"]]);
  analysis("f-fremont-terrace", 455000, 52000, 360000, 329000, { investorPct: 0.82, wholesaleFee: 18000 });
  offers.push({ id: id("of_"), leadId: fre.id, propertyId: "f-fremont-terrace", amount: 318000, earnestMoney: 3000, closeDays: 14, inspectionDays: 7, terms: "All cash, as-is, tenant in place OK.", templateId: "tpl-cash", status: "countered", counterAmount: 340000, arv: 455000, repairs: 52000, mao: 321000, projectedFee: 21000, sellerAsk: 360000, createdAt: at(14, 8, 40), sentAt: at(14, 9), respondedAt: at(13, 18, 22) });
  task(fre, "Send revised offer at $329k", "send_offer", 0, 12, false, "u-acq", 1);

  // ── 7. Driving for dollars: 6043 Wren Hollow Way ─────────────────
  const wren = lead("f-wren-hollow", "new_lead", "potential", "driving_for_dollars", 1, ["Driving for Dollars", "Vacant", "Distressed"], { campaignId: "cp_d4d" });
  notes.push({ id: id("nt_"), entityType: "lead", entityId: wren.id, body: "D4D: boarded rear windows, overgrown yard, 3 newspapers on porch, roof tarp on garage.", pinned: false, tags: ["d4d"], viaVoice: true, photoIds: [], userId: "u-acq", at: at(1, 17, 40) });
  task(wren, "Skip trace owner (Redding mailing address)", "other", 0, 9, false, "u-va");

  // ── 8. Pre-foreclosure: 8821 Sable Creek Dr ──────────────────────
  const sable = lead("f-sable-creek", "contacted", "hot", "sms", 5, ["Pre-Foreclosure", "Hot Lead"], { campaignId: "cp_sms_pf" });
  seller(sable, {
    contacts: [phone("916-555-0109", "verified", "mobile", { smsConsent: true })],
    motivation: 4, timeline: "Before auction (Nov 18)", mortgageEstimate: 352000, reasonForSelling: "Job loss; 5 payments behind", condition: "Good, lightly dated", occupancy: "Owner occupied", decisionMakers: "Marcus & Tanya", preferredComm: "sms",
    answers: { mortgage: "~$352k plus arrears ~$19k.", timeline: "Must resolve before auction date." },
  });
  comm(sable, 5, 12, 0, "sms", "outbound", "Delivered", "Hi Marcus — we help homeowners with options before a foreclosure sale. Happy to talk if helpful. Reply STOP to opt out.");
  comm(sable, 4, 19, 10, "sms", "inbound", "Replied", "We might need to sell. What would you pay?");
  comm(sable, 3, 10, 0, "call", "outbound", "Connected", "Equity is thin (~$200k est. value gap vs ARV but payoff high). Explained options incl. listing w/ agent.");
  task(sable, "Get payoff/reinstatement figures (authorization signed)", "other", 1, 10, false, "u-acq", 1);
  analysis("f-sable-creek", 612000, 22000, 470000, 0);
  repairEst("f-sable-creek", [["Interior paint", "moderate"], ["Flooring", "minor"], ["Landscaping", "minor"], ["Appliances", "minor"]]);

  // ── Buyers ───────────────────────────────────────────────────────
  const B = (name: string, company: string | undefined, phoneNo: string, mail: string, zips: string[], markets: string[], types: Buyer["propertyTypes"], minP: number, maxP: number, rehab: Buyer["rehabTolerance"], strategies: Buyer["strategies"], deals: number, avg: number, rel: number, pof: number | null, lastDays: number, margin = 15, minBeds = 2): Buyer => ({
    id: id("by_"), name, company, contacts: [
      { id: id("cp_"), kind: "phone", value: phoneNo, phoneType: "mobile", status: "verified", source: "Buyer provided", dnc: false, optedOut: false, smsConsent: true, addedAt: at(200) },
      { id: id("cp_"), kind: "email", value: mail, status: "verified", source: "Buyer provided", dnc: false, optedOut: false, smsConsent: false, addedAt: at(200) },
    ], markets, zips, propertyTypes: types, minPrice: minP, maxPrice: maxP, minBeds, rehabTolerance: rehab, strategies, desiredMarginPct: margin,
    dealsPurchased: deals, avgPurchasePrice: avg, reliability: rel, pofAmount: pof ?? undefined, pofVerifiedAt: pof ? at(30) : undefined, lastActivityAt: at(lastDays), tags: [], createdAt: at(300),
  });
  const buyers: Buyer[] = [
    B("Marcus Tate", "Willow Bend Homes LLC", "916-555-0201", "marcus@willowbend.example.com", ["95827", "95826", "95823", "95828", "95670"], ["Sacramento", "Rancho Cordova"], ["sfr"], 220000, 420000, "heavy", ["flip"], 14, 318000, 5, 1500000, 3),
    B("Elena Voss", "Sierra Gate Capital", "916-555-0202", "elena@sierragate.example.com", ["95828", "95823", "95824", "95832", "95820"], ["Sacramento", "Elk Grove"], ["sfr", "duplex"], 250000, 450000, "full_gut", ["flip", "brrrr"], 22, 341000, 5, 3000000, 2, 12),
    B("Dwayne Holcomb", "Two Rivers Renovation", "916-555-0203", "dwayne@tworivers.example.com", ["95820", "95824", "95817", "95822"], ["Sacramento"], ["sfr"], 200000, 380000, "heavy", ["flip"], 9, 286000, 4, 900000, 11),
    B("Brianna Shaw", "Capitol Flip Co.", "916-555-0204", "bri@capitolflip.example.com", ["95821", "95608", "95610", "95841"], ["Sacramento", "Carmichael", "Citrus Heights"], ["sfr", "townhouse"], 280000, 520000, "moderate", ["flip"], 7, 389000, 4, 1200000, 6),
    B("Tomás Aguilar", "Greenleaf BRRRR Partners", "916-555-0205", "tomas@greenleaf.example.com", ["95660", "95838", "95815", "95823"], ["North Highlands", "Sacramento"], ["sfr", "duplex", "triplex", "fourplex"], 180000, 420000, "heavy", ["brrrr", "hold"], 11, 274000, 4, 800000, 9),
    B("Kenji Watanabe", "Northgate Rental Holdings", "916-555-0206", "kenji@northgate.example.com", ["95660", "95842", "95610", "95621"], ["North Highlands", "Citrus Heights"], ["sfr", "duplex", "fourplex"], 200000, 450000, "moderate", ["hold"], 16, 301000, 5, 2000000, 20),
    B("Ruth Okonkwo", "Delta Land Ventures", "916-555-0207", "ruth@deltaland.example.com", ["95838", "95817", "95834"], ["Sacramento"], ["lot", "land"], 40000, 250000, "full_gut", ["land"], 5, 118000, 3, 600000, 40),
    B("Avi Rosen", "Midtown Multifamily Group", "916-555-0208", "avi@midtownmf.example.com", ["95817", "95818", "95816", "95660"], ["Sacramento", "North Highlands"], ["duplex", "triplex", "fourplex", "multifamily"], 300000, 1200000, "heavy", ["multifamily", "hold"], 8, 612000, 4, 2500000, 14),
    B("Carla Jimenez", "Folsom Lake Homes", "916-555-0209", "carla@folsomlake.example.com", ["95670", "95608", "95610", "95630"], ["Rancho Cordova", "Carmichael", "Citrus Heights"], ["sfr"], 300000, 550000, "moderate", ["flip"], 6, 402000, 3, null, 33),
    B("Derek Lund", "Pinecrest Property Solutions", "916-555-0210", "derek@pinecrest.example.com", ["95758", "95757", "95624", "95828"], ["Elk Grove", "Sacramento"], ["sfr"], 320000, 560000, "cosmetic", ["flip", "hold"], 4, 455000, 3, 700000, 18),
    B("Mina Farouk", "Harborline Investments", "916-555-0211", "mina@harborline.example.com", ["95823", "95828", "95824", "95832", "95822"], ["Sacramento"], ["sfr", "duplex"], 200000, 400000, "full_gut", ["flip", "brrrr"], 12, 297000, 4, 1100000, 5),
    B("Josh Pratt", "Bluebird Home Buyers", "916-555-0212", "josh@bluebird.example.com", ["95826", "95827", "95670", "95821"], ["Sacramento", "Rancho Cordova"], ["sfr", "condo", "townhouse"], 180000, 400000, "moderate", ["flip"], 3, 265000, 2, null, 75),
    B("Grant Hollis", undefined, "916-555-0213", "grant.hollis@example.com", ["95818", "95822", "95820"], ["Sacramento"], ["sfr"], 300000, 600000, "heavy", ["flip"], 2, 420000, 3, 500000, 26),
    B("Yesenia Cruz", "Cruz Family Rentals", "916-555-0214", "yesenia@cruzrentals.example.com", ["95824", "95823", "95828", "95832"], ["Sacramento"], ["sfr", "duplex"], 180000, 340000, "moderate", ["hold", "brrrr"], 6, 248000, 4, 450000, 12),
  ];
  const byName = (nm: string) => buyers.find((b) => b.name === nm)!;

  // ── 9. Under contract / dispositions: 4471 Quarry Oak Ct ─────────
  const quarry = lead("f-quarry-oak", "disposition", "under_contract", "ppc", 34, ["Under Contract"], { askingPrice: 305000, campaignId: "cp_ppc" });
  seller(quarry, { contacts: [phone("916-555-0171", "verified", "mobile", { smsConsent: true })], motivation: 4, timeline: "30 days", askingPrice: 305000, mortgageEstimate: 12800, reasonForSelling: "Moving into assisted living", condition: "Dated throughout, roof ok", occupancy: "Owner occupied until close", decisionMakers: "Lorraine + son (POA)", preferredComm: "call" });
  comm(quarry, 34, 10, 0, "call", "inbound", "Connected", "PPC lead. Moving to assisted living.");
  comm(quarry, 27, 13, 0, "offer", "outbound", "sent", "Offer $290,000");
  comm(quarry, 24, 16, 30, "offer", "inbound", "accepted", "Agreed at $296,000");
  repairEst("f-quarry-oak", [["Kitchen", "moderate"], ["Bathrooms", "moderate"], ["Flooring", "moderate"], ["Interior paint", "moderate"], ["Exterior paint", "minor"], ["HVAC", "moderate"], ["Landscaping", "minor"]]);
  analysis("f-quarry-oak", 420000, 46000, 305000, 296000, { wholesaleFee: 25000 });
  offers.push({ id: id("of_"), leadId: quarry.id, propertyId: "f-quarry-oak", amount: 296000, earnestMoney: 5000, closeDays: 30, inspectionDays: 10, terms: "Cash, as-is.", templateId: "tpl-cash", status: "accepted", arv: 420000, repairs: 46000, mao: 0, projectedFee: 25000, sellerAsk: 305000, createdAt: at(26), sentAt: at(26), respondedAt: at(24) });
  contracts.push({ id: id("ct_"), leadId: quarry.id, kind: "purchase_agreement", title: "Purchase agreement — 4471 Quarry Oak Ct", status: "executed", amount: 296000, party: "Lorraine A. Bechtel", esignProvider: "demo", history: [{ status: "draft", at: at(24) }, { status: "sent", at: at(24) }, { status: "viewed", at: at(23) }, { status: "signed", at: at(23) }, { status: "executed", at: at(22) }], createdAt: at(24) });
  contracts.push({ id: id("ct_"), leadId: quarry.id, kind: "disclosure", title: "Seller disclosure packet — 4471 Quarry Oak Ct", status: "sent", history: [{ status: "draft", at: at(20) }, { status: "sent", at: at(19) }], createdAt: at(20) });
  const dq: Disposition = { id: id("dp_"), leadId: quarry.id, contractPrice: 296000, askingPrice: 324900, minimumPrice: 312000, accessInstructions: "Lockbox on side gate (code shared with confirmed buyers only). Seller home weekdays after 2pm — text 24h ahead.", closingDate: at(-16).slice(0, 10), earnestMoney: 5000, titleCompany: "Placer Sierra Title (demo)", titleContact: "Nina Alvarez · escrow officer", status: "reviewing_offers", showFullAddress: false, selectedBuyerIds: [], createdAt: at(21) };
  dispositions.push(dq);
  const qBuyers = ["Marcus Tate", "Elena Voss", "Dwayne Holcomb", "Mina Farouk", "Yesenia Cruz", "Josh Pratt"].map((x) => byName(x).id);
  dq.selectedBuyerIds = qBuyers;
  blasts.push({ id: id("bl_"), dispositionId: dq.id, channel: "email", subject: "Off-market 3/2 in Valley Hi — $324,900 · ARV ~$420k", body: "", sentAt: at(5, 9, 30), recipients: [
    { buyerId: qBuyers[0], status: "offer_submitted", at: at(3) }, { buyerId: qBuyers[1], status: "offer_submitted", at: at(2) }, { buyerId: qBuyers[2], status: "interested", at: at(4) },
    { buyerId: qBuyers[3], status: "offer_submitted", at: at(1) }, { buyerId: qBuyers[4], status: "opened", at: at(5) }, { buyerId: qBuyers[5], status: "passed", at: at(4) },
  ] });
  buyerOffers.push(
    { id: id("bo_"), dispositionId: dq.id, buyerId: qBuyers[0], amount: 315000, closeDays: 14, emd: 10000, pofVerified: true, status: "pending", at: at(3, 15) },
    { id: id("bo_"), dispositionId: dq.id, buyerId: qBuyers[1], amount: 321000, closeDays: 10, emd: 10000, pofVerified: true, status: "pending", at: at(2, 11) },
    { id: id("bo_"), dispositionId: dq.id, buyerId: qBuyers[3], amount: 324000, closeDays: 21, emd: 5000, pofVerified: false, status: "pending", notes: "Needs 21 days; POF pending", at: at(1, 17) },
  );
  act(5, 9, 31, "blast.sent", "Deal blast (email) sent to 6 buyers — 4471 Quarry Oak Ct", quarry.id, undefined, "u-dispo");
  act(0, 14, 14, "buyer.access", "Buyer requested access — Dwayne Holcomb · 4471 Quarry Oak Ct", quarry.id, undefined, "u-dispo");

  // ── 10. Closing: 1126 Bramblewood Dr ─────────────────────────────
  const bram = lead("f-bramblewood", "closing", "under_contract", "direct_mail", 41, ["Under Contract"], { askingPrice: 310000, campaignId: "cp_dm_q3" });
  seller(bram, { name: "Gerald Sorensen (Trustee)", contacts: [phone("916-555-0193", "verified", "landline")], motivation: 4, timeline: "45 days", askingPrice: 310000, reasonForSelling: "Moving to Oregon", condition: "Dated, pool needs resurfacing", occupancy: "Owner occupied", decisionMakers: "Gerald & Ana (co-trustees)", preferredComm: "call" });
  analysis("f-bramblewood", 438000, 44000, 310000, 302000, { wholesaleFee: 25000 });
  repairEst("f-bramblewood", [["Kitchen", "moderate"], ["Pool", "moderate"], ["Flooring", "moderate"], ["Interior paint", "moderate"], ["Bathrooms", "minor"]]);
  contracts.push({ id: id("ct_"), leadId: bram.id, kind: "purchase_agreement", title: "Purchase agreement — 1126 Bramblewood Dr", status: "executed", amount: 302000, party: "Sorensen Living Trust", esignProvider: "demo", history: [{ status: "sent", at: at(30) }, { status: "executed", at: at(29) }], createdAt: at(30) });
  const db: Disposition = { id: id("dp_"), leadId: bram.id, contractPrice: 302000, askingPrice: 329000, minimumPrice: 318000, accessInstructions: "Seller present; schedule via Sam.", closingDate: at(-9).slice(0, 10), earnestMoney: 5000, titleCompany: "Capitol Valley Escrow (demo)", titleContact: "Mark Ibarra", status: "closing", showFullAddress: true, selectedBuyerIds: [byName("Brianna Shaw").id, byName("Kenji Watanabe").id, byName("Carla Jimenez").id], createdAt: at(28) };
  dispositions.push(db);
  const wb: BuyerOffer = { id: id("bo_"), dispositionId: db.id, buyerId: byName("Brianna Shaw").id, amount: 327000, closeDays: 14, emd: 10000, pofVerified: true, status: "accepted", at: at(20) };
  buyerOffers.push(wb, { id: id("bo_"), dispositionId: db.id, buyerId: byName("Kenji Watanabe").id, amount: 322500, closeDays: 21, emd: 5000, pofVerified: true, status: "declined", at: at(21) });
  db.winningOfferId = wb.id;
  contracts.push({ id: id("ct_"), leadId: bram.id, dispositionId: db.id, kind: "assignment_agreement", title: "Assignment agreement — Brianna Shaw", status: "executed", amount: 327000, party: "Brianna Shaw", esignProvider: "demo", history: [{ status: "sent", at: at(19) }, { status: "executed", at: at(18) }], createdAt: at(19) });
  contracts.push({ id: id("ct_"), leadId: bram.id, dispositionId: db.id, kind: "proof_of_funds", title: "Proof of funds — Capitol Flip Co.", status: "signed", history: [{ status: "signed", at: at(20) }], createdAt: at(20) });
  task(bram, "Confirm title has assignment + EMD receipt", "contact_title", 1, 11, false, "u-dispo", 1);
  task(bram, "Check closing — final walkthrough with buyer", "check_closing", 7, 10, false, "u-dispo");
  appointments.push({ id: id("ap_"), leadId: bram.id, title: "Closing — 1126 Bramblewood Dr", kind: "closing", startsAt: at(-9, 14), durationMin: 60, location: "Capitol Valley Escrow (demo)", status: "scheduled", assignee: "u-dispo" });

  // ── 11 & 12. Closed deals ────────────────────────────────────────
  function closed(pid: string, closedDaysAgo: number, contractPrice: number, buyerName: string, fee: number, arv: number, rep: number, source: LeadSource, campaignId?: string) {
    const l = lead(pid, "closed", "owned", source, closedDaysAgo + 45, [], { campaignId, closedAt: at(closedDaysAgo, 15) });
    l.stageHistory[l.stageHistory.length - 1].at = at(closedDaysAgo, 15);
    analysis(pid, arv, rep, undefined, contractPrice, { wholesaleFee: fee });
    const d: Disposition = { id: id("dp_"), leadId: l.id, contractPrice, askingPrice: contractPrice + fee, minimumPrice: contractPrice + fee / 2, accessInstructions: "", closingDate: at(closedDaysAgo).slice(0, 10), earnestMoney: 5000, titleCompany: "Placer Sierra Title (demo)", titleContact: "", status: "closed", showFullAddress: true, selectedBuyerIds: [], actualFee: fee, feeReceivedAt: at(closedDaysAgo, 15), createdAt: at(closedDaysAgo + 20) };
    const bo: BuyerOffer = { id: id("bo_"), dispositionId: d.id, buyerId: byName(buyerName).id, amount: contractPrice + fee, closeDays: 14, emd: 10000, pofVerified: true, status: "accepted", at: at(closedDaysAgo + 14) };
    d.winningOfferId = bo.id;
    dispositions.push(d);
    buyerOffers.push(bo);
    contracts.push({ id: id("ct_"), leadId: l.id, kind: "purchase_agreement", title: `Purchase agreement — ${l.property.line1}`, status: "executed", amount: contractPrice, history: [{ status: "executed", at: at(closedDaysAgo + 25) }], createdAt: at(closedDaysAgo + 26) });
    contracts.push({ id: id("ct_"), leadId: l.id, dispositionId: d.id, kind: "assignment_agreement", title: `Assignment agreement — ${buyerName}`, status: "executed", amount: contractPrice + fee, history: [{ status: "executed", at: at(closedDaysAgo + 13) }], createdAt: at(closedDaysAgo + 14) });
    act(closedDaysAgo, 15, 5, "deal.closed", `Closed — assignment fee $${fee.toLocaleString()} · ${l.property.line1}`, l.id, pid, "u-dispo");
    return l;
  }
  closed("f-pebble-run", 22, 290500, "Marcus Tate", 21500, 405000, 38000, "direct_mail", "cp_dm_q3");
  closed("f-thornapple", 2, 314000, "Elena Voss", 24000, 472000, 51000, "cold_call", "cp_cc_td");

  // ── Historical leads from the provider dataset (for analytics realism) ──
  const pool = PROPERTIES.filter((p) => p.id.startsWith("p-") && p.propertyType === "sfr" && p.motivationScore >= 30);
  const sources: [LeadSource, string | undefined][] = [["direct_mail", "cp_dm_q3"], ["cold_call", "cp_cc_td"], ["sms", "cp_sms_pf"], ["ppc", "cp_ppc"], ["driving_for_dollars", "cp_d4d"], ["referral", undefined], ["list", undefined]];
  const histStages: LeadStage[] = ["dead", "dead", "dead", "follow_up", "contact_attempted", "contacted", "dead", "new_lead", "researching", "follow_up", "dead", "contacted"];
  const reps = ["u-acq", "u-acq", "u-owner", "u-va"];
  for (let i = 0; i < 46; i++) {
    const p = pool[(i * 37) % pool.length];
    const [src, camp] = sources[i % sources.length];
    const stage = histStages[i % histStages.length];
    const created = 3 + ((i * 53) % 230);
    const l = lead(p.id, stage, stage === "dead" ? "dead" : i % 9 === 0 ? "hot" : "potential", src, created, [], { campaignId: camp, assignedTo: reps[i % reps.length], deadReason: stage === "dead" ? ["Not motivated", "Listed with agent", "Price too high", "Wrong number / no contact", "Sold to another investor"][i % 5] : undefined });
    if (stage !== "new_lead" && stage !== "researching") comm(l, Math.max(0, created - 2), 10 + (i % 6), (i * 7) % 60, "call", "outbound", i % 3 === 0 ? "Connected" : "No answer");
  }
  // historical closed deals (earlier months) for revenue trend
  const histClosed: [number, number, number, string][] = [
    [48, 265000, 18500, "Dwayne Holcomb"], [67, 301000, 22000, "Mina Farouk"], [96, 248000, 15000, "Yesenia Cruz"], [119, 333000, 27500, "Elena Voss"],
    [151, 276000, 19000, "Tomás Aguilar"], [176, 289000, 16500, "Marcus Tate"], [205, 312000, 31000, "Avi Rosen"], [236, 259000, 14000, "Dwayne Holcomb"],
  ];
  const closedPool = PROPERTIES.filter((p) => p.id.startsWith("p-") && p.propertyType === "sfr" && (p.estValue ?? 0) > 250000 && (p.estValue ?? 0) < 380000);
  histClosed.forEach(([d, price, fee, buyer], i) => {
    const p = closedPool[(i * 101 + 7) % closedPool.length];
    closed(p.id, d, price, buyer, fee, Math.round(price * 1.42 / 1000) * 1000, Math.round(price * 0.14 / 1000) * 1000, sources[i % 5][0], sources[i % 5][1]);
  });

  // ── Lists & saved searches ──
  const sum = (ids: string[]) => ids.map((x) => demoSummary(x)).filter(Boolean) as PropertySummary[];
  const highEqAbs = PROPERTIES.filter((p) => p.owner.absentee && (p.equityPct ?? 0) >= 60 && (p.yearsOwned ?? 0) >= 10 && p.propertyType === "sfr").slice(0, 60).map((p) => p.id);
  const vacant = PROPERTIES.filter((p) => p.distress.vacant).slice(0, 40).map((p) => p.id);
  const mk = (name: string, ids: string[], color: string, description?: string): LeadList => {
    const m = sum(ids);
    return { id: id("ls_"), name, description, dynamic: false, propertyIds: m.map((x) => x.id), members: Object.fromEntries(m.map((x) => [x.id, x])), color, createdAt: at(30) };
  };
  const lists: LeadList[] = [
    mk("High Equity Sacramento", highEqAbs, "#3b82f6", "Absentee, 60%+ equity, 10+ yrs owned — Q3 mailer"),
    mk("Vacant Properties", vacant, "#f97316"),
    mk("Driving for Dollars", ["f-wren-hollow"], "#22c55e"),
    mk("Probate Leads", ["f-juniper", ...PROPERTIES.filter((p) => p.distress.probate).slice(0, 15).map((p) => p.id)], "#a855f7"),
    { id: id("ls_"), name: "Tired Landlords (dynamic)", dynamic: true, rules: { tiredLandlord: "yes", minYearsOwned: 10 }, propertyIds: [], members: {}, color: "#eab308", createdAt: at(20), description: "Auto: absentee, 10+ yrs, distress signals" },
    { id: id("ls_"), name: "Free & Clear Old Houses (dynamic)", dynamic: true, rules: { freeAndClear: "yes", maxYearBuilt: 1970, propertyTypes: ["sfr"] }, propertyIds: [], members: {}, color: "#06b6d4", createdAt: at(15) },
    { id: id("ls_"), name: "Pre-Foreclosure (dynamic)", dynamic: true, rules: { preForeclosure: "yes" }, propertyIds: [], members: {}, color: "#ef4444", createdAt: at(10) },
  ];
  const savedSearches: SavedSearch[] = [
    { id: id("ss_"), name: "Sacramento Absentee Equity", filters: { propertyTypes: ["sfr"], absentee: "yes", minEquityPct: 60, minYearsOwned: 10, minValue: 250000, maxValue: 700000 }, createdAt: at(30), lastRunAt: at(7), lastResultIds: highEqAbs.slice(0, 40), newMatchIds: [] },
    { id: id("ss_"), name: "Old SFR, long-term owners", filters: { propertyTypes: ["sfr"], maxYearBuilt: 1990, minYearsOwned: 15, absentee: "yes", minEquityPct: 60 }, createdAt: at(14), lastRunAt: at(14), lastResultIds: [], newMatchIds: [] },
  ];

  const campaigns: Campaign[] = [
    { id: "cp_dm_q3", name: "Direct Mail — Absentee High Equity (Q3)", audience: "seller", channel: "direct_mail", spend: 6850, startDate: at(95).slice(0, 10), status: "active", listId: lists[0].id, sent: 4200, responses: 61 },
    { id: "cp_cc_td", name: "Cold Calling — Tax Delinquent", audience: "seller", channel: "cold_call", spend: 2400, startDate: at(120).slice(0, 10), status: "active", sent: 3100, responses: 48 },
    { id: "cp_sms_pf", name: "SMS — Pre-Foreclosure (consented)", audience: "seller", channel: "sms", spend: 640, startDate: at(60).slice(0, 10), status: "active", sent: 380, responses: 22 },
    { id: "cp_ppc", name: "PPC — “sell my house fast Sacramento”", audience: "seller", channel: "ppc", spend: 3900, startDate: at(150).slice(0, 10), status: "active", sent: 0, responses: 37 },
    { id: "cp_d4d", name: "Driving for Dollars — South Sac", audience: "seller", channel: "driving_for_dollars", spend: 260, startDate: at(45).slice(0, 10), status: "active", sent: 0, responses: 0 },
    { id: "cp_blast_q", name: "Deal Blast — 4471 Quarry Oak Ct", audience: "buyer", channel: "deal_blast", spend: 0, startDate: at(5).slice(0, 10), status: "active", sent: 6, responses: 4 },
  ];

  // generic tasks
  task(null, "Weekly KPI review with acquisitions", "other", 2, 9, false, "u-owner", 3);
  task(cedar, "Mail second letter to Phoenix address", "other", -2, 10, false, "u-va", 3); // overdue
  task(bell, "Run comps after walkthrough", "run_comps", 1, 9);
  task(alder, "Request roof photos from Dolores", "request_photos", -1, 14, false, "u-acq", 2); // overdue

  documents.push({ id: id("dc_"), name: "Offer — 7428 Alder Grove Way ($285,000).pdf", kind: "offer", leadId: alder.id, propertyId: "f-alder-grove", createdAt: at(2, 16), generated: true });
  documents.push({ id: id("dc_"), name: "Deal Package — 4471 Quarry Oak Ct.pdf", kind: "deal_package", leadId: quarry.id, propertyId: "f-quarry-oak", createdAt: at(5, 9), generated: true });

  act(0, 10, 42, "lead.created", "Seller lead added — 6043 Wren Hollow Way (Driving for Dollars)", wren.id, "f-wren-hollow");
  act(0, 11, 7, "arv.calculated", "ARV calculated — $455,000 · 1408 Fremont Terrace", fre.id, "f-fremont-terrace");
  act(0, 11, 18, "offer.created", "Offer drafted — $329,000 · 1408 Fremont Terrace", fre.id, "f-fremont-terrace");
  act(0, 12, 2, "task.created", "Seller follow-up scheduled — 7428 Alder Grove Way", alder.id, "f-alder-grove");

  activities.sort((a, b) => b.at.localeCompare(a.at));
  comms.sort((a, b) => b.at.localeCompare(a.at));
  return {
    leads, sellers, comms, tasks, appointments, notes, compSets: [], repairs, analyses, offers, contracts, buyers, dispositions,
    blasts, buyerOffers, lists, savedSearches, campaigns, activities, documents, routes: [], suppression: [
      { kind: "phone", value: "9165550199", reason: "Requested no contact (call 2026)", at: at(40) },
    ], savedAreas: [
      { id: "ar_southsac", name: "South Sac farm area", ring: [[-121.47, 38.475], [-121.39, 38.475], [-121.39, 38.53], [-121.47, 38.53], [-121.47, 38.475]], createdAt: at(30) },
    ],
  };
}

