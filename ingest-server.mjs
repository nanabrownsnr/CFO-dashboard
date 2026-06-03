import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { Pool } from "pg";
import { WORKBOOK_SHEETS, compareWorkbookRows } from "./src/lib/importWorkbook.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localEnvPath = path.join(__dirname, ".env.local");

function parseEnvFile(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

async function loadLocalEnv() {
  try {
    const text = await fs.readFile(localEnvPath, "utf8");
    const parsed = parseEnvFile(text);
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional file
  }
}

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function isSupabaseHost(connectionString) {
  try {
    return new URL(connectionString).hostname.includes("supabase.co");
  } catch {
    return false;
  }
}

function dbConfigFromEnv() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("Missing SUPABASE_DB_URL / DATABASE_URL / POSTGRES_CONNECTION_STRING");
  }
  return {
    connectionString,
    ssl: isSupabaseHost(connectionString) ? { rejectUnauthorized: false } : undefined,
  };
}

const TABLE_BOOTSTRAP_SQL = `
create table if not exists treasury_inputs (
  id integer primary key,
  unrestricted_cash_m numeric(12,2) not null default 0,
  restricted_cash_m numeric(12,2) not null default 0,
  monthly_burn_m numeric(12,2) not null default 0,
  gross_loans_m numeric(12,2) not null default 0,
  as_of_date date not null default current_date
);

create table if not exists covenants (
  metric_key text primary key,
  covenant_name text not null,
  "limit" numeric(12,2) not null,
  unit text not null,
  direction text not null,
  base_actual numeric(12,2) not null
);

create table if not exists accounting_inputs (
  id integer primary key,
  cecl_base_m numeric(12,2) not null default 0,
  prior_reserve_m numeric(12,2) not null default 0,
  current_quarter text not null,
  npl_base_pct numeric(12,2) not null default 0,
  nco_base_pct numeric(12,2) not null default 0,
  cost_of_funds_pct numeric(12,2) not null default 0,
  opex_pct numeric(12,2) not null default 0,
  recovery_base_pct numeric(12,2) not null default 0,
  timeline_base_mo numeric(12,2) not null default 0,
  fc_count_base integer not null default 0,
  fc_value_base_m numeric(12,2) not null default 0
);

alter table if exists treasury_inputs enable row level security;
alter table if exists app_warehouse_facilities enable row level security;
alter table if exists covenants enable row level security;
alter table if exists accounting_inputs enable row level security;

alter table if exists accounting_inputs
  add column if not exists fc_value_base_m numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = current_schema()
      and tablename = 'app_warehouse_facilities'
      and policyname = 'public read app_warehouse_facilities'
  ) then
    create policy "public read app_warehouse_facilities" on app_warehouse_facilities for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = current_schema()
      and tablename = 'treasury_inputs'
      and policyname = 'public read treasury_inputs'
  ) then
    create policy "public read treasury_inputs" on treasury_inputs for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = current_schema()
      and tablename = 'covenants'
      and policyname = 'public read covenants'
  ) then
    create policy "public read covenants" on covenants for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = current_schema()
      and tablename = 'accounting_inputs'
      and policyname = 'public read accounting_inputs'
  ) then
    create policy "public read accounting_inputs" on accounting_inputs for select using (true);
  end if;
end $$;
`;

const TABLE_CONFIG = new Map(WORKBOOK_SHEETS.map((sheet) => [sheet.targetTable, sheet]));

async function ensureBootstrap(pool) {
  await pool.query(TABLE_BOOTSTRAP_SQL);
}

