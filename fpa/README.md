# FP&A Construction Workflow

An AI-native FP&A workflow for construction finance teams.

This is not a dashboard. It is a **system** for monthly reporting:

```
period.json  →  enrich  →  variance  →  anomaly  →  scenario  →  board brief
                                                                       ↓
                                                                  finance Q&A
```

Every step is deterministic. AI is layered on top — for narrative voice in the board brief, for interpretation of structured signals, for free-form Q&A routed through an intent resolver. The numbers never come from a model.

## Why a workflow, not a dashboard

Most FP&A work breaks down because the analysis lives in too many places. The model is in Excel. The commentary is in a doc. The charts are in a deck. The assumptions are in someone's head. The final explanation gets rebuilt every month.

This package gives the close one shared contract — the **period pack** — and a fixed pipeline that runs on it.

| Concern | Where it lives |
|---|---|
| Inputs | `data/<period>.json` (validated against `src/schema/period.schema.json`) |
| Construction metrics (POC, EAC, fade, billings) | `src/lib/construction-metrics.js` |
| Variance analysis | `src/steps/variance.js` |
| Anomaly detection | `src/steps/anomaly.js` |
| Scenario engine | `src/steps/scenario.js` |
| Board brief renderer | `src/steps/board-brief.js` |
| Finance Q&A resolver | `src/steps/qa.js` |
| Orchestrator | `src/workflow.js` |
| CLI | `src/index.js` |

Artifacts land in `artifacts/<period-label>/`. The board brief is a deterministic render of structured sections, not a generated essay — the same period pack produces the same brief, every time.

## Quick start

```bash
cd fpa
node src/index.js run --period data/sample-period.json --out artifacts/2026-04
node src/index.js ask "How did revenue compare to budget?" --period data/sample-period.json
node test/workflow.test.js
```

You will see, on the sample data:

- 5 active jobs enriched
- 19 budget variances
- 14 anomaly flags across 6 kinds
- 5 scenarios projected to FY
- A board brief at `artifacts/2026-04/board-brief.md`

## The five workflow steps

### 1. Variance

Every P&L line is compared against four baselines: budget, forecast, prior month, prior year month. Each variance gets:

- `delta`, `pct`
- `materiality` — `high` (|Δ| ≥ $50K and |Δ%| ≥ 5%), `medium`, `low`
- `direction` — `favorable` / `unfavorable` (cost lines are inverted)
- `driver_hypotheses` — for material variances against budget, candidate drivers pulled from the same period (margin fade, underbillings, etc.)

### 2. Anomaly

Six detector kinds:

| Kind | Trigger |
|---|---|
| `margin_fade` | Job's forecast margin drifts below bid margin by ≥ 2 pts (warning) / 5 pts (critical) |
| `eac_overrun` | EAC exceeds original bid cost by ≥ 3% (info) / 5% (warning) / 10% (critical) |
| `underbilling` | Job is underbilled by ≥ 3% (warning) / 10% (critical) of earned revenue |
| `customer_concentration` | Top customer ≥ 30% (info) / 50% (warning) of earned revenue |
| `ar_aging` | A/R over 60 days ≥ 5% (info) / 10% (warning) / 15% (critical) of total |
| `opex_outlier` | Modified z-score ≥ 2.5 vs (budget, forecast, prior_month, prior_year_month) |

### 3. Scenario

Six levers — applied as multiplicative shifts (or whole-month deferrals for schedule slip):

```js
{
  revenue_growth,
  material_cost_change,
  labor_cost_change,
  subcontractor_change,
  opex_change,
  schedule_slip_months,
}
```

For each scenario, the engine returns the period projection, the annualized FY projection, and a per-lever attribution to FY net income. Defaults: `base`, `upside`, `downside`, `labor_squeeze`, `schedule_slip`.

### 4. Board brief

Seven fixed sections:

1. Headline
2. What drove the result
3. Risks & anomalies
4. Backlog & pipeline
5. Cash & working capital
6. FY scenarios
7. Decisions requested

Rendered deterministically. The `fpa-board-brief-writer` agent rewrites it for tone — but cannot change a number or invent a risk.

### 5. Finance Q&A

`node src/index.js ask "<question>" --period <file>` routes through a deterministic intent resolver. Supported intents:

- `revenue_vs_budget`
- `gross_margin`
- `cash_position`
- `worst_job` (largest margin fade)
- `underbillings`
- `ar_aging`
- `backlog`
- `scenario_downside`

Unknown question → `intent: 'unknown'` with the supported list. The resolver returns `{answer, data, sources}` so the calling agent can quote facts and cite source paths instead of hallucinating.

## Claude Code components

The `cli-tool/components/` directory ships agents, commands, and a skill that wrap this workflow:

| Component | Purpose |
|---|---|
| `skills/finance/fpa-construction-workflow/SKILL.md` | The canonical knowledge for this workflow |
| `agents/finance/fpa-orchestrator.md` | Runs the full pipeline |
| `agents/finance/fpa-variance-analyst.md` | Writes the variance memo |
| `agents/finance/fpa-anomaly-detector.md` | Triages anomaly flags |
| `agents/finance/fpa-scenario-modeler.md` | Designs and interprets scenarios |
| `agents/finance/fpa-board-brief-writer.md` | Rewrites the brief in CFO voice |
| `agents/finance/fpa-finance-qa.md` | Answers ad-hoc questions over artifacts |
| `commands/finance/fpa-monthly-close.md` | `/fpa-monthly-close` slash command |
| `commands/finance/fpa-variance.md` | `/fpa-variance` |
| `commands/finance/fpa-anomaly-scan.md` | `/fpa-anomaly-scan` |
| `commands/finance/fpa-scenario.md` | `/fpa-scenario` |
| `commands/finance/fpa-board-brief.md` | `/fpa-board-brief` |
| `commands/finance/fpa-qa.md` | `/fpa-qa` |

The skill is the contract; the agents call the workflow; the commands orchestrate the agents.

## Where AI fits

AI is useful when finance logic is already structured. Without that structure, it is just another chatbot. With it:

- The **board brief** can be rewritten in CFO voice without changing any fact.
- The **variance memo** can expand structured `driver_hypotheses` using ops context.
- **Q&A** can answer "which job is fading the most?" by routing to a deterministic resolver that returns the fact plus the JSON path it came from.

If a question requires a fact not in the period pack, the resolver and the agents both refuse rather than guess.

## Extending

- New baseline → add a key under `plan` in the period pack. Variance picks it up automatically.
- New anomaly kind → add a detector function in `src/steps/anomaly.js` that returns `{severity, kind, subject, signal, evidence, recommendation}`.
- New scenario lever → add it in `src/steps/scenario.js:applyLevers()` and document it in the skill.
- New Q&A intent → add an entry to `src/steps/qa.js:intents` with a regex matcher and an `answer(artifacts)` function.

## Tests

`node test/workflow.test.js` runs the full pipeline on the sample period and asserts:

- Job enrichment matches input count and produces in-range percent_complete
- Variances are sorted by |Δ| descending
- Anomaly detection produces at least one flag on the sample
- All five default scenarios run
- The board brief contains every required section heading
- Q&A returns the expected intents (and `unknown` for unsupported questions)
