# Master Reporting Inventory — Midwest Design Group LLC

**Audience:** Steve Little (managing partner)
**Author:** Hunter Johnson
**Last updated:** _2026-05-27 (seeded by cloud scaffold; awaits local ingestion)_

This is the single source of truth for every recurring report, projection,
analysis, and spreadsheet model Hunter currently runs. Each entry uses the
template at `templates/report-entry-template.md`. The `drafts/inventory.csv`
and `drafts/inventory.xlsx` files are generated from this document.

## Legend

- **Entity:** TI = Tenant Improvement · MF = Multi-Family · Co = Company rollup
- **Classification:** 🔴 Critical · 🟡 Informational · ⚪ Discretionary
- **Status:** ✅ confirmed with Hunter · 🟦 seeded from `cfo-dashboard/` · ❓ needs Hunter input

---

## Summary table (auto-generated to CSV/XLSX)

| # | Report | Entity | Requester | Frequency | Prep hrs | Maint hrs | Class | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Monthly QBO P&L Snapshot Refresh | Co | Steve Little | Monthly | TBD | TBD | 🔴 | 🟦 |
| 2 | CFO Executive Dashboard (7-tab) | Co | Steve Little | Monthly | TBD | TBD | 🔴 | 🟦 |
| 3 | Year-End Forecast & Run-Rate Projection | Co | Steve Little | Monthly | TBD | TBD | 🔴 | 🟦 |
| 4 | Cash Flow / Cash Position Analysis | Co | Steve Little | Monthly | TBD | TBD | 🔴 | 🟦 |
| 5 | Action Flags Review (revenue, margin, A/R) | Co | Steve Little | Monthly | TBD | TBD | 🟡 | 🟦 |
| 6 | Verified Per-Month P&L Trend | Co | Steve Little | Monthly | TBD | TBD | 🟡 | 🟦 |
| _…_ | _populate from `INBOX/` in local session_ | | | | | | | |

---

## Detailed entries

### 1. Monthly QBO P&L Snapshot Refresh

| Field | Value |
|---|---|
| **Entity** | Co (consumed by CFO dashboard; underlies TI/MF rollups) |
| **Requested by** | Steve Little (recurring CFO-pack input) |
| **Purpose** | Refresh `cfo-dashboard/data/snapshot.json` from live QBO so every downstream KPI, comparison, forecast, and action flag renders against current-month numbers. |
| **Frequency** | Monthly (1st of month, per `cfo-dashboard/scripts/refresh.sh`) |
| **Prep time (per cycle)** | _TBD — Hunter to confirm_ |
| **Maintenance time (per cycle)** | _TBD — includes per-month query loop (FY 2024, FY 2025, YTD 2026, plus individual months due to the QB MCP `monthlyBreakdown` reconciliation quirk)_ |
| **Data owner** | QuickBooks Online (live API via QuickBooks MCP) |
| **Output owner** | Hunter Johnson |
| **Classification** | 🔴 Operationally Critical |
| **Delivery format** | JSON snapshot → 7-tab HTML dashboard |
| **Source systems** | QuickBooks Online (via MCP) |
| **Overlap / duplication** | Feeds reports 2, 3, 4, 5, 6 below — single source of truth. **No redundant pulls** today, but the per-month workaround (one MCP call per month) is a known time tax. |
| **Streamlining opportunities** | (a) Automate via scheduled Claude Code session on the 1st. (b) Monitor whether the QB MCP fixes `monthlyBreakdown` so the per-month loop can be retired. |
| **File reference** | `cfo-dashboard/scripts/refresh.sh`, `cfo-dashboard/scripts/build_snapshot.py`, `cfo-dashboard/data/raw/`, `cfo-dashboard/data/snapshot.json` |

**Notes:**
- Validation checklist already exists in `cfo-dashboard/README.md` lines 94–104.
- Known QB quirk: `pl_2025.json` returns `netIncome=0`; back-filled from `cf_prior.json`. Documented in `build_snapshot.py`.