function normalizeRowsForCommit(targetTable, rows, context = {}) {
  if (targetTable === "app_product_profitability") {
    const accountingRow = context.accountingInputs?.[0] ?? {};
    const costOfFunds = Number(accountingRow.cost_of_funds_pct ?? 7.5);
    return rows.map((row) => {
      const grossYield = Number(row.gross_yield_pct);
      const realizedYield = Number(row.real_yield_pct ?? row.realized_yield_pct);
      const lossPct = Number(row.loss_pct ?? row.base_loss_pct);
      const netMarginPct = Number.isFinite(realizedYield) && Number.isFinite(lossPct)
        ? +(realizedYield - costOfFunds - lossPct).toFixed(1)
        : null;
      const status = netMarginPct == null ? "gray" : netMarginPct > 1.5 ? "green" : netMarginPct > 0 ? "amber" : "red";
      return {
        product_name: row.product_name,
        volume_m: row.volume_m,
        gross_yield_pct: grossYield,
        real_yield_pct: realizedYield,
        loss_pct: lossPct,
        net_margin_pct: netMarginPct,
        status,
      };
    });
  }

  if (targetTable === "app_channel_risk") {
    return rows.map((row) => ({
      channel: row.channel,
      volume_m: row.volume_m,
      default_pct: row.default_pct ?? row.default_rate_pct,
      complaint_pct: row.complaint_pct ?? row.complaint_rate_pct,
      assessment: row.assessment ?? (row.status === "red" ? "High risk" : row.status === "amber" ? "Monitor" : "Stable"),
      status: row.status,
    }));
  }

  if (targetTable === "app_warehouse_facilities") {
    return rows.map((row) => ({
      id: row.id ?? row.facility_id,
      lender: row.lender,
      commitment_m: row.commitment_m ?? row.commitment,
      drawn_m: row.drawn_m ?? row.drawn,
      advance_rate: row.advance_rate ?? row.advanceRate,
      eligible_collateral_m: row.eligible_collateral_m ?? row.eligibleCollateral,
      spread: row.spread,
      maturity: row.maturity ?? row.maturity_date,
    }));
  }

  if (targetTable === "funding_providers") {
    return rows.map((row) => {
      const sourceId = row.provider_id ?? row.id ?? row.facility_id ?? row.provider_name ?? row.lender;
      const providerId = String(sourceId ?? "")
        .startsWith("FP-")
        ? String(sourceId)
        : `FP-${String(sourceId ?? "").replace(/^FP-/, "")}`;
      const commitment = Number(row.commitment_m ?? row.commitment ?? 0);
      const drawn = Number(row.drawn_m ?? row.drawn ?? 0);
      const utilization = commitment > 0 ? drawn / commitment : 0;
      const status = row.status ?? (utilization > 0.9 ? "red" : utilization > 0.82 ? "amber" : "green");
      return {
        provider_id: providerId,
        provider_name: row.provider_name ?? row.lender ?? String(providerId),
        commitment_m: commitment,
        drawn_m: drawn,
        provider_type: row.provider_type ?? "Warehouse lender",
        status,
      };
    });
  }

  if (targetTable === "covenants") {
    const treasuryRow = context.treasuryInputs?.[0] ?? {};
    const facilities = context.facilities ?? [];
    const unrestricted = Number(treasuryRow.unrestricted_cash_m ?? 42);
    const totalAvail = facilities.reduce((sum, facility) => {
      const commitment = Number(facility.commitment_m ?? facility.commitment ?? 0);
      const drawn = Number(facility.drawn_m ?? facility.drawn ?? 0);
      const advanceRate = Number(facility.advance_rate ?? facility.advanceRate ?? 0);
      const eligibleCollateral = Number(facility.eligible_collateral_m ?? facility.eligibleCollateral ?? 0);
      const bbValue = advanceRate * eligibleCollateral;
      return sum + Math.max(0, Math.min(commitment, bbValue) - drawn);
    }, 0);
    const totalMarginCall = facilities.reduce((sum, facility) => {
      const drawn = Number(facility.drawn_m ?? facility.drawn ?? 0);
      const advanceRate = Number(facility.advance_rate ?? facility.advanceRate ?? 0);
      const eligibleCollateral = Number(facility.eligible_collateral_m ?? facility.eligibleCollateral ?? 0);
      const bbValue = advanceRate * eligibleCollateral;
      return sum + Math.max(0, drawn - bbValue);
    }, 0);
    const liquidityActual = Math.max(0, unrestricted + totalAvail - totalMarginCall);

    const actualByMetric = {
      liquidity: liquidityActual,
      delinquency: 4.2,
      dscr: 1.31,
      leverage: 4.4,
      tnw: 112,
    };

    return rows.map((row) => {
      const actual = row.base_actual ?? actualByMetric[String(row.metric_key ?? row.covenant_name ?? "").toLowerCase()];
      return {
        metric_key: row.metric_key,
        covenant_name: row.covenant_name,
        limit: row.limit,
        unit: row.unit,
        direction: row.direction,
        base_actual: actual,
      };
    });
  }

  if (targetTable === "app_reserve_history") {
    const treasuryRow = context.treasuryInputs?.[0] ?? {};
    const grossLoans = Number(treasuryRow.gross_loans_m ?? 812);
    return rows.map((row) => ({
      quarter: row.quarter,
      reserve_m: row.reserve_m,
      coverage_pct: row.coverage_pct ?? (Number.isFinite(Number(row.reserve_m)) && grossLoans ? +((Number(row.reserve_m) / grossLoans) * 100).toFixed(4) : null),
    }));
  }

  if (targetTable === "app_model_registry") {
    return rows.map((row) => ({
      model_name: row.model_name ?? row.model,
      inputs: row.inputs,
      output_table: row.output_table ?? row.output,
      version: row.version,
      run_frequency: row.run_frequency ?? row.run_cadence,
      status: row.status,
      note: row.note ?? "",
    }));
  }

  return rows;
}

