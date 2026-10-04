# Parcel — Wholesale OS

A map-first operating system for real-estate wholesaling: find distressed/undervalued
properties, research owners, run comps, calculate ARV / repairs / MAO, work sellers,
manage offers and contracts, match cash buyers, and track every deal to the recorded
assignment fee.

> **Demo build.** Property data comes from a seeded **synthetic** provider (Sacramento
> region) and every value is labeled “Demo data”. None of it describes real people or
> parcels. Connect licensed providers (ATTOM, RentCast, Regrid, MLS…) through the provider
> layer — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

```bash
npm install
cp .env.example .env.local      # optional in demo mode; set AUTH_SECRET (≥32 chars) for anything real
npm run dev                     # http://localhost:3000
```

Without `AUTH_SECRET` the app runs on a built-in demo secret and logs a warning; with
`DEMO_MODE=false` a real secret is required. Session cookies are marked `Secure` only when
the request arrives over HTTPS (directly or via `x-forwarded-proto`), so plain-http local
and LAN setups work too.

Sign in with a demo account (password `demo1234`): `owner@demo.wholesale` (full access),
`acq@`, `dispo@`, `va@`, or `viewer@demo.wholesale` (read-only) — roles are enforced server-side.

```bash
npm test          # calculation engine unit tests (MAO, ARV, similarity, repairs, scoring, filters)
npm run typecheck
npm run build
```

## The core workflow

**Map → search an area → click a pin → owner + basic data → Save lead → Run comps → select
comps → ARV → repairs → MAO → choose offer → contact seller → follow up → under contract →
match buyers → send deal → accept buyer offer → track closing → record assignment fee.**

| Question | Where it's answered |
|---|---|
| Is this owner worth contacting? | Motivation score (every indicator shown with its source) on the quick card / property record |
| What is it worth after repair? | Comp Engine + ARV calculator (3 methods, range, contributing comps, override) |
| What can I offer? | Deal Desk: configurable MAO formulas, market presets, low/target/max offer with fee at each |
| Can I assign it profitably? | Buyer matching, deal blasts, buyer offers, Deal Room |

## Highlights
* **Map**: clustered pins, parcels, heat maps, 9 colour modes, polygon/radius drawing, saved territories, street/satellite/hybrid, Street View.
* **No black box**: every calculated value shows its formula, inputs and assumptions; every data field shows source, date and confidence.
* **Deal Desk**: subject, map, numbers, comps, repairs and calculator on one screen — any change recalculates instantly.
* **Seller CRM**: contact points with verified/likely/unverified status, DNC/consent compliance gates, discovery questions, sequences, timeline.
* **Dispositions**: buyer match scores with reasons, deal package PDF, email/SMS/portal blasts with engagement tracking, buyer offers, closing.
* **Mobile modes**: Driving for Dollars (GPS, one-tap tags, photos, route history) and Walkthrough (room-by-room condition, repairs, photos, voice notes → live rehab estimate).
* **Reports**: property analysis, comp report, deal package, offer letter (PDF).
* **Optional AI assistant**: uses only stored facts (listed with sources) and labels its output as interpretation; works offline with deterministic rules when `ANTHROPIC_API_KEY` is unset.

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · MapLibre GL · Zustand ·
Zod · jose · jsPDF · PostgreSQL/PostGIS schema (Supabase-ready).

## Project layout
```
db/migrations/        PostgreSQL + PostGIS schema, triggers, RLS, search functions
docs/ARCHITECTURE.md  database, provider, map and information architecture
src/server/           auth, rate limiting, API wrapper, data providers, demo seed
src/lib/calc/         pure calculation engine (comps, ARV, deal/MAO, repairs, scores, metrics)
src/lib/store/        workspace store (demo persistence) + UI state
src/components/map/   provider-isolated map components
src/app/(app)/        product pages
tests/                unit tests
```

## Legal
Templates and compliance settings are configurable tools, not legal advice. Have contract
and offer templates reviewed by a licensed attorney in your jurisdiction. Skip-trace and
property data are never guaranteed accurate; respect provider licence terms and DNC/consent rules.
