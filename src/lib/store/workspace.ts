"use client";
// ════════════════════════════════════════════════════════════════════
// Workspace store — the CRM side of the app (leads, sellers, comps,
// analyses, offers, contracts, buyers, dispositions, tasks …).
//
// DEMO MODE: persisted to the browser (localStorage) so the app is fully
// usable without a database. Every mutation goes through an action that
// also writes an activity + audit entry — the same boundary at which a
// Supabase/Postgres repository would issue its INSERT/UPDATE (see
// db/migrations/001_init.sql for the matching tables).
// ════════════════════════════════════════════════════════════════════
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_CRITERIA, DEFAULT_WEIGHTS } from "../calc/comps";
import { DEFAULT_PRESETS } from "../calc/deal";
import { DEFAULT_DEAL_WEIGHTS, DEFAULT_MOTIVATION_WEIGHTS, type DealScoreWeights, type MotivationWeights } from "../calc/scores";
import { normalizeAddress, normalizeEmail, normalizePhone, uid } from "../format";
import type {
  Activity, Appointment, AuditEntry, Buyer, BuyerOffer, Campaign, CommType, Communication, CompCriteria, CompSet,
  ContactPoint, Contract, ContractStatus, D4DRoute, DealAnalysis, DealBlast, Disposition, DocumentRecord, FollowUpSequence,
  Lead, LeadList, LeadSource, LeadStage, MarketPreset, Note, Offer, OfferStatus, PinStatus, PropertySummary,
  RepairEstimate, SavedSearch, Seller, SimilarityWeights, Task, TeamUser,
} from "../types";

export interface ComplianceSettings {
  enforceDnc: boolean;
  requireSmsConsent: boolean;
  quietHoursStart: number; // 0-23 local
  quietHoursEnd: number;
  maxAttemptsPerWeek: number;
  emailFooter: string;
  smsOptOutText: string;
  blastDisclaimer: string;
}

export interface Settings {
  presets: MarketPreset[];
  defaultPresetId: string;
  compCriteria: CompCriteria;
  similarityWeights: SimilarityWeights;
  motivationWeights: MotivationWeights;
  dealWeights: DealScoreWeights;
  repairMarketId: string;
  repairOverrides: Record<string, Partial<Record<"minor" | "moderate" | "major" | "full", number>>>;
  sequences: FollowUpSequence[];
  customTags: string[];
  compliance: ComplianceSettings;
  offerTemplates: { id: string; name: string; body: string }[];
}

export const SYSTEM_TAGS = [
  "Vacant", "Distressed", "High Equity", "Absentee", "Probate", "Pre-Foreclosure", "Tax Delinquent",
  "Driving for Dollars", "Hot Lead", "Follow Up", "Bad Number", "Do Not Contact", "Under Contract",
];

export const DEFAULT_SETTINGS: Settings = {
  presets: DEFAULT_PRESETS,
  defaultPresetId: "sacramento",
  compCriteria: DEFAULT_CRITERIA,
  similarityWeights: DEFAULT_WEIGHTS,
  motivationWeights: DEFAULT_MOTIVATION_WEIGHTS,
  dealWeights: DEFAULT_DEAL_WEIGHTS,
  repairMarketId: "sacramento",
  repairOverrides: {},
  sequences: [
    { id: "seq-standard", name: "Standard seller follow-up", steps: [
      { day: 0, type: "call_seller" }, { day: 1, type: "sms" }, { day: 3, type: "call_seller" },
      { day: 7, type: "email" }, { day: 14, type: "call_seller" }, { day: 30, type: "follow_up" },
    ] },
    { id: "seq-nurture", name: "Long-term nurture (not ready)", steps: [
      { day: 0, type: "follow_up", note: "Log reason not ready" }, { day: 30, type: "call_seller" }, { day: 60, type: "email" }, { day: 90, type: "call_seller" },
    ] },
    { id: "seq-offer", name: "Post-offer follow-up", steps: [
      { day: 1, type: "call_seller", note: "Confirm offer received" }, { day: 3, type: "follow_up" }, { day: 7, type: "call_seller" },
    ] },
  ],
  customTags: ["Motivated - Relocation", "Needs Walkthrough", "Seller Finance Candidate"],
  compliance: {
    enforceDnc: true, requireSmsConsent: true, quietHoursStart: 21, quietHoursEnd: 8, maxAttemptsPerWeek: 4,
    emailFooter: "You are receiving this because you expressed interest in real-estate opportunities. Reply UNSUBSCRIBE or use the link below to opt out.",
    smsOptOutText: "Reply STOP to opt out.",
    blastDisclaimer: "This is an assignment of contract, not a listing. All figures (ARV, repairs, comps) are estimates provided for convenience only — buyers must perform their own due diligence. Property sold as-is. Equal Housing Opportunity.",
  },
  offerTemplates: [
    { id: "tpl-cash", name: "All-cash, as-is (standard)", body: "Buyer offers to purchase the Property for ${{offer}} in cash, as-is, with an earnest money deposit of ${{emd}} to be held by {{title}}. Closing on or before {{closeDays}} days from acceptance. Buyer shall have {{inspectionDays}} days for inspection/due diligence. Buyer may assign this agreement." },
    { id: "tpl-flex", name: "Flexible close / leaseback", body: "Buyer offers ${{offer}}, as-is, closing in {{closeDays}} days or on a date of Seller's choosing within 60 days. Seller may remain in possession up to 14 days after closing. EMD ${{emd}}. Inspection period {{inspectionDays}} days." },
  ],
};

export const TEAM: TeamUser[] = [
  { id: "u-owner", name: "Jordan Reyes", email: "owner@demo.wholesale", role: "owner", initials: "JR" },
  { id: "u-acq", name: "Sam Whitley", email: "acq@demo.wholesale", role: "acquisitions", initials: "SW" },
  { id: "u-dispo", name: "Alexis Moreno", email: "dispo@demo.wholesale", role: "dispositions", initials: "AM" },
  { id: "u-va", name: "Riley Park", email: "va@demo.wholesale", role: "assistant", initials: "RP" },
  { id: "u-ro", name: "Casey Lin", email: "viewer@demo.wholesale", role: "read_only", initials: "CL" },
];

