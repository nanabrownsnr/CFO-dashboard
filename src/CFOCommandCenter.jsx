/* ============================================================================
 *  WBL CFO RISK & COMPLIANCE COMMAND CENTER
 *  Annotated build ? prototype -> living application
 * ============================================================================
 *
 *  HOW TO READ THE ANNOTATIONS
 *  ---------------------------
 *  // == WIRE ==   A hardcoded value. Replace with a live API call.
 *  // SOURCE:      Originating system of record + ingestion cadence.
 *  // TABLE:       Postgres table(s) that back this data.
 *  // ENDPOINT:    Suggested REST route the client should call.
 *  // SERVER:      Logic that must move server-side (do NOT compute in the browser
 *                  in production ? it must be reproducible, versioned, auditable).
 *  // PROTOTYPE:   Throwaway demo scaffolding. Remove before production.
 *  // GOV:         Governance / audit / RBAC hook required by the data model.
 *
 *  WIRING ORDER (lowest risk first)
 *  --------------------------------
 *   1. Stand up the API + the 16 tables (see the schema in the backend repo).
 *   2. Build the read endpoints below; have them return COMPUTED values
 *      (the derivation layer runs server-side, not here).
 *   3. Swap each `== WIRE ==` constant for a call via the data layer (below).
 *   4. Add auth (RBAC), refresh/polling, loading + error states.
 *   5. Delete every `// PROTOTYPE` block.
 *
 *  ENDPOINT MAP (target state)
 *  ---------------------------
 *   GET  /api/treasury/summary?scenario=            -> KPIs, cash, runway
 *   GET  /api/treasury/facilities?scenario=         -> warehouse_facilities (+ derived)
 *   GET  /api/treasury/covenants?scenario=          -> covenants (+ headroom, status)
 *   GET  /api/treasury/concentration               -> funding_providers (+ HHI)
 *   GET  /api/treasury/runway?scenario=             -> liquidity_forecasts (curve)
 *   GET  /api/accounting/reserves?scenario=         -> apr/CECL outputs, coverage, NPL
 *   GET  /api/accounting/vintages?scenario=         -> vintage cumulative-loss matrix
 *   GET  /api/accounting/products?scenario=         -> product profitability
 *   GET  /api/accounting/foreclosure?scenario=      -> recovery / timeline / severity
 *   GET  /api/compliance/states                     -> state_laws + usury_rules (+ APR)
 *   GET  /api/compliance/litigation                 -> litigation matters
 *   GET  /api/compliance/channels                   -> broker/channel risk
 *   GET  /api/governance/maturity                   -> operating-maturity scorecard
 *   GET  /api/program/priorities                    -> 180-day program tracker
 *   POST /api/stress/run  { scenarioKey }           -> server-side stress engine
 *   GET  /api/ingest/feeds                          -> feed registry + last-load status
 *   POST /api/ingest/{feed}/upload  (multipart)     -> stage + validate a manual file
 *   POST /api/ingest/{feed}/sync                    -> trigger an API/SFTP connector run
 *   GET  /api/models                                -> model registry + versions
 *   POST /api/models/{model}/run                    -> execute a model, persist outputs
 *
 *  NOTE ON THE STRESS ENGINE
 *  -------------------------
 *  The `deriveTreasury` / `deriveAccounting` functions below are the prototype's
 *  client-side stress engine. In production this logic lives server-side, reads
 *  parameters from the `stress_scenarios` table, persists results to
 *  `liquidity_forecasts` / `apr_calculations`, and writes an `audit_logs` entry.
 *  The client should request a scenario and render the returned numbers ? never
 *  recompute reserves, APR, runway, or RAG status locally.
 * ========================================================================== */

import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell, ComposedChart,
} from "recharts";
import {
  Activity, AlertTriangle, Droplet, Building2, ShieldAlert, Gauge, ArrowUpRight,
  Zap, TrendingDown, CircleDot, LayoutGrid, Calculator, Scale, ClipboardCheck,
  Layers, Hammer, Network, FileText,
  Database, Cpu, Upload, RefreshCw, FileWarning, GitBranch, Sigma, Workflow,
} from "lucide-react";
import { ChartTip, DataTable, Dot, KPI, MetricStrip, Panel, SectionHeader, StatusChip, TabHeader } from "./components/dashboard/ui.jsx";
import { compareWorkbookRows, parseImportWorkbook, WORKBOOK_SHEETS } from "./lib/importWorkbook.js";

/* ----------------------------------------------------------------------------
 *  DATA LAYER  (the seam between this UI and the backend)
 *  ----------------------------------------------------------------------------
 *  TODO(api): Replace the synchronous seed reads with these async fetches.
 *  Recommended: TanStack Query (react-query) for caching, polling, retries,
 *  and per-endpoint stale-time so "live" data (cash) refreshes faster than
 *  "monthly" data (trustee reports). Sketch:
 *
 *    const API = import.meta.env.VITE_API_BASE_URL;          // GOV: never hardcode hosts
 *    async function apiGet(path, params = {}) {
 *      const qs = new URLSearchParams(params).toString();
 *      const res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
 *        credentials: "include",                              // GOV: RBAC session/JWT
 *        headers: { Accept: "application/json" },
 *      });
 *      if (!res.ok) throw new Error(`${path} -> ${res.status}`);
 *      return res.json();                                     // server returns COMPUTED + RAG
 *    }
 *
 *    // Example hook each view would use instead of the derive() calls:
 *    function useTreasury(scenario) {
 *      return useQuery({
 *        queryKey: ["treasury", scenario],
 *        queryFn: () => apiGet("/api/treasury/summary", { scenario }),
 *        staleTime: 30_000,                                   // cash/market ~ near-real-time
 *      });
 *    }
 *
 *  Until those exist, the prototype keeps the seed constants below so the UI
 *  renders. Each is tagged with what replaces it.
 * -------------------------------------------------------------------------- */

/* palette ? pure presentation, fine to keep client-side */
const C = {
  bg: "#efeff5",
  panel: "#ffffff",
  panel2: "#fafafe",
  border: "#eaeaf4",
  text: "#0f0f1e",
  muted: "#6a6a88",
  dim: "#8a8aa8",
  green: "#00c98d",
  amber: "#f5a623",
  red: "#ef4444",
  blue: "#6c5ce7",
  gray: "#c8c8dc",
};
const RAG = { green: C.green, amber: C.amber, red: C.red, gray: C.gray };
const mono = { fontFamily: "DM Sans, sans-serif" };
const sans = { fontFamily: "DM Sans, sans-serif" };
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getSupabaseProjectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return "unknown";
  }
}

function getSupabaseHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function useDashboardData(refreshToken = 0) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!supabase) {
        setLoading(false);
        setData(null);
        return;
      }

      setLoading(true);
      setError(null);

      const requests = [
        ["programPriorities", supabase.from("app_program_priorities").select("*").order("id")],
        ["stressScenarios", supabase.from("app_stress_scenarios").select("*").order("scenario_key")],
        ["warehouseFacilities", supabase.from("app_warehouse_facilities").select("*").order("id")],
        ["treasuryInputs", supabase.from("treasury_inputs").select("*").order("id")],
        ["covenants", supabase.from("covenants").select("*").order("metric_key")],
        ["accountingInputs", supabase.from("accounting_inputs").select("*").order("id")],
        ["reserveHistory", supabase.from("app_reserve_history").select("*").order("quarter")],
        ["vintageLosses", supabase.from("app_vintage_losses").select("*").order("vintage_year")],
        ["productProfitability", supabase.from("app_product_profitability").select("*").order("product_name")],
        ["foreclosureEconomics", supabase.from("app_foreclosure_economics").select("*").order("metric")],
        ["stateExposure", supabase.from("app_state_usury_exposure").select("*").order("state_code")],
        ["litigationMatters", supabase.from("app_litigation_matters").select("*").order("matter")],
        ["channelRisk", supabase.from("app_channel_risk").select("*").order("channel")],
        ["governanceItems", supabase.from("app_governance_items").select("*").order("name")],
        ["feedRegistry", supabase.from("app_feed_registry").select("*").order("feed")],
        ["modelRegistry", supabase.from("app_model_registry").select("*").order("model_name")],
        ["fundingProviders", supabase.from("funding_providers").select("*").order("provider_id")],
        ["loans", supabase.from("loans").select("*").order("loan_id")],
        ["aprCalculations", supabase.from("apr_calculations").select("*").order("calc_id")],
        ["borrowingBaseAssets", supabase.from("borrowing_base_assets").select("*").order("asset_id")],
        ["liquidityForecasts", supabase.from("liquidity_forecasts").select("*").order("scenario_key").order("forecast_week")],
        ["stateLaws", supabase.from("state_laws").select("*").order("state_code")],
        ["usuryRules", supabase.from("usury_rules").select("*").order("rule_id")],
        ["legalSources", supabase.from("legal_sources").select("*").order("source_id")],
        ["ingestRuns", supabase.from("ingest_runs").select("*").order("run_id", { ascending: false })],
        ["auditLogs", supabase.from("audit_logs").select("*").order("event_id", { ascending: false })],
      ];

      const settled = await Promise.allSettled(
        requests.map(async ([key, query]) => {
          const { data: rows, error: queryError } = await query;
          if (queryError) throw new Error(`${key}: ${queryError.message}`);
          return [key, rows ?? []];
        }),
      );

      const next = {};
      const failures = [];
      settled.forEach((result) => {
        if (result.status === "fulfilled") {
          const [key, rows] = result.value;
          next[key] = rows;
        } else {
          failures.push(result.reason?.message ?? String(result.reason));
        }
      });

      if (cancelled) return;

      setData(next);
      setLoading(false);
      if (failures.length > 0) setError(new Error(failures.join(" | ")));
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return { data, loading, error };
}

function normalizeDashboardData(raw = {}) {
  const scenarios = raw.stressScenarios?.length
    ? Object.fromEntries(raw.stressScenarios.map((row) => [
        row.scenario_key,
        {
          label: row.label,
          collateralImpair: toNumber(row.collateral_impair),
          advanceCut: toNumber(row.advance_cut),
          delinqMult: toNumber(row.delinq_mult, 1),
          inflowCut: toNumber(row.inflow_cut),
          desc: row.description ?? "",
        },
      ]))
      : {};

  return {
    priorities: raw.programPriorities?.length ? raw.programPriorities : [],
    scenarios,
    treasuryInputs: raw.treasuryInputs?.length ? raw.treasuryInputs : [],
    covenants: raw.covenants?.length
      ? raw.covenants.map((row) => ({
          key: row.metric_key,
          name: row.covenant_name,
          limit: toNumber(row.limit),
          unit: row.unit,
          dir: row.direction,
          actual: toNumber(row.base_actual),
        }))
      : [],
    accountingInputs: raw.accountingInputs?.length ? raw.accountingInputs : [],
    facilities: raw.warehouseFacilities?.length
      ? raw.warehouseFacilities.map((row) => ({
          id: row.id,
          lender: row.lender,
          commitment: toNumber(row.commitment_m),
          drawn: toNumber(row.drawn_m),
          advanceRate: toNumber(row.advance_rate),
          eligibleCollateral: toNumber(row.eligible_collateral_m),
          spread: row.spread,
          maturity: row.maturity,
        }))
        : raw.fundingProviders?.length
          ? raw.fundingProviders.map((row) => ({
              id: row.provider_id,
              lender: row.provider_name,
            commitment: toNumber(row.commitment_m),
            drawn: toNumber(row.drawn_m),
            advanceRate: toNumber(row.advance_rate ?? (toNumber(row.commitment_m) > 0 ? toNumber(row.drawn_m) / toNumber(row.commitment_m) : 0.75)),
              eligibleCollateral: toNumber(row.eligible_collateral_m ?? row.commitment_m),
              spread: row.spread ?? "",
              maturity: row.maturity ?? row.maturity_date ?? "2027-01-01",
            }))
          : [],
    reserveHistory: raw.reserveHistory?.length
      ? raw.reserveHistory.map((row) => ({
          q: row.quarter,
          res: toNumber(row.reserve_m),
          cov: toNumber(row.coverage_pct),
        }))
      : [],
    vintageLosses: raw.vintageLosses?.length ? raw.vintageLosses : [],
    products: raw.productProfitability?.length
      ? raw.productProfitability.map((row) => ({
          name: row.product_name,
          vol: toNumber(row.volume_m),
          gy: toNumber(row.gross_yield_pct),
          ry: toNumber(row.real_yield_pct),
          loss: toNumber(row.loss_pct),
          net: toNumber(row.net_margin_pct),
          status: row.status,
        }))
      : [],
    foreclosure: raw.foreclosureEconomics?.length
      ? raw.foreclosureEconomics.reduce((acc, row) => {
          acc[row.metric] = { value: row.value_text, status: row.status };
          return acc;
        }, {})
      : {},
    states: raw.stateExposure?.length
      ? raw.stateExposure.map((row) => ({
          st: row.state_code,
          exp: toNumber(row.exposure_m),
          pct: toNumber(row.exposure_pct),
          apr: toNumber(row.apr_pct),
          note: row.note,
          s: row.status,
        }))
      : [],
    litigation: raw.litigationMatters?.length
      ? raw.litigationMatters.map((row) => ({
          m: row.matter,
          j: row.jurisdiction,
          exp: toNumber(row.exposure_m),
          stage: row.stage,
          s: row.status,
        }))
      : [],
    channels: raw.channelRisk?.length
      ? raw.channelRisk.map((row) => ({
          c: row.channel,
          vol: toNumber(row.volume_m),
          dft: toNumber(row.default_pct),
          cmp: toNumber(row.complaint_pct),
          assessment: row.assessment,
          s: row.status,
        }))
      : [],
    governance: raw.governanceItems?.length
      ? raw.governanceItems.map((row) => ({
          name: row.name,
          cur: toNumber(row.current_level),
          tgt: toNumber(row.target_level),
          owner: row.owner,
          s: row.status,
          note: row.note,
        }))
      : [],
    feeds: raw.feedRegistry?.length
      ? raw.feedRegistry.map((row) => ({
          feed: row.feed,
          source: row.source,
          table: row.target_table,
          method: row.method,
          cadence: row.cadence,
          last: row.last_load,
          rows: row.rows_text,
          s: row.status,
        }))
      : [],
    models: raw.modelRegistry?.length
      ? raw.modelRegistry.map((row) => ({
          name: row.model_name,
          inputs: row.inputs,
          out: row.output_table,
          ver: row.version,
          run: row.run_frequency,
          s: row.status,
          note: row.note,
        }))
      : [],
    fundingProviders: raw.fundingProviders?.length ? raw.fundingProviders : [],
    loans: raw.loans?.length ? raw.loans : [],
    aprCalculations: raw.aprCalculations?.length ? raw.aprCalculations : [],
    borrowingBaseAssets: raw.borrowingBaseAssets?.length ? raw.borrowingBaseAssets : [],
    liquidityForecasts: raw.liquidityForecasts?.length ? raw.liquidityForecasts : [],
    stateLaws: raw.stateLaws?.length ? raw.stateLaws : [],
    usuryRules: raw.usuryRules?.length ? raw.usuryRules : [],
    legalSources: raw.legalSources?.length ? raw.legalSources : [],
    ingestRuns: raw.ingestRuns?.length ? raw.ingestRuns : [],
    auditLogs: raw.auditLogs?.length ? raw.auditLogs : [],
  };
}

