# Playbook: QuickBooks Coding Audit

Primary owner: mdg-qb-auditor. Supporting: mdg-finance-analyst for margin impact.

## Data pulls (all read-only)

1. Transaction-level detail for the requested period via the QuickBooks MCP
   (P&L detail by account, AP detail, product/service and customer reports).
2. `cfo-dashboard/ACCOUNT_MAP.md` for the account-to-KPI mapping so reclass
   proposals land in accounts the dashboard actually uses.

## What to flag

1. Wrong account: expense type does not match the account (software in Office
   Supplies, field rental in General Overhead).
2. Overhead that belongs in job cost, and job cost sitting in overhead. This is
   the highest-value category because it distorts both margin and overhead trend.
3. Duplicate-looking charges: same vendor, similar amount, close dates.
4. Unusual vendors and one-time spikes that will need commentary at close.
5. Timing distortions: annual renewals hitting one month, unaccrued items.

## Steps

1. Pull the period's transactions by account. Work largest accounts first.
2. Score each finding with a confidence level (high / medium / low) and the
   follow-up needed to confirm (project number, subscription owner, invoice copy).
3. Quantify the margin and overhead impact if all high-confidence reclasses were
   made.
4. Produce the accounting follow-up list. Proposals only: never modify anything
   in QuickBooks.

## Required output

| Vendor | Date | Amount | Current account | Suggested account | Reason | Confidence | Follow-up |
|---|---|---:|---|---|---|---|---|

Then: duplicate-risk list, unusual/one-time list, total margin impact if
reclassed, accounting follow-up list with owners, confidence and assumptions.