export interface SeedData {
  leads: Lead[]; sellers: Seller[]; comms: Communication[]; tasks: Task[]; appointments: Appointment[]; notes: Note[];
  compSets: CompSet[]; repairs: RepairEstimate[]; analyses: DealAnalysis[]; offers: Offer[]; contracts: Contract[];
  buyers: Buyer[]; dispositions: Disposition[]; blasts: DealBlast[]; buyerOffers: BuyerOffer[]; lists: LeadList[];
  savedSearches: SavedSearch[]; campaigns: Campaign[]; activities: Activity[]; documents: DocumentRecord[]; routes: D4DRoute[];
  suppression: { kind: "phone" | "email"; value: string; reason: string; at: string }[];
  savedAreas: { id: string; name: string; ring: [number, number][]; createdAt: string }[];
}

export interface DuplicateHit {
  kind: "property" | "lead" | "phone" | "email" | "buyer";
  existingId: string;
  label: string;
}

interface State extends SeedData {
  seeded: boolean;
  seedVersion: number;
  currentUserId: string;
  settings: Settings;
  audit: AuditEntry[];

  // lifecycle
  loadSeed(seed: SeedData): void;
  resetAll(): void;
  setCurrentUser(id: string): void;
  updateSettings(patch: Partial<Settings>): void;

  // activity
  log(type: string, text: string, refs?: Partial<Pick<Activity, "leadId" | "propertyId" | "buyerId">>): void;

  // leads
  findDuplicateLead(p: Pick<PropertySummary, "id" | "line1" | "zip">): DuplicateHit | null;
  saveLead(p: PropertySummary, opts?: { source?: LeadSource; stage?: LeadStage; status?: PinStatus; tags?: string[]; campaignId?: string; force?: boolean }): Lead;
  updateLead(id: string, patch: Partial<Lead>): void;
  moveStage(id: string, stage: LeadStage): void;
  deleteLead(id: string): void;
  mergeLeads(keepId: string, dropId: string): void;
  toggleTag(leadId: string, tag: string): void;

  // sellers & contacts
  upsertSeller(s: Partial<Seller> & { leadId: string }): Seller;
  addContact(sellerId: string, c: Omit<ContactPoint, "id" | "addedAt">): { added: boolean; duplicate?: DuplicateHit };
  updateContact(sellerId: string, contactId: string, patch: Partial<ContactPoint>): void;
  suppress(kind: "phone" | "email", value: string, reason: string): void;
  isSuppressed(kind: "phone" | "email", value: string): boolean;

  // communications
  logComm(c: Omit<Communication, "id" | "at" | "userId"> & { at?: string }): Communication;

  // tasks & appointments
  addTask(t: Omit<Task, "id" | "createdAt" | "assignee"> & { assignee?: string }): Task;
  updateTask(id: string, patch: Partial<Task>): void;
  completeTask(id: string, done?: boolean): void;
  deleteTask(id: string): void;
  applySequence(leadId: string, sequenceId: string): number;
  addAppointment(a: Omit<Appointment, "id" | "assignee"> & { assignee?: string }): Appointment;
  updateAppointment(id: string, patch: Partial<Appointment>): void;

  // notes
  addNote(n: Omit<Note, "id" | "at" | "userId">): Note;
  updateNote(id: string, patch: Partial<Note>): void;
  deleteNote(id: string): void;

  // underwriting
  saveCompSet(cs: Omit<CompSet, "id" | "updatedAt"> & { id?: string }): CompSet;
  saveRepairs(r: Omit<RepairEstimate, "id" | "updatedAt"> & { id?: string }): RepairEstimate;
  saveAnalysis(a: Omit<DealAnalysis, "id" | "updatedAt"> & { id?: string }): DealAnalysis;

  // offers & contracts
  createOffer(o: Omit<Offer, "id" | "createdAt" | "status"> & { status?: OfferStatus }): Offer;
  setOfferStatus(id: string, status: OfferStatus, counterAmount?: number): void;
  createContract(c: Omit<Contract, "id" | "createdAt" | "history" | "status"> & { status?: ContractStatus }): Contract;
  setContractStatus(id: string, status: ContractStatus): void;

  // buyers & dispositions
  addBuyer(b: Omit<Buyer, "id" | "createdAt">, force?: boolean): { buyer?: Buyer; duplicate?: DuplicateHit };
  updateBuyer(id: string, patch: Partial<Buyer>): void;
  deleteBuyer(id: string): void;
  createDisposition(leadId: string, d: Partial<Disposition>): Disposition;
  updateDisposition(id: string, patch: Partial<Disposition>): void;
  sendBlast(b: Omit<DealBlast, "id" | "sentAt" | "recipients"> & { buyerIds: string[] }): DealBlast;
  setBlastRecipient(blastId: string, buyerId: string, status: DealBlast["recipients"][number]["status"]): void;
  addBuyerOffer(o: Omit<BuyerOffer, "id" | "at" | "status">): BuyerOffer;
  acceptBuyerOffer(offerId: string): void;
  closeDeal(dispositionId: string, actualFee: number, closedAt?: string): void;

  // lists & searches
  createList(l: Omit<LeadList, "id" | "createdAt" | "propertyIds" | "members"> & { members?: PropertySummary[] }): LeadList;
  updateList(id: string, patch: Partial<LeadList>): void;
  addToList(listId: string, props: PropertySummary[]): number;
  removeFromList(listId: string, propertyId: string): void;
  deleteList(id: string): void;
  saveSearch(s: Omit<SavedSearch, "id" | "createdAt" | "lastResultIds" | "newMatchIds"> & { resultIds?: string[] }): SavedSearch;
  refreshSearch(id: string, resultIds: string[]): number;
  deleteSearch(id: string): void;
  saveArea(name: string, ring: [number, number][]): void;
  deleteArea(id: string): void;

