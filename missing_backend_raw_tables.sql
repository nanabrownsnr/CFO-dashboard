-- Missing backend raw tables for CFO Command Center
-- Run after seed_cfo_command_center.sql. Additive only.

begin;

create extension if not exists pgcrypto;

create table if not exists funding_providers (
  provider_id text primary key,
  provider_name text not null,
  commitment_m numeric(12,2) not null,
  drawn_m numeric(12,2) not null,
  provider_type text not null,
  status text not null,
  as_of date not null default current_date
);

create table if not exists loans (
  loan_id text primary key,
  borrower_name text not null,
  product_code text not null,
  origination_date date not null,
  maturity_date date not null,
  state_code text not null,
  channel text not null,
  unpaid_principal_balance_m numeric(12,2) not null,
  current_balance_m numeric(12,2) not null,
  coupon_rate_pct numeric(8,2) not null,
  fee_rate_pct numeric(8,2) not null,
  delinquency_days integer not null default 0,
  status text not null,
  foreclosure_flag boolean not null default false,
  npl_flag boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists apr_calculations (
  calc_id bigserial primary key,
  loan_id text not null references loans(loan_id) on delete cascade,
  state_code text not null,
  gross_apr_pct numeric(8,2) not null,
  fee_apr_pct numeric(8,2) not null,
  total_apr_pct numeric(8,2) not null,
  rule_version text not null,
  effective_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists borrowing_base_assets (
  asset_id text primary key,
  facility_id text not null,
  loan_id text references loans(loan_id) on delete set null,
  asset_type text not null,
  original_value_m numeric(12,2) not null,
  eligible_value_m numeric(12,2) not null,
  haircut_pct numeric(8,2) not null,
  valuation_date date not null,
  status text not null
);

create table if not exists liquidity_forecasts (
  forecast_id bigserial primary key,
  scenario_key text not null,
  forecast_week integer not null,
  forecast_date date not null,
  unrestricted_cash_m numeric(12,2) not null,
  restricted_cash_m numeric(12,2) not null,
  available_capacity_m numeric(12,2) not null,
  total_liquidity_m numeric(12,2) not null,
  monthly_burn_m numeric(12,2) not null,
  runway_days integer not null,
  created_at timestamptz not null default now(),
  unique (scenario_key, forecast_week)
);

create table if not exists state_laws (
  state_code text primary key,
  statute_name text not null,
  usury_cap_pct numeric(8,2) not null,
  commercial_exemption boolean not null default true,
  notes text not null
);

create table if not exists usury_rules (
  rule_id bigserial primary key,
  state_code text not null references state_laws(state_code) on delete cascade,
  loan_type text not null,
  fee_in_interest boolean not null default true,
  threshold_pct numeric(8,2) not null,
  effective_date date not null,
  notes text not null
);

create table if not exists legal_sources (
  source_id text primary key,
  state_code text not null references state_laws(state_code) on delete cascade,
  citation text not null,
  source_type text not null,
  source_url text,
  effective_date date not null,
  summary text not null
);

create table if not exists ingest_runs (
  run_id bigserial primary key,
  feed_name text not null,
  trigger_type text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_loaded integer not null default 0,
  notes text not null
);

create table if not exists audit_logs (
  event_id bigserial primary key,
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists funding_providers enable row level security;
alter table if exists loans enable row level security;
alter table if exists apr_calculations enable row level security;
alter table if exists borrowing_base_assets enable row level security;
alter table if exists liquidity_forecasts enable row level security;
alter table if exists state_laws enable row level security;
alter table if exists usury_rules enable row level security;
alter table if exists legal_sources enable row level security;
alter table if exists ingest_runs enable row level security;
alter table if exists audit_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = current_schema() and tablename = 'funding_providers' and policyname = 'public read funding_providers'
  ) then
    create policy "public read funding_providers" on funding_providers for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = current_schema() and tablename = 'loans' and policyname = 'public read loans'
  ) then
    create policy "public read loans" on loans for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = current_schema() and tablename = 'apr_calculations' and policyname = 'public read apr_calculations'
  ) then
    create policy "public read apr_calculations" on apr_calculations for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = current_schema() and tablename = 'borrowing_base_assets' and policyname = 'public read borrowing_base_assets'
  ) then
    create policy "public read borrowing_base_assets" on borrowing_base_assets for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = current_schema() and tablename = 'liquidity_forecasts' and policyname = 'public read liquidity_forecasts'
  ) then
    create policy "public read liquidity_forecasts" on liquidity_forecasts for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = current_schema() and tablename = 'state_laws' and policyname = 'public read state_laws'
  ) then
    create policy "public read state_laws" on state_laws for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = current_schema() and tablename = 'usury_rules' and policyname = 'public read usury_rules'
  ) then
    create policy "public read usury_rules" on usury_rules for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = current_schema() and tablename = 'legal_sources' and policyname = 'public read legal_sources'
  ) then
    create policy "public read legal_sources" on legal_sources for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = current_schema() and tablename = 'ingest_runs' and policyname = 'public read ingest_runs'
  ) then
    create policy "public read ingest_runs" on ingest_runs for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = current_schema() and tablename = 'audit_logs' and policyname = 'public read audit_logs'
  ) then
    create policy "public read audit_logs" on audit_logs for select using (true);
  end if;
