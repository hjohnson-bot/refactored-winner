#!/usr/bin/env node
/**
 * Headless QuickBooks refresh.
 *
 * Calls Anthropic's Messages API with the QuickBooks MCP server attached,
 * pulls the period and per-month reports, writes them to data/raw/, then
 * rebuilds snapshot.json and the standalone HTML/Excel distributables.
 *
 * Required environment variables:
 *   ANTHROPIC_API_KEY  - Anthropic API key
 *   QB_MCP_URL         - QuickBooks MCP server URL
 *                        (default: https://ai-inc.quickbooks.intuit.com/v1/mcp)
 *
 * Optional:
 *   ANTHROPIC_MODEL    - default claude-sonnet-4-5
 *   AS_OF              - YYYY-MM-DD, default today UTC
 *   MAX_RETRIES        - per-pull retries on 5xx (default 2)
 *
 * Usage:
 *   node refresh-quickbooks.mjs
 *
 * Exits 0 on success. Exits non-zero if the API key is missing, any required
 * pull fails after retries, or build_snapshot.py / build_distributables.py
 * fail. Failures are noisy so the GitHub Actions log surfaces them.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const RAW = path.join(ROOT, "data", "raw");
const MONTHS = path.join(RAW, "months");

const API_KEY = process.env.ANTHROPIC_API_KEY;
const QB_MCP_URL = process.env.QB_MCP_URL || "https://ai-inc.quickbooks.intuit.com/v1/mcp";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const AS_OF = process.env.AS_OF || new Date().toISOString().slice(0, 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "2", 10);

if (!API_KEY) {
  console.error("FATAL: ANTHROPIC_API_KEY not set.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// QuickBooks pull helpers
// ---------------------------------------------------------------------------

/**
 * Ask Claude to call a single QuickBooks MCP tool and return only the raw
 * tool result JSON. We extract the first mcp_tool_result block and parse its
 * inner text as JSON.
 */
async function callQbTool(toolName, params, label) {
  const prompt = [
    `Call the QuickBooks MCP tool "${toolName}" with these arguments:`,
    "```json",
    JSON.stringify(params, null, 2),
    "```",
    "After it returns, do not summarize. Reply with only the literal string `OK`.",
  ].join("\n");

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "mcp-client-2025-04-04",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 16000,
          messages: [{ role: "user", content: prompt }],
          mcp_servers: [{ type: "url", url: QB_MCP_URL, name: "quickbooks" }],
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Anthropic ${res.status}: ${text.slice(0, 500)}`);
      }
      const data = await res.json();

      // Pull the first mcp_tool_result block
      const blocks = data.content || [];
      const toolResult = blocks.find(b => b.type === "mcp_tool_result");
      if (!toolResult) {
        throw new Error(`No mcp_tool_result block. Stop reason: ${data.stop_reason}. Content: ${JSON.stringify(blocks).slice(0, 500)}`);
      }
      const txt = toolResult.content?.[0]?.text;
      if (!txt) throw new Error("mcp_tool_result has no text content");

      // The QB tool returns JSON-formatted text
      return JSON.parse(txt);
    } catch (err) {
      lastErr = err;
      console.error(`  attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for ${label}: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  }
  throw new Error(`callQbTool(${label}) exhausted retries: ${lastErr?.message}`);
}

async function writeFile(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(obj, null, 2) + "\n");
}

/**
 * Pull a P&L for a given period and save the full report.
 */
async function pullPL(periodStart, periodEnd, outFile, label) {
  console.error(`Pulling P&L ${label} (${periodStart} → ${periodEnd})…`);
  const result = await callQbTool(
    "profit-loss-quickbooks-account",
    { periodStart, periodEnd },
    `pl ${label}`
  );
  await writeFile(outFile, result);
  console.error(`  saved ${path.relative(ROOT, outFile)} — totalIncome ${result.totalIncome}`);
  return result;
}

/**
 * Pull a Cash Flow for a given period and save a minimal extraction
 * (the schema build_snapshot.py expects).
 */
async function pullCF(periodStart, periodEnd, outFile, label) {
  console.error(`Pulling Cash Flow ${label} (${periodStart} → ${periodEnd})…`);
  const result = await callQbTool(
    "cash-flow-quickbooks-account",
    { periodStart, periodEnd },
    `cf ${label}`
  );

  // Extract working-capital line items by name (QB structure varies a bit)
  const wc = {};
  const findRow = (substr) => {
    const rows = result.reportRows || [];
    const r = rows.find(x => (x.cells?.[0]?.value || "").toLowerCase().includes(substr.toLowerCase()));
    return r?.cells?.[1]?.value ?? null;
  };
  const wcMap = {
    accountsPayableChange: "accounts payable",
    accountsReceivableChange: "accounts receivable",
    retainageReceivableChange: "retainage receivable",
    inventoryDrywallChange: "drywall inventory",
    wipOverbillingsChange: "overbilling",
    wipUnderbillingsChange: "underbilling",
    accruedBonusesChange: "accrued bonuses",
    accruedPayrollChange: "accrued payroll",
    accruedCommissionsChange: "accrued commissions",
    lineOfCreditDraw: "line of credit",
    lineOfCreditCapXChange: "cap x loc",
  };
  for (const [k, name] of Object.entries(wcMap)) {
    const v = findRow(name);
    if (v !== null) wc[k] = v;
  }

  // Net Income line under operating activities
  const netIncomeRow = (result.reportRows || []).find(r => (r.cells?.[0]?.value || "").trim().toLowerCase() === "net income");

  const minimal = {
    periodStart: result.periodStart,
    periodEnd: result.periodEnd,
    reportTitle: result.reportTitle,
    companyName: result.companyName,
    operatingActivities: result.operatingActivities,
    investingActivities: result.investingActivities,
    financingActivities: result.financingActivities,
    netCashIncrease: result.netCashIncrease,
    cashAtBeginning: result.cashAtBeginning,
    cashAtEnd: result.cashAtEnd,
    netIncome: netIncomeRow?.cells?.[1]?.value ?? null,
    workingCapital: wc,
  };
  await writeFile(outFile, minimal);
  console.error(`  saved ${path.relative(ROOT, outFile)} — operating ${minimal.operatingActivities}`);
  return minimal;
}