  // marketing
  upsertCampaign(c: Partial<Campaign> & { name: string }): Campaign;
  deleteCampaign(id: string): void;

  // documents, d4d
  addDocument(d: Omit<DocumentRecord, "id" | "createdAt">): DocumentRecord;
  deleteDocument(id: string): void;
  startRoute(): string;
  addRoutePoint(id: string, p: [number, number]): void;
  endRoute(id: string): void;
  tagRouteProperty(id: string, propertyId: string): void;
}

const now = () => new Date().toISOString();
const EMPTY: SeedData = {
  leads: [], sellers: [], comms: [], tasks: [], appointments: [], notes: [], compSets: [], repairs: [], analyses: [], offers: [],
  contracts: [], buyers: [], dispositions: [], blasts: [], buyerOffers: [], lists: [], savedSearches: [], campaigns: [],
  activities: [], documents: [], routes: [], suppression: [], savedAreas: [],
};

export const SEED_VERSION = 3;

export const useWorkspace = create<State>()(
  persist(
    (set, get) => {
      const audit = (entity: string, entityId: string, action: AuditEntry["action"], changes?: AuditEntry["changes"]) =>
        set((s) => ({ audit: [{ id: uid("au_"), at: now(), userId: s.currentUserId, entity, entityId, action, changes }, ...s.audit].slice(0, 2000) }));
      const diff = <T extends object>(before: T, patch: Partial<T>) => {
        const ch: Record<string, { from: unknown; to: unknown }> = {};
        for (const k of Object.keys(patch) as (keyof T)[]) {
          if (JSON.stringify(before[k]) !== JSON.stringify(patch[k])) ch[String(k)] = { from: before[k], to: patch[k] };
        }
        return ch;
      };
      const leadOf = (id?: string) => get().leads.find((l) => l.id === id);

      return {
        ...EMPTY,
        seeded: false,
        seedVersion: 0,
        currentUserId: "u-owner",
        settings: DEFAULT_SETTINGS,
        audit: [],

        loadSeed: (seed) => set({ ...EMPTY, ...seed, seeded: true, seedVersion: SEED_VERSION, audit: [] }),
        resetAll: () => set({ ...EMPTY, seeded: false, seedVersion: 0, settings: DEFAULT_SETTINGS, audit: [] }),
        setCurrentUser: (id) => set({ currentUserId: id }),
        updateSettings: (patch) => { set((s) => ({ settings: { ...s.settings, ...patch } })); audit("settings", "org", "update", Object.fromEntries(Object.keys(patch).map((k) => [k, { from: "…", to: "…" }]))); },

        log: (type, text, refs = {}) =>
          set((s) => ({ activities: [{ id: uid("ac_"), at: now(), type, text, userId: s.currentUserId, ...refs }, ...s.activities].slice(0, 3000) })),

        // ─── leads ───
        findDuplicateLead: (p) => {
          const na = normalizeAddress(p.line1);
          const hit = get().leads.find((l) => !l.deletedAt && (l.propertyId === p.id || (normalizeAddress(l.property.line1) === na && l.property.zip === p.zip)));
          return hit ? { kind: "lead", existingId: hit.id, label: `${hit.property.line1} (${hit.stage.replace(/_/g, " ")})` } : null;
        },
        saveLead: (p, opts = {}) => {
          const existing = get().leads.find((l) => l.propertyId === p.id && !l.deletedAt);
          if (existing && !opts.force) return existing;
          const t = now();
          const tags = new Set(opts.tags ?? []);
          if (p.absentee) tags.add("Absentee");
          if ((p.equityPct ?? 0) >= 60) tags.add("High Equity");
          if (p.distress.vacant) tags.add("Vacant");
          if (p.distress.probate) tags.add("Probate");
          if (p.distress.preForeclosure) tags.add("Pre-Foreclosure");
          if (p.distress.taxDelinquent) tags.add("Tax Delinquent");
          const stage = opts.stage ?? "new_lead";
          const lead: Lead = {
            id: uid("ld_"), propertyId: p.id, property: p, stage, status: opts.status ?? "potential", source: opts.source ?? "map",
            campaignId: opts.campaignId, assignedTo: get().currentUserId, tags: [...tags], createdAt: t, updatedAt: t, stageChangedAt: t,
            stageHistory: [{ stage, at: t }],
          };
          set((s) => ({ leads: [lead, ...s.leads] }));
          get().log("lead.created", `Lead added — ${p.line1}`, { leadId: lead.id, propertyId: p.id });
          audit("lead", lead.id, "create");
          return lead;
        },
        updateLead: (id, patch) => {
          const before = leadOf(id);
          if (!before) return;
          set((s) => ({ leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: now() } : l)) }));
          audit("lead", id, "update", diff(before, patch));
        },
        moveStage: (id, stage) => {
          const l = leadOf(id);
          if (!l || l.stage === stage) return;
          const t = now();
          const statusFor: Partial<Record<LeadStage, PinStatus>> = {
            contacted: "contacted", follow_up: "contacted", appointment: "contacted", offer_sent: "offer_sent", negotiating: "offer_sent",
            contract_sent: "offer_sent", under_contract: "under_contract", disposition: "under_contract", closing: "under_contract", closed: "owned", dead: "dead",
          };
          set((s) => ({ leads: s.leads.map((x) => x.id === id ? {
            ...x, stage, stageChangedAt: t, updatedAt: t, stageHistory: [...x.stageHistory, { stage, at: t }],
            status: x.status === "do_not_contact" ? x.status : statusFor[stage] ?? x.status,
            closedAt: stage === "closed" ? t : x.closedAt,
          } : x) }));
          get().log("lead.stage", `${l.property.line1} moved to ${stage.replace(/_/g, " ")}`, { leadId: id, propertyId: l.propertyId });
          audit("lead", id, "update", { stage: { from: l.stage, to: stage } });
        },
        deleteLead: (id) => {
          const l = leadOf(id);
          set((s) => ({ leads: s.leads.map((x) => (x.id === id ? { ...x, deletedAt: now() } : x)) }));
          if (l) get().log("lead.deleted", `Lead archived — ${l.property.line1}`, { leadId: id });
          audit("lead", id, "delete");
        },
        mergeLeads: (keepId, dropId) => {
          set((s) => ({
            leads: s.leads.map((l) => l.id === dropId ? { ...l, deletedAt: now() } : l.id === keepId
              ? { ...l, tags: [...new Set([...l.tags, ...(s.leads.find((d) => d.id === dropId)?.tags ?? [])])] } : l),
            comms: s.comms.map((c) => (c.leadId === dropId ? { ...c, leadId: keepId } : c)),
            tasks: s.tasks.map((t) => (t.leadId === dropId ? { ...t, leadId: keepId } : t)),
            notes: s.notes.map((n) => (n.entityId === dropId ? { ...n, entityId: keepId } : n)),
            offers: s.offers.map((o) => (o.leadId === dropId ? { ...o, leadId: keepId } : o)),
            sellers: s.sellers.map((x) => (x.leadId === dropId ? { ...x, leadId: keepId } : x)),
          }));
          audit("lead", keepId, "merge", { merged: { from: dropId, to: keepId } });
        },
        toggleTag: (leadId, tag) => {
          const l = leadOf(leadId);
          if (!l) return;
          const tags = l.tags.includes(tag) ? l.tags.filter((t) => t !== tag) : [...l.tags, tag];
          get().updateLead(leadId, { tags, status: tag === "Do Not Contact" && !l.tags.includes(tag) ? "do_not_contact" : l.status });
        },

        // ─── sellers ───
        upsertSeller: (s) => {
          const existing = get().sellers.find((x) => x.id === s.id || x.leadId === s.leadId);
          if (existing) {
            const next = { ...existing, ...s };
            set((st) => ({ sellers: st.sellers.map((x) => (x.id === existing.id ? next : x)) }));
            audit("seller", existing.id, "update", diff(existing, s));
            return next;
          }
          const lead = leadOf(s.leadId);
          const seller: Seller = {
            id: uid("sl_"), name: lead?.property.ownerName ?? "Unknown seller", contacts: [], motivation: 3, timeline: "", reasonForSelling: "",
            condition: "", occupancy: "", decisionMakers: "", preferredComm: "any", answers: {}, createdAt: now(), ...s,
          };
          set((st) => ({ sellers: [seller, ...st.sellers], leads: st.leads.map((l) => (l.id === s.leadId ? { ...l, sellerId: seller.id } : l)) }));
          audit("seller", seller.id, "create");
          return seller;
        },
        addContact: (sellerId, c) => {
          const norm = c.kind === "phone" ? normalizePhone(c.value) : normalizeEmail(c.value);
          const seller = get().sellers.find((s) => s.id === sellerId);
          if (!seller) return { added: false };
          if (seller.contacts.some((x) => (x.kind === "phone" ? normalizePhone(x.value) : normalizeEmail(x.value)) === norm))
            return { added: false, duplicate: { kind: c.kind, existingId: sellerId, label: "already on this seller" } };
          const other = get().sellers.find((s) => s.id !== sellerId && s.contacts.some((x) => (x.kind === "phone" ? normalizePhone(x.value) : normalizeEmail(x.value)) === norm));
          const contact: ContactPoint = { ...c, id: uid("cp_"), addedAt: now(), optedOut: c.optedOut || get().isSuppressed(c.kind, c.value) };
          set((s) => ({ sellers: s.sellers.map((x) => (x.id === sellerId ? { ...x, contacts: [...x.contacts, contact] } : x)) }));
          return { added: true, duplicate: other ? { kind: c.kind, existingId: other.id, label: `also on seller ${other.name}` } : undefined };
        },
        updateContact: (sellerId, contactId, patch) => {
          set((s) => ({ sellers: s.sellers.map((x) => x.id === sellerId ? { ...x, contacts: x.contacts.map((c) => (c.id === contactId ? { ...c, ...patch } : c)) } : x) }));
          if (patch.optedOut) {
            const c = get().sellers.find((x) => x.id === sellerId)?.contacts.find((x) => x.id === contactId);
            if (c) get().suppress(c.kind, c.value, "Opted out");
          }
        },
        suppress: (kind, value, reason) => {
          const v = kind === "phone" ? normalizePhone(value) : normalizeEmail(value);
          if (get().suppression.some((x) => x.kind === kind && x.value === v)) return;
          set((s) => ({ suppression: [{ kind, value: v, reason, at: now() }, ...s.suppression] }));
          audit("suppression", v, "create");
        },
        isSuppressed: (kind, value) => {
          const v = kind === "phone" ? normalizePhone(value) : normalizeEmail(value);
          return get().suppression.some((x) => x.kind === kind && x.value === v);
        },

        // ─── comms ───
        logComm: (c) => {
          const comm: Communication = { id: uid("cm_"), at: c.at ?? now(), userId: get().currentUserId, ...c };
          set((s) => ({
            comms: [comm, ...s.comms],
            leads: c.leadId && c.direction !== "internal" ? s.leads.map((l) => (l.id === c.leadId ? { ...l, lastContactAt: comm.at } : l)) : s.leads,
          }));
          const l = leadOf(c.leadId);
          const verb: Record<CommType, string> = { call: "Call", sms: "SMS", email: "Email", voicemail: "Voicemail", note: "Note", appointment: "Appointment", offer: "Offer", contract: "Contract", automation: "Automation", mail: "Mail" };
          get().log(`comm.${c.type}`, `${verb[c.type]} ${c.direction === "inbound" ? "received" : "logged"}${c.outcome ? ` (${c.outcome})` : ""}${l ? ` — ${l.property.line1}` : ""}`, { leadId: c.leadId, propertyId: l?.propertyId, buyerId: c.buyerId });
          if (l && c.direction !== "internal" && ["new_lead", "researching"].includes(l.stage)) get().moveStage(l.id, c.direction === "inbound" || c.outcome === "Connected" ? "contacted" : "contact_attempted");
          return comm;
        },

        // ─── tasks ───
        addTask: (t) => {
          const task: Task = { id: uid("tk_"), createdAt: now(), assignee: t.assignee ?? get().currentUserId, ...t };
          set((s) => ({ tasks: [task, ...s.tasks] }));
          get().log("task.created", `Task: ${task.title}`, { leadId: task.leadId });
          return task;
        },
        updateTask: (id, patch) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
        completeTask: (id, done = true) => {
          const t = get().tasks.find((x) => x.id === id);
          set((s) => ({ tasks: s.tasks.map((x) => (x.id === id ? { ...x, completedAt: done ? now() : undefined } : x)) }));
          if (t && done) get().log("task.completed", `Completed: ${t.title}`, { leadId: t.leadId });
        },
        deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
        applySequence: (leadId, sequenceId) => {
          const seq = get().settings.sequences.find((s) => s.id === sequenceId);
          const l = leadOf(leadId);
          if (!seq || !l) return 0;
          const base = new Date();
          base.setHours(10, 0, 0, 0);
          const labels: Record<string, string> = { call_seller: "Call", sms: "Text", email: "Email", follow_up: "Follow up with" };
          for (const step of seq.steps) {
            get().addTask({
              title: `${labels[step.type] ?? "Follow up"} ${l.sellerId ? get().sellers.find((s) => s.id === l.sellerId)?.name ?? "seller" : "seller"} — ${l.property.line1}${step.note ? ` (${step.note})` : ""} · Day ${step.day}`,
              type: step.type, leadId, dueAt: new Date(base.getTime() + step.day * 86400000).toISOString(), priority: step.day === 0 ? 1 : 2, sequenceId,
            });
          }
          get().log("sequence.applied", `Follow-up sequence “${seq.name}” started — ${l.property.line1}`, { leadId });
          return seq.steps.length;
        },
        addAppointment: (a) => {
          const appt: Appointment = { id: uid("ap_"), assignee: a.assignee ?? get().currentUserId, ...a };
          set((s) => ({ appointments: [appt, ...s.appointments] }));
          const l = leadOf(a.leadId);
          get().log("appointment.created", `${a.title} scheduled${l ? ` — ${l.property.line1}` : ""}`, { leadId: a.leadId });
          if (l && a.kind === "walkthrough" && STAGE_ORDER.indexOf(l.stage) < STAGE_ORDER.indexOf("appointment")) get().moveStage(l.id, "appointment");
          return appt;
        },
        updateAppointment: (id, patch) => set((s) => ({ appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),

        // ─── notes ───
        addNote: (n) => {
          const note: Note = { id: uid("nt_"), at: now(), userId: get().currentUserId, ...n };
          set((s) => ({ notes: [note, ...s.notes] }));
          get().log("note.added", `Note added${n.viaVoice ? " (voice)" : ""}`, n.entityType === "lead" ? { leadId: n.entityId } : n.entityType === "property" ? { propertyId: n.entityId } : {});
          return note;
        },
        updateNote: (id, patch) => set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),
        deleteNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),

        // ─── underwriting ───
        saveCompSet: (cs) => {
          const existing = get().compSets.find((x) => x.id === cs.id || x.propertyId === cs.propertyId);
          const rec: CompSet = { ...cs, id: existing?.id ?? uid("cs_"), updatedAt: now() };
          set((s) => ({ compSets: existing ? s.compSets.map((x) => (x.id === existing.id ? rec : x)) : [rec, ...s.compSets] }));
          if (!existing || existing.calculatedArv !== rec.calculatedArv || existing.userArv !== rec.userArv) {
            const arv = rec.userArv ?? rec.calculatedArv;
            if (arv) get().log("arv.calculated", `ARV ${rec.userArv ? "set (override)" : "calculated"} — $${arv.toLocaleString()} from ${rec.comps.filter((c) => c.included).length} comps`, { propertyId: rec.propertyId, leadId: get().leads.find((l) => l.propertyId === rec.propertyId)?.id });
            audit("comp_set", rec.id, existing ? "update" : "create", { calculatedArv: { from: existing?.calculatedArv ?? null, to: rec.calculatedArv }, userArv: { from: existing?.userArv ?? null, to: rec.userArv ?? null } });
          }
          return rec;
        },
        saveRepairs: (r) => {
          const existing = get().repairs.find((x) => x.id === r.id || x.propertyId === r.propertyId);
          const rec: RepairEstimate = { ...r, id: existing?.id ?? uid("re_"), updatedAt: now() };
          set((s) => ({ repairs: existing ? s.repairs.map((x) => (x.id === existing.id ? rec : x)) : [rec, ...s.repairs] }));
          if (!existing) get().log("repairs.estimated", "Repair estimate created", { propertyId: r.propertyId, leadId: get().leads.find((l) => l.propertyId === r.propertyId)?.id });
          return rec;
        },
        saveAnalysis: (a) => {
          const existing = get().analyses.find((x) => x.id === a.id || x.propertyId === a.propertyId);
          const rec: DealAnalysis = { ...a, id: existing?.id ?? uid("da_"), updatedAt: now() };
          set((s) => ({ analyses: existing ? s.analyses.map((x) => (x.id === existing.id ? rec : x)) : [rec, ...s.analyses] }));
          if (existing) audit("deal_analysis", rec.id, "update", diff(existing.inputs as unknown as Record<string, unknown>, a.inputs as unknown as Record<string, unknown>));
          return rec;
        },

        // ─── offers & contracts ───
        createOffer: (o) => {
          const offer: Offer = { id: uid("of_"), createdAt: now(), status: o.status ?? "draft", ...o };
          if (offer.status === "sent") offer.sentAt = now();
          set((s) => ({ offers: [offer, ...s.offers] }));
          const l = leadOf(o.leadId);
          get().log("offer.created", `Offer ${offer.status === "sent" ? "sent" : "created"} — $${o.amount.toLocaleString()}${l ? ` · ${l.property.line1}` : ""}`, { leadId: o.leadId, propertyId: o.propertyId });
          if (l && STAGE_ORDER.indexOf(l.stage) < STAGE_ORDER.indexOf(offer.status === "sent" ? "offer_sent" : "offer_prep")) get().moveStage(l.id, offer.status === "sent" ? "offer_sent" : "offer_prep");
          audit("offer", offer.id, "create");
          return offer;
        },
        setOfferStatus: (id, status, counterAmount) => {
          const o = get().offers.find((x) => x.id === id);
          if (!o) return;
          const t = now();
          set((s) => ({ offers: s.offers.map((x) => x.id === id ? { ...x, status, counterAmount: counterAmount ?? x.counterAmount, sentAt: status === "sent" ? t : x.sentAt, respondedAt: ["accepted", "rejected", "countered"].includes(status) ? t : x.respondedAt } : x) }));
          get().logComm({ leadId: o.leadId, type: "offer", direction: status === "sent" ? "outbound" : "inbound", outcome: status, body: `Offer $${o.amount.toLocaleString()} ${status}${counterAmount ? ` — counter $${counterAmount.toLocaleString()}` : ""}` });
          const l = leadOf(o.leadId);
          if (l) {
            if (status === "sent" && STAGE_ORDER.indexOf(l.stage) < STAGE_ORDER.indexOf("offer_sent")) get().moveStage(l.id, "offer_sent");
            if (status === "countered") get().moveStage(l.id, "negotiating");
            if (status === "accepted") get().moveStage(l.id, "contract_sent");
          }
          audit("offer", id, "update", { status: { from: o.status, to: status } });
        },
        createContract: (c) => {
          const status = c.status ?? "draft";
          const rec: Contract = { id: uid("ct_"), createdAt: now(), status, history: [{ status, at: now() }], ...c };
          set((s) => ({ contracts: [rec, ...s.contracts] }));
          get().log("contract.created", `${rec.title} created`, { leadId: c.leadId });
          audit("contract", rec.id, "create");
          return rec;
        },
        setContractStatus: (id, status) => {
          const c = get().contracts.find((x) => x.id === id);
          if (!c) return;
          set((s) => ({ contracts: s.contracts.map((x) => (x.id === id ? { ...x, status, history: [...x.history, { status, at: now() }] } : x)) }));
          get().log("contract.status", `${c.title} — ${status}`, { leadId: c.leadId });
          const l = leadOf(c.leadId);
          if (l && c.kind === "purchase_agreement") {
            if (status === "sent" && STAGE_ORDER.indexOf(l.stage) < STAGE_ORDER.indexOf("contract_sent")) get().moveStage(l.id, "contract_sent");
            if ((status === "executed" || status === "signed") && STAGE_ORDER.indexOf(l.stage) < STAGE_ORDER.indexOf("under_contract")) {
              get().moveStage(l.id, "under_contract");
              get().toggleTag(l.id, "Under Contract");
            }
          }
          audit("contract", id, "update", { status: { from: c.status, to: status } });
        },

        // ─── buyers & dispositions ───
        addBuyer: (b, force) => {
          if (!force) {
            const phones = b.contacts.filter((c) => c.kind === "phone").map((c) => normalizePhone(c.value));
            const emails = b.contacts.filter((c) => c.kind === "email").map((c) => normalizeEmail(c.value));
            const dup = get().buyers.find((x) => x.name.toLowerCase() === b.name.toLowerCase() || x.contacts.some((c) => (c.kind === "phone" ? phones.includes(normalizePhone(c.value)) : emails.includes(normalizeEmail(c.value)))));
            if (dup) return { duplicate: { kind: "buyer", existingId: dup.id, label: `${dup.name}${dup.company ? ` · ${dup.company}` : ""}` } };
          }
          const buyer: Buyer = { ...b, id: uid("by_"), createdAt: now() };
          set((s) => ({ buyers: [buyer, ...s.buyers] }));
          get().log("buyer.created", `Buyer added — ${buyer.name}`, { buyerId: buyer.id });
          audit("buyer", buyer.id, "create");
          return { buyer };
        },
        updateBuyer: (id, patch) => {
          const b = get().buyers.find((x) => x.id === id);
          set((s) => ({ buyers: s.buyers.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
          if (b) audit("buyer", id, "update", diff(b, patch));
        },
        deleteBuyer: (id) => { set((s) => ({ buyers: s.buyers.filter((b) => b.id !== id) })); audit("buyer", id, "delete"); },
        createDisposition: (leadId, d) => {
          const existing = get().dispositions.find((x) => x.leadId === leadId);
          if (existing) return existing;
          const l = leadOf(leadId);
          const accepted = get().offers.find((o) => o.leadId === leadId && o.status === "accepted");
          const analysis = get().analyses.find((a) => a.propertyId === l?.propertyId);
          const contractPrice = d.contractPrice ?? accepted?.amount ?? analysis?.inputs.purchasePrice ?? 0;
          const fee = analysis?.inputs.wholesaleFee ?? 20000;
          const disp: Disposition = {
            id: uid("dp_"), leadId, contractPrice, askingPrice: contractPrice + fee, minimumPrice: contractPrice + Math.round(fee * 0.5),
            accessInstructions: "", closingDate: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10), earnestMoney: accepted?.earnestMoney ?? 5000,
            titleCompany: "", titleContact: "", status: "preparing", showFullAddress: false, selectedBuyerIds: [], createdAt: now(), ...d,
          };
          set((s) => ({ dispositions: [disp, ...s.dispositions] }));
          if (l && STAGE_ORDER.indexOf(l.stage) < STAGE_ORDER.indexOf("disposition")) get().moveStage(leadId, "disposition");
          get().log("disposition.created", `Moved to dispositions — ${l?.property.line1 ?? ""}`, { leadId });
          return disp;
        },
        updateDisposition: (id, patch) => {
          const d = get().dispositions.find((x) => x.id === id);
          set((s) => ({ dispositions: s.dispositions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
          if (d) audit("disposition", id, "update", diff(d, patch));
        },
        sendBlast: (b) => {
          const { compliance } = get().settings;
          const t = now();
          const recipients = b.buyerIds.map((buyerId) => {
            const buyer = get().buyers.find((x) => x.id === buyerId);
            const channelContacts = buyer?.contacts.filter((c) => c.kind === (b.channel === "sms" ? "phone" : "email")) ?? [];
            const blocked = b.channel !== "portal" && (channelContacts.length === 0 || channelContacts.every((c) => c.optedOut || get().isSuppressed(c.kind, c.value) || (b.channel === "sms" && compliance.requireSmsConsent && !c.smsConsent)));
            return { buyerId, status: (blocked ? "suppressed" : "sent") as DealBlast["recipients"][number]["status"], at: t };
          });
          const blast: DealBlast = { id: uid("bl_"), dispositionId: b.dispositionId, channel: b.channel, subject: b.subject, body: b.body, sentAt: t, recipients };
          set((s) => ({
            blasts: [blast, ...s.blasts],
            dispositions: s.dispositions.map((d) => (d.id === b.dispositionId && d.status === "preparing" ? { ...d, status: "marketing" } : d)),
          }));
          const sent = recipients.filter((r) => r.status === "sent").length;
          get().log("blast.sent", `Deal blast (${b.channel}) sent to ${sent} buyer${sent === 1 ? "" : "s"}${recipients.length - sent ? `, ${recipients.length - sent} suppressed` : ""}`, { leadId: get().dispositions.find((d) => d.id === b.dispositionId)?.leadId });
          return blast;
        },
        setBlastRecipient: (blastId, buyerId, status) => {
          set((s) => ({ blasts: s.blasts.map((b) => b.id === blastId ? { ...b, recipients: b.recipients.map((r) => (r.buyerId === buyerId ? { ...r, status, at: now() } : r)) } : b) }));
          if (status === "interested") {
            const buyer = get().buyers.find((b) => b.id === buyerId);
            get().log("buyer.interest", `${buyer?.name ?? "Buyer"} is interested`, { buyerId });
            get().updateBuyer(buyerId, { lastActivityAt: now() });
          }
        },
        addBuyerOffer: (o) => {
          const offer: BuyerOffer = { ...o, id: uid("bo_"), at: now(), status: "pending" };
          set((s) => ({
            buyerOffers: [offer, ...s.buyerOffers],
            dispositions: s.dispositions.map((d) => (d.id === o.dispositionId && ["preparing", "marketing"].includes(d.status) ? { ...d, status: "reviewing_offers" } : d)),
            blasts: s.blasts.map((b) => b.dispositionId === o.dispositionId ? { ...b, recipients: b.recipients.map((r) => (r.buyerId === o.buyerId ? { ...r, status: "offer_submitted", at: now() } : r)) } : b),
          }));
          const buyer = get().buyers.find((b) => b.id === o.buyerId);
          get().log("buyer.offer", `Buyer offer — ${buyer?.name ?? "buyer"} $${o.amount.toLocaleString()}`, { buyerId: o.buyerId, leadId: get().dispositions.find((d) => d.id === o.dispositionId)?.leadId });
          return offer;
        },
        acceptBuyerOffer: (offerId) => {
          const o = get().buyerOffers.find((x) => x.id === offerId);
          if (!o) return;
          const d = get().dispositions.find((x) => x.id === o.dispositionId);
          if (!d) return;
          set((s) => ({
            buyerOffers: s.buyerOffers.map((x) => (x.dispositionId === o.dispositionId ? { ...x, status: x.id === offerId ? "accepted" : x.status === "pending" ? "declined" : x.status } : x)),
            dispositions: s.dispositions.map((x) => (x.id === d.id ? { ...x, winningOfferId: offerId, status: "assigned" } : x)),
          }));
          const buyer = get().buyers.find((b) => b.id === o.buyerId);
          get().createContract({ leadId: d.leadId, dispositionId: d.id, kind: "assignment_agreement", title: `Assignment agreement — ${buyer?.name ?? "buyer"}`, amount: o.amount, party: buyer?.name });
          get().moveStage(d.leadId, "closing");
          get().log("buyer.selected", `Buyer selected — ${buyer?.name} at $${o.amount.toLocaleString()} (fee $${(o.amount - d.contractPrice).toLocaleString()})`, { leadId: d.leadId, buyerId: o.buyerId });
        },
        closeDeal: (dispositionId, actualFee, closedAt) => {
          const d = get().dispositions.find((x) => x.id === dispositionId);
          if (!d) return;
          const t = closedAt ?? now();
          set((s) => ({ dispositions: s.dispositions.map((x) => (x.id === dispositionId ? { ...x, status: "closed", actualFee, feeReceivedAt: t } : x)) }));
          const winning = get().buyerOffers.find((b) => b.id === d.winningOfferId);
          if (winning) get().updateBuyer(winning.buyerId, { dealsPurchased: (get().buyers.find((b) => b.id === winning.buyerId)?.dealsPurchased ?? 0) + 1, lastActivityAt: t });
          get().moveStage(d.leadId, "closed");
          get().log("deal.closed", `Closed — assignment fee $${actualFee.toLocaleString()} recorded`, { leadId: d.leadId });
          audit("disposition", dispositionId, "update", { actualFee: { from: d.actualFee ?? null, to: actualFee } });
        },

        // ─── lists & searches ───
        createList: (l) => {
          const members = l.members ?? [];
          const list: LeadList = { id: uid("ls_"), createdAt: now(), name: l.name, description: l.description, dynamic: l.dynamic, rules: l.rules, color: l.color,
            propertyIds: members.map((m) => m.id), members: Object.fromEntries(members.map((m) => [m.id, m])) };
          set((s) => ({ lists: [list, ...s.lists] }));
          get().log("list.created", `List created — ${list.name}${members.length ? ` (${members.length})` : ""}`);
          return list;
        },
        updateList: (id, patch) => set((s) => ({ lists: s.lists.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
        addToList: (listId, props) => {
          const list = get().lists.find((l) => l.id === listId);
          if (!list) return 0;
          const fresh = props.filter((p) => !list.propertyIds.includes(p.id));
          set((s) => ({ lists: s.lists.map((l) => l.id === listId ? { ...l, propertyIds: [...l.propertyIds, ...fresh.map((p) => p.id)], members: { ...l.members, ...Object.fromEntries(fresh.map((p) => [p.id, p])) } } : l) }));
          if (fresh.length) get().log("list.added", `${fresh.length} propert${fresh.length === 1 ? "y" : "ies"} added to ${list.name}`);
          return fresh.length;
        },
        removeFromList: (listId, propertyId) => set((s) => ({ lists: s.lists.map((l) => l.id === listId ? { ...l, propertyIds: l.propertyIds.filter((x) => x !== propertyId) } : l) })),
        deleteList: (id) => set((s) => ({ lists: s.lists.filter((l) => l.id !== id) })),
        saveSearch: (s) => {
          const rec: SavedSearch = { id: uid("ss_"), createdAt: now(), name: s.name, filters: s.filters, area: s.area, lastRunAt: now(), lastResultIds: s.resultIds ?? [], newMatchIds: [] };
          set((st) => ({ savedSearches: [rec, ...st.savedSearches] }));
          get().log("search.saved", `Saved search — ${rec.name}`);
          return rec;
        },
        refreshSearch: (id, resultIds) => {
          const s = get().savedSearches.find((x) => x.id === id);
          if (!s) return 0;
          const prev = new Set(s.lastResultIds);
          const fresh = resultIds.filter((r) => !prev.has(r));
          set((st) => ({ savedSearches: st.savedSearches.map((x) => (x.id === id ? { ...x, lastRunAt: now(), lastResultIds: resultIds, newMatchIds: fresh } : x)) }));
          return fresh.length;
        },
        deleteSearch: (id) => set((s) => ({ savedSearches: s.savedSearches.filter((x) => x.id !== id) })),
        saveArea: (name, ring) => set((s) => ({ savedAreas: [{ id: uid("ar_"), name, ring, createdAt: now() }, ...s.savedAreas] })),
        deleteArea: (id) => set((s) => ({ savedAreas: s.savedAreas.filter((a) => a.id !== id) })),

        // ─── marketing ───
        upsertCampaign: (c) => {
          const existing = c.id ? get().campaigns.find((x) => x.id === c.id) : undefined;
          const rec: Campaign = existing ? { ...existing, ...c } as Campaign : {
            id: uid("cp_"), audience: "seller", channel: "direct_mail", spend: 0, startDate: now().slice(0, 10), status: "draft", sent: 0, responses: 0, ...c,
          } as Campaign;
          set((s) => ({ campaigns: existing ? s.campaigns.map((x) => (x.id === rec.id ? rec : x)) : [rec, ...s.campaigns] }));
          return rec;
        },
        deleteCampaign: (id) => set((s) => ({ campaigns: s.campaigns.filter((c) => c.id !== id) })),

        // ─── documents & d4d ───
        addDocument: (d) => {
          const doc: DocumentRecord = { id: uid("dc_"), createdAt: now(), ...d };
          set((s) => ({ documents: [doc, ...s.documents] }));
          get().log("document.generated", `${doc.name} generated`, { leadId: d.leadId, propertyId: d.propertyId });
          return doc;
        },
        deleteDocument: (id) => set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),
        startRoute: () => {
          const r: D4DRoute = { id: uid("rt_"), startedAt: now(), points: [], taggedPropertyIds: [], userId: get().currentUserId };
          set((s) => ({ routes: [r, ...s.routes] }));
          return r.id;
        },
        addRoutePoint: (id, p) => set((s) => ({ routes: s.routes.map((r) => (r.id === id ? { ...r, points: [...r.points, [p[0], p[1], Date.now()] as [number, number, number]].slice(-5000) } : r)) })),
        endRoute: (id) => set((s) => ({ routes: s.routes.map((r) => (r.id === id ? { ...r, endedAt: now() } : r)) })),
        tagRouteProperty: (id, propertyId) => set((s) => ({ routes: s.routes.map((r) => (r.id === id && !r.taggedPropertyIds.includes(propertyId) ? { ...r, taggedPropertyIds: [...r.taggedPropertyIds, propertyId] } : r)) })),
      };
    },
    {
      name: "wholesale-os-workspace",
      version: SEED_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: () => ({ seeded: false }) as unknown as State, // schema change → reseed demo
      partialize: (s) => {
        // functions are dropped automatically; keep everything else
        const { ...rest } = s;
        return rest;
      },
    },
  ),
);

export const STAGE_ORDER: LeadStage[] = [
  "new_lead", "researching", "contact_attempted", "contacted", "follow_up", "appointment", "offer_prep", "offer_sent",
  "negotiating", "contract_sent", "under_contract", "disposition", "closing", "closed", "dead",
];

export const userName = (id: string) => TEAM.find((u) => u.id === id)?.name ?? "Unknown";
