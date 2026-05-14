---
name: fpa-scenario
allowed-tools: Read, Write, Edit, Bash
argument-hint: '[period-file] [--lever name=value] [--lever name=value]...'
description: Run a custom FP&A scenario for a construction finance team
---

# FP&A Scenario

Run a what-if scenario through the deterministic FP&A engine: **$ARGUMENTS**

## Usage

```
/fpa-scenario fpa/data/sample-period.json --lever material_cost_change=0.08 --lever schedule_slip_months=1
/fpa-scenario fpa/data/sample-period.json --lever revenue_growth=-0.10
```

## Supported levers

| Lever | Effect |
|---|---|
| `revenue_growth` | Scales period revenue (multiplicative around 1.0) |
| `material_cost_change` | Scales COGS materials line |
| `labor_cost_change` | Scales COGS labor line |
| `subcontractor_change` | Scales COGS subcontractors line |
| `opex_change` | Scales opex_total |
| `schedule_slip_months` | Whole months of period revenue + 85% of COGS deferred out of FY |

## Instructions

1. Parse `--lever <name>=<value>` pairs into a JSON scenario named `custom`.
2. Edit `fpa/src/steps/scenario.js`'s `DEFAULT_SCENARIOS` to add the entry (or pass via the workflow API).
3. Run `node fpa/src/index.js run --period <period> --out fpa/artifacts/<label>`.
4. Delegate interpretation to `fpa-scenario-modeler` agent.
5. Report:
   - Annual revenue, GM%, net income for `custom`
   - `lever_contributions` sorted by |Δ to net income|
   - Comparison vs `base`: net income Δ and direction

## Rules

- Refuse `revenue_growth` outside [-0.5, 0.5] unless the user gives written justification.
- Refuse levers not listed above — propose extending `scenario.js` instead.
- Never approximate a projection in your head. Rerun the engine.
