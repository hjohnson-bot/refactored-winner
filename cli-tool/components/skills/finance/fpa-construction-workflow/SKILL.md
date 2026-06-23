---
name: fpa-construction-workflow
description: AI-native FP&A workflow for construction finance teams. Turns monthly reporting into a structured pipeline — variance analysis, anomaly detection, scenario planning, board brief generation, and finance Q&A — over a single period pack. Use when a construction CFO or controller needs to run a monthly close, explain results, stress-test scenarios, or answer leadership questions with grounded data.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# FP&A Construction Workflow

> Finance reporting is a system, not a deck. Data goes in. Metrics are calculated. Variances are explained. Scenarios are tested. Commentary is generated. The finance team reviews and decides.

## When to use this skill

Trigger any of:

- Running the monthly close for a construction GC / subcontractor
- Explaining a revenue or margin miss to leadership
- Producing a board package for a construction company
- Stress-testing an FY landing under labor / material / schedule pressure
- Answering ad-hoc finance questions ("worst job?", "underbillings?", "downside scenario?")

## The contract

Every step operates on one structured input — the **period pack** — that captures everything needed for the close:

```
period.json
├── company              { name, industry, fiscal_year_end, currency }
├── period               { label, type, start, end, completed_months_ytd }
├── actuals
│   ├── pnl              { revenue, cogs{...}, gross_profit, opex{...}, opex_total, net_income }
│   ├── balance_sheet    { cash, ar, underbillings, overbillings, ap, retainage_*, debt }
│   ├── cash_flow        { operating, investing, financing, net_change }
│   ├── ar_aging         { current, d1_30, d31_60, d61_90, d90_plus }
│   └── headcount
├── plan
│   ├── budget           # same shape as actuals.pnl — the plan
│   ├── forecast         # rolling forecast
│   ├── prior_month
│   └── prior_year_month
├── jobs[]               # WIP schedule: contract_value, cost_to_date, eac, etc, billings_to_date, bid_gross_margin, change_orders
└── backlog              { total_backlog, signed_not_started, verbal_commitments }
```

Schema: `fpa/src/schema/period.schema.json`. Sample: `fpa/data/sample-period.json`.

Reconciliation invariant: `gross_profit === revenue − cogs.total` within $1, enforced by the loader.

## The pipeline

```
enrich → variance → anomaly → scenario → board-brief
                                          ↓
                                      Q&A (runs anytime on the artifacts)
```

Run end-to-end:

```bash
cd fpa
node src/index.js run --period data/sample-period.json --out artifacts/2026-04
```

Artifacts written:

- `variances.json` — every line variance vs budget/forecast/prior-month/prior-year-month, sorted by |Δ|, with materiality (high / medium / low) and driver hypotheses on material items.
- `anomalies.json` — flags grouped by severity (critical / warning / info). Kinds: `margin_fade`, `eac_overrun`, `underbilling`, `customer_concentration`, `ar_aging`, `opex_outlier`.
- `scenarios.json` — base, upside, downside, labor_squeeze, schedule_slip. Each scenario has period & annual projections plus per-lever attribution to FY net income.
- `board-brief.md` + `board-brief.json` — headline, drivers, risks, backlog, cash, scenarios, decisions requested. Markdown is rendered deterministically from structured sections.
- `job-metrics.json` — per-job percent-complete, earned revenue, over/under billings, forecast margin, margin fade, retainage.
- `run.json` — trace and artifact index.

## Construction-specific metrics (all in `fpa/src/lib/construction-metrics.js`)

| Metric | Formula |
|---|---|
| Percent complete (POC) | `cost_to_date / eac` |
| Earned revenue | `contract_value × percent_complete` |
| Over/under billings | `billings_to_date − earned_revenue` (negative = underbilled) |
| Forecast margin | `(contract_value − eac) / contract_value` |
| Margin fade | `forecast_margin − bid_gross_margin` |
| Profit at completion | `contract_value − eac` |
| Earned profit | `profit_at_completion × percent_complete` |

These are the AICPA POC formulas, not approximations.

## Materiality

A variance is **high** if |Δ| ≥ $50K AND |Δ%| ≥ 5%; **medium** if |Δ| ≥ $15K AND |Δ%| ≥ 3%. Below either floor, it is **low** and dropped from the brief. Override via the `MATERIALITY` constant in `fpa/src/steps/variance.js`.

## Anomaly thresholds (defaults — tune per company)

- `margin_fade` warning at −2 pts, critical at −5 pts
- `eac_overrun` info at +3% over original bid cost, warning at +5%, critical at +10%
- `underbilling` warning at 3% of earned revenue, critical at 10%
- `customer_concentration` info at 30% share, warning at 50%
- `ar_aging` info at 5% of A/R over 60 days, warning at 10%, critical at 15%
- `opex_outlier` triggers when the period's value has |modified z-score| ≥ 2.5 vs (budget, forecast, prior_month, prior_year_month)

## Scenarios

Levers (multiplicative around 1.0 unless noted):

- `revenue_growth`
- `material_cost_change` / `labor_cost_change` / `subcontractor_change` / `opex_change`
- `schedule_slip_months` (whole-period revenue + 85% of COGS deferred per slip month)

Projection = run-rate × 12 with deferrals subtracted. Each lever's marginal contribution to FY net income is attributed in `lever_contributions`.

## Finance Q&A

Deterministic intent resolver — never invents numbers. Supported intents:

- `revenue_vs_budget`
- `gross_margin`
- `cash_position`
- `worst_job` (largest margin fade)
- `underbillings`
- `ar_aging`
- `backlog`
- `scenario_downside`

Unknown question → explicit "I don't have a structured answer for that" with the list of supported intents.

```bash
node src/index.js ask "How did revenue compare to budget?" --period data/sample-period.json
```

## Workflow as code (Node API)

```js
const { load } = require('./src/loaders/period');
const workflow = require('./src/workflow');

const period = load('./data/sample-period.json');
const result = workflow.run(period);          // full pipeline
workflow.ask('Worst job?', period, result);   // Q&A over artifacts
```

## Where AI fits

AI is invoked **on top of** these artifacts, not in place of them:

- The **board-brief-writer** agent rewrites the deterministic brief in the voice/length the CFO prefers.
- The **variance-analyst** agent expands `driver_hypotheses` into operational narratives using ops context outside the period pack.
- The **finance-qa** agent answers free-form questions by routing through `workflow.ask()` and adding context only when the resolved intent fires.

If the period pack does not contain a fact, the agent must say so — never fabricate. The Q&A resolver returns `intent: 'unknown'` for unsupported questions; agents must respect this.

## Refusal rules

- Do not invent jobs, customers, or numbers not in the period pack.
- Do not produce a board brief without first running `variance`, `anomaly`, and `scenario`.
- Do not modify `bid_gross_margin` or historical baselines — only forecast inputs.
- Never write secrets, API keys, or customer PII into artifacts.

## Output discipline

- Board brief: max ~400 words; every claim cites a structured artifact path.
- Q&A: ≤ 2 sentences + cited source(s).
- Variance memo: top 5 variances by |Δ|, each with cause hypothesis.
- Anomaly report: critical first, then warnings; drop info from the executive view.
