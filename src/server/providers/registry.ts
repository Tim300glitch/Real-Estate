// Chooses a provider per capability from env vars and exposes a single
// PropertyDataProvider facade to API routes. Swap vendors without touching UI.
import "server-only";
import type { SearchRequest } from "@/lib/types";
import { AttomAdapter, RegridAdapter, RentCastAdapter } from "./adapters";
import { DemoPropertyProvider } from "./demo/provider";
import type { Capability, CompQuery, MarketStatsQuery, PropertyDataProvider, ProviderInfo, SkipTraceInput, SkipTraceProvider, SkipTraceResult } from "./types";

const demo = new DemoPropertyProvider();
const registry: Record<string, () => PropertyDataProvider> = {
  demo: () => demo,
  rentcast: () => new RentCastAdapter(),
  attom: () => new AttomAdapter(),
  regrid: () => new RegridAdapter(),
};

function pick(envVar: string): PropertyDataProvider {
  const id = (process.env[envVar] || process.env.PROPERTY_PROVIDER || "demo").toLowerCase();
  const factory = registry[id];
  if (!factory) return demo;
  const p = factory();
  // fall back to the demo provider when a vendor is selected but no key is present
  return p.info().configured ? p : demo;
}

class CompositeProvider implements PropertyDataProvider {
  private route(cap: Capability): PropertyDataProvider {
    if (cap === "comps") return pick("COMPS_PROVIDER");
    if (cap === "parcel") return pick("PARCEL_PROVIDER");
    return pick("PROPERTY_PROVIDER");
  }
  info(): ProviderInfo {
    const main = this.route("property").info();
    return { ...main, id: "composite", name: `${main.name}` };
  }
  routing() {
    const caps: Capability[] = ["search", "property", "owner", "owner_portfolio", "sales_history", "comps", "mortgage", "parcel", "tax", "value_history", "market_stats"];
    return caps.map((c) => ({ capability: c, provider: this.route(c).info().name, kind: this.route(c).info().kind }));
  }
  searchProperties(r: SearchRequest) { return this.route("search").searchProperties(r); }
  getProperty(id: string) { return this.route("property").getProperty(id); }
  getOwner(id: string) { return this.route("owner").getOwner(id); }
  getOwnerPortfolio(id: string) { return this.route("owner_portfolio").getOwnerPortfolio(id); }
  getSalesHistory(id: string) { return this.route("sales_history").getSalesHistory(id); }
  getComps(q: CompQuery) { return this.route("comps").getComps(q); }
  getMortgageData(id: string) { return this.route("mortgage").getMortgageData(id); }
  getParcel(id: string) { return this.route("parcel").getParcel(id); }
  getTaxData(id: string) { return this.route("tax").getTaxData(id); }
  getValueHistory(id: string) { return this.route("value_history").getValueHistory(id); }
  getMarketStats(q: MarketStatsQuery) { return this.route("market_stats").getMarketStats(q); }
}

export const propertyData = new CompositeProvider();

export function allProviders(): ProviderInfo[] {
  return Object.values(registry).map((f) => f().info());
}

// ─── Skip trace ─────────────────────────────────────────────────────

class DemoSkipTrace implements SkipTraceProvider {
  id = "demo"; name = "Demo Skip Trace (synthetic)"; configured = true;
  async trace(input: SkipTraceInput): Promise<SkipTraceResult> {
    // Deterministic FAKE numbers in the reserved 555-01xx range so they can never reach a real person.
    let h = 0;
    for (const ch of input.ownerName + input.propertyAddress.line1) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const n = (k: number) => String(100 + ((h >> k) % 100)).slice(-2);
    const first = input.ownerName.split(/[ &]/)[0].toLowerCase().replace(/[^a-z]/g, "");
    const isEntity = /llc|trust|estate|inc|corp/i.test(input.ownerName);
    return {
      provider: this.name, synthetic: true,
      matchedName: isEntity ? null : input.ownerName,
      phones: isEntity ? [] : [
        { number: `916-555-01${n(1)}`, type: "mobile", confidence: "likely", dnc: (h & 3) === 0, lastSeen: "2026-06" },
        { number: `916-555-01${n(5)}`, type: "landline", confidence: "unverified", dnc: false, lastSeen: "2021-02" },
        ...((h & 4) ? [{ number: `530-555-01${n(9)}`, type: "mobile" as const, confidence: "unverified" as const, dnc: null }] : []),
      ],
      emails: isEntity || !first ? [] : [{ address: `${first}.${(h % 97)}@example.com`, confidence: "unverified" }],
      mailingAddress: input.mailingAddress ? `${input.mailingAddress.line1}, ${input.mailingAddress.city}, ${input.mailingAddress.state} ${input.mailingAddress.zip}` : null,
      costCents: 0,
      disclaimer: "Synthetic demo result (555-01xx numbers are reserved and fictional). Real skip-trace data is probabilistic and must be scrubbed against DNC and consent rules before contact.",
    };
  }
}

/** Integration point for a licensed skip-trace vendor (BatchData, REISkip, Tracers, etc.) */
class HttpSkipTrace implements SkipTraceProvider {
  id = "http"; name = process.env.SKIPTRACE_PROVIDER ?? "external"; configured = !!process.env.SKIPTRACE_API_KEY;
  async trace(_input: SkipTraceInput): Promise<SkipTraceResult> {
    throw new Error(`Skip-trace provider "${this.name}" is configured but its adapter is not implemented. Map the vendor response to SkipTraceResult in src/server/providers/registry.ts.`);
  }
}

export function skipTraceProvider(): SkipTraceProvider {
  const id = (process.env.SKIPTRACE_PROVIDER ?? "demo").toLowerCase();
  if (id !== "demo" && process.env.SKIPTRACE_API_KEY) return new HttpSkipTrace();
  return new DemoSkipTrace();
}

export function integrationStatus() {
  return {
    database: { configured: !!process.env.DATABASE_URL, note: "Postgres/PostGIS schema in db/migrations. Demo mode persists CRM data in the browser." },
    esign: { configured: !!process.env.ESIGN_API_KEY, provider: process.env.ESIGN_PROVIDER || null },
    sms: { configured: !!process.env.SMS_PROVIDER, provider: process.env.SMS_PROVIDER || null },
    email: { configured: !!process.env.EMAIL_PROVIDER, provider: process.env.EMAIL_PROVIDER || null },
    ai: { configured: !!process.env.ANTHROPIC_API_KEY, provider: process.env.ANTHROPIC_API_KEY ? "Anthropic" : "Rule-based (offline)" },
    streetView: { configured: !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY },
    skipTrace: { configured: true, provider: skipTraceProvider().name },
  };
}
