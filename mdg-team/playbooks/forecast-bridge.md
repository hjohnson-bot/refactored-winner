# Playbook: Forecast Bridge

Primary owner: mdg-finance-analyst. Supporting: mdg-wip-analyst for job-level
questions, mdg-payroll-analyst for payroll movement.

Explains movement between any two versions: old forecast versus new forecast,
budget versus forecast, actuals versus budget.

## Steps

1. Confirm both source files by version and date before comparing. If either is
   ambiguous, stop and ask; do not guess the source of truth.
2. Compare old to new by job. Split periods the MDG way: July to December 2026,
   then 2027, then 2028 (adjust the split to the request's horizon).
3. For every material job movement, determine which of these happened:
   - Contract value changed
   - Actuals replaced projections (and whether actuals ran over or under)
   - Timing shifted (work moved between periods or years, not lost)
   - Scope was added or removed
   - Cost-to-complete or margin assumption changed
4. Roll job movements up to division level, then company level.
5. Separate timing shifts from true revenue and margin changes in the summary.
6. Draft PM follow-up questions for anything the files cannot answer.

## Required output

```text
Bridge:
Starting value: $X (source, version, date)
  Jobs moved out of period: (X)
  Contract value changes: +/- X
  Actuals replacing projections: +/- X
  New scope / forecast increases: +X
  Other (itemized): +/- X
Ending value: $X (source, version, date)
Net change: $X
```

Then: job-level bridge table, division rollup, timing versus permanent split,
biggest 5 drivers explained in plain language, PM questions with owners,
confidence level and assumptions.
