# Playbook: WIP and Project Profitability Review

Primary owner: mdg-wip-analyst. Supporting: mdg-project-ops for execution context,
mdg-finance-analyst for company-level rollup.

## Data pulls (all read-only)

1. Active jobs, contract values, budgets, costs to date, and invoiced to date from
   the Knowify MCP (or the latest AJR export in the AJR Reports folder; note which
   was used and its date).
2. Job-cost actuals cross-check from QuickBooks where amounts look off.

## Steps

1. For every active job compute: percent complete (cost basis), earned revenue,
   billed to date, over/under billing, current projected margin, and margin versus
   the last review.
2. Flag margin fade and margin gain beyond the threshold (default: 2 margin points
   or $25k, whichever is smaller; tighten on request).
3. For each flagged job, separate accounting causes (coding, billing timing,
   unposted costs) from true performance causes (production, scope, schedule,
   estimate quality). Say which it is, or name the question that decides it.
4. Check overbilled jobs for cash-flow masking and underbilled jobs for unbilled
   scope or missed change orders.
5. Draft PM-specific questions: job, issue, question, document needed, priority.

## Required output

1. Portfolio summary: total contract value, earned, billed, over/under position
2. Flagged jobs table: job, issue, financial impact, likely cause, owner, question
3. Margin fade list and margin gain list with explanations
4. Accounting-versus-performance split
5. PM follow-up agenda grouped by PM
6. Confidence level, data sources with dates, assumptions
