---
allowed-tools: Read, Write, Bash(./scripts/refresh.sh:*), Bash(python3:*), Bash(ls:*), Bash(date:*), Bash(cd:*), Bash(git:*)
argument-hint: [YYYY-MM-DD] [--full-months] [--dist]
description: Refresh the CFO dashboard from QuickBooks via MCP, rebuild snapshot.json, and verify it
---

# CFO Dashboard Refresh

Pull live QuickBooks data for **Midwest Design Group LLC**, refresh the raw files under
`cfo-dashboard/data/raw/`, rebuild `data/snapshot.json`, and verify the result: $ARGUMENTS

This is the interactive counterpart to the headless daily refresh
(`.github/workflows/cfo-dashboard-refresh.yml` → `scripts/refresh-quickbooks.mjs`, see
`cfo-dashboard/DAILY_REFRESH.md`). Use this command when the cron has been failing (stale
`asOf`), when the QuickBooks OAuth needs a live session, for month-end runs with a custom
as-of date, or to fill gaps in the monthly trend data.

## Arguments

- `YYYY-MM-DD` — optional as-of date (default: today UTC). Used as the YTD period end and
  stamped into the snapshot.
- `--full-months` — re-pull **all** of the last 13 completed months, not just missing ones.
- `--dist` — also rebuild `downloads/cfo-dashboard.html` + `.xlsx` via
  `python3 scripts/build_distributables.py`.

## Data contract (do not deviate)

All paths relative to `cfo-dashboard/`. `YEAR` = as-of year, `PRIOR` = YEAR−1, `PRIOR2` = YEAR−2.

| File | Content | Shape |
|---|---|---|
| `data/raw/pl_<PRIOR2>.json` | Full-year P&L, PRIOR2 | Full raw MCP response |
| `data/raw/pl_<PRIOR>.json` | Full-year P&L, PRIOR | Full raw MCP response |
| `data/raw/pl_<YEAR>_ytd.json` | P&L, Jan 1 → as-of | Full raw MCP response |
| `data/raw/cf_current.json` | Cash flow, Jan 1 → as-of | Minimal extract — match the existing file's keys (`periodStart`, `periodEnd`, `operatingActivities`, `investingActivities`, `financingActivities`, `netCashIncrease`, `cashAtBeginning`, `cashAtEnd`, `netIncome`, `workingCapital`, `investing`, `financing`, …) |
| `data/raw/cf_prior.json` | Cash flow, full PRIOR year | Same minimal extract |
| `data/raw/months/YYYY-MM.json` | One **completed** month's P&L | Exactly: `periodStart`, `periodEnd`, `totalIncome`, `totalCogs`, `grossProfit`, `totalExpenses`, `netIncome` — ⚠️ `totalCogs` is required or the trend tab's gross-margin math breaks |
| `data/raw/benchmark.json` | Industry benchmark (optional, non-fatal) | Match existing keys |
| `data/raw/customers.json` | Top customers by sales (optional, non-fatal) | Match existing keys (`period`, `totalSales`, `customerCount`, `top5Concentration`, `topCustomers`) |
| `data/raw/pipeline.json` | Invoice billing cadence (optional, non-fatal) | Match existing keys (`asOf`, `invoiceCount`, `ytdBillings`, `ytdOpenBalance`, `ytdCollected`, `openInvoiceCount`, …) |

## Step-by-step process

### 1. Preflight
1. Confirm `cfo-dashboard/` exists; work from the repo root and `cd cfo-dashboard` for script calls.
2. Locate the QuickBooks MCP tools. Depending on the session they are named with dashes or
   underscores (e.g. `profit-loss-quickbooks-account` / `profit_loss_quickbooks_account`,
   `cash-flow-quickbooks-account`, `benchmarking-quickbooks-account`, `company-info`). If no
   QuickBooks MCP is connected, **STOP** and tell the user to authorize it (claude.ai
   connector settings, or `/mcp` in an interactive session). Do not fake data.
3. Call the company-info tool. Confirm the company is **Midwest Design Group LLC** — if a
   different company comes back, STOP and report it.
4. Read the current `data/snapshot.json` and note its `asOf` so the report can show
   before → after freshness.

### 2. Pull the period totals (5 required calls)
For each row in the contract table, call the P&L / cash-flow tool with the exact period and
save to the exact filename with Write. Save the P&L responses **whole** — `build_snapshot.py`
navigates the raw structure. For the two cash-flow files, write the minimal extract matching
the existing file's key set (read the old file first to mirror its shape).

