# Parcel — Wholesale OS: Architecture

This document covers the eleven design areas requested up front, then security,
compliance, performance and how future features plug in.

---

## 1. Database architecture

Schema: [`db/migrations/001_init.sql`](../db/migrations/001_init.sql) (PostgreSQL 15+ / Supabase, PostGIS, pg_trgm).

**Layers**

| Layer | Tables | Notes |
|---|---|---|
| Tenancy & auth | `organizations`, `users` | `role` enum drives RBAC; RLS isolates every business table by `org_id`. |
| Provenance | `data_sources`, `api_records` | Every external payload is stored raw (`api_records`) with cost + expiry so paid calls are deduplicated and licensing retention can be enforced. |
| Property (provider-independent) | `properties`, `property_data`, `property_data_history`, `owners`, `property_owners`, `property_transactions`, `mortgages`, `liens`, `tax_records`, `distress_events` | `properties` holds a cached, indexed summary for search; `property_data` holds field-level values **with source, observed date and confidence**. A trigger retires the previous value and writes `property_data_history` — values are never overwritten silently (e.g. AVM Jan $470k → Apr $481k → Oct $492k). |
| Lists & search | `tags`, `property_tags`, `lead_lists`, `list_properties`, `saved_searches`, `saved_search_results` | Dynamic lists store a filter DSL (`rules`) identical to the search API's `PropertyFilters`. `saved_search_results.first_seen_at` powers "new since last refresh". |
| CRM | `leads`, `lead_stage_history`, `sellers`, `contact_points`, `suppression_list`, `communications`, `follow_up_sequences`, `tasks`, `appointments`, `notes` | Contact points carry status (verified/likely/unverified/bad), DNC scrub result, opt-out and SMS-consent evidence. |
| Underwriting | `comp_sets`, `comps`, `repair_estimates`, `repair_items`, `deal_analyses` | Comp sets store criteria + weights + **both** `calculated_arv` and `user_arv`. Deal analyses store the full input set so results are reproducible. `strategy` column anticipates flip/BRRRR/sub-to/seller-finance. |
| Transaction | `offers`, `contracts`, `documents`, `photos` | Contracts track e-sign envelope ids and every status timestamp. |
| Disposition | `buyers`, `buyer_preferences`, `dispositions`, `buyer_offers`, `marketing_campaigns`, `campaign_contacts` | `buyer_preferences.buy_box_area` (MultiPolygon) allows geo buy boxes. |
| Ops | `d4d_routes`, `activities`, `notifications`, `audit_log` | `audit_log` is written by triggers on sensitive tables (old/new row JSON, user, IP). |

**Indexes** — GiST on `properties.location` and `parcel_geom`; composite filter indexes
(type/equity/years/year built, absentee, distress); trigram index on normalized address
(fuzzy search + duplicate detection); partial unique index on `(org_id, property_id)` for
active leads (duplicate prevention); `(fips, apn)` uniqueness for parcels.

**Soft deletion** — `deleted_at` on user-owned business records; partial indexes exclude deleted rows.

**Search functions** — `search_properties_bbox()` (bbox + filters, hard row cap) and
`find_comp_sales()` (`ST_DWithin` radius + sale window) are the SQL equivalents of the demo provider.

## 2. API / data-provider architecture

```
UI ──fetch──▶ /api/* route ──▶ api() wrapper (auth · RBAC · rate limit · zod)
                                  │
                                  ▼
                         CompositeProvider  (src/server/providers/registry.ts)
                 ┌────────────┬───────────┼────────────┬─────────────┐
            search/property  comps     parcel      skip trace   (MLS, e-sign, SMS…)
                 │             │          │
         Demo │ ATTOM │ RentCast │ Regrid │ <your adapter>
```

* `PropertyDataProvider` (`src/server/providers/types.ts`) defines
  `searchProperties · getProperty · getOwner · getOwnerPortfolio · getSalesHistory · getComps · getMortgageData · getParcel · getTaxData · getValueHistory · getMarketStats`.
* Each vendor adapter maps payloads into normalized types **and fills `Provenance`** (`kind`, `source`, `asOf`, `confidence`, `note`) for every field it supplies. Unknown values are `null`, never `false`.
* Routing is per capability via env (`PROPERTY_PROVIDER`, `COMPS_PROVIDER`, `PARCEL_PROVIDER`), so parcels can come from Regrid while comps come from an MLS feed. A vendor without a key falls back to the demo provider.
* Adapters included: **Demo** (synthetic, complete), **RentCast**, **ATTOM**, **Regrid** (integration points calling documented endpoints — verify field mappings against your contract). Skip trace, e-signature and messaging have their own interfaces (`SkipTraceProvider`, `ESignProvider`, `MessagingProvider`).
* Keys are server-only env vars; the browser never sees them.

**Data categories surfaced in the UI** (dot colour on every value, click for details):
public record · third-party provider · MLS · calculated estimate · user-entered.

## 3. Map architecture

`src/components/map/` is the only code that imports MapLibre.

| Component | Job |
|---|---|
| `PropertyMap` | Owns the map, basemap (street / satellite / hybrid), viewport events, offline fallback, context for layers |
| `PropertyLayer` | Clustered GeoJSON pins coloured by status / motivation / equity / value / tenure / absentee / last sale / list; hover popups; click → side panel; optional heat map (density / motivation / value / equity) |
| `ParcelLayer` | Parcel polygons fetched by bbox at zoom ≥ 16 |
| `CompLayer` | Subject marker, numbered comp markers, radius ring, subject→comp lines |
| `SearchAreaLayer` / `DrawingTools` | Polygon + radius drawing → `SearchArea` sent to the API |
| `UserLocation` / `RouteLayer` | Driving-for-dollars GPS dot and route trail |
| `StreetView` | Google Maps Embed API (official iframe) or documented Maps URL link-out |