end $$;

insert into funding_providers (provider_id, provider_name, commitment_m, drawn_m, provider_type, status, as_of) values
  ('FP-ATLAS', 'Atlas Capital Partners', 250, 212, 'Warehouse lender', 'amber', date '2026-06-01'),
  ('FP-MERIDIAN', 'Meridian Warehouse Finance', 200, 186, 'Warehouse lender', 'red', date '2026-06-01'),
  ('FP-GRANITE', 'Granite Structured Funding', 175, 100, 'Warehouse lender', 'green', date '2026-06-01')
on conflict (provider_id) do nothing;

insert into loans (loan_id, borrower_name, product_code, origination_date, maturity_date, state_code, channel, unpaid_principal_balance_m, current_balance_m, coupon_rate_pct, fee_rate_pct, delinquency_days, status, foreclosure_flag, npl_flag) values
  ('LN-1001', 'Orchard Hill LLC', 'Bridge', date '2025-08-14', date '2027-08-14', 'NY', 'Direct / In-house', 12.4, 12.1, 11.8, 1.2, 0, 'current', false, false),
  ('LN-1002', 'Sunset Equity Group', 'Bridge', date '2025-09-02', date '2027-09-02', 'CA', 'Broker — Apex Partners', 10.2, 10.0, 12.1, 1.4, 14, '30dpd', false, false),
  ('LN-1003', 'Magnolia Capital', 'Fix & Flip', date '2025-06-21', date '2027-06-21', 'NJ', 'Broker — Coastal Capital', 8.8, 8.5, 13.8, 1.5, 62, '60dpd', true, true),
  ('LN-1004', 'Pine Street Holdings', 'CRE Term', date '2024-11-18', date '2028-11-18', 'FL', 'Correspondent', 14.5, 14.4, 10.4, 0.9, 0, 'current', false, false),
  ('LN-1005', 'Blue Harbor Partners', 'SBA-Adjacent', date '2025-01-07', date '2027-01-07', 'GA', 'Broker — Apex Partners', 6.1, 5.9, 12.9, 1.8, 91, '90dpd', true, true),
  ('LN-1006', 'Juniper REI', 'Bridge', date '2025-10-11', date '2027-10-11', 'TX', 'Direct / In-house', 11.3, 11.1, 11.5, 1.0, 0, 'current', false, false),
  ('LN-1007', 'Cedar Ridge Capital', 'CRE Term', date '2024-09-01', date '2028-09-01', 'NY', 'Correspondent', 9.7, 9.6, 10.1, 0.8, 3, 'current', false, false),
  ('LN-1008', 'Summit Grove LLC', 'Fix & Flip', date '2025-04-15', date '2027-04-15', 'CA', 'Broker — Coastal Capital', 7.3, 7.1, 13.4, 1.3, 0, 'current', false, false),
  ('LN-1009', 'Lakeside Partners', 'Bridge', date '2025-07-03', date '2027-07-03', 'NJ', 'Broker — Apex Partners', 9.9, 9.7, 12.7, 1.4, 31, '30dpd', false, false),
  ('LN-1010', 'Evergreen RE Capital', 'SBA-Adjacent', date '2025-02-22', date '2027-02-22', 'FL', 'Correspondent', 5.8, 5.7, 11.9, 1.1, 0, 'current', false, false),
  ('LN-1011', 'Harbor Point Ventures', 'CRE Term', date '2024-12-09', date '2028-12-09', 'GA', 'Broker — Apex Partners', 13.6, 13.4, 10.8, 0.9, 45, '60dpd', false, false),
  ('LN-1012', 'Vista Ridge Holdings', 'Bridge', date '2025-05-29', date '2027-05-29', 'TX', 'Direct / In-house', 8.1, 8.0, 11.3, 1.0, 0, 'current', false, false)
on conflict (loan_id) do nothing;

