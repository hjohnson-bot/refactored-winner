# Reconciliation — model vs. source systems

**As of 2026-06-17.** Every headline figure in the dashboard is derived from a live
QuickBooks Online or Knowify response (pulled via MCP) and reconciles to the source
within rounding. Re-run `scripts/build_dashboard.py` to regenerate; it prints this
reconciliation and writes `data/_reconciliation.json`.

## Profit & Loss (QuickBooks P&L, by section total)

| Period | Revenue | COGS | Gross Profit | OpEx | Net Income | Source check |
|---|--:|--:|--:|--:|--:|---|
| FY2024 | 39,537,774.90 | 28,435,216.93 | 11,102,557.97 | 8,249,044.14 | 2,899,162.56 | QB P&L FY2024 |
| FY2025 | 40,491,815.42 | 27,755,136.44 | 12,736,678.98 | 10,032,604.11 | 2,704,074.87 | QB P&L FY2025 (section totals) |
| YTD2026 | **28,774,215.27** | 18,535,632.98 | 10,238,582.29 | 4,772,731.89 | **5,340,196.80** | QB P&L `totalIncome`; NI = QB cash-flow Net Income |

- **YTD2026 Revenue 28,774,215.27** = QuickBooks P&L `totalIncome` exactly.
- **YTD2026 Net Income 5,340,196.80** = QuickBooks cash-flow statement "Net Income" line exactly.
- FY2025 OpEx uses the QB **Expenses section header total**; a single
  "Operating Expense — Unitemized" plug keeps Fact_GL tied to QB (FY2025 raw `netIncome`
  field is `0` — a known QuickBooks MCP quirk; P&L-basis NI computed from section totals).
- Monthly trend (Fact_PL_Monthly) uses **verified single-month** QB P&L queries; the
  partial current month is captured in the YTD total.

## Accounts Receivable (QuickBooks)

| Item | Model | Source | Tie |
|---|--:|--:|---|
| Trade A/R (Fact_AR, deduped) | 12,986,875.87 | Balance sheet A/R 12,986,875.87 | ✓ exact |
| Retainage Receivable | 3,136,194.46 | Balance sheet "Retainage Receivable" | ✓ exact |
| **Total receivables incl. retainage** | **16,123,070.33** | | |

A/R aging buckets are deduplicated from the QB A/R Aging Summary by keeping only
top-level customer rows (`parentId="0"`), excluding the "Total for…" and per-job
sub-rows that otherwise triple-count.

## Accounts Payable (QuickBooks)

| Item | Model | Source | Tie |
|---|--:|--:|---|
| A/P (Fact_AP, deduped) | 3,655,333.94 | Balance sheet A/P 3,655,333.94 | ✓ exact |

## Knowify (AJR / JobsReport)

| Item | Model | Source |
|---|--:|---|
| Active jobs | **308** | JobsReport `Total` = 308 |
| Managed jobs (PM + budget + ≥$1k) | 84 | matches spec "~84 actively managed" |
| Contract value (active) | 68,738,372.84 | Σ ContractTotal |
| Invoiced (active) | 46,850,685.67 | Σ Invoiced |
| Backlog (contract − invoiced) | 21,887,687.17 | |
| Job profit $ (active) | 13,878,328.86 | Σ ProfitAmount |
| Worst profit-fade PMs | Tommy Cohoat, Spencer Anderson | matches spec's flagged concentration |

## Balance sheet & liquidity (QuickBooks, 2026-06-17)

| Item | Value | Source |
|---|--:|---|
| Total assets | 22,551,054.99 | QB balance sheet |
| Total liabilities | 13,852,385.73 | QB balance sheet |
| Total equity | 8,698,669.26 | QB balance sheet |
| Cash | -54,623.30 | QB balance sheet |
| LOC drawn (Forum 0874) | 5,440,076.95 | QB balance sheet |
| Operating / Investing / Financing CF (YTD) | 1,708,994.16 / 212,852.10 / -1,650,418.17 | QB cash flow |

**USER-MAINTAINED inputs** (not present in QuickBooks/Knowify, parameterized and flagged
yellow on the Cash & Liquidity sheet / `Param_Cash.csv`): LOC Limit, Advance Rate,
Eligible-AR basis. BBC headroom and LOC utilization compute from these.