/* ? WIRE ? 180-day program tracker.
 * SOURCE:   PMO / CFO office; manually maintained workstream tracker.
 * TABLE:    program_priorities (add to schema; not in the original 16).
 * ENDPOINT: GET /api/program/priorities
 * GOV:      `status` and `pct` are owner-updated; log edits to audit_logs.
 * The labels/phases are stable config; status + pct are the live fields. */
const PHASES = [
  { label: "Immediate · 0–30 Days", short: "0–30D" },
  { label: "Near-Term · 30–90 Days", short: "30–90D" },
  { label: "Medium-Term · 90–180 Days", short: "90–180D" },
];
const PRIORITIES = [
  { id: 1, phase: 0, name: "Liquidity Stress Testing", tab: "treasury", status: "green", pct: 90 },
  { id: 2, phase: 0, name: "Warehouse Covenant Review", tab: "treasury", status: "amber", pct: 75 },
  { id: 3, phase: 0, name: "Funding Concentration Analysis", tab: "treasury", status: "amber", pct: 80 },
  { id: 4, phase: 0, name: "State-Law Exposure Map", tab: "compliance", status: "red", pct: 40 },
  { id: 5, phase: 0, name: "Litigation Inventory", tab: "compliance", status: "amber", pct: 60 },
  { id: 6, phase: 0, name: "Reserve Methodology Review", tab: "accounting", status: "amber", pct: 55 },
  { id: 7, phase: 1, name: "CECL Model Validation", tab: "calc", status: "amber", pct: 35 },
  { id: 8, phase: 1, name: "Product Profitability by Vintage", tab: "accounting", status: "green", pct: 50 },
  { id: 9, phase: 1, name: "Foreclosure Economics", tab: "accounting", status: "amber", pct: 30 },
  { id: 10, phase: 1, name: "Broker / Channel Risk Review", tab: "compliance", status: "red", pct: 20 },
  { id: 11, phase: 1, name: "Compliance Governance Framework", tab: "compliance", status: "amber", pct: 25 },
  { id: 12, phase: 2, name: "Institutional Reporting Upgrade", tab: "governance", status: "gray", pct: 10 },
  { id: 13, phase: 2, name: "Data Warehouse Modernization", tab: "import", status: "gray", pct: 5 },
  { id: 14, phase: 2, name: "Automated Compliance Engine", tab: "calc", status: "gray", pct: 15 },
  { id: 15, phase: 2, name: "Internal Audit Enhancement", tab: "governance", status: "gray", pct: 0 },
  { id: 16, phase: 2, name: "Board-Level Risk Reporting", tab: "governance", status: "gray", pct: 5 },
];

/* Tab config is presentation/IA ? keep client-side. */
const TABS = [
  { id: "overview", label: "Overview", icon: LayoutGrid, answers: "Where does the 180-day review stand, and what is on fire today?" },
  { id: "treasury", label: "Liquidity & Treasury", icon: Droplet, answers: "Can we survive a funding shock, and which covenant fails first?" },
  { id: "accounting", label: "Accounting & Reserves", icon: Calculator, answers: "Are reserves adequate, and where are we actually making money?" },
  { id: "compliance", label: "Compliance & Legal", icon: Scale, answers: "Where is our legal exposure concentrated by state, channel, and matter?" },
  { id: "governance", label: "Governance & Reporting", icon: ClipboardCheck, answers: "Is the operating infrastructure becoming institution-grade?" },
  { id: "import", label: "Data Import", icon: Database, answers: "Where does each table's data come from, and is every feed current?" },
  { id: "calc", label: "Calculation Layer", icon: Cpu, answers: "Which models turn raw data into the numbers on every tab — and are they validated?" },
  { id: "connections", label: "Connections", icon: Network, answers: "What is the active Supabase connection, and what data sources are attached?" },
];

/* ? WIRE ? Stress scenario definitions (multipliers).
 * SOURCE:   Risk/Treasury policy; reviewed by CRO.
 * TABLE:    stress_scenarios (parameters), versioned.
 * ENDPOINT: GET /api/stress/scenarios  (definitions)
 *           POST /api/stress/run { scenarioKey } (server applies + persists)
 * SERVER:   These multipliers MUST live server-side so every run is reproducible
 *           and the inputs that produced a given board number are auditable. */
const SCENARIOS = {
  base: { label: "Base Case", collateralImpair: 0, advanceCut: 0, delinqMult: 1.0, inflowCut: 0, desc: "Normal operating conditions" },
  warehouse: { label: "Warehouse Pullback", collateralImpair: 0, advanceCut: 0.15, delinqMult: 1.2, inflowCut: 0.1, desc: "Advance rates cut 15%; eligibility tightens" },
  abs: { label: "Securitization Freeze", collateralImpair: 0, advanceCut: 0, delinqMult: 1.3, inflowCut: 0.4, desc: "ABS market shut; repayments stall" },
  recession: { label: "Recession Shock", collateralImpair: 0.25, advanceCut: 0.15, delinqMult: 2.0, inflowCut: 0.35, desc: "25% collateral impair + 2x delinquency + 15% advance cut" },
};

/* ? WIRE ? Warehouse facility records.
 * SOURCE:   Each warehouse lender's borrowing-base certificate + covenant cert.
 *           OFTEN MANUAL (Excel/portal per counterparty) ? the hardest, least
 *           timely feed. Stamp every record with as_of date and show staleness.
 * TABLE:    warehouse_facilities, borrowing_base_assets, funding_providers
 * ENDPOINT: GET /api/treasury/facilities?scenario=
 * SERVER:   advanceRate haircut, bbValue, availability, marginCall, RAG status
 *           are DERIVED ? return them computed; do not recompute below. */
const FACILITIES = [
  { id: "ATLAS", lender: "Atlas Capital Partners", commitment: 250, drawn: 212, advanceRate: 0.8, eligibleCollateral: 300, spread: "S+285", maturity: "2026-11-15" },
  { id: "MERIDIAN", lender: "Meridian Warehouse Finance", commitment: 200, drawn: 186, advanceRate: 0.75, eligibleCollateral: 268, spread: "S+310", maturity: "2026-08-20" },
  { id: "GRANITE", lender: "Granite Structured Funding", commitment: 175, drawn: 100, advanceRate: 0.78, eligibleCollateral: 175, spread: "S+265", maturity: "2027-03-30" },
];

/* ? WIRE ? Treasury scalars.
 * SOURCE:   UNRESTRICTED/RESTRICTED cash -> bank APIs / BAI2 (near-real-time).
 *           MONTHLY_BURN -> FP&A cash forecast (monthly).
 *           GROSS_LOANS  -> loan accounting / GL (daily).
 * TABLE:    liquidity_forecasts, loans (aggregate)
 * ENDPOINT: GET /api/treasury/summary?scenario=  (returns cash, burn, gross) */
const UNRESTRICTED = 42.0, RESTRICTED = 18.5, MONTHLY_BURN = 11.0, GROSS_LOANS = 812;

/* PROTOTYPE: "today" is hardcoded as the anchor for maturity countdowns.
 * TODO(api): server should compute days-to-maturity against real now(); client
 * should not depend on a frozen date. */
const daysTo = (d, asOf = "2026-06-01") => Math.round((new Date(d) - new Date(asOf)) / 86400000);
const daysSince = (d) => Math.max(0, Math.round((new Date() - new Date(d)) / 86400000));

/* ----------------------------------------------------------------------------
 * SERVER: deriveTreasury ? this is the client-side stress engine (PROTOTYPE).
 * In production this entire function runs in the derivation layer:
 *   - reads facilities, covenants, cash from Postgres
 *   - applies stress_scenarios params
 *   - writes liquidity_forecasts + audit_logs
 *   - returns the SAME shape this function returns, so the views below are
 *     unchanged when you swap derive() for an API response.
 * KEEP THE RETURN SHAPE STABLE ? it is effectively the API contract.
 * -------------------------------------------------------------------------- */
function deriveTreasury(key, source = {}) {
  const scenarios = source.scenarios ?? {};
  const facilitiesSource = source.facilities ?? [];
  const fundingSource = source.fundingProviders ?? [];
  const treasuryInput = source.treasuryInputs?.[0] ?? {};
  const s = scenarios[key] ?? { label: key, collateralImpair: 0, advanceCut: 0, delinqMult: 1, inflowCut: 0, desc: "" };
  const unrestricted = toNumber(treasuryInput.unrestricted_cash_m, UNRESTRICTED);
  const monthlyBurn = toNumber(treasuryInput.monthly_burn_m, MONTHLY_BURN);
  const grossLoans = toNumber(treasuryInput.gross_loans_m, GROSS_LOANS);
  const asOfDate = treasuryInput.as_of_date ?? "2026-06-01";
  const facilities = facilitiesSource.map((f) => {
    const advanceRate = toNumber(f.advanceRate) * (1 - s.advanceCut);
    const collateral = toNumber(f.eligibleCollateral) * (1 - s.collateralImpair);
    const bbValue = advanceRate * collateral;
    const commitment = toNumber(f.commitment);
    const drawn = toNumber(f.drawn);
    const availability = Math.max(0, Math.min(commitment, bbValue) - drawn);
    const marginCall = Math.max(0, drawn - bbValue);
    const util = drawn / commitment, dte = daysTo(f.maturity, asOfDate);
    // SERVER: RAG thresholds belong in config/policy, not literals in code.
    let status = "green";
    if (util > 0.9 || marginCall > 0 || dte < 90) status = "red";
    else if (util > 0.82 || dte < 180 || availability < 12) status = "amber";
    return { ...f, commitment, drawn, advanceRate, bbValue, availability, marginCall, util, dte, status };
  });
  const totalAvail = facilities.reduce((a, f) => a + f.availability, 0);
  const totalMarginCall = facilities.reduce((a, f) => a + f.marginCall, 0);
  const totalDrawn = facilities.reduce((a, f) => a + f.drawn, 0);
  const totalCommit = facilities.reduce((a, f) => a + f.commitment, 0);
  const startLiquidity = Math.max(0, unrestricted + totalAvail - totalMarginCall);
  const delinquency = +(4.2 * s.delinqMult).toFixed(1);
  const dscr = +(1.31 * (1 - 0.1 * (s.delinqMult - 1) - 0.25 * s.inflowCut)).toFixed(2);
  const leverage = +(4.4 + 8 * s.collateralImpair + 2 * s.advanceCut).toFixed(1);
  const tnw = +(112 - 280 * s.collateralImpair).toFixed(0);
  /* ? WIRE ? Covenant limits + actuals.
   * SOURCE:   limits -> credit agreements (legal docs, static, versioned);
   *           actuals -> derived from loan/GL/treasury data.
   * TABLE:    covenants
   * ENDPOINT: GET /api/treasury/covenants?scenario= */
  const covenantSource = source.covenants ?? [];
  const covenants = covenantSource.length
    ? covenantSource.map((row) => {
        const actual = toNumber(row.actual ?? row.base_actual);
        const limit = toNumber(row.limit);
        const dir = row.dir ?? row.direction ?? "min";
        const head = dir === "min" ? actual - limit : limit - actual;
        const ratio = dir === "min" ? actual / limit : limit / Math.max(actual, 0.01);
        let status = head <= 0 ? "red" : ratio < 1.12 ? "amber" : "green";
        return {
          name: row.name ?? row.covenant_name ?? row.metric_key,
          actual,
          limit,
          unit: row.unit,
          dir,
          head: +head.toFixed(2),
          status,
        };
      })
    : [
      { name: "Min Unrestricted Liquidity", actual: +startLiquidity.toFixed(0), limit: 25, unit: "$M", dir: "min" },
      { name: "Max 60+ Delinquency", actual: delinquency, limit: 6.0, unit: "%", dir: "max" },
      { name: "Min DSCR", actual: dscr, limit: 1.2, unit: "x", dir: "min" },
      { name: "Max Leverage (D/E)", actual: leverage, limit: 5.0, unit: "x", dir: "max" },
      { name: "Min Tangible Net Worth", actual: tnw, limit: 90, unit: "$M", dir: "min" },
      { name: "Max Single-State Conc.", actual: 22, limit: 25, unit: "%", dir: "max" },
    ].map((c) => {
      const head = c.dir === "min" ? c.actual - c.limit : c.limit - c.actual;
      const ratio = c.dir === "min" ? c.actual / c.limit : c.limit / Math.max(c.actual, 0.01);
      let status = head <= 0 ? "red" : ratio < 1.12 ? "amber" : "green";
      return { ...c, head: +head.toFixed(2), status };
    });
  const burn = monthlyBurn * (1 + s.inflowCut);
  const runwayDays = Math.round((startLiquidity / burn) * 30);
  const capitalNeed = Math.max(0, totalMarginCall + 25 - (unrestricted + totalAvail));
  const exposureSource = fundingSource.length
    ? fundingSource.map((provider) => ({
        name: provider.provider_id,
        lender: provider.provider_name,
        drawn: toNumber(provider.drawn_m),
        commitment: toNumber(provider.commitment_m),
      }))
    : facilities.map((f) => ({ name: f.id, lender: f.lender, drawn: f.drawn, commitment: f.commitment }));
  const totalExposureDrawn = exposureSource.reduce((sum, entry) => sum + entry.drawn, 0) || 1;
  const exposures = exposureSource
    .map((entry) => ({ ...entry, pct: entry.drawn / totalExposureDrawn }))
    .sort((a, b) => b.pct - a.pct);
  const hhi = exposures.reduce((a, e) => a + e.pct * e.pct, 0);
  return { facilities, totalAvail, totalMarginCall, totalDrawn, totalCommit, startLiquidity, covenants, runwayDays, capitalNeed, exposures, hhi };
}

