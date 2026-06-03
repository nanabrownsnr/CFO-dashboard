import * as XLSX from "xlsx";

const IGNORED_SHEET_PATTERNS = [/^_/, /_summary$/i];

export const WORKBOOK_SHEETS = [
  {
    sheetName: "treasury_inputs",
    targetTable: "treasury_inputs",
    keyColumns: ["id"],
    singleton: true,
    requiredColumns: ["unrestricted_cash_m", "restricted_cash_m", "monthly_burn_m", "gross_loans_m", "as_of_date"],
  },
  {
    sheetName: "scenarios",
    targetTable: "app_stress_scenarios",
    keyColumns: ["scenario_key"],
    requiredColumns: ["scenario_key", "label", "collateral_impair", "advance_cut", "delinq_mult", "inflow_cut", "description"],
  },
  {
    sheetName: "facilities",
    targetTable: "app_warehouse_facilities",
    keyColumns: ["id"],
    requiredColumns: ["facility_id", "lender", "commitment_m", "drawn_m", "advance_rate", "eligible_collateral_m", "spread", "maturity_date"],
  },
  {
    sheetName: "covenants",
    targetTable: "covenants",
    keyColumns: ["metric_key"],
    requiredColumns: ["metric_key", "covenant_name", "limit", "unit", "direction", "base_actual"],
  },
  {
    sheetName: "accounting_inputs",
    targetTable: "accounting_inputs",
    keyColumns: ["id"],
    singleton: true,
    requiredColumns: ["cecl_base_m", "prior_reserve_m", "current_quarter", "npl_base_pct", "nco_base_pct", "cost_of_funds_pct", "opex_pct", "recovery_base_pct", "timeline_base_mo", "fc_count_base"],
  },
  {
    sheetName: "reserve_history",
    targetTable: "app_reserve_history",
    keyColumns: ["quarter"],
    requiredColumns: ["quarter", "reserve_m"],
  },
  {
    sheetName: "vintages",
    targetTable: "app_vintage_losses",
    keyColumns: ["vintage_year"],
    requiredColumns: ["vintage_year", "mob_6", "mob_12", "mob_18", "mob_24", "mob_30", "mob_36"],
  },
  {
    sheetName: "products",
    targetTable: "app_product_profitability",
    keyColumns: ["product_name"],
    requiredColumns: ["product_name", "volume_m", "gross_yield_pct", "realized_yield_pct", "base_loss_pct"],
  },
  {
    sheetName: "program_priorities",
    targetTable: "app_program_priorities",
    keyColumns: ["id"],
    requiredColumns: ["id", "phase", "name", "tab", "status", "pct"],
  },
  {
    sheetName: "compliance_states",
    targetTable: "app_state_usury_exposure",
    keyColumns: ["state_code"],
    requiredColumns: ["state", "exposure_m", "pct_portfolio", "effective_apr_pct", "status", "note"],
  },
  {
    sheetName: "litigation",
    targetTable: "app_litigation_matters",
    keyColumns: ["matter"],
    requiredColumns: ["matter", "jurisdiction", "exposure_m", "stage", "status"],
  },
  {
    sheetName: "channels",
    targetTable: "app_channel_risk",
    keyColumns: ["channel"],
    requiredColumns: ["channel", "volume_m", "default_rate_pct", "complaint_rate_pct", "status"],
  },
  {
    sheetName: "governance_maturity",
    targetTable: "app_governance_items",
    keyColumns: ["name"],
    requiredColumns: ["initiative", "current_level", "target_level", "owner", "status", "note"],
  },
  {
    sheetName: "feed_registry",
    targetTable: "app_feed_registry",
    keyColumns: ["feed"],
    requiredColumns: ["feed", "source", "target_table", "method", "cadence", "last_load", "rows", "status"],
  },
  {
    sheetName: "model_registry",
    targetTable: "app_model_registry",
    keyColumns: ["model_name"],
    requiredColumns: ["model", "inputs", "output", "version", "run_cadence", "status", "note"],
  },
];

const TABLE_BY_SHEET = new Map(WORKBOOK_SHEETS.map((sheet) => [sheet.sheetName, sheet]));

function isIgnoredSheet(name) {
  return IGNORED_SHEET_PATTERNS.some((pattern) => pattern.test(name));
}

function isNumericLike(value) {
  return typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim());
}

function isDateKey(key) {
  return /date|_at$|_on$/i.test(key);
}