/**
 * Pull industry benchmark.
 */
async function pullBenchmark(outFile) {
  console.error("Pulling industry benchmark…");
  try {
    const result = await callQbTool(
      "benchmarking-quickbooks-account",
      { aggregationPeriod: "yearly", metricType: "profit" },
      "benchmark"
    );
    await writeFile(outFile, result);
    console.error(`  saved ${path.relative(ROOT, outFile)}`);
  } catch (err) {
    console.error(`  benchmark pull failed (non-fatal): ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Period planning
// ---------------------------------------------------------------------------

function lastDayOfMonth(year, month) {
  // month is 1-12; new Date(year, month, 0) gives last day of that month
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function planMonthlyPulls(asOf) {
  // Last 13 completed months (so the trend chart always has 12+ even at start of month)
  const end = new Date(asOf + "T00:00:00Z");
  const months = [];
  for (let i = 1; i <= 13; i++) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    months.push({
      year: y,
      month: m,
      start: `${y}-${String(m).padStart(2, "0")}-01`,
      end: `${y}-${String(m).padStart(2, "0")}-${String(lastDayOfMonth(y, m)).padStart(2, "0")}`,
      file: path.join(MONTHS, `${y}-${String(m).padStart(2, "0")}.json`),
    });
  }
  return months.reverse();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await fs.mkdir(MONTHS, { recursive: true });
  const currentYear = new Date(AS_OF).getUTCFullYear();
  const priorYear = currentYear - 1;
  const prior2Year = currentYear - 2;

  console.error(`=== CFO dashboard refresh @ ${AS_OF} ===`);
  console.error(`Model: ${MODEL}`);
  console.error(`MCP:   ${QB_MCP_URL}`);
  console.error("");

  // 1. Period totals (3 P&L + 2 cash flow)
  await pullPL(`${prior2Year}-01-01`, `${prior2Year}-12-31`, path.join(RAW, `pl_${prior2Year}.json`), `FY ${prior2Year}`);
  await pullPL(`${priorYear}-01-01`, `${priorYear}-12-31`, path.join(RAW, `pl_${priorYear}.json`), `FY ${priorYear}`);
  await pullPL(`${currentYear}-01-01`, AS_OF, path.join(RAW, `pl_${currentYear}_ytd.json`), `YTD ${currentYear}`);
  await pullCF(`${currentYear}-01-01`, AS_OF, path.join(RAW, "cf_current.json"), `YTD ${currentYear}`);
  await pullCF(`${priorYear}-01-01`, `${priorYear}-12-31`, path.join(RAW, "cf_prior.json"), `FY ${priorYear}`);

  // 2. Per-month verified pulls (last 13 completed months)
  const monthly = planMonthlyPulls(AS_OF);
  console.error(`Pulling ${monthly.length} individual months for trend tab…`);
  for (const m of monthly) {
    await pullPL(m.start, m.end, m.file, `${m.year}-${String(m.month).padStart(2, "0")}`);
  }

  // 3. Benchmark (non-fatal)
  await pullBenchmark(path.join(RAW, "benchmark.json"));

  // 4. Rebuild snapshot.json
  console.error("");
  console.error("Rebuilding snapshot.json…");
  execFileSync("python3", [
    path.join(ROOT, "scripts", "build_snapshot.py"),
    "--pl-current", path.join(RAW, `pl_${currentYear}_ytd.json`),
    "--pl-prior", path.join(RAW, `pl_${priorYear}.json`),
    "--pl-prior-2", path.join(RAW, `pl_${prior2Year}.json`),
    "--cf-current", path.join(RAW, "cf_current.json"),
    "--cf-prior", path.join(RAW, "cf_prior.json"),
    "--benchmark", path.join(RAW, "benchmark.json"),
    "--months-dir", MONTHS,
    "--as-of", AS_OF,
    "--out", path.join(ROOT, "data", "snapshot.json"),
  ], { stdio: "inherit" });

  // 5. Rebuild standalone HTML + Excel
  console.error("Rebuilding standalone HTML + Excel…");
  execFileSync("python3", [path.join(ROOT, "scripts", "build_distributables.py")], { stdio: "inherit" });

  console.error("");
  console.error("=== Refresh complete ===");
}

main().catch(err => {
  console.error("FATAL:", err.message);
  console.error(err.stack);
  process.exit(1);
});