/* ----------------------------------------------------------------------------
 * SERVER: deriveAccounting ? client-side reserve/credit engine (PROTOTYPE).
 * In production the CECL/ECL outputs come from the model engine (Python/vendor),
 * NOT from these multipliers. This function only exists to make the demo react
 * to the scenario toggle.
 * ? WIRE ? ENDPOINTs:
 *   GET /api/accounting/reserves?scenario=    (cecl, coverage, npl, nco, build, history)
 *   GET /api/accounting/vintages?scenario=    (cumulative-loss matrix)
 *   GET /api/accounting/products?scenario=    (product profitability)
 *   GET /api/accounting/foreclosure?scenario= (recovery/timeline/severity/pipeline)
 * SOURCE: loan servicing + GL (daily), CECL model outputs (monthly close),
 *         collateral/valuation (appraisal/AVM feeds).
 * TABLE:  apr_calculations, loans, fees, borrowing_base_assets
 * -------------------------------------------------------------------------- */
function deriveAccounting(key, source = {}) {
  const scenarios = source.scenarios ?? {};
  const s = scenarios[key] ?? { label: key, collateralImpair: 0, advanceCut: 0, delinqMult: 1, inflowCut: 0, desc: "" };
  const loanSource = source.loans ?? [];
  const accountingInput = source.accountingInputs?.[0] ?? {};
  const treasuryInput = source.treasuryInputs?.[0] ?? {};
  const ceclBase = toNumber(accountingInput.cecl_base_m, 25.8);
  const priorReserve = toNumber(accountingInput.prior_reserve_m, 24.6);
  const nplBase = toNumber(accountingInput.npl_base_pct, 3.6);
  const ncoBase = toNumber(accountingInput.nco_base_pct, 1.2);
  const costOfFunds = toNumber(accountingInput.cost_of_funds_pct, 7.5);
  const opex = toNumber(accountingInput.opex_pct, 2.0);
  const grossLoans = toNumber(treasuryInput.gross_loans_m, GROSS_LOANS);
  // SERVER: reserveMult stands in for the real PD/LGD/EAD-driven CECL output.
  const reserveMult = 1 + 1.4 * s.collateralImpair + 0.25 * (s.delinqMult - 1) + 0.15 * s.inflowCut;
  const cecl = +(ceclBase * reserveMult).toFixed(1);
  const coverage = +((cecl / grossLoans) * 100).toFixed(2);
  const npl = +(nplBase * (1 + 0.8 * (s.delinqMult - 1))).toFixed(1);
  const nco = +(ncoBase * (1 + s.delinqMult - 1 + 0.5 * s.collateralImpair * 4)).toFixed(1);
  const build = +(cecl - priorReserve).toFixed(1);
  /* ? WIRE ? Quarterly reserve history.
   * SOURCE: GL reserve postings by period. TABLE: apr_calculations (history). */
  const historySource = source.reserveHistory ?? [];
  const history = historySource.length
    ? historySource.map((r) => ({ q: r.q, res: toNumber(r.res), cov: toNumber(r.cov) }))
    : [
      { q: "Q3-24", res: 18.2 }, { q: "Q4-24", res: 19.1 }, { q: "Q1-25", res: 20.4 },
      { q: "Q2-25", res: 21.0 }, { q: "Q3-25", res: 22.3 }, { q: "Q4-25", res: 23.1 },
        { q: "Q1-26", res: priorReserve }, { q: "Q2-26", res: cecl },
      ].map((r) => ({ ...r, cov: +((r.res / grossLoans) * 100).toFixed(2) }));

  const lossUplift = 1 + 1.2 * s.collateralImpair + 0.2 * (s.delinqMult - 1);
  /* ? WIRE ? Vintage cumulative-loss matrix (rows = origination year, cols = MOB).
   * SOURCE: loan-level loss history aggregated by vintage. TABLE: loans (rollup). */
  const vintageSource = source.vintageLosses ?? [];
  const vintages = vintageSource.length
    ? vintageSource.map((row) => ({
        y: row.vintage_year ?? row.y,
        row: ["mob_6mo", "mob_12mo", "mob_18mo", "mob_24mo", "mob_30mo", "mob_36mo"].map((field) => (
          row[field] == null ? null : toNumber(row[field])
        )),
      }))
    : [
        { y: "2022", row: [0.4, 0.9, 1.4, 1.9, 2.3, 2.6] },
        { y: "2023", row: [0.6, 1.3, 2.1, 2.8, 3.3, null] },
        { y: "2024", row: [0.9, 1.9, 3.0, 3.9, null, null] },
        { y: "2025", row: [1.4, 2.7, 4.2, null, null, null] },
      ].map((v) => ({ y: v.y, row: v.row.map((x) => (x == null ? null : +(x * lossUplift).toFixed(1))) }));

  const COF = costOfFunds, OPEX = opex; // ? WIRE ? cost of funds from treasury; opex from FP&A.
  /* ? WIRE ? Product profitability.
   * SOURCE: loan/GL by product code. TABLE: loans + fees grouped by product. */
  const productSource = loanSource.length
    ? Object.values(loanSource.reduce((acc, loan) => {
        const productKey = loan.product_code ?? "Unknown";
        if (!acc[productKey]) {
          acc[productKey] = { name: productKey, vol: 0, gy: 0, ry: 0, loss: 0, count: 0 };
        }
        const bucket = acc[productKey];
        bucket.vol += toNumber(loan.current_balance_m);
        bucket.gy += toNumber(loan.coupon_rate_pct);
        bucket.ry += toNumber(loan.coupon_rate_pct) + toNumber(loan.fee_rate_pct);
        bucket.loss += loan.npl_flag ? 1.6 : loan.delinquency_days >= 60 ? 1.1 : loan.delinquency_days > 0 ? 0.5 : 0.2;
        bucket.count += 1;
        return acc;
      }, {}))
    : (source.products ?? []);
  const products = productSource.length
    ? (loanSource.length
      ? productSource.map((p) => {
          const avgGy = +(p.gy / p.count).toFixed(1);
          const avgRy = +(p.ry / p.count).toFixed(1);
          const baseLoss = +(p.loss / p.count).toFixed(1);
          const loss = +(baseLoss * (1 + (s.delinqMult - 1) * 0.6 + s.collateralImpair)).toFixed(1);
          const ry = +(avgRy * (1 - 0.15 * s.inflowCut)).toFixed(1);
          const net = +(ry - COF - loss).toFixed(1);
          const status = net > 1.5 ? "green" : net > 0 ? "amber" : "red";
          return { name: p.name, vol: +p.vol.toFixed(1), gy: avgGy, ry, loss, net, status };
        })
      : productSource.map((p) => ({ ...p })))
    : [
        { name: "Bridge", vol: 340, gy: 13.5, ry: 11.8, loss: 2.1 },
        { name: "Fix & Flip", vol: 210, gy: 14.2, ry: 11.0, loss: 3.6 },
        { name: "CRE Term", vol: 185, gy: 10.8, ry: 10.1, loss: 0.9 },
        { name: "SBA-Adjacent", vol: 77, gy: 12.0, ry: 9.2, loss: 4.4 },
      ].map((p) => {
        const loss = +(p.loss * (1 + (s.delinqMult - 1) * 0.6 + s.collateralImpair)).toFixed(1);
        const ry = +(p.ry * (1 - 0.15 * s.inflowCut)).toFixed(1);
        const net = +(ry - COF - loss).toFixed(1);
        const status = net > 1.5 ? "green" : net > 0 ? "amber" : "red";
        return { ...p, loss, ry, net, status };
      });

  /* ? WIRE ? Foreclosure economics.
   * SOURCE: servicing/collections + REO disposition data; collateral valuations.
   * TABLE: loans (foreclosure pipeline), borrowing_base_assets (collateral). */
  const foreclosureSource = source.foreclosure ?? {};
  const foreclosureLoans = loanSource.filter((loan) => loan.foreclosure_flag || loan.npl_flag);
  const recovery = foreclosureSource["Avg recovery rate"]?.value
    ? Number(String(foreclosureSource["Avg recovery rate"].value).replace("%", ""))
    : loanSource.length
      ? +(Math.max(40, 78 - foreclosureLoans.length * 2.5)).toFixed(0)
      : +(72 - 60 * s.collateralImpair).toFixed(0);
  const timeline = foreclosureSource["Avg timeline"]?.value
    ? Number(String(foreclosureSource["Avg timeline"].value).replace(" mo", ""))
    : loanSource.length
      ? +(10 + foreclosureLoans.length * 0.8).toFixed(0)
      : +(11 + 4 * (s.delinqMult - 1) + 8 * s.collateralImpair).toFixed(0);
  const severity = foreclosureSource["Loss severity"]?.value
    ? Number(String(foreclosureSource["Loss severity"].value).replace("%", ""))
    : +(100 - recovery + 9).toFixed(0);
  const fcCount = loanSource.length ? foreclosureLoans.length : Math.round(84 * (1 + 0.6 * (s.delinqMult - 1)));
  const fcValue = loanSource.length
    ? +foreclosureLoans.reduce((sum, loan) => sum + toNumber(loan.current_balance_m), 0).toFixed(0)
    : +(96 * (1 + 0.6 * (s.delinqMult - 1))).toFixed(0);

  return { cecl, coverage, npl, nco, build, history, vintages, products, recovery, timeline, severity, fcCount, fcValue, reserveMult };
}

