---
name: fpa-refresh
allowed-tools: Read, Write, Edit, Bash, Glob
argument-hint: '[period-label]'
description: Daily refresh — pull live QuickBooks + Knowify data into the FP&A workflow and run the close
---

# FP&A Daily Refresh

Pull live QuickBooks and Knowify data, rebuild the period pack, and run the FP&A workflow: **$ARGUMENTS**

## Usage

```
/fpa-refresh              # use current month (UTC)
/fpa-refresh 2026-04      # specific month
```

## Trigger

This command is fired every 24 hours by the entry in `schedule.json`:

```json
{
  "run": "/fpa-refresh",
  "cron": "0 6 * * *",
  "description": "Daily FP&A refresh — pulls QuickBooks + Knowify, rebuilds period pack, runs workflow"
}
```

## Instructions

Both the QuickBooks MCP (`mcp__*__profit-loss-quickbooks-account`, `qbo_accounting_get_*`) and the Knowify MCP (`mcp__*__query`, `mcp__*__platform_knowledge`) must be enabled in this session. If either is not connected, stop and ask the user to connect them.

**Step 1 — Determine the period.**

- If a `period-label` argument was provided (e.g. `2026-04`), use it.
- Otherwise: use the current month UTC (`date -u +%Y-%m`).
- Compute prior month and prior-year same month for comparison.

**Step 2 — Pull live data into `fpa/data/raw/`.** Run these MCP calls in parallel where possible. Save each response as the indicated JSON file (use the Write tool):

| MCP call | Output file |
|---|---|
| `company-info` | `fpa/data/raw/company-info.txt` |
| `profit-loss-quickbooks-account` periodStart/End = target month | `fpa/data/raw/pnl-<label>.json` (extract `totalIncome`, `grossProfit`, `totalExpenses`, `netIncome`, `cogs.*`, `opex.*`) |
| Same MCP for prior month | `fpa/data/raw/pnl-<prior-month>.json` |
| Same MCP for prior year same month | `fpa/data/raw/pnl-<prior-year-month>.json` |
| `qbo_accounting_get_balance_sheet` start_date/end_date = period-end | `fpa/data/raw/balance-sheet-summary.json` (extract `.summary` only) |
| `qbo_accounting_get_ar_aging_summary` as_of_date = period-end | `fpa/data/raw/ar-aging-summary.json` (extract `.summary` only) |
| `qbo_accounting_get_ap_aging_summary` as_of_date = period-end | `fpa/data/raw/ap-aging-summary.json` (extract `.summary` only) |
| Knowify `query` on `JobsReport` with `scopes: [["params", {date_type:"active", start_date:"...", end_date:"..."}]]`, `where: {Status: "#ACTIVE"}`, fields including `ContractTotal, ChangeOrders, BudgetTotal, Invoiced, PercCompleted, ProjectedProfit, Profit, Retainage, WIP, StartDate, EndDate, ProjectManager, ClientName, ContractType`, ordered by `ContractTotal DESC`, limit 100 | `fpa/data/raw/knowify-jobs.json` (full response or `Data` array) |

Some MCP responses exceed the token limit and are auto-saved to a tool-results file. When that happens, use `jq` via Bash to extract the `.summary` (for balance-sheet / aging) and save the extract to the indicated file.

**Step 3 — Build the period pack and run the workflow.**

```bash
bash fpa/scripts/refresh.sh build <label>
```

This invokes `fpa/scripts/build-period.js` (transforms raw blobs into `fpa/data/period-<label>.json`) and then `node fpa/src/index.js run`, which emits artifacts to `fpa/artifacts/<label>/`.

**Step 4 — Report results.**

Report counts only (no fabricated numbers — quote from artifacts):

- active jobs enriched
- anomaly flags by severity (`critical`, `warning`, `info`)
- scenario names and FY net income for each
- the absolute path of `board-brief.md`

Then ask the user whether to invoke `fpa-board-brief-writer` (to rewrite in CFO voice) or `fpa-anomaly-detector` (to triage flags).

## Hard rules

- Do not invent numbers — quote only from the artifacts produced by the workflow run.
- If any raw pull fails, stop and surface the error. Do not synthesize.
- Period reconciliation invariant: the loader will reject the period pack if `gross_profit !== revenue - cogs.total` within $1. If it rejects, inspect `fpa/data/raw/pnl-<label>.json` and fix the COGS extraction.
- Do not commit `fpa/data/raw/` or `fpa/artifacts/` — both are gitignored.