Swapping to Google Maps or Mapbox means re-implementing these components against the same
props. Performance: the server returns at most 5 000 summaries per viewport (bbox query,
sorted by motivation, `truncated` flag), clustering happens on the GPU worker, parcels load
only at high zoom, and the entire state is never sent to the browser.

## 4. Information architecture

```
Overview   Dashboard
Find       Deal Finder · Map · Lists (+ saved searches) · Driving for Dollars
Acquire    Leads · Properties · Comps · Deal Desk · Offers · Pipeline · Tasks · Appointments · Contracts
Dispose    Buyers · Dispositions (Deal Room, package, matching, blast, buyer offers, closing)
Grow       Marketing · Campaigns · Skip Trace · Documents · Analytics · Settings
Global     ⌘K command palette · persistent + quick actions · property slide-over from anywhere
```

The **property** is the hub: map pin → quick card → full record (Overview, Owner, Property,
Seller CRM, Comps, ARV, Deal Analysis, Repairs, Offers, Communication, Photos, Documents,
Activity, Data Sources, Assistant) → Deal Desk → Disposition / Deal Room.

## 5. Deal Finder
Filters (location, type, size, value, sale, tenure, equity, ownership, every distress flag,
motivation) are one `PropertyFilters` object shared by search, dynamic lists and saved
searches. Quick "stacks" combine filters (e.g. Absentee + 15 yrs + 60% equity + SFR + pre-1990).
Results show on the map and in a sortable table with bulk save-as-lead / add-to-list / CSV.

## 6. Property side panel (quick card)
Address, photo/Street View, beds/baths/sf/lot/year/type, value, ARV, last sale, equity, owner,
mailing, occupancy, tenure, tax, mortgage, distress, motivation score, deal numbers if analysed,
and the 8 quick actions — without leaving the map.

## 7. Comp Engine
Provider search by radius + sale window (server), tolerances applied client-side (instant).
Each comp gets a configurable-weight similarity score with a per-part explanation.
Include/exclude (excluded stay greyed), manual comps (user-entered provenance), six sort
orders, side-by-side comparison with difference highlighting, map + table.

## 8. ARV calculator
Three methods (average price, average $/sf × sf, similarity-weighted $/sf × sf),
conservative/likely/aggressive (P25/selected/P75 $/sf), contributing comps and weights,
warnings (few comps, low similarity, stale sales), user override stored alongside the calculated value.

## 9. Deal Desk
Six panels on one screen; every input persists immediately and every output recomputes:
ARV → MAO → offer range → fee; repairs → MAO; fee → MAO; offer → buyer profit/ROI.
Visual deal indicator with quality label and show-the-math toggle.

## 10. CRM pipeline
15 stages, drag-and-drop, cards with seller, ARV, offer, fee, motivation, last contact, next
task. Stage changes write `stageHistory`, an activity and an audit entry; offer/contract
events advance stages automatically.

## 11. Buyer / disposition system
Buyer buy boxes → transparent match score → selection → deal blast (email/SMS/portal) with
per-recipient engagement → buyer offers with fee/reliability/POF → winner → assignment
agreement → closing checklist → recorded fee feeds analytics.

---

## Security
* JWT session in an `httpOnly`, `sameSite=lax` cookie (`jose`, HS256, 12h), `AUTH_SECRET` required in production.
* `proxy.ts` gates pages; every API route goes through `api()` → auth, `can(role, permission)`, per-user rate limit, zod validation, error shaping.
* Roles: owner, admin, acquisitions, dispositions, assistant, read-only (`src/lib/permissions.ts`).
* Security headers in `next.config.ts`; secrets only in server env; RLS policies in SQL.
* Rate limiting is in-memory per instance — use Redis/Upstash for multi-instance deployments.

## Compliance
DNC flags block calls, SMS requires recorded consent, quiet hours warn, opt-outs feed an
org-wide suppression list enforced across channels (including deal blasts), email footer and
SMS opt-out text are configurable, contract/offer templates are explicitly user/attorney-supplied,
skip-trace data is labeled probabilistic, and provider licence notes are visible in Settings.

## Persistence in demo mode
CRM records live in the browser (Zustand + localStorage; photos/video in IndexedDB) so the
product is fully usable with no database. Every mutation goes through a store action that
also writes activity + audit — the same boundary where a Supabase repository issues SQL.

## Future features — where they plug in
| Feature | Hook |
|---|---|
| MLS integration | new `PropertyDataProvider` adapter for comps/DOM/inventory; `source_kind = 'mls'` already modelled |
| Direct mail, SMS, email sequences, dialer | `MessagingProvider`; `campaign_contacts` statuses; sequences already generate tasks |
| AI call summaries | `communications.recording_url` + `/api/ai` facts pipeline |
| Route optimisation | `d4d_routes` + appointments geocodes |
| Native mobile | API routes are UI-agnostic; Drive/Walkthrough are mobile-first already |
| Public records imports / list stacking | `api_records` → `property_data` with source; list membership counts = stacking |
| AVMs, rental/flip/BRRRR/sub-to/seller-finance/land/multifamily | `deal_analyses.strategy` + new calculators beside `computeDeal` |