async function upsertTable(pool, targetTable, rows, keyColumns, context = {}) {
  const normalizedRows = normalizeRowsForCommit(targetTable, rows, context);
  if (!normalizedRows.length) {
    const deleteSql = `delete from ${quoteIdent(targetTable)}`;
    const result = await pool.query(deleteSql);
    return { insertedOrUpdated: 0, removed: result.rowCount ?? 0 };
  }

  const columns = [...new Set(normalizedRows.flatMap((row) => Object.keys(row)))];
  const keySet = keyColumns.join(",");
  const values = [];
  const placeholders = normalizedRows.map((row, rowIndex) => {
    const rowPlaceholders = columns.map((column) => {
      values.push(row[column] ?? null);
      return `$${values.length}`;
    });
    return `(${rowPlaceholders.join(", ")})`;
  });

  const insertSql = `
    insert into ${quoteIdent(targetTable)} (${columns.map(quoteIdent).join(", ")})
    values ${placeholders.join(", ")}
    on conflict (${keyColumns.map(quoteIdent).join(", ")})
    do update set ${columns
      .filter((column) => !keyColumns.includes(column))
      .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
      .join(", ")}
  `;

  const existingRowsResult = await pool.query(`select ${keyColumns.map(quoteIdent).join(", ")} from ${quoteIdent(targetTable)}`);
  const existingKeys = new Set(existingRowsResult.rows.map((row) => keyColumns.map((key) => String(row[key] ?? "")).join("::")));
  const incomingKeys = new Set(normalizedRows.map((row) => keyColumns.map((key) => String(row[key] ?? "")).join("::")));
  const missingKeys = [...existingKeys].filter((key) => !incomingKeys.has(key));

  const upsertResult = await pool.query(insertSql, values);

  let removed = 0;
  if (missingKeys.length > 0) {
    const firstKey = keyColumns[0];
    const deleteSql = `delete from ${quoteIdent(targetTable)} where ${quoteIdent(firstKey)}::text = any($1::text[])`;
    const deleteResult = await pool.query(deleteSql, [missingKeys.map((key) => key.split("::")[0])]);
    removed = deleteResult.rowCount ?? 0;
  }

  return { insertedOrUpdated: upsertResult.rowCount ?? 0, removed };
}