insert into apr_calculations (loan_id, state_code, gross_apr_pct, fee_apr_pct, total_apr_pct, rule_version, effective_date) values
  ('LN-1001', 'NY', 11.8, 1.2, 13.0, 'v1.0', date '2026-06-01'),
  ('LN-1002', 'CA', 12.1, 1.4, 13.5, 'v1.0', date '2026-06-01'),
  ('LN-1003', 'NJ', 13.8, 1.5, 15.3, 'v1.0', date '2026-06-01'),
  ('LN-1004', 'FL', 10.4, 0.9, 11.3, 'v1.0', date '2026-06-01'),
  ('LN-1005', 'GA', 12.9, 1.8, 14.7, 'v1.0', date '2026-06-01'),
  ('LN-1006', 'TX', 11.5, 1.0, 12.5, 'v1.0', date '2026-06-01'),
  ('LN-1007', 'NY', 10.1, 0.8, 10.9, 'v1.0', date '2026-06-01'),
  ('LN-1008', 'CA', 13.4, 1.3, 14.7, 'v1.0', date '2026-06-01'),
  ('LN-1009', 'NJ', 12.7, 1.4, 14.1, 'v1.0', date '2026-06-01'),
  ('LN-1010', 'FL', 11.9, 1.1, 13.0, 'v1.0', date '2026-06-01'),
  ('LN-1011', 'GA', 10.8, 0.9, 11.7, 'v1.0', date '2026-06-01'),
  ('LN-1012', 'TX', 11.3, 1.0, 12.3, 'v1.0', date '2026-06-01')
on conflict do nothing;

insert into borrowing_base_assets (asset_id, facility_id, loan_id, asset_type, original_value_m, eligible_value_m, haircut_pct, valuation_date, status) values
  ('BBA-1', 'ATLAS', 'LN-1001', 'First lien note', 15.0, 12.4, 17.3, date '2026-06-01', 'eligible'),
  ('BBA-2', 'ATLAS', 'LN-1006', 'First lien note', 13.4, 11.3, 15.7, date '2026-06-01', 'eligible'),
  ('BBA-3', 'MERIDIAN', 'LN-1002', 'Seasoned bridge', 11.0, 8.9, 19.1, date '2026-06-01', 'eligible'),
  ('BBA-4', 'MERIDIAN', 'LN-1003', 'Fix & flip', 10.5, 8.1, 22.9, date '2026-06-01', 'watch'),
  ('BBA-5', 'GRANITE', 'LN-1004', 'CRE term', 16.0, 13.1, 18.1, date '2026-06-01', 'eligible'),
  ('BBA-6', 'GRANITE', 'LN-1008', 'Fix & flip', 8.7, 6.7, 23.0, date '2026-06-01', 'eligible'),
  ('BBA-7', 'MERIDIAN', 'LN-1009', 'Bridge', 9.3, 7.5, 19.4, date '2026-06-01', 'watch'),
  ('BBA-8', 'ATLAS', 'LN-1011', 'CRE term', 14.2, 11.8, 16.9, date '2026-06-01', 'eligible')
on conflict (asset_id) do nothing;

insert into liquidity_forecasts (scenario_key, forecast_week, forecast_date, unrestricted_cash_m, restricted_cash_m, available_capacity_m, total_liquidity_m, monthly_burn_m, runway_days) values
  ('base', 0, date '2026-06-01', 42.0, 18.5, 113.0, 173.5, 11.0, 472),
  ('base', 13, date '2026-09-01', 32.0, 18.5, 103.0, 153.5, 11.0, 417),
  ('base', 26, date '2026-12-01', 22.0, 18.5, 93.0, 133.5, 11.0, 362),
  ('warehouse', 0, date '2026-06-01', 42.0, 18.5, 91.0, 151.5, 12.1, 375),
  ('warehouse', 13, date '2026-09-01', 30.0, 18.5, 79.0, 127.5, 12.1, 315),
  ('warehouse', 26, date '2026-12-01', 16.0, 18.5, 65.0, 99.5, 12.1, 246),
  ('abs', 0, date '2026-06-01', 42.0, 18.5, 76.0, 136.5, 15.4, 266),
  ('abs', 13, date '2026-09-01', 24.0, 18.5, 58.0, 100.5, 15.4, 196),
  ('abs', 26, date '2026-12-01', 8.0, 18.5, 42.0, 68.5, 15.4, 134),
  ('recession', 0, date '2026-06-01', 42.0, 18.5, 58.0, 118.5, 14.9, 238),
  ('recession', 13, date '2026-09-01', 18.0, 18.5, 34.0, 70.5, 14.9, 142),
  ('recession', 26, date '2026-12-01', 0.0, 18.5, 20.0, 38.5, 14.9, 81)
on conflict (scenario_key, forecast_week) do nothing;

