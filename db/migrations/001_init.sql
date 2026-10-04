-- ════════════════════════════════════════════════════════════════════
-- Wholesale OS — core schema (PostgreSQL 15+ / Supabase, PostGIS)
-- ════════════════════════════════════════════════════════════════════
-- Conventions
--   * uuid primary keys (gen_random_uuid)
--   * created_at / updated_at on every table, maintained by trigger
--   * deleted_at for soft deletion on user-owned business records
--   * every value obtained from an outside source carries provenance:
--       data_source_id, source_record_id, observed_at, confidence
--   * important provider values are never overwritten silently:
--       property_data_history keeps every prior value (see trigger)
--   * org_id on every business table → multi-tenant, enforced by RLS
-- ════════════════════════════════════════════════════════════════════

create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists citext;

-- ─── Enumerations ───────────────────────────────────────────────────
create type source_kind      as enum ('public_record','third_party','mls','calculated','user_entered');
create type confidence_level as enum ('high','medium','low','unknown');
create type user_role        as enum ('owner','admin','acquisitions','dispositions','assistant','read_only');
create type property_type    as enum ('sfr','condo','townhouse','duplex','triplex','fourplex','multifamily','mobile','lot','land','commercial','other');
create type lead_stage       as enum ('new_lead','researching','contact_attempted','contacted','follow_up','appointment',
                                      'offer_prep','offer_sent','negotiating','contract_sent','under_contract',
                                      'disposition','closing','closed','dead');
create type pin_status       as enum ('not_reviewed','potential','hot','contacted','offer_sent','under_contract','dead','do_not_contact','owned');
create type comm_type        as enum ('call','sms','email','voicemail','note','appointment','offer','contract','automation','mail');
create type comm_direction   as enum ('inbound','outbound','internal');
create type contact_status   as enum ('verified','likely','unverified','bad');
create type offer_status     as enum ('draft','sent','countered','accepted','rejected','expired','withdrawn');
create type contract_status  as enum ('draft','sent','viewed','signed','executed','cancelled','expired');
create type contract_kind    as enum ('purchase_agreement','assignment_agreement','addendum','disclosure','title','proof_of_funds','seller_document','buyer_document','other');
create type disposition_status as enum ('preparing','marketing','reviewing_offers','assigned','closing','closed','cancelled');
create type buyer_offer_status as enum ('pending','accepted','declined','withdrawn');
create type condition_level  as enum ('good','minor','moderate','major','full_replacement');
create type repair_unit      as enum ('sqft','unit','room','linear_ft','flat');

-- ─── Utility triggers ───────────────────────────────────────────────
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ─── Organisations & users ──────────────────────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  email citext not null unique,
  full_name text not null,
  role user_role not null default 'acquisitions',
  password_hash text,                       -- null when using Supabase Auth / SSO
  auth_provider_id text unique,             -- e.g. auth.users.id in Supabase
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index users_org_idx on users(org_id) where deleted_at is null;

