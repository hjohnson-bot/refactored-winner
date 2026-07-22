# Playbook: Payroll and Headcount Bridge

Primary owner: mdg-payroll-analyst. Supporting: mdg-hr-advisor for policy context,
mdg-finance-analyst for forecast integration.

## Data pulls (all read-only)

1. Payroll actuals from the QuickBooks MCP payroll tools (employees, last payroll
   run, pay types, deductions and contributions).
2. The 2026 headcount plan and payroll budget files (confirm version and date).

## Steps

1. Start from the original budget payroll total. Bridge to the current forecast in
   these categories, each with dollars and explanation:
   - Base wages (existing staff)
   - New hires (name role and start date; mid-year starts get partial-year impact)
   - Terminations
   - Raises (effective dates matter)
   - Bonuses (state the assumption basis)
   - Payroll taxes (follows taxable wages; do not flat-line it)
   - Benefits (new eligible employees change this)
   - 401(k) and safe harbor
   - Timing (start-date shifts, pay-period counts)
2. Split field versus office payroll where the data allows.
3. Flag open roles budgeted but not hired, and their remaining-year impact.
4. List decisions still open (pending raises, bonus assumptions, backfills).

## Required output

1. Bridge table: category, dollar impact, explanation
2. Headcount count: budget versus current versus forecast
3. Field versus office split
4. Open roles and unhired budget
5. Decisions needed with owners
6. Confidence level and assumptions

## Sensitivity rule

Individual compensation details go only into outputs Hunter explicitly requested.
They never enter memory files, and they are excluded from any packet addressed to
a wider audience unless Hunter approves.