If a required pull fails: retry once, then **STOP without overwriting the existing raw file**
— a stale-but-good file beats an error payload. Report which pull failed.

### 3. Gap-fill the monthly trend
1. Compute the last 13 **completed** months (never the in-progress month).
2. `ls data/raw/months/` and diff. Pull only the missing months — unless `--full-months`,
   in which case re-pull all 13 (numbers can change after reclassifications; a periodic
   full re-pull keeps the trend honest).
3. Each month file gets exactly the 7 keys from the contract table.

### 4. Optional pulls (non-fatal — skip with a note on failure)
- Benchmark tool → `data/raw/benchmark.json`
- Sales-by-customer summary for YEAR → transform to the `customers.json` shape
- Invoice data for YEAR → aggregate to the `pipeline.json` shape

### 5. Build
```bash
cd cfo-dashboard && AS_OF=<as-of-date> ./scripts/refresh.sh build
```
The script picks up benchmark/pipeline/customers automatically when the files exist.
If `--dist` was passed, follow with `python3 scripts/build_distributables.py`.

### 6. Verify (all must pass before reporting success)
1. `snapshot.json` parses; `asOf` equals the requested as-of date.
2. `periods`, `cashFlow`, `multiYear`, `verifiedMonths` are present and non-null; if
   benchmark/pipeline/customers raw files exist, those sections are non-null too.
3. `len(verifiedMonths)` equals the number of files in `data/raw/months/`.
4. Spot-check one figure end-to-end: YTD net income in `snapshot.json` matches the value in
   `data/raw/pl_<YEAR>_ytd.json` (per `ACCOUNT_MAP.md`). If it doesn't, report the mismatch —
   do not shrug it off.
5. Any check fails → report ❌ with the specific failure. Never present a broken snapshot as done.

### 7. Report, then stop
Do **not** commit or push — the raw pulls and snapshot are live financial data; committing is
the user's call (say the files are ready if they want to).

## Output format

```
CFO Dashboard Refresh — ✅ Done  (as of 2026-07-06)
──────────────────────────────────
Freshness:    2026-05-07 → 2026-07-06
Period pulls: 5/5  (pl_2024, pl_2025, pl_2026_ytd, cf_current, cf_prior)
Months:       filled 9 gaps (2025-02…2026-05) → 13/13 present
Optional:     benchmark ✅ · customers ✅ · pipeline ⚠️ skipped (<reason>)
Snapshot:     rebuilt — verifiedMonths 13, all sections non-null
Spot-check:   YTD net income snapshot $X == raw pl_2026_ytd $X ✓
Distributables: skipped (no --dist)
──────────────────────────────────
Not committed — say the word if you want this committed.
```

On failure, same shape with `❌ Failed at step N`, the exact error, and which raw files were
left untouched.

## Example of a great run

```
$ /cfo-refresh 2026-06-30 --full-months

Company confirmed: Midwest Design Group LLC. Current snapshot asOf 2026-05-07 (54 days stale).
Pulled FY2024, FY2025, YTD→06-30, both cash flows. Re-pulled all 13 months (2025-06…2026-06).
Benchmark + customers refreshed; pipeline skipped (invoice tool unavailable this session).
Built snapshot with AS_OF=2026-06-30.

CFO Dashboard Refresh — ✅ Done  (as of 2026-06-30)
──────────────────────────────────
Freshness:    2026-05-07 → 2026-06-30
Period pulls: 5/5
Months:       re-pulled 13/13 (--full-months)
Optional:     benchmark ✅ · customers ✅ · pipeline ⚠️ skipped (tool unavailable)
Snapshot:     rebuilt — verifiedMonths 13, all sections non-null
Spot-check:   YTD net income $2,341,806 == raw ✓
──────────────────────────────────
Not committed — say the word if you want this committed.
```

## Do NOT

- ❌ Invent, estimate, or carry forward any financial number — every value comes from a real
  MCP response saved under `data/raw/` (that dir is the verifiable source of truth)
- ❌ Hand-edit `data/snapshot.json` — it is generated only by `build_snapshot.py`
- ❌ Overwrite a good raw file with an error payload or partial response
- ❌ Pull the current in-progress month into `data/raw/months/`
- ❌ Omit `totalCogs` from month files, or freelance the file shapes — match the contract table
- ❌ Commit or push without being asked
- ❌ Print OAuth tokens, API keys, or auth headers from MCP plumbing
- ❌ Report ✅ if any verification check in step 6 failed
