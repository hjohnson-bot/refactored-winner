---
allowed-tools: Read, Bash
argument-hint: [period-file] [--severity critical|warning|info|all]
description: Triage FP&A anomaly flags for a construction monthly close
---

# FP&A Anomaly Scan

Triage anomaly flags produced by the FP&A workflow for: **$ARGUMENTS**

## Usage

```
/fpa-anomaly-scan fpa/data/sample-period.json
/fpa-anomaly-scan fpa/data/2026-04.json --severity critical
```

## Instructions

1. Read `fpa/artifacts/<period-label>/anomalies.json`. If missing, run the workflow first.
2. Filter by `--severity` (default: include `critical` and `warning`; `info` only when explicitly requested).
3. Delegate to `fpa-anomaly-detector` agent.
4. The agent groups flags by kind, assigns owners (PM / Billing / Controller / Sales), and quotes the recommendation verbatim.
5. Report counts + the grouped triage list.

## Anomaly kinds the engine emits

- `margin_fade` (per job)
- `eac_overrun` (per job)
- `underbilling` (per job)
- `customer_concentration` (portfolio)
- `ar_aging` (portfolio)
- `opex_outlier` (per opex line, MAD-based)

## Rules

- Do not invent new kinds.
- Do not paraphrase the `recommendation` field — quote it.
- If zero flags at the requested severity, say so plainly.
