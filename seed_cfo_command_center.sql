-- CFO Command Center seed data for Supabase / Postgres
-- Safe to run on a fresh schema. Drops and recreates the prototype tables.

begin;

create extension if not exists pgcrypto;

drop table if exists app_program_priorities cascade;
drop table if exists app_stress_scenarios cascade;
drop table if exists app_warehouse_facilities cascade;
drop table if exists app_reserve_history cascade;
drop table if exists app_vintage_losses cascade;
drop table if exists app_product_profitability cascade;
drop table if exists app_foreclosure_economics cascade;
drop table if exists app_state_usury_exposure cascade;
drop table if exists app_litigation_matters cascade;
drop table if exists app_channel_risk cascade;
drop table if exists app_governance_items cascade;
drop table if exists app_feed_registry cascade;
drop table if exists app_model_registry cascade;

create table app_program_priorities (
  id integer primary key,
  phase integer not null,
  name text not null,
  tab text not null,
  status text not null,
  pct integer not null
);

create table app_stress_scenarios (
  scenario_key text primary key,
  label text not null,
  collateral_impair numeric(6,4) not null,
  advance_cut numeric(6,4) not null,
  delinq_mult numeric(6,4) not null,
  inflow_cut numeric(6,4) not null,
  description text not null
);

create table app_warehouse_facilities (
  id text primary key,
  lender text not null,
  commitment_m numeric(12,2) not null,
  drawn_m numeric(12,2) not null,
  advance_rate numeric(6,4) not null,
  eligible_collateral_m numeric(12,2) not null,
  spread text not null,
  maturity date not null
);

create table app_reserve_history (
  quarter text primary key,
  reserve_m numeric(12,2) not null,
  coverage_pct numeric(8,4) not null
);

create table app_vintage_losses (
  vintage_year text primary key,
  mob_6mo numeric(8,2),
  mob_12mo numeric(8,2),
  mob_18mo numeric(8,2),
  mob_24mo numeric(8,2),
  mob_30mo numeric(8,2),
  mob_36mo numeric(8,2)
);

create table app_product_profitability (
  product_name text primary key,
  volume_m numeric(12,2) not null,
  gross_yield_pct numeric(8,2) not null,
  real_yield_pct numeric(8,2) not null,
  loss_pct numeric(8,2) not null,
  net_margin_pct numeric(8,2) not null,
  status text not null
);

create table app_foreclosure_economics (
  metric text primary key,
  value_text text not null,
  status text not null
);

create table app_state_usury_exposure (
  state_code text primary key,
  exposure_m numeric(12,2) not null,
  exposure_pct numeric(8,2) not null,
  apr_pct numeric(8,2) not null,
  note text not null,
  status text not null
);

create table app_litigation_matters (
  matter text primary key,
  jurisdiction text not null,
  exposure_m numeric(12,2) not null,
  stage text not null,
  status text not null
);

create table app_channel_risk (
  channel text primary key,
  volume_m numeric(12,2) not null,
  default_pct numeric(8,2) not null,
  complaint_pct numeric(8,2) not null,
  assessment text not null,
  status text not null
);

create table app_governance_items (
  name text primary key,
  current_level integer not null,
  target_level integer not null,
  owner text not null,
  status text not null,
  note text not null
);

create table app_feed_registry (
  feed text primary key,
  source text not null,
  target_table text not null,
  method text not null,
  cadence text not null,
  last_load text not null,
  rows_text text not null,
  status text not null
);

create table app_model_registry (
  model_name text primary key,
  inputs text not null,
  output_table text not null,
  version text not null,
  run_frequency text not null,
  status text not null,
  note text not null
);

insert into app_program_priorities (id, phase, name, tab, status, pct) values
  (1, 0, 'Liquidity Stress Testing', 'treasury', 'green', 90),
  (2, 0, 'Warehouse Covenant Review', 'treasury', 'amber', 75),
  (3, 0, 'Funding Concentration Analysis', 'treasury', 'amber', 80),
  (4, 0, 'State-Law Exposure Map', 'compliance', 'red', 40),
  (5, 0, 'Litigation Inventory', 'compliance', 'amber', 60),
  (6, 0, 'Reserve Methodology Review', 'accounting', 'amber', 55),
  (7, 1, 'CECL Model Validation', 'calc', 'amber', 35),
  (8, 1, 'Product Profitability by Vintage', 'accounting', 'green', 50),
  (9, 1, 'Foreclosure Economics', 'accounting', 'amber', 30),
  (10, 1, 'Broker / Channel Risk Review', 'compliance', 'red', 20),
  (11, 1, 'Compliance Governance Framework', 'compliance', 'amber', 25),
  (12, 2, 'Institutional Reporting Upgrade', 'governance', 'gray', 10),
  (13, 2, 'Data Warehouse Modernization', 'import', 'gray', 5),
  (14, 2, 'Automated Compliance Engine', 'calc', 'gray', 15),
  (15, 2, 'Internal Audit Enhancement', 'governance', 'gray', 0),
  (16, 2, 'Board-Level Risk Reporting', 'governance', 'gray', 5);