function coerceCell(key, value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return isDateKey(key) ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  if (isNumericLike(value)) return Number(value);
  const text = String(value).trim();
  if (!text) return null;
  if (isDateKey(key) && /^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return text;
}

function isNoteRow(row) {
  const values = Object.values(row).filter((value) => value != null && value !== "");
  if (values.length === 0) return true;
  const joined = values.map((value) => String(value).trim()).join(" ").toLowerCase();
  return joined.startsWith("loads to postgres table") || joined.startsWith("loads to postgresql table") || joined.startsWith("loads to ");
}

function hasRequiredValue(row, sheetName) {
  const keys = {
    treasury_inputs: ["unrestricted_cash_m", "restricted_cash_m", "monthly_burn_m", "gross_loans_m", "as_of_date"],
    scenarios: ["scenario_key", "label"],
    facilities: ["id", "lender"],
    covenants: ["metric_key", "covenant_name"],
    accounting_inputs: ["cecl_base_m", "prior_reserve_m", "current_quarter"],
    reserve_history: ["quarter", "reserve_m"],
    vintages: ["vintage_year", "mob_6mo"],
    products: ["product_name", "volume_m"],
    program_priorities: ["id", "name"],
    compliance_states: ["state_code", "exposure_m"],
    litigation: ["matter", "jurisdiction"],
    channels: ["channel", "volume_m"],
    governance_maturity: ["name", "current_level"],
    feed_registry: ["feed", "source"],
    model_registry: ["model_name", "inputs"],
  }[sheetName] ?? [];

  return keys.every((key) => row[key] != null && row[key] !== "");
}

function mapRow(sheetName, row) {
  const next = {};
  for (const [key, value] of Object.entries(row)) {
    next[key] = coerceCell(key, value);
  }

  if (sheetName === "compliance_states") {
    return {
      state_code: next.state,
      exposure_m: next.exposure_m,
      exposure_pct: next.pct_portfolio,
      apr_pct: next.effective_apr_pct,
      note: next.note,
      status: next.status,
    };
  }

  if (sheetName === "governance_maturity") {
    return {
      name: next.initiative,
      current_level: next.current_level,
      target_level: next.target_level,
      owner: next.owner,
      status: next.status,
      note: next.note,
    };
  }

  if (sheetName === "feed_registry") {
    return {
      feed: next.feed,
      source: next.source,
      target_table: next.target_table,
      method: next.method,
      cadence: next.cadence,
      last_load: next.last_load,
      rows_text: next.rows,
      status: next.status,
    };
  }

  if (sheetName === "model_registry") {
    return {
      model_name: next.model,
      inputs: next.inputs,
      output_table: next.output,
      version: next.version,
      run_frequency: next.run_cadence,
      status: next.status,
      note: next.note,
    };
  }

  if (sheetName === "channels") {
    const assessment = next.status === "red" ? "High risk" : next.status === "amber" ? "Monitor" : "Stable";
    return {
      channel: next.channel,
      volume_m: next.volume_m,
      default_pct: next.default_rate_pct,
      complaint_pct: next.complaint_rate_pct,
      assessment,
      status: next.status,
    };
  }

  if (sheetName === "products") {
    const costOfFunds = 7.5;
    const realYield = next.realized_yield_pct;
    const lossPct = next.base_loss_pct;
    const netMargin = realYield != null && lossPct != null ? +(realYield - costOfFunds - lossPct).toFixed(1) : null;
    const status = netMargin == null ? "gray" : netMargin > 1.5 ? "green" : netMargin > 0 ? "amber" : "red";
    return {
      product_name: next.product_name,
      volume_m: next.volume_m,
      gross_yield_pct: next.gross_yield_pct,
      real_yield_pct: realYield,
      loss_pct: lossPct,
      net_margin_pct: netMargin,
      status,
    };
  }

  if (sheetName === "vintages") {
    return {
      vintage_year: next.vintage_year,
      mob_6mo: next.mob_6,
      mob_12mo: next.mob_12,
      mob_18mo: next.mob_18,
      mob_24mo: next.mob_24,
      mob_30mo: next.mob_30,
      mob_36mo: next.mob_36,
    };
  }

  if (sheetName === "facilities") {
    return {
      id: next.facility_id,
      lender: next.lender,
      commitment_m: next.commitment_m,
      drawn_m: next.drawn_m,
      advance_rate: next.advance_rate,
      eligible_collateral_m: next.eligible_collateral_m,
      spread: next.spread,
      maturity: next.maturity_date,
    };
  }

  if (sheetName === "treasury_inputs" || sheetName === "accounting_inputs") {
    if (sheetName === "accounting_inputs") {
      return {
        id: 1,
        cecl_base_m: next.cecl_base_m,
        prior_reserve_m: next.prior_reserve_m,
        current_quarter: next.current_quarter,
        npl_base_pct: next.npl_base_pct,
        nco_base_pct: next.nco_base_pct,
        cost_of_funds_pct: next.cost_of_funds_pct,
        opex_pct: next.opex_pct,
        recovery_base_pct: next.recovery_base_pct,
        timeline_base_mo: next.timeline_base_mo,
        fc_count_base: next.fc_count_base,
        fc_value_base_m: next.fc_value_base_m,
      };
    }
    return {
      ...next,
      id: 1,
    };
  }

  return next;
}

function pickPreview(rows, limit = 3) {
  return rows.slice(0, limit);
}

function validateHeaders(sheetName, headers = []) {
  const config = TABLE_BY_SHEET.get(sheetName);
  if (!config) return [];
  return config.requiredColumns.filter((column) => !headers.includes(column));
}

function normaliseSheetWorkbook(sheetName, worksheet) {
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: true, blankrows: false });
  const mappedRows = rawRows
    .filter((row) => !isNoteRow(row))
    .map((row) => mapRow(sheetName, row));
  const rows = mappedRows
    .filter((row) => Object.values(row).some((value) => value != null && value !== "") && hasRequiredValue(row, sheetName));

  const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  return {
    rows,
    previewRows: pickPreview(rows, 3),
    rowCount: rows.length,
    headers,
    missingColumns: validateHeaders(sheetName, headers),
  };
}