---

### 2. CFO Executive Dashboard (7-tab)

| Field | Value |
|---|---|
| **Entity** | Co (P&L, cash, forecast, trends rollup) |
| **Requested by** | Steve Little |
| **Purpose** | One-stop executive view: KPIs, P&L w/ comparison, period-over-period, deep dive, year-end forecast, multi-year trends, action flags. |
| **Frequency** | Monthly (re-renders on snapshot refresh) |
| **Prep time (per cycle)** | _TBD — Hunter to confirm (incremental on top of report 1)_ |
| **Maintenance time (per cycle)** | _TBD — usually zero unless tabs/flags change_ |
| **Data owner** | `cfo-dashboard/data/snapshot.json` (Hunter) |
| **Output owner** | Hunter Johnson |
| **Classification** | 🔴 Operationally Critical |
| **Delivery format** | Single-page HTML dashboard (open `cfo-dashboard/index.html`) |
| **Source systems** | snapshot.json (which sources QBO) |
| **Overlap / duplication** | Combines outputs from reports 3–6 into a single artifact. **Intentional aggregation, not duplication.** |
| **Streamlining opportunities** | Host the dashboard so Steve can self-serve instead of asking Hunter for screenshots. |
| **File reference** | `cfo-dashboard/index.html`, `cfo-dashboard/app.js`, `cfo-dashboard/styles.css` |

---

### 3. Year-End Forecast & Run-Rate Projection

| Field | Value |
|---|---|
| **Entity** | Co |
| **Requested by** | Steve Little |
| **Purpose** | Project year-end revenue, GP, OpEx, net income, cash from YTD actuals using two methods (run-rate and avg-monthly × remaining). Drives the "Forecast & Year-End Projection" tab. |
| **Frequency** | Monthly |
| **Prep time (per cycle)** | _TBD_ |
| **Maintenance time (per cycle)** | _TBD — formulas in `app.js`; no manual touch unless methodology changes_ |
| **Data owner** | Hunter (formula logic) + QBO (inputs) |
| **Output owner** | Hunter Johnson |
| **Classification** | 🔴 Operationally Critical |
| **Delivery format** | Dashboard tab + ad-hoc Excel for partners |
| **Source systems** | snapshot.json |
| **Overlap / duplication** | Inputs feed the forecast-miss action flag (report 5). |
| **Streamlining opportunities** | _TBD — does Steve want a separate distributable forecast PDF, or is the dashboard tab enough?_ |
| **File reference** | `cfo-dashboard/app.js` (forecast functions), `cfo-dashboard/README.md` lines 53–55 |

---

### 4. Cash Flow / Cash Position Analysis

| Field | Value |
|---|---|
| **Entity** | Co |
| **Requested by** | Steve Little |
| **Purpose** | Track operating / investing / financing cash flow + period-end cash position. Surfaces the negative-cash-position and A/R-collection-risk flags. |
| **Frequency** | Monthly |
| **Prep time (per cycle)** | _TBD_ |
| **Maintenance time (per cycle)** | _TBD_ |
| **Data owner** | QBO Cash Flow report |
| **Output owner** | Hunter Johnson |
| **Classification** | 🔴 Operationally Critical |
| **Delivery format** | Dashboard "Deep Dive Analysis" tab |
| **Source systems** | QBO Cash Flow (via MCP) |
| **Overlap / duplication** | None known. (Partner contributions/distributions listed by partner in QBO — see ACCOUNT_MAP §3 — _confirm whether a separate partner-distribution report exists_.) |
| **Streamlining opportunities** | _TBD_ |
| **File reference** | `cfo-dashboard/data/raw/cf_current.json`, `cf_prior.json` |

---

### 5. Action Flags Review