insert into app_stress_scenarios (scenario_key, label, collateral_impair, advance_cut, delinq_mult, inflow_cut, description) values
  ('base', 'Base Case', 0, 0, 1.0, 0, 'Normal operating conditions'),
  ('warehouse', 'Warehouse Pullback', 0, 0.15, 1.2, 0.1, 'Advance rates cut 15%; eligibility tightens'),
  ('abs', 'Securitization Freeze', 0, 0, 1.3, 0.4, 'ABS market shut; repayments stall'),
  ('recession', 'Recession Shock', 0.25, 0.15, 2.0, 0.35, '25% collateral impair + 2x delinquency + 15% advance cut');

insert into app_warehouse_facilities (id, lender, commitment_m, drawn_m, advance_rate, eligible_collateral_m, spread, maturity) values
  ('ATLAS', 'Atlas Capital Partners', 250, 212, 0.80, 300, 'S+285', date '2026-11-15'),
  ('MERIDIAN', 'Meridian Warehouse Finance', 200, 186, 0.75, 268, 'S+310', date '2026-08-20'),
  ('GRANITE', 'Granite Structured Funding', 175, 100, 0.78, 175, 'S+265', date '2027-03-30');

insert into app_reserve_history (quarter, reserve_m, coverage_pct) values
  ('Q3-24', 18.2, 2.24),
  ('Q4-24', 19.1, 2.35),
  ('Q1-25', 20.4, 2.51),
  ('Q2-25', 21.0, 2.59),
  ('Q3-25', 22.3, 2.75),
  ('Q4-25', 23.1, 2.84),
  ('Q1-26', 24.6, 3.03),
  ('Q2-26', 25.8, 3.18);

insert into app_vintage_losses (vintage_year, mob_6mo, mob_12mo, mob_18mo, mob_24mo, mob_30mo, mob_36mo) values
  ('2022', 0.4, 0.9, 1.4, 1.9, 2.3, 2.6),
  ('2023', 0.6, 1.3, 2.1, 2.8, 3.3, null),
  ('2024', 0.9, 1.9, 3.0, 3.9, null, null),
  ('2025', 1.4, 2.7, 4.2, null, null, null);

insert into app_product_profitability (product_name, volume_m, gross_yield_pct, real_yield_pct, loss_pct, net_margin_pct, status) values
  ('Bridge', 340, 13.5, 11.8, 2.1, 2.2, 'green'),
  ('Fix & Flip', 210, 14.2, 11.0, 3.6, -0.1, 'red'),
  ('CRE Term', 185, 10.8, 10.1, 0.9, 1.7, 'green'),
  ('SBA-Adjacent', 77, 12.0, 9.2, 4.4, -2.7, 'red');

insert into app_foreclosure_economics (metric, value_text, status) values
  ('Avg recovery rate', '72%', 'green'),
  ('Avg timeline', '11 mo', 'green'),
  ('Loss severity', '37%', 'amber'),
  ('Pipeline', '84 · $96M', 'green');

insert into app_state_usury_exposure (state_code, exposure_m, exposure_pct, apr_pct, note, status) values
  ('NY', 178, 22, 24.0, 'Commercial exempt · CFDL disclosure', 'green'),
  ('CA', 96, 12, 22.4, 'CFDL disclosure — review', 'amber'),
  ('NJ', 71, 9, 24.8, 'Criminal usury 30% · margin thin', 'amber'),
  ('FL', 64, 8, 23.1, 'Compliant', 'green'),
  ('GA', 41, 5, 26.2, 'Approaching threshold — flag', 'red'),
  ('TX', 38, 5, 21.0, 'Compliant', 'green');

insert into app_litigation_matters (matter, jurisdiction, exposure_m, stage, status) values
  ('Borrower class action — usury', 'NJ Superior', 4.2, 'Discovery', 'red'),
  ('True-lender challenge', 'CA Federal', 2.8, 'Motion to dismiss', 'red'),
  ('Foreclosure contest (owner-occ.)', 'NY State', 1.1, 'Pre-trial', 'amber'),
  ('Broker disclosure dispute', 'FL State', 0.6, 'Settlement talks', 'amber');