export function parseImportWorkbook(fileBuffer, fileName = "workbook.xlsx") {
  const isArrayBuffer = typeof ArrayBuffer !== "undefined" && (fileBuffer instanceof ArrayBuffer || ArrayBuffer.isView(fileBuffer));
  const workbook = XLSX.read(isArrayBuffer ? fileBuffer : fileBuffer, {
    type: isArrayBuffer ? "array" : "buffer",
    cellDates: true,
  });
  const ignoredSheets = workbook.SheetNames.filter(isIgnoredSheet);
  const sheets = [];
  const issues = [];

  for (const sheetName of workbook.SheetNames) {
    if (isIgnoredSheet(sheetName)) continue;

    const config = TABLE_BY_SHEET.get(sheetName);
    if (!config) {
      issues.push({
        type: "ignored",
        sheetName,
        message: "No import mapping defined for this sheet.",
      });
      continue;
    }

    const worksheet = workbook.Sheets[sheetName];
    const normalized = normaliseSheetWorkbook(sheetName, worksheet);
    sheets.push({
      sheetName,
      targetTable: config.targetTable,
      keyColumns: config.keyColumns,
      singleton: Boolean(config.singleton),
      ...normalized,
    });

    if (normalized.missingColumns.length > 0) {
      issues.push({
        type: "missing-columns",
        sheetName,
        message: `Missing columns: ${normalized.missingColumns.join(", ")}`,
      });
    }
  }

  for (const config of WORKBOOK_SHEETS) {
    if (!workbook.SheetNames.includes(config.sheetName)) {
      issues.push({
        type: "missing-sheet",
        sheetName: config.sheetName,
        message: "Expected sheet not found in workbook.",
      });
    }
  }

  return {
    fileName,
    sheetCount: sheets.length,
    ignoredSheets,
    issues,
    sheets,
  };
}

export function compareWorkbookRows(importRows = [], existingRows = [], keyColumns = []) {
  const keyFor = (row) => keyColumns.map((key) => String(row?.[key] ?? "")).join("::");
  const importMap = new Map(importRows.map((row) => [keyFor(row), row]));
  const existingMap = new Map(existingRows.map((row) => [keyFor(row), row]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const [key, row] of importMap) {
    const existing = existingMap.get(key);
    if (!existing) {
      inserted += 1;
      continue;
    }
    const comparableKeys = new Set([...Object.keys(row), ...Object.keys(existing)].filter((field) => !keyColumns.includes(field)));
    const changed = [...comparableKeys].some((field) => JSON.stringify(row[field] ?? null) !== JSON.stringify(existing[field] ?? null));
    if (changed) updated += 1;
    else unchanged += 1;
  }

  let removed = 0;
  for (const key of existingMap.keys()) {
    if (!importMap.has(key)) removed += 1;
  }

  return { inserted, updated, removed, unchanged };
}

export function getWorkbookSheetConfig(sheetName) {
  return TABLE_BY_SHEET.get(sheetName) ?? null;
}
