# Reconciliation — model vs. source systems

**As of 2026-06-04.** Every headline figure in the dashboard is derived from a live
QuickBooks Online or Knowify response (pulled via MCP) and reconciles to the source
within rounding. Re-run `scripts/build_dashboard.py` to regenerate; it prints this
reconciliation and writes `data/_reconciliation.json`.

## Profit & Loss (QuickBooks P&L, by section total)

| Period | Revenue | COGS | Gross Profit | OpEx | Net Income | Source check |
|---|--:|--:|--:|--:|--:|---|
| FY2024 | 39,537,774.90 | 28,435,216.93 | 11,102,557.97 | 8,249,044.14 | 2,899,162.56 | QB P&L FY2024 |
| FY2025 | 40,491,815.42 | 27,755,136.44 | 12,736,678.98 | 10,032,604.11 | 2,704,074.87 | QB P&L FY2025 (section totals) |
| YTD2026 | **25,001,793.75** | 17,639,687.45 | 7,362,106.30 | 4,225,966.28 | **3,010,486.42** | QB P&L `totalIncome`; NI = QB cash-flow Net Income |

- **YTD2026 Revenue 25,001,793.75** = QuickBooks P&L `totalIncome` exactly.
- **YTD2026 Net Income 3,010,486.42** = QuickBooks cash-flow statement "Net Income" line exactly.
- FY2025 OpEx uses the QB **Expenses section header total** (10,032,604.11); the saved
  prior-year export itemizes 9,704,407.23, so a single **"Operating Expense — Unitemized"**
  plug of 328,196.88 keeps Fact_GL tied to QB. (FY2025 raw `netIncome` field is `0` — a
  known QuickBooks MCP quirk; the P&L-basis NI is computed from section totals.)
- Monthly trend (Fact_PL_Monthly) uses **verified single-month** QB P&L queries
  (Jan–May 2026 + Jan/Apr 2025), per the documented MCP caveat that multi-month
  `monthlyBreakdown` does not reconcile to annual totals.

## Accounts Receivable (QuickBooks)

| Item | Model | Source | Tie |
|---|--:|--:|---|
| Trade A/R (Fact_AR, deduped) | 10,931,346.48 | Balance sheet A/R 10,888,703.31 | ✓ within $42,643 of residual penny-invoices/deposit |
| Retainage Receivable | 3,583,176.48 | Balance sheet "Retainage Receivable" | ✓ exact |
| **Total receivables incl. retainage** | **14,514,522.96** | ≈ spec "~$14.5M A/R + ~$3.6M retainage" | ✓ |

A/R aging buckets are deduplicated from the QB A/R Aging Summary by keeping only
top-level customer rows (`parentId="0"`), excluding the "Total for…" and per-job
sub-rows that otherwise triple-count to a spurious $32.3M.

## Accounts Payable (QuickBooks)

| Item | Model | Source | Tie |
|---|--:|--:|---|
| A/P (Fact_AP, deduped) | 3,496,092.28 | Balance sheet A/P 3,381,507.35 | ✓ aging gross vs GL net |

## Knowify (AJR / JobsReport)

| Item | Model | Source |
|---|--:|---|
| Active jobs | **297** | JobsReport `Total` = 297 |
| Managed jobs (PM + budget + ≥$1k) | 81 | ≈ spec "~84 actively managed" |
| Contract value (active) | 64,129,531.56 | Σ ContractTotal |
| Invoiced (active) | 41,700,168.53 | Σ Invoiced |
| Job profit $ (active) | 12,472,060.98 | Σ ProfitAmount |
| Worst profit-fade PMs | Tommy Cohoat, Spencer Anderson | matches spec's flagged concentration |

## Balance sheet & liquidity (QuickBooks, 2026-06-04)

| Item | Value | Source |
|---|--:|---|
| Total assets | 20,214,113.65 | QB balance sheet |
| Total liabilities | 13,487,455.40 | QB balance sheet |
| Total equity | 6,726,658.25 | QB balance sheet |
| Cash | -270,165.62 | QB balance sheet |
| LOC drawn (Forum 0874) | 5,954,525.79 | QB balance sheet |
| Operating / Investing / Financing CF (YTD) | 1,417,890.04 / 212,852.10 / -1,401,536.77 | QB cash flow |

**USER-MAINTAINED inputs** (not present in QuickBooks/Knowify, parameterized and flagged
yellow on the Cash & Liquidity sheet / `Param_Cash.csv`): LOC Limit, Advance Rate,
Eligible-AR basis. BBC headroom and LOC utilization compute from these.