insert into app_channel_risk (channel, volume_m, default_pct, complaint_pct, assessment, status) values
  ('Broker — Apex Partners', 142, 6.8, 3.1, 'Elevated default + complaints — escalate', 'red'),
  ('Broker — Coastal Capital', 88, 3.4, 0.9, 'Monitor', 'amber'),
  ('Direct / In-house', 410, 2.1, 0.3, 'Acceptable', 'green'),
  ('Correspondent', 172, 3.9, 1.2, 'Monitor', 'amber');

insert into app_governance_items (name, current_level, target_level, owner, status, note) values
  ('Institutional Reporting Upgrade', 2, 4, 'FP&A', 'gray', 'Manual board pack today; target automated monthly close package.'),
  ('Data Warehouse Modernization', 1, 4, 'Data Eng', 'gray', 'Fragmented sources; target single governed warehouse w/ lineage.'),
  ('Automated Compliance Engine', 2, 5, 'Compliance', 'gray', 'APR/usury checks manual; target rules engine + legal-source versioning.'),
  ('Internal Audit Enhancement', 1, 3, 'Int. Audit', 'gray', 'Ad-hoc; target risk-based annual plan + control testing.'),
  ('Board-Level Risk Reporting', 2, 4, 'CFO Office', 'gray', 'Inconsistent; target standardized RAG risk dashboard each board cycle.');

insert into app_feed_registry (feed, source, target_table, method, cadence, last_load, rows_text, status) values
  ('Loan servicing extract', 'Servicing platform', 'loans, fees', 'API', 'Daily', '4h ago', '38,412', 'green'),
  ('General ledger', 'ERP / GL', 'loans (agg), covenants', 'API', 'Daily', '6h ago', '1,204', 'green'),
  ('Bank cash positions', 'Bank APIs / BAI2', 'liquidity_forecasts', 'API', 'Intraday', '22m ago', '7', 'green'),
  ('Warehouse borrowing-base certs', 'Lender portals (manual)', 'warehouse_facilities, borrowing_base_assets', 'Manual', 'Weekly', '19d ago', '3', 'red'),
  ('Covenant compliance certs', 'Lender / Legal', 'covenants', 'Manual', 'Monthly', '8d ago', '6', 'amber'),
  ('Trustee / investor reports', 'Securitization trustee', 'securitizations', 'SFTP', 'Monthly', '12d ago', '4', 'green'),
  ('Collateral valuations', 'Appraisal / AVM', 'borrowing_base_assets', 'API', 'Event', '2d ago', '91', 'green'),
  ('State statutes & rulings', 'Legal scraper → RAG', 'state_laws, usury_rules, legal_sources', 'Scraper', 'Weekly', '3d ago', '212', 'amber'),
  ('Litigation matters', 'Matter-mgmt system', 'litigation_matters', 'API', 'Weekly', '5d ago', '4', 'green'),
  ('Market data (SOFR, spreads)', 'Market data vendor', '(reference)', 'API', 'Intraday', '1m ago', 'live', 'green');

insert into app_model_registry (model_name, inputs, output_table, version, run_frequency, status, note) values
  ('Effective APR engine', 'loans, fees, usury_rules', 'apr_calculations', 'v1.4', 'Daily', 'amber', 'Fee-as-interest logic per state; pending legal sign-off.'),
  ('CECL / ECL reserve', 'loans, vintages, macro overlays', 'apr_calculations (reserve)', 'v2.1', 'Monthly close', 'amber', 'In validation — PD/LGD/EAD backtest outstanding.'),
  ('Liquidity runway & stress', 'liquidity_forecasts, facilities, stress_scenarios', 'liquidity_forecasts', 'v1.2', 'Intraday', 'green', 'Multipliers below; prototype live calc.'),
  ('Covenant headroom', 'covenants, GL, treasury', 'covenants (derived)', 'v1.0', 'Daily', 'green', 'Includes breach-forecast under stress.'),
  ('Funding concentration (HHI)', 'funding_providers, loans', '(derived)', 'v1.0', 'Daily', 'green', ''),
  ('RAG scoring engine', 'policy thresholds', 'applied to every tab', 'v0.9', 'On read', 'amber', 'Thresholds are still code literals — move to versioned policy table.'),
  ('True-lender / usury risk score', 'loans, channels, state_laws', 'compliance_reviews', '—', '—', 'red', 'Not built — highest legal sensitivity; human approval required.');

commit;