/* ===== OVERVIEW =========================================================== */
function OverviewView({ t, a, priorities = [], states = [], governance = [] }) {
  /* SERVER: domain rollups should be computed server-side from the same data
   * the tabs use, so the headline and the detail can never disagree.
   * ENDPOINT: GET /api/program/health  -> [{ name, status }] */
  const DOMAINS = [
    { name: "Liquidity & Treasury", status: t.runwayDays > 270 ? "green" : t.runwayDays > 120 ? "amber" : "red" },
    { name: "Funding & Warehouse", status: t.facilities.some((f) => f.status === "red") ? "red" : "amber" },
    { name: "Credit & Reserves", status: a.coverage > 4.5 ? "red" : a.coverage > 3.5 ? "amber" : "green" },
    {
      name: "Compliance & Legal",
      status: states.some((row) => row.s === "red") || governance.some((row) => row.s === "red")
        ? "red"
        : states.some((row) => row.s === "amber") ? "amber" : "green",
    },
    {
      name: "Governance & Reporting",
      status: governance.length > 0 ? (governance.some((row) => row.cur < row.tgt) ? "amber" : "green") : "gray",
    },
  ];
  return (
    <div style={{ display: "grid", gap: 24, marginTop: 24 }}>
      <SectionHeader
        eyebrow="Portfolio overview"
        title="Executive control tower"
        description="A quick read on the five domains that matter most: liquidity, credit quality, compliance, governance, and program execution."
      />
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        {DOMAINS.map((d) => (
          <div key={d.name} className="rounded-[14px] border border-border bg-panel px-4 py-3 shadow-panel" style={{ borderTop: `3px solid ${RAG[d.status]}` }}>
            <div className="mb-2 flex items-center gap-1.5"><Dot s={d.status} /><span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">{d.name}</span></div>
            <span className="font-mono text-[12px] font-bold" style={{ color: RAG[d.status] }}>
              {d.status === "red" ? "ACTION REQUIRED" : d.status === "amber" ? "MONITOR" : d.status === "gray" ? "NOT STARTED" : "ON TRACK"}
            </span>
          </div>
        ))}
      </div>
      <Panel
        title="180-Day CFO Priority Program · Live Tracker"
        icon={Activity}
        right={<span className="font-mono text-[10px] text-dim">{priorities.filter((p) => p.status === "green").length}/{priorities.length} on track · {priorities.filter((p) => p.status === "red").length} red</span>}
      >
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {PHASES.map((ph, pi) => (
            <div key={pi} style={{ border: "1px solid #eaeaf4", borderRadius: 14, background: "#fafafe", padding: 16 }}>
              <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #eaeaf4", fontFamily: "DM Sans, sans-serif", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: "#8a8aa8" }}>{ph.label}</div>
              <div style={{ display: "grid", gap: 10 }}>
                {priorities.filter((p) => p.phase === pi).map((p) => (
                  /* TODO(api): clicking a priority should deep-link to its tab + open
                   * the underlying drill-down. Track click -> audit_logs (who viewed what). */
                  <div key={p.id} style={{ border: "1px solid #eaeaf4", borderLeft: `3px solid ${RAG[p.status]}`, borderRadius: 12, background: "#ffffff", padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "#0f0f1e" }}><Dot s={p.status} /> {p.name}</span>
                      <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, color: "#8a8aa8" }}>{p.pct}%</span>
                    </div>
                    <div style={{ marginTop: 10, height: 6, overflow: "hidden", borderRadius: 999, background: "#efeff5" }}><div style={{ height: "100%", borderRadius: 999, width: `${p.pct}%`, background: RAG[p.status] }} /></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ===== TREASURY =========================================================== */
function TreasuryView({ m, base, scenario, stressed, scenarios = {}, forecasts = [] }) {
  /* SERVER: the 26-week runway curve should come from /api/treasury/runway
   * (persisted to liquidity_forecasts). This client-side projection is PROTOTYPE. */
  const pathData = useMemo(() => {
    const forecastRows = forecasts.length
      ? forecasts.reduce((acc, row) => {
          acc[row.scenario_key] = acc[row.scenario_key] ?? [];
          acc[row.scenario_key].push(row);
          return acc;
        }, {})
      : null;
    if (forecastRows?.base?.length && forecastRows?.[scenario]?.length) {
      const baseRows = [...forecastRows.base].sort((a, b) => a.forecast_week - b.forecast_week);
      const scenRows = [...forecastRows[scenario]].sort((a, b) => a.forecast_week - b.forecast_week);
      const byWeek = new Map(baseRows.map((row) => [row.forecast_week, row]));
      return scenRows.map((row) => ({
        week: row.forecast_week,
        base: toNumber(byWeek.get(row.forecast_week)?.total_liquidity_m),
        scen: toNumber(row.total_liquidity_m),
      }));
    }
    const wk = (st, inf) => { const arr = []; let l = st; const w = (MONTHLY_BURN * (1 + inf)) / 4.345; for (let i = 0; i <= 26; i++) { arr.push(Math.max(0, +l.toFixed(1))); l -= w; } return arr; };
    const b = wk(base.startLiquidity, 0), sp = wk(m.startLiquidity, scenarios[scenario]?.inflowCut ?? 0);
    return b.map((v, i) => ({ week: i, base: v, scen: sp[i] }));
  }, [m, base, scenario, forecasts, scenarios]);
  const runwayStatus = m.runwayDays > 270 ? "green" : m.runwayDays > 120 ? "amber" : "red";
  const utilStatus = m.totalDrawn / m.totalCommit > 0.9 ? "red" : m.totalDrawn / m.totalCommit > 0.82 ? "amber" : "green";
  const tightest = [...m.covenants].sort((a, b) => (a.status === "red" ? 0 : a.status === "amber" ? 1 : 2) - (b.status === "red" ? 0 : b.status === "amber" ? 1 : 2))[0];
  return (
    <div style={{ display: "grid", gap: 24, marginTop: 24, gridTemplateColumns: "repeat(12,minmax(0,1fr))" }}>
      <div style={{ gridColumn: "span 12" }}>
        <SectionHeader
          eyebrow="Liquidity & treasury"
          title="Funding runway and warehouse pressure"
          description="We’re showing the top line first: runway, cash, warehouse availability, and the covenant most likely to break."
        />
      </div>
      <div style={{ gridColumn: "span 12" }}>
        <MetricStrip>
        <KPI label="Liquidity Runway" value={m.runwayDays} unit="days" status={runwayStatus} sub={`avail $${(UNRESTRICTED + m.totalAvail).toFixed(0)}M`} />
        <KPI label="Unrestricted Cash" value={UNRESTRICTED.toFixed(1)} unit="$M" status={UNRESTRICTED > 25 ? "green" : "red"} sub={`restricted $${RESTRICTED}M`} />
        <KPI label="Warehouse Avail." value={m.totalAvail.toFixed(0)} unit="$M" status={m.totalAvail > 40 ? "green" : m.totalAvail > 15 ? "amber" : "red"} sub={`of $${m.totalCommit}M`} />
        <KPI label="BB Utilization" value={((m.totalDrawn / m.totalCommit) * 100).toFixed(1)} unit="%" status={utilStatus} sub={`$${m.totalDrawn}M drawn`} />
        <KPI label="Tightest Covenant" value={tightest.head} unit={tightest.unit} status={tightest.status} sub={tightest.name} />
        </MetricStrip>
      </div>
      <Panel span={8} title="Stress-Adjusted Liquidity Runway · 26 Weeks" icon={Droplet} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>$M · floor $25M</span>}>
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={pathData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={stressed ? C.red : C.blue} stopOpacity={0.35} /><stop offset="100%" stopColor={stressed ? C.red : C.blue} stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="week" stroke={C.dim} tick={{ fontSize: 10, fill: C.dim }} tickLine={false} />
            <YAxis stroke={C.dim} tick={{ fontSize: 10, fill: C.dim }} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTip suffix="M" />} />
            <ReferenceLine y={25} stroke={C.amber} strokeDasharray="4 3" />
            <Area type="monotone" dataKey="base" name="Base" stroke={C.dim} fill="none" strokeWidth={1.2} strokeDasharray="4 3" dot={false} />
            <Area type="monotone" dataKey="scen" name={scenarios[scenario]?.label ?? scenario} stroke={stressed ? C.red : C.blue} fill="url(#g1)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>
      <Panel span={4} title="Stress Engine Output" icon={TrendingDown}>
        <div style={{ display: "grid", gap: 10 }}>
          {[
            { k: "Survival timeline", v: `${m.runwayDays} days`, s: runwayStatus },
            { k: "Aggregate margin call", v: `$${m.totalMarginCall.toFixed(1)}M`, s: m.totalMarginCall > 0 ? "red" : "green" },
            { k: "Capital injection req.", v: `$${m.capitalNeed.toFixed(0)}M`, s: m.capitalNeed > 0 ? "red" : "green" },
            { k: "First covenant breach", v: tightest.status === "red" ? tightest.name.split(" ").slice(-1)[0] : "none", s: tightest.status },
          ].map((r, i) => (
            <div key={i} className="flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
              <span style={{ ...sans, fontSize: 11, color: C.muted }}>{r.k}</span>
              <span className="flex items-center gap-1.5"><Dot s={r.s} /><span style={{ ...mono, fontSize: 13, color: C.text, fontWeight: 600 }}>{r.v}</span></span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel span={8} title="Warehouse Facility Monitor" icon={Building2}>
        {/* GOV: show as_of timestamp per facility here; flag rows older than policy
            (e.g. > 7 days) as stale ? a covenant view on a 3-week-old cert is itself a risk. */}
        <div style={{ ...mono, fontSize: 11 }}>
          <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: "1.6fr .7fr .6fr .8fr .8fr .8fr .5fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
            <span>FACILITY</span><span className="text-right">COMMIT</span><span className="text-right">UTIL</span><span className="text-right">ADV</span><span className="text-right">AVAIL</span><span className="text-right">MARGIN</span><span className="text-center">MAT</span>
          </div>
          {m.facilities.map((f) => (
            /* TODO(api): row click -> GET /api/treasury/facilities/{id} drill-down. */
            <div key={f.id} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: "1.6fr .7fr .6fr .8fr .8fr .8fr .5fr", borderBottom: `1px solid ${C.border}` }}>
              <span className="flex items-center gap-2"><Dot s={f.status} /><span><span style={{ color: C.text }}>{f.id}</span><span style={{ color: C.dim, fontSize: 9.5, display: "block" }}>{f.spread} · {f.maturity}</span></span></span>
              <span className="text-right" style={{ color: C.muted }}>${f.commitment}M</span>
              <span className="text-right" style={{ color: f.util > 0.9 ? C.red : f.util > 0.82 ? C.amber : C.text }}>{(f.util * 100).toFixed(0)}%</span>
              <span className="text-right" style={{ color: C.text }}>{(f.advanceRate * 100).toFixed(1)}%</span>
              <span className="text-right" style={{ color: C.text }}>${f.availability.toFixed(0)}M</span>
              <span className="text-right" style={{ color: f.marginCall > 0 ? C.red : C.dim }}>{f.marginCall > 0 ? `$${f.marginCall.toFixed(1)}M` : "?"}</span>
              <span className="text-center" style={{ color: f.dte < 90 ? C.red : f.dte < 180 ? C.amber : C.dim }}>{f.dte}d</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel span={4} title="Funding Concentration" icon={ShieldAlert} right={<span style={{ ...mono, fontSize: 10, color: m.hhi > 0.33 ? C.amber : C.dim }}>HHI {m.hhi.toFixed(2)}</span>}>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={m.exposures} layout="vertical" margin={{ top: 0, right: 30, left: 6, bottom: 0 }}>
            <XAxis type="number" domain={[0, 0.5]} hide /><YAxis type="category" dataKey="name" width={64} tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} />
            <Bar dataKey="pct" radius={[0, 3, 3, 0]} label={{ position: "right", formatter: (v) => `${(v * 100).toFixed(0)}%`, fill: C.muted, fontSize: 10 }}>
              {m.exposures.map((e, i) => <Cell key={i} fill={e.pct > 0.4 ? C.amber : C.blue} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ ...mono, fontSize: 10, color: C.dim, marginTop: 4 }}>Top: {m.exposures[0].lender} = {(m.exposures[0].pct * 100).toFixed(0)}%</div>
      </Panel>
      <Panel span={12} title="Covenant Headroom" icon={Gauge}>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          {m.covenants.map((c) => {
            const pct = Math.max(2, Math.min(100, c.dir === "min" ? (c.limit / Math.max(c.actual, 0.01)) * 100 : (c.actual / c.limit) * 100));
            return (
              <div key={c.name}>
                <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
                  <span className="flex items-center gap-1.5"><Dot s={c.status} /><span style={{ ...sans, fontSize: 11, color: C.muted }}>{c.name}</span></span>
                  <span style={{ ...mono, fontSize: 11, color: C.text }}>{c.actual}{c.unit} <span style={{ color: C.dim }}>/ {c.limit}{c.unit}</span></span>
                </div>
                <div style={{ height: 5, background: C.panel2, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: RAG[c.status] }} /></div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/* ===== ACCOUNTING ========================================================= */
function lossColor(v) { return v == null ? C.dim : v < 1.5 ? C.green : v < 3 ? C.amber : C.red; }
function AccountingView({ a, scenario, stressed }) {
  const MOB = ["6mo", "12mo", "18mo", "24mo", "30mo", "36mo"];
  return (
    <div style={{ display: "grid", gap: 24, marginTop: 24, gridTemplateColumns: "repeat(12,minmax(0,1fr))" }}>
      <div style={{ gridColumn: "span 12" }}>
        <SectionHeader
          eyebrow="Accounting & reserves"
          title="Credit reserves and product economics"
          description="We start with CECL, coverage, and charge-off direction, then move into vintage and product detail."
        />
      </div>
      <div style={{ gridColumn: "span 12" }}>
        <MetricStrip>
        <KPI label="CECL Reserve" value={a.cecl} unit="$M" status={a.coverage > 4.5 ? "red" : a.coverage > 3.5 ? "amber" : "green"} sub={`on $${GROSS_LOANS}M gross loans`} />
        <KPI label="Reserve Coverage" value={a.coverage} unit="%" status={a.coverage > 4.5 ? "red" : a.coverage > 3.5 ? "amber" : "green"} sub="reserve / gross loans" />
        <KPI label="Reserve Build (QoQ)" value={(a.build >= 0 ? "+" : "") + a.build} unit="$M" status={a.build > 4 ? "red" : a.build > 1.5 ? "amber" : "green"} sub="earnings impact" />
        <KPI label="NPL Ratio" value={a.npl} unit="%" status={a.npl > 6 ? "red" : a.npl > 4 ? "amber" : "green"} sub="60+ DPD non-performing" />
        <KPI label="Net Charge-Off" value={a.nco} unit="%" status={a.nco > 3 ? "red" : a.nco > 1.8 ? "amber" : "green"} sub="annualized" />
        </MetricStrip>
      </div>
      <Panel span={7} title="Reserve Adequacy Trend · 8 Quarters" icon={Layers} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>reserve $M · coverage %</span>}>
        <ResponsiveContainer width="100%" height={210}>
          <ComposedChart data={a.history} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="q" stroke={C.dim} tick={{ fontSize: 9.5, fill: C.dim }} tickLine={false} />
            <YAxis yAxisId="l" stroke={C.dim} tick={{ fontSize: 10, fill: C.dim }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="r" orientation="right" stroke={C.dim} tick={{ fontSize: 10, fill: C.dim }} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTip />} />
            <Bar yAxisId="l" dataKey="res" name="Reserve" radius={[3, 3, 0, 0]}>
              {a.history.map((h, i) => <Cell key={i} fill={i === a.history.length - 1 && stressed ? C.red : C.blue} />)}
            </Bar>
            <Line yAxisId="r" type="monotone" dataKey="cov" name="Coverage %" stroke={C.amber} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>
      <Panel span={5} title="Vintage Cumulative Loss · % by Months on Book" icon={TrendingDown}>
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11 }}>
          <div className="grid" style={{ gridTemplateColumns: `46px repeat(${MOB.length},1fr)`, marginBottom: 4 }}>
            <span style={{ color: C.dim, fontSize: 9.5 }}>VINT</span>
            {MOB.map((mm) => <span key={mm} className="text-center" style={{ color: C.dim, fontSize: 9.5 }}>{mm}</span>)}
          </div>
          {a.vintages.map((v) => (
            <div key={v.y} className="grid items-center" style={{ gridTemplateColumns: `46px repeat(${MOB.length},1fr)`, marginBottom: 3 }}>
              <span style={{ color: C.muted }}>{v.y}</span>
              {v.row.map((c, i) => (
                <span key={i} className="text-center" style={{ margin: "0 2px", padding: "3px 0", borderRadius: 3, fontSize: 10.5,
                  background: c == null ? "transparent" : `${lossColor(c)}22`, color: lossColor(c), border: c == null ? "none" : `1px solid ${lossColor(c)}44` }}>
                  {c == null ? "·" : c}
                </span>
              ))}
            </div>
          ))}
          <div style={{ ...mono, fontSize: 9.5, color: C.dim, marginTop: 6 }}>Newer vintages curing slower ? 2025 cohort is the watch item.</div>
        </div>
      </Panel>
      <Panel span={7} title="Product Profitability by Vintage" icon={Calculator} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>net = realized yield - 7.5% CoF - loss</span>}>
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11 }}>
          <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: "1.4fr .8fr .9fr .9fr .8fr .9fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
            <span>PRODUCT</span><span className="text-right">VOL</span><span className="text-right">GROSS YLD</span><span className="text-right">REAL YLD</span><span className="text-right">LOSS</span><span className="text-right">NET MGN</span>
          </div>
          {a.products.map((p) => (
            <div key={p.name} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: "1.4fr .8fr .9fr .9fr .8fr .9fr", borderBottom: `1px solid ${C.border}` }}>
              <span className="flex items-center gap-2"><Dot s={p.status} /><span style={{ color: C.text }}>{p.name}</span></span>
              <span className="text-right" style={{ color: C.muted }}>${p.vol}M</span>
              <span className="text-right" style={{ color: C.muted }}>{p.gy}%</span>
              <span className="text-right" style={{ color: C.text }}>{p.ry}%</span>
              <span className="text-right" style={{ color: p.loss > 3 ? C.red : C.amber }}>{p.loss}%</span>
              <span className="text-right" style={{ color: RAG[p.status], fontWeight: 600 }}>{p.net > 0 ? "+" : ""}{p.net}%</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel span={5} title="Foreclosure Economics" icon={Hammer}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {[
            { k: "Avg recovery rate", v: `${a.recovery}%`, s: a.recovery > 68 ? "green" : a.recovery > 55 ? "amber" : "red" },
            { k: "Avg timeline", v: `${a.timeline} mo`, s: a.timeline > 16 ? "red" : a.timeline > 13 ? "amber" : "green" },
            { k: "Loss severity", v: `${a.severity}%`, s: a.severity > 45 ? "red" : a.severity > 35 ? "amber" : "green" },
            { k: "Pipeline", v: `${a.fcCount} · $${a.fcValue}M`, s: a.fcCount > 110 ? "red" : a.fcCount > 90 ? "amber" : "green" },
          ].map((r, i) => (
            <div key={i} style={{ background: C.panel2, borderLeft: `2px solid ${RAG[r.s]}`, borderRadius: 3, padding: "8px 10px" }}>
              <div style={{ ...sans, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: .5 }}>{r.k}</div>
              <div className="flex items-center gap-1.5 mt-1"><Dot s={r.s} /><span style={{ ...mono, fontSize: 16, color: C.text, fontWeight: 600 }}>{r.v}</span></div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ===== COMPLIANCE ========================================================= */
/* NOTE: This whole tab is the most legally sensitive surface. The APR figures,
 * thresholds, and RAG must come from the server-side APR engine + usury_rules,
 * carry legal-source CITATIONS (pgvector RAG), and any red item requires HUMAN
 * APPROVAL before it drives action. Do not let the client decide usury status. */
function ComplianceView({ states = [], litigation = [], channels = [], stateLaws = [], usuryRules = [], legalSources = [] }) {
  /* ? WIRE ? State usury exposure.
   * SOURCE:   loan exposure by state (servicing) + state_laws/usury_rules (legal).
   * TABLE:    state_laws, usury_rules, loans (exposure), apr_calculations (eff APR)
   * ENDPOINT: GET /api/compliance/states
   * GOV:      every row needs a legal-source citation + as_of statute version. */
  const stateRows = states.length ? states : [
    { st: "NY", exp: 178, pct: 22, apr: 24.0, note: "Commercial exempt · CFDL disclosure", s: "green" },
    { st: "CA", exp: 96, pct: 12, apr: 22.4, note: "CFDL disclosure ? review", s: "amber" },
    { st: "NJ", exp: 71, pct: 9, apr: 24.8, note: "Criminal usury 30% · margin thin", s: "amber" },
    { st: "FL", exp: 64, pct: 8, apr: 23.1, note: "Compliant", s: "green" },
    { st: "GA", exp: 41, pct: 5, apr: 26.2, note: "Approaching threshold ? flag", s: "red" },
    { st: "TX", exp: 38, pct: 5, apr: 21.0, note: "Compliant", s: "green" },
  ];
  /* ? WIRE ? Litigation inventory.
   * SOURCE: legal matter-management system. TABLE: litigation_matters (add to schema).
   * ENDPOINT: GET /api/compliance/litigation */
  const litigationRows = litigation.length ? litigation : [
    { m: "Borrower class action ? usury", j: "NJ Superior", exp: 4.2, stage: "Discovery", s: "red" },
    { m: "True-lender challenge", j: "CA Federal", exp: 2.8, stage: "Motion to dismiss", s: "red" },
    { m: "Foreclosure contest (owner-occ.)", j: "NY State", exp: 1.1, stage: "Pre-trial", s: "amber" },
    { m: "Broker disclosure dispute", j: "FL State", exp: 0.6, stage: "Settlement talks", s: "amber" },
  ];
  /* ? WIRE ? Broker/channel risk.
   * SOURCE: origination channel tags + performance + complaints log.
   * TABLE: loans (channel), funding_providers/brokers. ENDPOINT: GET /api/compliance/channels */
  const channelRows = channels.length ? channels : [
    { c: "Broker ? Apex Partners", vol: 142, dft: 6.8, cmp: 3.1, s: "red" },
    { c: "Broker ? Coastal Capital", vol: 88, dft: 3.4, cmp: 0.9, s: "amber" },
    { c: "Direct / In-house", vol: 410, dft: 2.1, cmp: 0.3, s: "green" },
    { c: "Correspondent", vol: 172, dft: 3.9, cmp: 1.2, s: "amber" },
  ];
  const ruleByState = usuryRules.length
    ? usuryRules.reduce((acc, rule) => {
        acc[rule.state_code] = acc[rule.state_code] ?? [];
        acc[rule.state_code].push(rule);
        return acc;
      }, {})
    : {};
  const lawRows = stateLaws.length ? stateLaws : [];
  return (
    <div style={{ display: "grid", gap: 24, marginTop: 24, gridTemplateColumns: "repeat(12,minmax(0,1fr))" }}>
      <div style={{ gridColumn: "span 12" }}>
        <SectionHeader
          eyebrow="Compliance & legal"
          title="State law, litigation, and channel risk"
          description="This view leads with the legal exposures that can change economics fastest: usury, litigation, and origination channel concentration."
        />
      </div>
      <div style={{ gridColumn: "span 12" }}>
        <MetricStrip>
          {/* == WIRE == all five summary tiles -> GET /api/compliance/summary */}
          <KPI label="Active States" value={stateRows.length} unit="" status={stateRows.some((r) => r.s === "red") ? "red" : "amber"} sub={`${stateRows.filter((r) => r.s === "red").length} red · ${stateRows.filter((r) => r.s === "amber").length} amber`} />
          <KPI label="Loans > APR Threshold" value={stateRows.filter((r) => r.s === "red").length} unit="" status="red" sub="review queue" />
          <KPI label="Wtd. Avg Portfolio APR" value={(stateRows.reduce((sum, row) => sum + toNumber(row.apr), 0) / Math.max(stateRows.length, 1)).toFixed(1)} unit="%" status="amber" sub="all-in incl. fees" />
          <KPI label="True-Lender Exposure" value={stateRows.some((r) => r.s === "red") ? "High" : "Moderate"} unit="" status={stateRows.some((r) => r.s === "red") ? "red" : "amber"} sub="bank-partner structures" />
          <KPI label="Open Litigation" value={litigationRows.length} unit="" status={litigationRows.some((r) => r.s === "red") ? "red" : "amber"} sub="$8.7M est. exposure" />
        </MetricStrip>
      </div>
      <Panel span={6} title="State Usury Exposure · Top 6" icon={Scale} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>indicative - pending legal review</span>}>
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11 }}>
          <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: ".5fr .8fr .6fr .8fr 2fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
            <span>ST</span><span className="text-right">EXP</span><span className="text-right">%</span><span className="text-right">APR</span><span style={{ paddingLeft: 10 }}>STATUS</span>
          </div>
          {stateRows.map((r) => (
            /* TODO(api): row click -> state drill-down with statute citations + loan list. */
            <div key={r.st} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: ".5fr .8fr .6fr .8fr 2fr", borderBottom: `1px solid ${C.border}` }}>
              <span className="flex items-center gap-1.5"><Dot s={r.s} /><span style={{ color: C.text }}>{r.st}</span></span>
              <span className="text-right" style={{ color: C.muted }}>${r.exp}M</span>
              <span className="text-right" style={{ color: C.dim }}>{r.pct}%</span>
              <span className="text-right" style={{ color: r.s === "red" ? C.red : C.text }}>{r.apr}%</span>
              <span style={{ paddingLeft: 10, color: C.dim, fontSize: 10 }}>{r.note}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel span={6} title="Litigation Inventory" icon={AlertTriangle}>
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11 }}>
          <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: "2fr 1.1fr 1.2fr .7fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
            <span>MATTER</span><span>JURISDICTION</span><span>STAGE</span><span className="text-right">EXP</span>
          </div>
          {litigationRows.map((r, i) => (
            <div key={i} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: "2fr 1.1fr 1.2fr .7fr", borderBottom: `1px solid ${C.border}` }}>
              <span className="flex items-center gap-1.5"><Dot s={r.s} /><span style={{ color: C.text }}>{r.m}</span></span>
              <span style={{ color: C.muted }}>{r.j}</span>
              <span style={{ color: C.dim }}>{r.stage}</span>
              <span className="text-right" style={{ color: C.text }}>${r.exp}M</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel span={12} title="Broker / Channel Risk Review" icon={Network}>
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11 }}>
          <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 2fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
            <span>CHANNEL</span><span className="text-right">VOLUME</span><span className="text-right">DEFAULT %</span><span className="text-right">COMPLAINT %</span><span style={{ paddingLeft: 12 }}>ASSESSMENT</span>
          </div>
          {channelRows.map((r, i) => (
            <div key={i} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 2fr", borderBottom: `1px solid ${C.border}` }}>
              <span className="flex items-center gap-1.5"><Dot s={r.s} /><span style={{ color: C.text }}>{r.c}</span></span>
              <span className="text-right" style={{ color: C.muted }}>${r.vol}M</span>
              <span className="text-right" style={{ color: r.dft > 5 ? C.red : r.dft > 3 ? C.amber : C.text }}>{r.dft}%</span>
              <span className="text-right" style={{ color: r.cmp > 2 ? C.red : r.cmp > 1 ? C.amber : C.text }}>{r.cmp}%</span>
              <span style={{ paddingLeft: 12, color: C.dim, fontSize: 10 }}>{r.s === "red" ? "Elevated default + complaints ? escalate" : r.s === "amber" ? "Monitor" : "Acceptable"}</span>
            </div>
          ))}
        </div>
      </Panel>
      <Panel span={12} title="State Law Register" icon={Scale} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>state_laws · usury_rules · legal_sources</span>}>
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11 }}>
          <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: "1fr 1.3fr .8fr .8fr 1.2fr 1.2fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
            <span>STATE</span><span>STATUTE</span><span className="text-right">CAP</span><span className="text-right">RULES</span><span>NOTES</span><span>LAW SOURCE</span>
          </div>
          {lawRows.map((law) => {
            const rules = ruleByState[law.state_code] ?? [];
            const latestRule = rules[0];
            const source = legalSources.find((entry) => entry.state_code === law.state_code);
            return (
              <div key={law.state_code} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: "1fr 1.3fr .8fr .8fr 1.2fr 1.2fr", borderBottom: `1px solid ${C.border}` }}>
                <span className="flex items-center gap-1.5"><Dot s={law.commercial_exemption ? "green" : "amber"} /><span style={{ color: C.text }}>{law.state_code}</span></span>
                <span style={{ color: C.muted }}>{law.statute_name}</span>
                <span className="text-right" style={{ color: C.text }}>{law.usury_cap_pct}%</span>
                <span className="text-right" style={{ color: C.muted }}>{rules.length}{latestRule ? ` · ${latestRule.threshold_pct}%` : ""}</span>
                <span style={{ color: C.dim, fontSize: 10 }}>{law.notes}</span>
                <span style={{ color: source ? C.text : C.dim, fontSize: 10 }}>{source?.citation ?? "—"}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/* ===== GOVERNANCE ========================================================= */
function GovernanceView({ items = [] }) {
  /* ? WIRE ? Operating-maturity scorecard.
   * SOURCE: CFO office self-assessment / internal audit. TABLE: maturity_scorecard (add).
   * ENDPOINT: GET /api/governance/maturity */
  const scoreRows = items.length ? items : [
    { name: "Institutional Reporting Upgrade", cur: 2, tgt: 4, owner: "FP&A", s: "gray", note: "Manual board pack today; target automated monthly close package." },
    { name: "Data Warehouse Modernization", cur: 1, tgt: 4, owner: "Data Eng", s: "gray", note: "Fragmented sources; target single governed warehouse w/ lineage." },
    { name: "Automated Compliance Engine", cur: 2, tgt: 5, owner: "Compliance", s: "gray", note: "APR/usury checks manual; target rules engine + legal-source versioning." },
    { name: "Internal Audit Enhancement", cur: 1, tgt: 3, owner: "Int. Audit", s: "gray", note: "Ad-hoc; target risk-based annual plan + control testing." },
    { name: "Board-Level Risk Reporting", cur: 2, tgt: 4, owner: "CFO Office", s: "gray", note: "Inconsistent; target standardized RAG risk dashboard each board cycle." },
  ];
  return (
    <div style={{ display: "grid", gap: 24, marginTop: 24 }}>
      <SectionHeader
        eyebrow="Governance & reporting"
        title="Operating maturity scorecard"
        description="This section should feel board-ready: clear vertical rhythm, one card, one purpose, and enough breathing room to scan quickly."
      />
      <Panel title="Operating-Maturity Scorecard · 90-180 Day Track" icon={FileText} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>maturity 1 (ad-hoc) → 5 (optimized)</span>}>
        <div style={{ display: "grid", gap: 16 }}>
          {scoreRows.map((it) => (
            <div key={it.name} style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "DM Sans, sans-serif", fontSize: 12, color: C.text }}><Dot s={it.s} /> {it.name}</span>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, color: C.dim }}>{it.owner} · L{it.cur} → L{it.tgt}</span>
              </div>
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} style={{ flex: 1, height: 6, borderRadius: 2, background: n <= it.cur ? C.blue : n <= it.tgt ? `${C.blue}33` : C.panel2, border: n === it.tgt ? `1px solid ${C.blue}` : "none" }} />
                ))}
              </div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10.5, color: C.muted }}>{it.note}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ===== CONNECTIONS ======================================================= */
function ConnectionView({ connection, live = {}, dataLoading, dataError }) {
  const tableRows = [
    { label: "program_priorities", source: "Supabase table", status: live.priorities?.length ? "green" : "amber", note: `${live.priorities?.length ?? 0} rows` },
    { label: "stress_scenarios", source: "Supabase table", status: Object.keys(live.scenarios ?? {}).length ? "green" : "amber", note: `${Object.keys(live.scenarios ?? {}).length} scenarios` },
    { label: "funding_providers", source: "Supabase table", status: live.fundingProviders?.length ? "green" : "amber", note: `${live.fundingProviders?.length ?? 0} rows` },
    { label: "loans", source: "Supabase table", status: live.loans?.length ? "green" : "amber", note: `${live.loans?.length ?? 0} rows` },
    { label: "liquidity_forecasts", source: "Supabase table", status: live.liquidityForecasts?.length ? "green" : "amber", note: `${live.liquidityForecasts?.length ?? 0} rows` },
    { label: "state_laws", source: "Supabase table", status: live.stateLaws?.length ? "green" : "amber", note: `${live.stateLaws?.length ?? 0} rows` },
  ];
  return (
    <div style={{ display: "grid", gap: 24, marginTop: 24 }}>
      <SectionHeader
        eyebrow="Connections"
        title="Active connection and backend map"
        description="This page is the quick proof that the app is attached to the live Supabase project and which tables are currently feeding the dashboard."
      />
      <MetricStrip>
        <KPI label="Connection Status" value={connection.statusLabel} unit="" status={connection.status} sub="active data layer" />
        <KPI label="Project Ref" value={connection.projectRef} unit="" status="blue" sub="Supabase project identifier" />
        <KPI label="Database Name" value={connection.databaseName} unit="" status="green" sub="primary Postgres database" />
        <KPI label="Auth Mode" value={connection.authMode} unit="" status="amber" sub="browser client uses anon key" />
        <KPI label="Loaded Tables" value={connection.loadedTables} unit="" status="green" sub="tables currently queried" />
      </MetricStrip>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
        <Panel title="Active Connection" icon={Network} right={<StatusChip status={connection.status}>{connection.statusLabel}</StatusChip>}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", color: C.dim }}>Connection Name</div>
              <div style={{ fontFamily: "Syne, sans-serif", fontSize: 22, fontWeight: 600, letterSpacing: "-0.04em", color: C.text }}>{connection.name}</div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                ["Supabase URL", connection.projectUrl],
                ["Host", connection.host],
                ["Project Ref", connection.projectRef],
                ["Database", connection.databaseName],
                ["Auth", connection.authMode],
                ["RLS", connection.rlsEnabled],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
                  <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: C.muted }}>{label}</span>
                  <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: C.text, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <StatusChip status={dataLoading ? "blue" : "green"}>{dataLoading ? "Refreshing" : "Live"}</StatusChip>
              {dataError ? <StatusChip status="amber">Partial data</StatusChip> : <StatusChip status="green">All required tables visible</StatusChip>}
            </div>
          </div>
        </Panel>

        <Panel title="Table Coverage" icon={Database} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>current dashboard inputs</span>}>
          <DataTable
            columns={[
              { label: "Table", width: "1.5fr" },
              { label: "Source", width: "1fr" },
              { label: "Status", width: "0.7fr" },
              { label: "Note", width: "0.9fr" },
            ]}
          >
            {tableRows.map((row) => (
              <div key={row.label} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.7fr 0.9fr", gap: 16, alignItems: "center", padding: "14px 18px" }}>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: C.text }}>{row.label}</span>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: C.muted }}>{row.source}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "DM Sans, sans-serif", fontSize: 11, color: C.text }}>
                  <Dot s={row.status} /> {row.status}
                </span>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: C.dim }}>{row.note}</span>
              </div>
            ))}
          </DataTable>
        </Panel>
      </div>
    </div>
  );
}