insert into state_laws (state_code, statute_name, usury_cap_pct, commercial_exemption, notes) values
  ('NY', 'NY Banking Law 14-a', 16.0, true, 'Commercial exemptions apply, but structure and disclosure matter.'),
  ('CA', 'California Finance Lenders Law', 12.0, true, 'CFDL review required for licensed lender structures.'),
  ('NJ', 'NJ Criminal Usury Statute', 30.0, true, 'Criminal usury risk becomes sensitive as rates approach threshold.'),
  ('FL', 'Florida Interest and Usury', 18.0, true, 'Commercial lending generally exempt with proper structure.'),
  ('GA', 'Georgia Usury Statute', 16.0, true, 'Watch APR and fee treatment closely.'),
  ('TX', 'Texas Finance Code', 18.0, true, 'Generally favorable for commercial lending.')
on conflict (state_code) do nothing;

insert into usury_rules (state_code, loan_type, fee_in_interest, threshold_pct, effective_date, notes) values
  ('NY', 'Commercial real estate bridge', true, 16.0, date '2026-01-01', 'Fee treatment reviewed with counsel.'),
  ('CA', 'Business purpose loan', true, 12.0, date '2026-01-01', 'CFDL disclosure emphasis.'),
  ('NJ', 'Commercial loan', true, 30.0, date '2026-01-01', 'Criminal usury cap.'),
  ('FL', 'Commercial real estate', true, 18.0, date '2026-01-01', 'Commercial exemption expected.'),
  ('GA', 'Business-purpose loan', true, 16.0, date '2026-01-01', 'Review fee treatment carefully.'),
  ('TX', 'Commercial bridge', true, 18.0, date '2026-01-01', 'State law generally favorable.')
on conflict do nothing;

insert into legal_sources (source_id, state_code, citation, source_type, source_url, effective_date, summary) values
  ('LS-NY-1', 'NY', 'NY Banking Law 14-a', 'Statute', 'https://www.nysenate.gov/legislation/laws/BNK/14-A', date '2026-01-01', 'Commercial lending disclosure and exemption analysis.'),
  ('LS-CA-1', 'CA', 'California Finance Lenders Law', 'Statute', 'https://leginfo.legislature.ca.gov/', date '2026-01-01', 'CFDL / lender licensing context.'),
  ('LS-NJ-1', 'NJ', 'NJ Criminal Usury Statute', 'Statute', 'https://www.njleg.state.nj.us/', date '2026-01-01', 'Criminal usury risk summary.'),
  ('LS-FL-1', 'FL', 'Florida Interest and Usury', 'Statute', 'https://www.leg.state.fl.us/', date '2026-01-01', 'Commercial exemption note.'),
  ('LS-GA-1', 'GA', 'Georgia Usury Statute', 'Statute', 'https://www.legis.ga.gov/', date '2026-01-01', 'APR and fee treatment note.'),
  ('LS-TX-1', 'TX', 'Texas Finance Code', 'Statute', 'https://statutes.capitol.texas.gov/', date '2026-01-01', 'Commercial lending friendliness.')
on conflict (source_id) do nothing;

insert into ingest_runs (feed_name, trigger_type, status, started_at, finished_at, rows_loaded, notes) values
  ('Loan servicing extract', 'Scheduled', 'success', now() - interval '1 day', now() - interval '23 hours', 38412, 'Nightly load succeeded.'),
  ('General ledger', 'Scheduled', 'success', now() - interval '1 day', now() - interval '23 hours 30 minutes', 1204, 'Daily close batch loaded.'),
  ('Bank cash positions', 'API sync', 'success', now() - interval '1 hour', now() - interval '58 minutes', 7, 'Intraday bank feed current.'),
  ('State statutes & rulings', 'Manual review', 'warning', now() - interval '3 days', now() - interval '3 days', 212, 'One source requires follow-up.'),
  ('Warehouse borrowing-base certs', 'Manual upload', 'warning', now() - interval '19 days', now() - interval '19 days', 3, 'Stale upload needs refresh.')
on conflict do nothing;

insert into audit_logs (actor, action, entity_type, entity_id, details, created_at) values
  ('system', 'seed', 'table', 'funding_providers', '{"source":"missing_backend_raw_tables.sql"}', now() - interval '1 minute'),
  ('system', 'seed', 'table', 'loans', '{"source":"missing_backend_raw_tables.sql"}', now() - interval '1 minute'),
  ('system', 'seed', 'table', 'apr_calculations', '{"source":"missing_backend_raw_tables.sql"}', now() - interval '1 minute'),
  ('system', 'seed', 'table', 'liquidity_forecasts', '{"source":"missing_backend_raw_tables.sql"}', now() - interval '1 minute'),
  ('system', 'seed', 'table', 'state_laws', '{"source":"missing_backend_raw_tables.sql"}', now() - interval '1 minute');

commit;

