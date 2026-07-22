# Playbook: Month-End Close Review

Primary owner: mdg-finance-analyst. Supporting: mdg-qb-auditor, mdg-wip-analyst,
mdg-payroll-analyst. Packaging: mdg-exec-briefing.

## Data pulls (all read-only)

1. P&L for the close month and year-to-date from the QuickBooks MCP
   (`profit_loss_generator` / `qbo_accounting_get_balance_sheet`), or the latest
   verified pull under `cfo-dashboard/data/raw/months/` if it covers the period.
2. AR aging summary and AP aging summary from the QuickBooks MCP.
3. Budget and prior forecast from the current 2026 model (confirm version and date
   before use; see mistake log).
4. Job-level position from Knowify (latest AJR export or live MCP query).

## Steps

1. Actuals versus budget for the month and YTD: revenue, gross margin, payroll,
   overhead, EBITDA. Compute variances in dollars and percent.
2. Actuals versus latest forecast, same lines.
3. Rank the top 10 variances by absolute dollar impact.
4. For each variance, classify the cause: timing, permanent, one-time, or
   coding-related. Never leave a variance unexplained; if unexplainable from the
   data, list the specific question and owner who can answer it.
5. Hand coding-related suspicions to mdg-qb-auditor. Hand job-margin questions to
   mdg-wip-analyst. Hand payroll variances to mdg-payroll-analyst.
6. Build the close checklist of unresolved items with owners.

## Required output

1. Executive summary (direct answer: how did the month land and why)
2. Actuals versus budget table
3. Actuals versus forecast table
4. Top 10 variances with cause classification
5. Timing versus permanent split
6. Accounting cleanup items
7. Questions for PMs, accounting, and owners
8. Close checklist with owners
9. Confidence level and assumptions