/* ===== DATA IMPORT (ingestion control surface) =========================== */
function ImportViewLegacy({ feeds = [], ingestRuns = [] }) {
  /* ? WIRE ? Source feed registry + last-load status.
   * SOURCE:   ingestion-layer job metadata (operational, not a business table).
   * TABLE:    feed_registry / ingest_runs  (ADD to schema ? operational tables).
   * ENDPOINT: GET /api/ingest/feeds
   * SERVER:   staleness `s` (last_load vs cadence SLA) is computed server-side;
   *           the client only renders it. This screen is the operational view of the
   *           "source -> ingestion -> Postgres" flow ? one row per feed into the 16 tables. */
  const feedRows = feeds.length ? feeds : [];
  const healthy = feedRows.filter((f) => f.s === "green").length;
  const stale = feedRows.filter((f) => f.s === "amber").length;
  const failing = feedRows.filter((f) => f.s === "red").length;
  const sortedRuns = [...ingestRuns].sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  const staleRun = [...ingestRuns].filter((r) => r.status !== "success").sort((a, b) => new Date(a.started_at) - new Date(b.started_at))[0];
  const oldestCriticalDays = staleRun ? daysSince(staleRun.started_at) : 0;
  const steps = [
    { n: "1 · Connect / upload", d: "API, SFTP, scraper, or manual file" },
    { n: "2 · Validate", d: "schema, required fields, dupes, staleness" },
    { n: "3 · Stage", d: "load to staging; show diff vs current" },
    { n: "4 · Approve & commit", d: "human sign-off → write to Postgres + audit" },
  ];
  return (
    <div style={{ display: "grid", gap: 24, marginTop: 24, gridTemplateColumns: "repeat(12,minmax(0,1fr))" }}>
      <div style={{ gridColumn: "span 12" }}>
        <SectionHeader
          eyebrow="Data import"
          title="Source feeds and ingest status"
          description="This is the operational view of the pipeline: where the data comes from, how fresh it is, and which feeds are slowing us down."
        />
      </div>
      <div style={{ gridColumn: "span 12" }}>
        <MetricStrip>
          <KPI label="Feeds Current" value={healthy} unit={`/ ${feedRows.length}`} status="green" sub="within cadence SLA" />
          <KPI label="Stale Feeds" value={stale} unit="" status={stale ? "amber" : "green"} sub="past cadence window" />
          <KPI label="Failing / Critical" value={failing} unit="" status={failing ? "red" : "green"} sub="degrading accuracy" />
          <KPI label="Oldest Critical Feed" value={oldestCriticalDays || "—"} unit="days" status={oldestCriticalDays > 14 ? "red" : oldestCriticalDays > 7 ? "amber" : "green"} sub={staleRun?.feed_name ?? "none"} />
        </MetricStrip>
      </div>

      <Panel span={5} title="Manual Source Upload" icon={Upload} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>xlsx · csv · pdf</span>}>
        {/* PROTOTYPE: non-functional dropzone.
            == WIRE == POST /api/ingest/{feed}/upload  (multipart/form-data)
            GOV: server validates schema ? stages ? shows diff ? requires HUMAN APPROVAL
            before commit. Never auto-commit. Legal/rules files (statutes, usury_rules)
            additionally require compliance sign-off. Log upload + approver to audit_logs.
            SECURITY: validate file type/size server-side; never trust client MIME. */}
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 6, padding: "22px 16px", textAlign: "center", background: C.panel2 }}>
          <Upload size={22} color={C.dim} />
          <div style={{ ...sans, fontSize: 12, color: C.muted, marginTop: 8 }}>Drop a lender cert or statute file</div>
          <div style={{ ...mono, fontSize: 10, color: C.dim, marginTop: 4 }}>then map columns → validate → stage</div>
          <button disabled style={{ ...sans, fontSize: 11, marginTop: 12, padding: "5px 14px", borderRadius: 4, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "not-allowed" }}>Select file (wire upload)</button>
        </div>
        <div style={{ ...mono, fontSize: 9.5, color: C.dim, marginTop: 8 }}>Primary use: warehouse borrowing-base certs &amp; covenant certs - the feeds most often manual and stale.</div>
      </Panel>

      <Panel span={7} title="Ingestion Pipeline" icon={Workflow} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>every step server-side &amp; gated</span>}>
        {/* SERVER: each stage runs in the ingestion layer, not the browser.
            GOV: commit is gated by validation + human approval; all writes versioned. */}
        <div className="flex flex-col gap-2">
          {steps.map((st, i) => (
            <div key={i} className="flex items-center gap-3" style={{ background: C.panel2, borderLeft: `2px solid ${C.blue}`, borderRadius: 3, padding: "8px 10px" }}>
              <span style={{ ...mono, fontSize: 11, color: C.text, minWidth: 130 }}>{st.n}</span>
              <span style={{ ...sans, fontSize: 11, color: C.muted }}>{st.d}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel span={12} title="Source Feed Registry" icon={Database} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>maps each table to its origin + cadence</span>}>
        <div style={{ ...mono, fontSize: 11 }}>
          <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: "1.7fr 1.3fr 1.9fr .8fr .9fr .9fr .7fr .8fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
            <span>FEED</span><span>SOURCE</span><span>? TARGET TABLE</span><span>METHOD</span><span>CADENCE</span><span className="text-right">LAST LOAD</span><span className="text-right">ROWS</span><span className="text-center">ACTION</span>
          </div>
          {feedRows.map((f, i) => (
            /* TODO(api): ACTION "Sync" -> POST /api/ingest/{feed}/sync;
                          "Upload" -> open the upload+map flow; "Fix" -> validation-error drill-down. */
            <div key={i} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: "1.7fr 1.3fr 1.9fr .8fr .9fr .9fr .7fr .8fr", borderBottom: `1px solid ${C.border}` }}>
              <span className="flex items-center gap-2"><Dot s={f.s} /><span style={{ color: C.text }}>{f.feed}</span></span>
              <span style={{ color: C.muted }}>{f.source}</span>
              <span style={{ color: C.dim }}>{f.table}</span>
              <span style={{ color: f.method === "Manual" ? C.amber : C.muted }}>{f.method}</span>
              <span style={{ color: C.muted }}>{f.cadence}</span>
              <span className="text-right" style={{ color: f.s === "red" ? C.red : f.s === "amber" ? C.amber : C.text }}>{f.last}</span>
              <span className="text-right" style={{ color: C.muted }}>{f.rows}</span>
              <span className="text-center" style={{ color: f.s === "green" ? C.dim : C.blue }}>{f.s === "green" ? "Sync" : f.method === "Manual" ? "Upload" : "Fix"}</span>
            </div>
          ))}
        </div>
      </Panel>
      {sortedRuns.length > 0 && (
        <Panel span={12} title="Recent Ingest Runs" icon={RefreshCw} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>ingest_runs · latest operational trail</span>}>
          <div style={{ ...mono, fontSize: 11 }}>
            <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: "1.7fr 1fr .8fr .8fr 1fr 1.1fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
              <span>FEED</span><span>TRIGGER</span><span className="text-right">ROWS</span><span>STATUS</span><span>STARTED</span><span>FINISHED</span>
            </div>
            {sortedRuns.slice(0, 5).map((run) => (
              <div key={run.run_id} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: "1.7fr 1fr .8fr .8fr 1fr 1.1fr", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: C.text }}>{run.feed_name}</span>
                <span style={{ color: C.muted }}>{run.trigger_type}</span>
                <span className="text-right" style={{ color: C.text }}>{run.rows_loaded}</span>
                <span><Dot s={run.status === "success" ? "green" : run.status === "warning" ? "amber" : "red"} /> <span style={{ color: C.muted, marginLeft: 6 }}>{run.status}</span></span>
                <span style={{ color: C.muted }}>{new Date(run.started_at).toLocaleString()}</span>
                <span style={{ color: C.dim }}>{run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function ImportView({ rawData = {}, feeds = [], ingestRuns = [], onCommitted }) {
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [parsedWorkbook, setParsedWorkbook] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [commitState, setCommitState] = useState({ status: "idle", message: "" });
  const [busy, setBusy] = useState(false);

  const feedRows = feeds.length ? feeds : [];

  const currentRowsBySheet = useMemo(() => ({
    treasury_inputs: rawData.treasuryInputs ?? [],
    scenarios: rawData.stressScenarios ?? [],
    facilities: rawData.warehouseFacilities ?? [],
    covenants: rawData.covenants ?? [],
    accounting_inputs: rawData.accountingInputs ?? [],
    reserve_history: rawData.reserveHistory ?? [],
    vintages: rawData.vintageLosses ?? [],
    products: rawData.productProfitability ?? [],
    program_priorities: rawData.programPriorities ?? [],
    compliance_states: rawData.stateExposure ?? [],
    litigation: rawData.litigationMatters ?? [],
    channels: rawData.channelRisk ?? [],
    governance_maturity: rawData.governanceItems ?? [],
    feed_registry: rawData.feedRegistry ?? [],
    model_registry: rawData.modelRegistry ?? [],
  }), [rawData]);

  const enrichedSheets = useMemo(() => {
    if (!parsedWorkbook) return [];
    return parsedWorkbook.sheets.map((sheet) => ({
      ...sheet,
      diff: compareWorkbookRows(sheet.rows, currentRowsBySheet[sheet.sheetName] ?? [], sheet.keyColumns),
    }));
  }, [parsedWorkbook, currentRowsBySheet]);

  const selectedSheetState = enrichedSheets.find((sheet) => sheet.sheetName === selectedSheet) ?? enrichedSheets[0] ?? null;
  const previewColumns = selectedSheetState ? Object.keys(selectedSheetState.previewRows?.[0] ?? selectedSheetState.rows?.[0] ?? {}) : [];
  const sortedRuns = [...ingestRuns].sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  const staleRun = [...ingestRuns].filter((r) => r.status !== "success").sort((a, b) => new Date(a.started_at) - new Date(b.started_at))[0];
  const oldestCriticalDays = staleRun ? daysSince(staleRun.started_at) : 0;
  const feedHealthy = feedRows.filter((f) => f.s === "green").length;
  const feedStale = feedRows.filter((f) => f.s === "amber").length;
  const feedFailing = feedRows.filter((f) => f.s === "red").length;
  const readySheets = enrichedSheets.filter((sheet) => !(sheet.missingColumns?.length > 0)).length;
  const totalRows = enrichedSheets.reduce((sum, sheet) => sum + (sheet.rowCount ?? 0), 0);
  const totalInserted = enrichedSheets.reduce((sum, sheet) => sum + (sheet.diff?.inserted ?? 0), 0);
  const totalUpdated = enrichedSheets.reduce((sum, sheet) => sum + (sheet.diff?.updated ?? 0), 0);
  const totalRemoved = enrichedSheets.reduce((sum, sheet) => sum + (sheet.diff?.removed ?? 0), 0);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setParseError("");
    setCommitState({ status: "idle", message: "" });

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseImportWorkbook(buffer, file.name);
      setParsedWorkbook(parsed);
      setSelectedFileName(file.name);
      setSelectedSheet(parsed.sheets[0]?.sheetName ?? null);
    } catch (error) {
      setParseError(error.message ?? String(error));
      setParsedWorkbook(null);
      setSelectedFileName(file.name);
      setSelectedSheet(null);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function handleCommit() {
    if (!parsedWorkbook) return;
    setBusy(true);
    setCommitState({ status: "running", message: "Writing workbook to Supabase…" });

    try {
      const response = await fetch(`${API_BASE_URL}/api/import/workbook/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workbookName: parsedWorkbook.fileName,
          sheets: parsedWorkbook.sheets.map((sheet) => ({
            sheetName: sheet.sheetName,
            targetTable: sheet.targetTable,
            keyColumns: sheet.keyColumns,
            rows: sheet.rows,
          })),
        }),
      });
      const responseText = await response.text();
      let payload = null;
      try {
        payload = responseText ? JSON.parse(responseText) : null;
      } catch {
        payload = null;
      }
      if (!response.ok) throw new Error(payload?.error ?? responseText.trim() ?? `Import failed (${response.status})`);
      if (!payload) throw new Error("Import endpoint returned an empty response.");
      setCommitState({ status: "success", message: `Committed ${payload.totalRows} rows across ${payload.results.length} sheets.` });
      if (onCommitted) onCommitted(payload);
    } catch (error) {
      setCommitState({ status: "error", message: error.message ?? String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24, marginTop: 24, gridTemplateColumns: "repeat(12,minmax(0,1fr))" }}>
      <div style={{ gridColumn: "span 12" }}>
        <SectionHeader
          eyebrow="Data import"
          title="Upload workbook, preview the diff, commit on approval"
          description="This template-driven import keeps the workbook as the source of truth. We read the sheet, compare it to the live Supabase tables, show a preview, and only then commit the rows."
        />
      </div>

      <div style={{ gridColumn: "span 12" }}>
        <MetricStrip>
          <KPI label="Feeds Current" value={feedHealthy} unit={`/ ${feedRows.length}`} status="green" sub="within cadence SLA" />
          <KPI label="Stale Feeds" value={feedStale} unit="" status={feedStale ? "amber" : "green"} sub="past cadence window" />
          <KPI label="Failing / Critical" value={feedFailing} unit="" status={feedFailing ? "red" : "green"} sub="degrading accuracy" />
          <KPI label="Workbook Sheets" value={parsedWorkbook?.sheetCount ?? 0} unit={parsedWorkbook ? "" : "none"} status={parsedWorkbook ? "blue" : "gray"} sub={selectedFileName || "No file selected"} />
          <KPI label="Critical Age" value={oldestCriticalDays || "—"} unit="days" status={oldestCriticalDays > 14 ? "red" : oldestCriticalDays > 7 ? "amber" : "green"} sub={staleRun?.feed_name ?? "none"} />
        </MetricStrip>
      </div>

      <Panel span={4} title="Template Upload" icon={Upload} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>xlsx only</span>}>
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 12, padding: 18, background: C.panel2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(108,92,231,0.08)", color: C.blue }}>
              <Upload size={20} />
            </div>
            <div>
              <div style={{ ...sans, fontSize: 13, fontWeight: 700, color: C.text }}>Select the workbook template</div>
              <div style={{ ...mono, fontSize: 10, color: C.dim }}>Preview first, then commit to Postgres</div>
            </div>
          </div>
          <label style={{ display: "inline-flex", marginTop: 16, cursor: "pointer" }}>
            <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} disabled={busy} style={{ display: "none" }} />
            <span style={{ ...sans, fontSize: 11, padding: "8px 14px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.panel, color: C.text, fontWeight: 700 }}>Choose workbook</span>
          </label>
          <div style={{ marginTop: 14, ...mono, fontSize: 10, color: C.dim }}>Template sheets are auto-mapped; `_README` and derived sheets are ignored.</div>
          {parseError && <div style={{ marginTop: 12, color: C.red, fontSize: 11 }}>{parseError}</div>}
          {commitState.message && (
            <div style={{ marginTop: 12, color: commitState.status === "error" ? C.red : commitState.status === "success" ? C.green : C.muted, fontSize: 11 }}>
              {commitState.message}
            </div>
          )}
          <button
            onClick={handleCommit}
            disabled={!parsedWorkbook || busy}
            style={{
              ...sans,
              fontSize: 11,
              marginTop: 14,
              padding: "8px 14px",
              borderRadius: 999,
              border: `1px solid ${C.border}`,
              background: parsedWorkbook ? C.blue : "transparent",
              color: parsedWorkbook ? "#fff" : C.muted,
              fontWeight: 700,
              cursor: !parsedWorkbook || busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Working…" : "Commit to Supabase"}
          </button>
        </div>
      </Panel>

      <Panel span={8} title="Import Summary" icon={Workflow} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>preview vs live tables</span>}>
        <div style={{ display: "grid", gap: 12 }}>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <KPI label="Ready Sheets" value={readySheets} unit={`/ ${enrichedSheets.length || 0}`} status="green" sub="headers validated" />
            <KPI label="Rows in Workbook" value={totalRows} unit="" status="blue" sub="mapped rows" />
            <KPI label="Inserted" value={totalInserted} unit="" status="green" sub="new vs live" />
            <KPI label="Updated" value={totalUpdated} unit="" status="amber" sub="changed vs live" />
            <KPI label="Removed" value={totalRemoved} unit="" status="red" sub="missing from workbook" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {parsedWorkbook?.issues?.length ? parsedWorkbook.issues.map((issue, index) => (
              <StatusChip key={`${issue.sheetName}-${index}`} status={issue.type === "missing-sheet" ? "red" : "amber"}>
                {issue.sheetName}: {issue.message}
              </StatusChip>
            )) : <StatusChip status="green">Template checks passed</StatusChip>}
          </div>
          {parsedWorkbook ? (
            <div style={{ display: "grid", gap: 10 }}>
              {enrichedSheets.map((sheet) => {
                const isSelected = selectedSheetState?.sheetName === sheet.sheetName;
                return (
                  <button
                    key={sheet.sheetName}
                    onClick={() => setSelectedSheet(sheet.sheetName)}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${isSelected ? C.blue : C.border}`,
                      background: isSelected ? "rgba(108,92,231,0.04)" : C.panel,
                      borderRadius: 12,
                      padding: "12px 14px",
                      display: "grid",
                      gap: 6,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Dot s={sheet.diff.removed > 0 ? "red" : sheet.diff.updated > 0 ? "amber" : "green"} />
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{sheet.sheetName}</div>
                      </div>
                      <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 10, color: C.dim }}>{sheet.targetTable}</div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontFamily: "DM Sans, sans-serif", fontSize: 10.5, color: C.muted }}>
                      <span>{sheet.rowCount} rows</span>
                      <span>{sheet.diff.inserted} new</span>
                      <span>{sheet.diff.updated} updated</span>
                      <span>{sheet.diff.removed} removed</span>
                      {sheet.missingColumns?.length ? <span style={{ color: C.red }}>Missing: {sheet.missingColumns.join(", ")}</span> : <span style={{ color: C.green }}>Ready</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: 18, border: `1px dashed ${C.border}`, borderRadius: 12, background: C.panel2, color: C.muted, fontSize: 12 }}>
              Choose the workbook template to see a sheet-by-sheet preview and diff.
            </div>
          )}
        </div>
      </Panel>

      <Panel span={12} title={`Sheet Preview ${selectedSheetState ? `· ${selectedSheetState.sheetName}` : ""}`} icon={Database} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>{selectedSheetState?.targetTable ?? "select a sheet"}</span>}>
        {!selectedSheetState ? (
          <div style={{ color: C.muted, fontSize: 12 }}>Select a sheet to inspect the rows that will be written to Supabase.</div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <StatusChip status={selectedSheetState.diff.inserted > 0 ? "blue" : "green"}>{selectedSheetState.rowCount} workbook rows</StatusChip>
              <StatusChip status={selectedSheetState.diff.updated > 0 ? "amber" : "green"}>{selectedSheetState.diff.updated} updates</StatusChip>
              <StatusChip status={selectedSheetState.diff.removed > 0 ? "red" : "green"}>{selectedSheetState.diff.removed} removals</StatusChip>
              <StatusChip status={selectedSheetState.missingColumns?.length ? "amber" : "green"}>{selectedSheetState.missingColumns?.length ? `Missing headers: ${selectedSheetState.missingColumns.join(", ")}` : "Headers match template"}</StatusChip>
            </div>
            <div className="overflow-x-auto">
              <div style={{ minWidth: 720 }}>
                <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(previewColumns.length, 1)}, minmax(120px, 1fr))`, gap: 16, borderBottom: `1px solid ${C.border}`, padding: "0 6px 10px", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.14em", color: C.dim, textTransform: "uppercase" }}>
                  {previewColumns.map((column) => <span key={column}>{column}</span>)}
                </div>
                <div style={{ display: "grid" }}>
                  {(selectedSheetState.previewRows ?? []).map((row, rowIndex) => (
                    <div key={rowIndex} className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(previewColumns.length, 1)}, minmax(120px, 1fr))`, gap: 16, borderBottom: `1px solid ${C.border}`, padding: "12px 6px", alignItems: "center", fontSize: 12 }}>
                      {previewColumns.map((column) => (
                        <span key={column} style={{ color: C.text, wordBreak: "break-word" }}>
                          {row[column] == null ? "—" : String(row[column])}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel span={12} title="Source Feed Registry" icon={RefreshCw} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>maps each table to its origin + cadence</span>}>
        <div style={{ ...mono, fontSize: 11 }}>
          <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: "1.7fr 1.3fr 1.9fr .8fr .9fr .9fr .7fr .8fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
            <span>FEED</span><span>SOURCE</span><span>TARGET TABLE</span><span>METHOD</span><span>CADENCE</span><span className="text-right">LAST LOAD</span><span className="text-right">ROWS</span><span className="text-center">ACTION</span>
          </div>
          {feedRows.map((f, i) => (
            <div key={i} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: "1.7fr 1.3fr 1.9fr .8fr .9fr .9fr .7fr .8fr", borderBottom: `1px solid ${C.border}` }}>
              <span className="flex items-center gap-2"><Dot s={f.s} /><span style={{ color: C.text }}>{f.feed}</span></span>
              <span style={{ color: C.muted }}>{f.source}</span>
              <span style={{ color: C.dim }}>{f.table}</span>
              <span style={{ color: f.method === "Manual" ? C.amber : C.muted }}>{f.method}</span>
              <span style={{ color: C.muted }}>{f.cadence}</span>
              <span className="text-right" style={{ color: f.s === "red" ? C.red : f.s === "amber" ? C.amber : C.text }}>{f.last}</span>
              <span className="text-right" style={{ color: C.muted }}>{f.rows}</span>
              <span className="text-center" style={{ color: f.s === "green" ? C.dim : C.blue }}>{f.s === "green" ? "Sync" : f.method === "Manual" ? "Upload" : "Fix"}</span>
            </div>
          ))}
        </div>
      </Panel>

      {sortedRuns.length > 0 && (
        <Panel span={12} title="Recent Ingest Runs" icon={RefreshCw} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>ingest_runs · latest operational trail</span>}>
          <div style={{ ...mono, fontSize: 11 }}>
            <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: "1.7fr 1fr .8fr .8fr 1fr 1.1fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
              <span>FEED</span><span>TRIGGER</span><span className="text-right">ROWS</span><span>STATUS</span><span>STARTED</span><span>FINISHED</span>
            </div>
            {sortedRuns.slice(0, 5).map((run) => (
              <div key={run.run_id} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: "1.7fr 1fr .8fr .8fr 1fr 1.1fr", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: C.text }}>{run.feed_name}</span>
                <span style={{ color: C.muted }}>{run.trigger_type}</span>
                <span className="text-right" style={{ color: C.text }}>{run.rows_loaded}</span>
                <span><Dot s={run.status === "success" ? "green" : run.status === "warning" ? "amber" : "red"} /> <span style={{ color: C.muted, marginLeft: 6 }}>{run.status}</span></span>
                <span style={{ color: C.muted }}>{new Date(run.started_at).toLocaleString()}</span>
                <span style={{ color: C.dim }}>{run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ===== CALCULATION / MODELING LAYER ====================================== */
function CalcView({ models = [], scenarios = {}, aprCalculations = [], liquidityForecasts = [], usuryRules = [], legalSources = [] }) {
  /* ? WIRE ? Model registry.
   * TABLE:    model_registry  (ADD to schema; version, owner, last validation, status).
   * ENDPOINT: GET /api/models ; POST /api/models/{model}/run
   * SERVER:   every model executes in the derivation layer (NOT the browser); outputs
   *           persisted to the tables shown, with lineage (inputs + version + run ts)
   *           on each row. The deriveTreasury/deriveAccounting functions above are the
   *           prototype stand-ins for the "Liquidity runway & stress" model below.
   * GOV:      red = not validated / not built ? must NOT drive action without human
   *           approval; amber = in validation; revalidate on cadence. */
   const modelRows = models.length ? models : [
    { name: "Effective APR engine", inputs: "loans, fees, usury_rules", out: "apr_calculations", ver: "v1.4", run: "Daily", s: "amber", note: "Fee-as-interest logic per state; pending legal sign-off." },
    { name: "CECL / ECL reserve", inputs: "loans, vintages, macro overlays", out: "apr_calculations (reserve)", ver: "v2.1", run: "Monthly close", s: "amber", note: "In validation ? PD/LGD/EAD backtest outstanding (priority #7)." },
    { name: "Liquidity runway & stress", inputs: "liquidity_forecasts, facilities, stress_scenarios", out: "liquidity_forecasts", ver: "v1.2", run: "Intraday", s: "green", note: "Multipliers below; the prototype's live calc." },
    { name: "Covenant headroom", inputs: "covenants, GL, treasury", out: "covenants (derived)", ver: "v1.0", run: "Daily", s: "green", note: "Includes breach-forecast under stress." },
    { name: "Funding concentration (HHI)", inputs: "funding_providers, loans", out: "(derived)", ver: "v1.0", run: "Daily", s: "green", note: "" },
    { name: "RAG scoring engine", inputs: "policy thresholds", out: "applied to every tab", ver: "v0.9", run: "On read", s: "amber", note: "Thresholds are still code literals ? move to versioned policy table." },
    { name: "True-lender / usury risk score", inputs: "loans, channels, state_laws", out: "compliance_reviews", ver: "?", run: "?", s: "red", note: "Not built ? highest legal sensitivity (priority #14); human approval required." },
  ];
  const prod = modelRows.filter((m) => m.s === "green").length;
  const val = modelRows.filter((m) => m.s === "amber").length;
  const notbuilt = modelRows.filter((m) => m.s === "red").length;
  const latestAprByLoan = aprCalculations.length ? [...aprCalculations].sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date) || b.calc_id - a.calc_id) : [];
  const latestForecasts = liquidityForecasts.length ? [...liquidityForecasts].sort((a, b) => new Date(a.forecast_date) - new Date(b.forecast_date)) : [];
  return (
    <div style={{ display: "grid", gap: 24, marginTop: 24, gridTemplateColumns: "repeat(12,minmax(0,1fr))" }}>
      <div style={{ gridColumn: "span 12" }}>
        <SectionHeader
          eyebrow="Calculation layer"
          title="Models, scenarios, and persisted outputs"
          description="This tab organizes the engine layer: what models exist, what scenarios they consume, and what outputs are already being persisted."
        />
      </div>
      <div style={{ gridColumn: "span 12" }}>
        <MetricStrip>
          <KPI label="Models in Production" value={prod} unit={`/ ${modelRows.length}`} status="green" sub="validated + persisting" />
          <KPI label="In Validation" value={val} unit="" status="amber" sub="pending sign-off" />
          <KPI label="Not Built / Blocked" value={notbuilt} unit="" status="red" sub="no action without review" />
          <KPI label="Pending Revalidation" value={Math.max(0, usuryRules.length - legalSources.length)} unit="" status={usuryRules.length > legalSources.length ? "amber" : "green"} sub="rules vs source coverage" />
        </MetricStrip>
      </div>

      <Panel span={12} title="Model Registry" icon={Sigma} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>derivation layer - runs server-side</span>}>
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11 }}>
          <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: "1.7fr 2fr 1.6fr .7fr .9fr 2.2fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
            <span>MODEL</span><span>INPUTS</span><span>? OUTPUT</span><span>VER</span><span>RUN</span><span>NOTE</span>
          </div>
          {modelRows.map((m, i) => (
            /* TODO(api): row -> model detail (lineage, version history, last validation).
               "Run" -> POST /api/models/{model}/run (logs to audit_logs). */
            <div key={i} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: "1.7fr 2fr 1.6fr .7fr .9fr 2.2fr", borderBottom: `1px solid ${C.border}` }}>
              <span className="flex items-center gap-2"><Dot s={m.s} /><span style={{ color: C.text }}>{m.name}</span></span>
              <span style={{ color: C.dim }}>{m.inputs}</span>
              <span style={{ color: C.muted }}>{m.out}</span>
              <span style={{ color: C.muted }}>{m.ver}</span>
              <span style={{ color: C.muted }}>{m.run}</span>
              <span style={{ color: C.dim, fontSize: 10 }}>{m.note}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel span={7} title="Stress Scenario Parameters" icon={GitBranch} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>the actual multipliers applied</span>}>
        {/* == WIRE == these literals are the SCENARIOS object in code. Move to the
            stress_scenarios table (versioned). POST /api/stress/run reads them
            server-side, applies them, persists results, and logs each run. */}
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11 }}>
          <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
            <span>SCENARIO</span><span className="text-right">COLLAT IMPAIR</span><span className="text-right">ADV CUT</span><span className="text-right">DELINQ Ã—</span><span className="text-right">INFLOW CUT</span>
          </div>
          {Object.entries(scenarios).map(([k, v]) => (
            <div key={k} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr 1fr", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: k === "base" ? C.blue : C.text }}>{v.label}</span>
              <span className="text-right" style={{ color: v.collateralImpair ? C.amber : C.dim }}>{(v.collateralImpair * 100).toFixed(0)}%</span>
              <span className="text-right" style={{ color: v.advanceCut ? C.amber : C.dim }}>{(v.advanceCut * 100).toFixed(0)}%</span>
              <span className="text-right" style={{ color: v.delinqMult > 1 ? C.amber : C.dim }}>{v.delinqMult.toFixed(1)}x</span>
              <span className="text-right" style={{ color: v.inflowCut ? C.amber : C.dim }}>{(v.inflowCut * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel span={5} title="Governance Requirements" icon={Cpu}>
        {/* GOV: enforce these on every model output before it surfaces on a tab. */}
        <div style={{ display: "grid", gap: 10 }}>
          {[
            "Every output row carries lineage: inputs + model version + run timestamp.",
            "Legal/usury outputs carry source citations (pgvector RAG).",
            "Red models cannot drive action without human approval.",
            "No model or threshold change without version history.",
            "Each run logged to audit_logs (who, when, inputs, version).",
          ].map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontFamily: "DM Sans, sans-serif", fontSize: 11, color: C.muted }}>
              <span style={{ color: C.blue, marginTop: 1 }}>•</span><span>{t}</span>
            </div>
          ))}
        </div>
      </Panel>
      {(latestAprByLoan.length > 0 || latestForecasts.length > 0) && (
        <Panel span={12} title="Persisted Engine Outputs" icon={Database} right={<span style={{ ...mono, fontSize: 10, color: C.dim }}>apr_calculations · liquidity_forecasts</span>}>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
            <div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: C.dim, marginBottom: 6, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em" }}>APR CALCULATIONS</div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11 }}>
                <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: "1fr .7fr .7fr .7fr 1fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
                  <span>LOAN</span><span className="text-right">STATE</span><span className="text-right">GROSS</span><span className="text-right">TOTAL</span><span className="text-right">EFFECTIVE</span>
                </div>
                {latestAprByLoan.slice(0, 5).map((row) => (
                  <div key={row.calc_id} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: "1fr .7fr .7fr .7fr 1fr", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.text }}>{row.loan_id}</span>
                    <span className="text-right" style={{ color: C.muted }}>{row.state_code}</span>
                    <span className="text-right" style={{ color: C.muted }}>{toNumber(row.gross_apr_pct).toFixed(1)}%</span>
                    <span className="text-right" style={{ color: C.text }}>{toNumber(row.total_apr_pct).toFixed(1)}%</span>
                    <span className="text-right" style={{ color: C.dim }}>{new Date(row.effective_date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: C.dim, marginBottom: 6, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em" }}>LIQUIDITY FORECASTS</div>
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11 }}>
                <div className="grid px-1 pb-1.5" style={{ gridTemplateColumns: "1fr .7fr .8fr .8fr", color: C.dim, fontSize: 9.5, borderBottom: `1px solid ${C.border}` }}>
                  <span>SCENARIO</span><span className="text-right">WEEK</span><span className="text-right">LIQUIDITY</span><span className="text-right">RUNWAY</span>
                </div>
                {latestForecasts.slice(0, 6).map((row) => (
                  <div key={row.forecast_id} className="grid items-center px-1 py-2" style={{ gridTemplateColumns: "1fr .7fr .8fr .8fr", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.text }}>{row.scenario_key}</span>
                    <span className="text-right" style={{ color: C.muted }}>{row.forecast_week}</span>
                    <span className="text-right" style={{ color: C.text }}>${toNumber(row.total_liquidity_m).toFixed(1)}M</span>
                    <span className="text-right" style={{ color: C.dim }}>{toNumber(row.runway_days)}d</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ===== ROOT =============================================================== */
export default function CFOCommandCenter() {
  const [tab, setTab] = useState("overview");
  const [scenario, setScenario] = useState("base");
  const [refreshToken, setRefreshToken] = useState(0);
  const { data: rawData, loading: dataLoading, error: dataError } = useDashboardData(refreshToken);
  const live = useMemo(() => normalizeDashboardData(rawData ?? {}), [rawData]);

  /* PROTOTYPE: live wall-clock only drives the "AS OF" readout for demo flavor.
   * In production replace with the data's as_of timestamp from the API response,
   * and add a manual "Refresh" + auto-poll (interval per endpoint stale-time). */
  const [clock, setClock] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  /* == WIRE == THE CORE SWAP.
   * Today: synchronous derive() on hardcoded seed data.
   * Target: data-fetching hooks (see DATA LAYER block at top). Example:
   *
   *   const { data: m, isLoading, error } = useTreasury(scenario);     // /api/treasury/*
   *   const { data: a } = useAccounting(scenario);                     // /api/accounting/*
   *   const { data: base } = useTreasury("base");                      // base comparison line
   *   if (isLoading) return <Skeleton/>;                               // TODO: loading state
   *   if (error)     return <ErrorPanel error={error}/>;               // TODO: error state
   *
   * The views below already consume `m` / `a` by shape, so they don't change. */
  const m = useMemo(() => deriveTreasury(scenario, live), [scenario, live]);
  const base = useMemo(() => deriveTreasury("base", live), [live]);
  const a = useMemo(() => deriveAccounting(scenario, live), [scenario, live]);
  const stressed = scenario !== "base";

  const scenarioRelevant = tab === "treasury" || tab === "accounting" || tab === "overview";
  const overall = m.facilities.some((f) => f.status === "red") || m.runwayDays < 120 ? "red" : "amber";

  /* GOV: gate tabs by role here (CFO/CRO/GC see all; operational roles see subset).
   * Read role from the auth session; never trust a client-set role.
   *   const role = useSession().role;
   *   const visibleTabs = TABS.filter(t => canView(role, t.id)); */

  const scenarioLabels = live.scenarios ?? {};
  const activeConnection = {
    name: "Active connection",
    projectUrl: SUPABASE_URL ?? "not configured",
    projectRef: SUPABASE_URL ? getSupabaseProjectRef(SUPABASE_URL) : "unknown",
    host: SUPABASE_URL ? getSupabaseHost(SUPABASE_URL) : "unknown",
    databaseName: "postgres",
    authMode: supabase ? "anon key" : "not configured",
    rlsEnabled: "enabled",
    status: supabase ? (dataError ? "amber" : "green") : "red",
    statusLabel: supabase ? (dataError ? "Partial" : "Connected") : "Offline",
    loadedTables: Object.values(live).filter((value) => Array.isArray(value) && value.length > 0).length,
  };

  function handleImportCommitted() {
    setRefreshToken((value) => value + 1);
  }

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <div className="border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-border bg-violet-light text-[14px] font-bold tracking-[0.18em] text-violet shadow-[2px_0_40px_rgba(0,0,0,0.07)]">WBL</div>
            <div className="h-9 w-px bg-border" />
            <div>
              <div className="font-display text-[20px] font-semibold tracking-[-0.04em] text-text">CFO Risk &amp; Compliance Command Center</div>
              <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-dim">Non-bank CRE lender · 180-day operating review</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <StatusChip status={overall}>{overall === "red" ? "Elevated risk" : "Watch"}</StatusChip>
            {dataLoading && <StatusChip status="blue">Syncing Supabase…</StatusChip>}
            {dataError && <StatusChip status="amber">Partial data · check RLS</StatusChip>}
            <div className="rounded-full border border-border bg-bg-input px-3 py-1.5 font-mono text-[10px] text-dim">
              AS OF {clock.toLocaleDateString("en-US")} {clock.toLocaleTimeString("en-US")}
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-border bg-white">
        <div className="mx-auto max-w-[1700px] px-4">
          <div className="flex items-stretch gap-2 overflow-x-auto py-2">
            {TABS.map((tdef) => {
              const on = tab === tdef.id, Icon = tdef.icon;
              return (
                <button
                  key={tdef.id}
                  onClick={() => setTab(tdef.id)}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-semibold transition ${
                    on ? "border-violet bg-violet-light text-violet" : "border-border bg-white text-muted hover:border-violet hover:text-violet"
                  }`}
                >
                  <Icon size={14} className={on ? "text-violet" : "text-dim"} />
                  <span>{tdef.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* == WIRE == scenario buttons should POST /api/stress/run and read results;
          server logs the run to audit_logs (who ran which scenario, when, inputs). */}
      <div className={`border-b border-border ${stressed && scenarioRelevant ? "bg-[rgba(108,92,231,0.04)]" : "bg-bg"}`}>
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-dim">
            <Zap size={13} className={stressed ? "text-red" : "text-dim"} />
            Stress scenario
          </div>
          {Object.entries(scenarioLabels).map(([k, v]) => {
            const on = scenario === k;
            const status = k === "base" ? "blue" : "red";
            return (
              <button
                key={k}
                onClick={() => setScenario(k)}
                disabled={!scenarioRelevant}
                className={`rounded-full border px-3 py-1.5 font-mono text-[11px] transition ${
                  on
                    ? status === "blue"
                      ? "border-violet bg-violet-light text-violet"
                      : "border-red bg-[rgba(239,68,68,0.12)] text-red"
                    : "border-border bg-white text-muted hover:border-violet hover:text-violet"
                } ${scenarioRelevant ? "" : "cursor-not-allowed opacity-60"}`}
              >
                {v.label}
              </button>
            );
          })}
          <div className="ml-auto rounded-full border border-border bg-white px-3 py-1.5 font-mono text-[10px] text-dim">
            {scenarioRelevant ? (scenarioLabels[scenario]?.desc ?? "Stress scenario selected") : "Stress engine drives Treasury & Accounting views"}
          </div>
        </div>
      </div>

      <main style={{ margin: "0 auto", maxWidth: 1700, padding: "24px 16px 40px" }}>
        <TabHeader tab={tab} answers={TABS.find((item) => item.id === tab)?.answers ?? ""} priorities={live.priorities} phases={PHASES} />

        {tab === "overview" && <OverviewView t={m} a={a} priorities={live.priorities} states={live.states} governance={live.governance} />}
        {tab === "treasury" && <TreasuryView m={m} base={base} scenario={scenario} stressed={stressed} scenarios={scenarioLabels} forecasts={live.liquidityForecasts} />}
        {tab === "accounting" && <AccountingView a={a} scenario={scenario} stressed={stressed} />}
        {tab === "compliance" && <ComplianceView states={live.states} litigation={live.litigation} channels={live.channels} stateLaws={live.stateLaws} usuryRules={live.usuryRules} legalSources={live.legalSources} />}
        {tab === "governance" && <GovernanceView items={live.governance} />}
        {tab === "connections" && <ConnectionView connection={activeConnection} live={live} dataLoading={dataLoading} dataError={dataError} />}
        {tab === "import" && <ImportView rawData={rawData ?? {}} feeds={live.feeds} ingestRuns={live.ingestRuns} onCommitted={handleImportCommitted} />}
        {tab === "calc" && <CalcView models={live.models} scenarios={scenarioLabels} aprCalculations={live.aprCalculations} liquidityForecasts={live.liquidityForecasts} usuryRules={live.usuryRules} legalSources={live.legalSources} />}

        <div className="mt-4 flex items-center justify-between border-t border-border/70 px-1 py-3 font-mono text-[9.5px] text-dim">
          <span className="flex items-center gap-1.5"><CircleDot size={10} /> PROTOTYPE · SYNTHETIC DATA · NOT FINANCIAL OR LEGAL ADVICE</span>
          <span className="flex items-center gap-1">DRILL-DOWN <ArrowUpRight size={10} /> wired in full build</span>
        </div>
      </main>
    </div>
  );
}