await loadLocalEnv();
const pool = new Pool(dbConfigFromEnv());
await ensureBootstrap(pool);

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ingest-api" });
});

app.get("/config.js", (_req, res) => {
  const config = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "",
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? "",
    VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? "",
  };
  res.type("application/javascript").send(`window.__APP_CONFIG__ = ${JSON.stringify(config)};`);
});

app.post("/api/import/workbook/commit", async (req, res) => {
  const workbookName = req.body?.workbookName ?? "workbook.xlsx";
  const sheets = Array.isArray(req.body?.sheets) ? req.body.sheets : [];
  const client = await pool.connect();
  const startedAt = new Date().toISOString();
  let runId = null;

  try {
    await client.query("begin");
    const runInsert = await client.query(
      `insert into ingest_runs (feed_name, trigger_type, status, started_at, rows_loaded, notes)
       values ($1, $2, $3, $4, $5, $6) returning run_id`,
      ["Workbook import", "upload", "running", startedAt, 0, `Importing ${workbookName}`],
    );
    runId = runInsert.rows[0].run_id;
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    client.release();
    throw error;
  } finally {
    client.release();
  }

  const results = [];
  let totalRows = 0;

  try {
    const sheetsByName = new Map(sheets.map((sheet) => [sheet.sheetName, sheet]));
    for (const sheet of sheets) {
      const config = TABLE_CONFIG.get(sheet.targetTable);
      if (!config) {
        results.push({ sheetName: sheet.sheetName, targetTable: sheet.targetTable, skipped: true, reason: "No table config." });
        continue;
      }
      const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
      totalRows += rows.length;
      const result = await upsertTable(pool, sheet.targetTable, rows, sheet.keyColumns ?? config.keyColumns, {
        accountingInputs: sheetsByName.get("accounting_inputs")?.rows ?? [],
      });
      if (sheet.targetTable === "app_warehouse_facilities") {
        const fundingProviderSync = await upsertTable(pool, "funding_providers", rows, ["provider_id"], {
          treasuryInputs: sheetsByName.get("treasury_inputs")?.rows ?? [],
        });
        results.push({
          sheetName: sheet.sheetName,
          targetTable: "funding_providers",
          syncedFrom: "app_warehouse_facilities",
          rows: rows.length,
          upserted: fundingProviderSync.insertedOrUpdated,
          removed: fundingProviderSync.removed,
        });
      }
      results.push({
        sheetName: sheet.sheetName,
        targetTable: sheet.targetTable,
        rows: rows.length,
        upserted: result.insertedOrUpdated,
        removed: result.removed,
      });
    }

    await pool.query(
      `update ingest_runs
       set status = $1, finished_at = now(), rows_loaded = $2, notes = $3
       where run_id = $4`,
      ["success", totalRows, `Imported ${sheets.length} sheets from ${workbookName}`, runId],
    );

    await pool.query(
      `insert into audit_logs (actor, action, entity_type, entity_id, details)
       values ($1, $2, $3, $4, $5)`,
      [
        "local-user",
        "workbook-import",
        "workbook",
        workbookName,
        JSON.stringify({ workbookName, totalRows, sheets: results }),
      ],
    );

    res.json({ ok: true, runId, workbookName, totalRows, results });
  } catch (error) {
    await pool.query(
      `update ingest_runs
       set status = $1, finished_at = now(), notes = $2
       where run_id = $3`,
      ["failed", `Import failed for ${workbookName}: ${error.message}`, runId],
    ).catch(() => {});
    res.status(500).json({ ok: false, error: error.message });
  }
});

const port = Number(process.env.PORT ?? process.env.INGEST_PORT ?? 8787);
const distDir = path.resolve(__dirname, "dist");

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Ingest API listening on http://0.0.0.0:${port}`);
});