| Field | Value |
|---|---|
| **Entity** | Co (rules), TI/MF could each get their own |
| **Requested by** | Steve Little (proactive risk surfacing) |
| **Purpose** | Automated rules that highlight revenue decline, margin compression, expense spike, negative cash flow / position, A/R risk, forecast miss. |
| **Frequency** | Monthly (re-renders on snapshot refresh) |
| **Prep time (per cycle)** | Effectively zero (automated) |
| **Maintenance time (per cycle)** | Only when thresholds/rules change |
| **Data owner** | snapshot.json |
| **Output owner** | Hunter Johnson |
| **Classification** | 🟡 Informational (decision-support, not operational gate) |
| **Delivery format** | Dashboard "Action Flags" tab |
| **Source systems** | snapshot.json |
| **Overlap / duplication** | All inputs already in reports 1–4. |
| **Streamlining opportunities** | Auto-email flag digest to Steve on snapshot refresh. |
| **File reference** | `cfo-dashboard/app.js:510-580` (`computeActionFlags`), `cfo-dashboard/ACCOUNT_MAP.md` §4 |

---

### 6. Verified Per-Month P&L Trend

| Field | Value |
|---|---|
| **Entity** | Co |
| **Requested by** | Steve Little |
| **Purpose** | Trustworthy monthly P&L series (revenue, GP, OpEx, NI per month) that reconciles to QB's individual monthly P&Ls. Used for trend charts and the verified-monthly table. |
| **Frequency** | Monthly (each month gets one row added) |
| **Prep time (per cycle)** | _TBD — one MCP call per month_ |
| **Maintenance time (per cycle)** | _TBD_ |
| **Data owner** | QBO (verified per-month query) |
| **Output owner** | Hunter Johnson |
| **Classification** | 🟡 Informational |
| **Delivery format** | Dashboard "Trends" tab + per-month JSONs |
| **Source systems** | QBO (one P&L query per month) |
| **Overlap / duplication** | Workaround for QB MCP `monthlyBreakdown` bug — would be duplicative if/when that bug is fixed upstream. |
| **Streamlining opportunities** | Re-evaluate the per-month loop quarterly to see if the upstream bug is fixed. |
| **File reference** | `cfo-dashboard/data/raw/months/YYYY-MM.json`, README lines 84–92 |

---

## Awaiting local ingestion (placeholders)

The following report families are very likely present but cannot be confirmed
or detailed without local file access. The local Claude Code session will
populate these from `INBOX/`:

- **TI-segment-specific projections** (tenant improvement project tracking,
  job cost rollups, change-order analyses)
- **MF-segment-specific projections** (multi-family unit economics, draws,
  draws-vs-budget, completion percentages)
- **Knowify job-cost reports** (per the parent repo's `knowify-dashboard.html`
  and `knowify-report` skill — likely a recurring AJR export)
- **Payroll & labor utilization reports** (per-employee, contractor labor split)
- **A/R aging & retainage** reports (referenced in ACCOUNT_MAP cash-flow section)
- **Lender / bank reporting packages** (LOCs and partner contributions
  suggest covenant or borrowing-base reporting)
- **Partner distribution schedules** (per-partner equity tracking)
- **Tax / sales-tax compliance** (multi-state: IN, KY, MI agency payables)
- **Ad-hoc analyses requested via email or Slack**

---

## Streamlining themes (preliminary — refine after full ingestion)

1. **Single source of truth is already working** — the QBO → snapshot.json
   → dashboard pipeline is well-architected. Don't refactor; document.
2. **Per-month QB query loop is a known time tax** — flag for upstream
   resolution, retire when fixed.
3. **Self-serve over screenshot delivery** — hosting the dashboard would
   remove Hunter from the loop on routine "what's our cash position"
   questions.
4. **Automated digest on refresh** — Action Flags + Forecast summary
   auto-emailed to Steve eliminates a recurring ad-hoc request pattern.
5. **TI / MF rollup tagging** — _TBD whether QBO `Class` is currently used
   to split TI vs MF; if so, the dashboard's class filter is scaffolded but
   not yet populated (see `cfo-dashboard/README.md` line 42)._