-- ─── Data sources & raw provider records ────────────────────────────
create table data_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- 'county_assessor_sacramento', 'attom', 'rentcast', 'regrid', 'mls_metrolist', 'calculated', 'user'
  name text not null,
  kind source_kind not null,
  license_notes text,                        -- redistribution / display / retention restrictions
  retention_days int,                        -- licensing-driven purge policy
  default_confidence confidence_level not null default 'medium',
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every raw payload received from an outside API, for audit/reprocessing.
create table api_records (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references data_sources(id),
  endpoint text not null,
  request_hash text not null,
  external_id text,
  payload jsonb not null,
  status_code int,
  cost_cents int,                            -- per-call provider cost tracking
  fetched_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index api_records_lookup_idx on api_records(data_source_id, request_hash);
create index api_records_external_idx on api_records(data_source_id, external_id);

-- ─── Properties (normalised, provider-independent) ──────────────────
create table properties (
  id uuid primary key default gen_random_uuid(),
  apn text,
  fips text,                                 -- county FIPS; (fips, apn) identifies a parcel
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state char(2) not null,
  zip text not null,
  county text,
  neighborhood text,
  normalized_address text not null,          -- upper-case, USPS-normalised, used for dedupe
  location geography(Point, 4326) not null,
  parcel_geom geometry(MultiPolygon, 4326),
  property_type property_type not null default 'sfr',
  beds numeric(4,1), baths numeric(4,1), sqft int, lot_sqft int, year_built int, units int default 1,
  -- cached, denormalised summary used by map/search (refreshed from property_data)
  est_value int, est_equity int, equity_pct numeric(5,2), est_mortgage_balance int,
  last_sale_price int, last_sale_date date, last_sale_cash boolean,
  owner_occupied boolean, absentee boolean, out_of_state_owner boolean,
  years_owned numeric(5,1), free_and_clear boolean,
  tax_delinquent boolean, pre_foreclosure boolean, foreclosure boolean, auction_date date,
  probate boolean, vacant boolean, code_violations int, lien_count int,
  inherited boolean, tired_landlord boolean,
  motivation_score smallint, deal_score smallint,
  primary_source_id uuid references data_sources(id),
  data_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index properties_parcel_uidx on properties(fips, apn) where apn is not null and deleted_at is null;
create unique index properties_address_uidx on properties(normalized_address) where deleted_at is null;
create index properties_location_gix on properties using gist(location);
create index properties_parcel_gix on properties using gist(parcel_geom);
create index properties_zip_idx on properties(zip);
create index properties_city_idx on properties(state, city);
create index properties_county_idx on properties(state, county);
create index properties_filter_idx on properties(property_type, equity_pct, years_owned, year_built);
create index properties_absentee_idx on properties(absentee, out_of_state_owner) where absentee;
create index properties_distress_idx on properties(tax_delinquent, pre_foreclosure, probate, vacant);
create index properties_address_trgm on properties using gin(normalized_address gin_trgm_ops);
create index properties_apn_idx on properties(apn);

-- Field-level values with provenance. One row per (property, field, source, observed_at).
create table property_data (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  field text not null,                       -- 'est_value','owner_name','mortgage_balance', …
  value jsonb not null,
  data_source_id uuid not null references data_sources(id),
  api_record_id uuid references api_records(id),
  source_record_id text,                     -- e.g. recorder document number
  confidence confidence_level not null default 'medium',
  observed_at timestamptz not null,          -- when the source says the value was true / recorded
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index property_data_current_idx on property_data(property_id, field) where is_current;
create index property_data_history_idx on property_data(property_id, field, observed_at desc);

-- Explicit history for important values (never silently overwritten)
create table property_data_history (
  id bigserial primary key,
  property_id uuid not null references properties(id) on delete cascade,
  field text not null,
  old_value jsonb,
  new_value jsonb,
  data_source_id uuid references data_sources(id),
  changed_at timestamptz not null default now()
);
create index property_data_history_prop_idx on property_data_history(property_id, field, changed_at desc);

create or replace function property_data_versioning() returns trigger language plpgsql as $$
begin
  -- retire the previous current value for the same field+source and log it
  insert into property_data_history(property_id, field, old_value, new_value, data_source_id)
  select pd.property_id, pd.field, pd.value, new.value, new.data_source_id
    from property_data pd
   where pd.property_id = new.property_id and pd.field = new.field
     and pd.data_source_id = new.data_source_id and pd.is_current and pd.id <> new.id;
  update property_data set is_current = false
   where property_id = new.property_id and field = new.field
     and data_source_id = new.data_source_id and is_current and id <> new.id;
  return new;
end $$;
create trigger property_data_versioning_trg after insert on property_data
  for each row execute function property_data_versioning();

-- ─── Owners ─────────────────────────────────────────────────────────
create table owners (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),  -- null = provider-level shared record
  display_name text not null,
  normalized_name text not null,
  entity_type text not null default 'individual', -- individual | llc | trust | estate | corporation | government
  mailing_line1 text, mailing_city text, mailing_state char(2), mailing_zip text,
  data_source_id uuid references data_sources(id),
  confidence confidence_level not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index owners_name_trgm on owners using gin(normalized_name gin_trgm_ops);
create index owners_mailing_idx on owners(mailing_zip, mailing_line1);

create table property_owners (
  property_id uuid not null references properties(id) on delete cascade,
  owner_id uuid not null references owners(id) on delete cascade,
  ownership_pct numeric(5,2),
  vesting text,
  acquired_on date,
  is_current boolean not null default true,
  data_source_id uuid references data_sources(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (property_id, owner_id, is_current)
);
create index property_owners_owner_idx on property_owners(owner_id) where is_current;

-- ─── Transactions, mortgages, liens, tax ────────────────────────────
create table property_transactions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  recorded_on date not null,
  sale_price int,
  document_type text,                        -- grant deed, trustee deed, quitclaim, affidavit of death…
  document_number text,
  buyer_names text[], seller_names text[],
  is_cash boolean, is_arms_length boolean,
  data_source_id uuid not null references data_sources(id),
  confidence confidence_level not null default 'high',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index property_transactions_prop_idx on property_transactions(property_id, recorded_on desc);
create index property_transactions_recent_idx on property_transactions(recorded_on desc) where sale_price is not null;

create table mortgages (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  lender text, original_amount int, recorded_on date, loan_type text, rate_type text, term_months int,
  est_balance int,                           -- ALWAYS an estimate unless user-entered from a statement
  position smallint,
  is_open boolean,
  data_source_id uuid not null references data_sources(id),
  confidence confidence_level not null default 'low',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mortgages_prop_idx on mortgages(property_id);

create table liens (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  lien_type text not null, amount int, recorded_on date, released_on date,
  data_source_id uuid not null references data_sources(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table tax_records (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  tax_year int not null, assessed_value int, annual_tax int, delinquent_amount int, is_delinquent boolean,
  data_source_id uuid not null references data_sources(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(property_id, tax_year, data_source_id)
);

create table distress_events (            -- NOD, NTS, auction, probate filing, code case, etc.
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  event_type text not null, event_date date, case_number text, details jsonb,
  data_source_id uuid not null references data_sources(id),
  confidence confidence_level not null default 'medium',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index distress_events_prop_idx on distress_events(property_id, event_type);

-- ─── Tags & lists ───────────────────────────────────────────────────
create table tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null, color text, is_system boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(org_id, name)
);
create table property_tags (
  org_id uuid not null references organizations(id),
  property_id uuid not null references properties(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, property_id, tag_id)
);

create table lead_lists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null, description text,
  is_dynamic boolean not null default false,
  rules jsonb,                               -- filter DSL for dynamic lists (same as saved_searches.filters)
  created_by uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table list_properties (
  list_id uuid not null references lead_lists(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  added_by uuid references users(id),
  added_reason text,                         -- 'manual' | 'dynamic_rule' | 'import' | 'd4d'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (list_id, property_id)
);
create index list_properties_property_idx on list_properties(property_id);

create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  user_id uuid not null references users(id),
  name text not null,
  filters jsonb not null,
  search_area geometry(Geometry, 4326),
  notify boolean not null default false,
  last_run_at timestamptz,
  last_result_count int,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table saved_search_results (       -- lets us detect "new since last refresh"
  saved_search_id uuid not null references saved_searches(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  primary key (saved_search_id, property_id)
);

-- ─── Leads, sellers, contact points ─────────────────────────────────
create table leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  property_id uuid not null references properties(id),
  stage lead_stage not null default 'new_lead',
  pin_status pin_status not null default 'potential',
  source text not null,                      -- list, d4d, direct mail, cold call, referral …
  campaign_id uuid,
  assigned_to uuid references users(id),
  motivation_score smallint, deal_score smallint,
  asking_price int,
  dead_reason text,
  last_contact_at timestamptz,
  stage_changed_at timestamptz not null default now(),
  property_snapshot jsonb,                   -- cached summary for fast lists
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index leads_property_uidx on leads(org_id, property_id) where deleted_at is null;
create index leads_stage_idx on leads(org_id, stage) where deleted_at is null;
create index leads_assigned_idx on leads(assigned_to, stage);

create table lead_stage_history (
  id bigserial primary key,
  lead_id uuid not null references leads(id) on delete cascade,
  from_stage lead_stage, to_stage lead_stage not null,
  changed_by uuid references users(id), changed_at timestamptz not null default now()
);

create table sellers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  lead_id uuid references leads(id),
  owner_id uuid references owners(id),
  full_name text not null,
  timeline text, asking_price int, mortgage_estimate int, reason_for_selling text,
  condition_notes text, occupancy text, decision_makers text, preferred_channel text,
  motivation_level smallint,                 -- 1–5 seller-stated / rep-assessed
  qualification jsonb not null default '{}', -- answers to discovery questions (never mandatory)
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index sellers_lead_idx on sellers(lead_id);

create table contact_points (             -- phones/emails for sellers, owners and buyers
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  entity_type text not null,                 -- 'seller' | 'owner' | 'buyer'
  entity_id uuid not null,
  kind text not null,                        -- 'phone' | 'email'
  value text not null,
  normalized_value text not null,
  phone_type text,                           -- mobile | landline | voip
  status contact_status not null default 'unverified',
  data_source_id uuid references data_sources(id),
  is_dnc boolean not null default false,     -- federal/state DNC registry scrub result
  dnc_checked_at timestamptz,
  opted_out_at timestamptz,
  sms_consent_at timestamptz,
  consent_evidence text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index contact_points_entity_idx on contact_points(entity_type, entity_id);
create index contact_points_value_idx on contact_points(org_id, normalized_value);

create table suppression_list (            -- org-wide opt-outs / internal DNC
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  kind text not null, normalized_value text not null, reason text, source text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(org_id, kind, normalized_value)
);

-- ─── Communications, tasks, appointments, notes ─────────────────────
create table communications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  lead_id uuid references leads(id), buyer_id uuid,
  contact_point_id uuid references contact_points(id),
  type comm_type not null, direction comm_direction not null,
  outcome text, subject text, body text,
  duration_seconds int, recording_url text, provider_message_id text,
  occurred_at timestamptz not null default now(),
  user_id uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index communications_lead_idx on communications(lead_id, occurred_at desc);

create table follow_up_sequences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null, steps jsonb not null,  -- [{day:0,type:'call'},{day:1,type:'sms'}…]
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  lead_id uuid references leads(id), buyer_id uuid, disposition_id uuid,
  title text not null, task_type text not null, priority smallint not null default 2,
  due_at timestamptz, completed_at timestamptz,
  assigned_to uuid references users(id),
  sequence_id uuid references follow_up_sequences(id), sequence_step smallint,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index tasks_due_idx on tasks(assigned_to, due_at) where completed_at is null and deleted_at is null;

create table appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  lead_id uuid references leads(id),
  kind text not null, starts_at timestamptz not null, ends_at timestamptz,
  location text, notes text, status text not null default 'scheduled',
  assigned_to uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index appointments_time_idx on appointments(org_id, starts_at);

create table notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  entity_type text not null, entity_id uuid not null,
  body text not null, is_pinned boolean not null default false, tags text[] not null default '{}',
  via_voice boolean not null default false,
  user_id uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index notes_entity_idx on notes(entity_type, entity_id);

-- ─── Comps & valuation ──────────────────────────────────────────────
create table comp_sets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  property_id uuid not null references properties(id),
  criteria jsonb not null,                   -- radius, months, sqft tolerance, …
  weights jsonb not null,                    -- similarity weights used
  calculated_arv int, arv_low int, arv_high int, arv_method text,
  user_arv int, user_arv_reason text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index comp_sets_property_idx on comp_sets(property_id, created_at desc);

create table comps (
  id uuid primary key default gen_random_uuid(),
  comp_set_id uuid not null references comp_sets(id) on delete cascade,
  comp_property_id uuid references properties(id),
  transaction_id uuid references property_transactions(id),
  is_manual boolean not null default false,
  manual_data jsonb,                         -- when user-entered
  is_included boolean not null default true,
  distance_miles numeric(6,3), similarity numeric(5,2), similarity_breakdown jsonb,
  adjusted_value int, weight numeric(6,4),
  condition_notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index comps_set_idx on comps(comp_set_id);

-- ─── Repairs ────────────────────────────────────────────────────────
create table repair_estimates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  property_id uuid not null references properties(id),
  market_code text, cost_multiplier numeric(5,3) not null default 1,
  contingency_pct numeric(5,2) not null default 10,
  low_total int, expected_total int, high_total int,
  walkthrough jsonb,                         -- rooms, ratings, media references
  created_by uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table repair_items (
  id uuid primary key default gen_random_uuid(),
  repair_estimate_id uuid not null references repair_estimates(id) on delete cascade,
  category text not null, room text, condition condition_level not null,
  unit repair_unit not null, quantity numeric(10,2) not null, unit_cost numeric(10,2) not null,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ─── Underwriting & offers ──────────────────────────────────────────
create table deal_analyses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  property_id uuid not null references properties(id),
  lead_id uuid references leads(id),
  comp_set_id uuid references comp_sets(id),
  repair_estimate_id uuid references repair_estimates(id),
  strategy text not null default 'wholesale',  -- wholesale | flip | brrrr | rental | subto | seller_finance | land (future)
  formula text not null,                       -- 'percent_of_arv' | 'detailed'
  inputs jsonb not null,                       -- full input set incl. preset used → reproducible
  outputs jsonb not null,                      -- MAO, offer range, ROI … at time of save
  deal_score smallint, deal_score_breakdown jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index deal_analyses_property_idx on deal_analyses(property_id, created_at desc);

create table offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  lead_id uuid not null references leads(id),
  deal_analysis_id uuid references deal_analyses(id),
  amount int not null, earnest_money int, close_days int, inspection_days int,
  terms text, template_id text, status offer_status not null default 'draft',
  sent_at timestamptz, responded_at timestamptz, expires_at timestamptz,
  document_id uuid,
  created_by uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index offers_lead_idx on offers(lead_id, created_at desc);

-- ─── Contracts & documents ──────────────────────────────────────────
create table documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  entity_type text not null, entity_id uuid not null,
  kind text not null, name text not null,
  storage_path text not null,                -- Supabase Storage / S3 key (never a public URL)
  mime_type text, size_bytes int, checksum text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index documents_entity_idx on documents(entity_type, entity_id);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  lead_id uuid not null references leads(id),
  disposition_id uuid,
  kind contract_kind not null, status contract_status not null default 'draft',
  title text not null, amount int,
  template_id text,                          -- templates are user/attorney supplied, not legal advice
  document_id uuid references documents(id),
  esign_provider text, esign_envelope_id text,
  sent_at timestamptz, viewed_at timestamptz, signed_at timestamptz, executed_at timestamptz, expires_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index contracts_lead_idx on contracts(lead_id);

create table photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  property_id uuid references properties(id),
  entity_type text, entity_id uuid,
  storage_path text not null, caption text, room text,
  taken_at timestamptz, location geography(Point,4326),
  license text,                              -- 'own' | provider licence id — never scrape listing photos
  created_by uuid references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ─── Buyers & dispositions ──────────────────────────────────────────
create table buyers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  full_name text not null, company text,
  reliability smallint,                      -- 1–5, rep-assessed
  proof_of_funds_amount int, proof_of_funds_verified_at timestamptz, proof_of_funds_document_id uuid,
  deals_purchased int not null default 0, avg_purchase_price int,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table buyer_preferences (
  buyer_id uuid primary key references buyers(id) on delete cascade,
  markets text[] not null default '{}', zips text[] not null default '{}',
  property_types property_type[] not null default '{}',
  min_price int, max_price int, min_beds smallint,
  rehab_tolerance text,                      -- cosmetic | moderate | heavy | full_gut
  strategies text[] not null default '{}',   -- flip | hold | brrrr | land | multifamily
  desired_margin_pct numeric(5,2),
  buy_box_area geometry(MultiPolygon,4326),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index buyer_preferences_zips_gin on buyer_preferences using gin(zips);

create table dispositions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  lead_id uuid not null unique references leads(id),
  contract_price int not null, asking_price int, minimum_price int,
  access_instructions text, closing_date date, earnest_money int,
  title_company text, title_contact text,
  status disposition_status not null default 'preparing',
  show_full_address boolean not null default false,
  winning_buyer_offer_id uuid,
  projected_fee int, actual_fee int, fee_received_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table buyer_offers (
  id uuid primary key default gen_random_uuid(),
  disposition_id uuid not null references dispositions(id) on delete cascade,
  buyer_id uuid not null references buyers(id),
  amount int not null, close_days int, emd int, pof_verified boolean not null default false,
  status buyer_offer_status not null default 'pending', notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table dispositions add constraint dispositions_winning_offer_fk
  foreign key (winning_buyer_offer_id) references buyer_offers(id);

-- ─── Marketing ──────────────────────────────────────────────────────
create table marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  audience text not null,                    -- 'seller' | 'buyer'
  channel text not null,                     -- direct_mail | cold_call | sms | email | ppc | d4d | deal_blast …
  disposition_id uuid references dispositions(id),
  list_id uuid references lead_lists(id),
  spend_cents bigint not null default 0,
  starts_on date, ends_on date, status text not null default 'draft',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table leads add constraint leads_campaign_fk foreign key (campaign_id) references marketing_campaigns(id);

create table campaign_contacts (
  campaign_id uuid not null references marketing_campaigns(id) on delete cascade,
  contact_point_id uuid references contact_points(id),
  buyer_id uuid references buyers(id),
  lead_id uuid references leads(id),
  status text not null default 'queued',     -- queued, sent, delivered, opened, clicked, interested, passed, offer_submitted, bounced, opted_out
  sent_at timestamptz, opened_at timestamptz, clicked_at timestamptz, responded_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index campaign_contacts_campaign_idx on campaign_contacts(campaign_id, status);

-- ─── Driving for dollars ────────────────────────────────────────────
create table d4d_routes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  user_id uuid not null references users(id),
  path geometry(LineString,4326), started_at timestamptz not null, ended_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- ─── Activity, notifications, audit ─────────────────────────────────
create table activities (
  id bigserial primary key,
  org_id uuid not null references organizations(id),
  user_id uuid references users(id),
  entity_type text not null, entity_id uuid not null,
  verb text not null,                        -- 'lead.created', 'arv.calculated', 'offer.sent' …
  summary text not null, data jsonb,
  occurred_at timestamptz not null default now()
);
create index activities_feed_idx on activities(org_id, occurred_at desc);
create index activities_entity_idx on activities(entity_type, entity_id, occurred_at desc);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  kind text not null, title text not null, body text, link text,
  read_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, created_at desc) where read_at is null;

create table audit_log (                  -- immutable; written by trigger on sensitive tables
  id bigserial primary key,
  org_id uuid, user_id uuid,
  table_name text not null, record_id uuid not null,
  action text not null,                      -- insert | update | delete
  old_data jsonb, new_data jsonb,
  ip inet, user_agent text,
  occurred_at timestamptz not null default now()
);
create index audit_log_record_idx on audit_log(table_name, record_id, occurred_at desc);

create or replace function audit_row() returns trigger language plpgsql security definer as $$
begin
  insert into audit_log(org_id, user_id, table_name, record_id, action, old_data, new_data)
  values (
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'org_id', null)::uuid,
    nullif(current_setting('app.user_id', true), '')::uuid,
    tg_table_name,
    (case when tg_op = 'DELETE' then old.id else new.id end),
    lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- updated_at + audit triggers on business tables
do $$
declare t text;
begin
  foreach t in array array['organizations','users','data_sources','api_records','properties','property_data','owners',
    'property_owners','property_transactions','mortgages','liens','tax_records','distress_events','tags','property_tags',
    'lead_lists','list_properties','saved_searches','leads','sellers','contact_points','suppression_list','communications',
    'follow_up_sequences','tasks','appointments','notes','comp_sets','comps','repair_estimates','repair_items',
    'deal_analyses','offers','documents','contracts','photos','buyers','buyer_preferences','dispositions','buyer_offers',
    'marketing_campaigns','campaign_contacts','d4d_routes','notifications']
  loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
  foreach t in array array['leads','sellers','contact_points','offers','contracts','buyers','dispositions','buyer_offers',
    'deal_analyses','comp_sets','users','suppression_list']
  loop
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function audit_row()', t, t);
  end loop;
end $$;

-- ─── Search helpers ─────────────────────────────────────────────────
-- Bounding-box + filters, server-side paginated (used by /api/properties/search)
create or replace function search_properties_bbox(
  west double precision, south double precision, east double precision, north double precision,
  filters jsonb default '{}', max_rows int default 2000, page_offset int default 0)
returns setof properties language sql stable as $$
  select p.* from properties p
   where p.deleted_at is null
     and p.location && st_makeenvelope(west, south, east, north, 4326)::geography
     and (filters->>'property_types' is null or p.property_type::text = any (array(select jsonb_array_elements_text(filters->'property_types'))))
     and (filters->>'min_equity_pct' is null or p.equity_pct >= (filters->>'min_equity_pct')::numeric)
     and (filters->>'min_years_owned' is null or p.years_owned >= (filters->>'min_years_owned')::numeric)
     and (filters->>'max_year_built' is null or p.year_built <= (filters->>'max_year_built')::int)
     and (filters->>'absentee' is null or p.absentee = (filters->>'absentee')::boolean)
   order by p.motivation_score desc nulls last
   limit least(max_rows, 5000) offset page_offset
$$;

-- Comparable sales within radius / window (used by comps engine)
create or replace function find_comp_sales(subject uuid, radius_miles numeric, months int, max_rows int default 50)
returns table(property_id uuid, transaction_id uuid, distance_miles numeric, sale_price int, recorded_on date)
language sql stable as $$
  select c.id, t.id, (st_distance(s.location, c.location) / 1609.344)::numeric(6,3), t.sale_price, t.recorded_on
    from properties s
    join properties c on c.id <> s.id and st_dwithin(s.location, c.location, radius_miles * 1609.344)
    join property_transactions t on t.property_id = c.id
   where s.id = subject and t.sale_price is not null and t.is_arms_length is not false
     and t.recorded_on >= (current_date - make_interval(months => months))
   order by st_distance(s.location, c.location)
   limit max_rows
$$;

-- ─── Row-level security (Supabase) ──────────────────────────────────
-- Each business table is restricted to the caller's organisation. Role-specific
-- write rules (e.g. read_only users) are enforced in the API layer + these policies.
create or replace function current_org_id() returns uuid language sql stable as $$
  select org_id from users where auth_provider_id = coalesce(auth.uid()::text, '') limit 1
$$;
do $$
declare t text;
begin
  foreach t in array array['leads','sellers','contact_points','communications','tasks','appointments','notes','comp_sets',
    'repair_estimates','deal_analyses','offers','documents','contracts','photos','buyers','dispositions','marketing_campaigns',
    'lead_lists','saved_searches','tags','property_tags','suppression_list','follow_up_sequences','activities','d4d_routes']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_org_isolation on %I using (org_id = current_org_id()) with check (org_id = current_org_id())', t, t);
  end loop;
end $$;
