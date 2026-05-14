---
allowed-tools: Read, Write, Bash, Glob
argument-hint: [period-file] [--out <dir>] [--skip <step,step>]
description: Run the full AI-native FP&A monthly close workflow on a construction period pack
---

# FP&A Monthly Close

Run the full FP&A workflow for a construction finance team's monthly close: **$ARGUMENTS**

## Usage

```
/fpa-monthly-close fpa/data/sample-period.json
/fpa-monthly-close fpa/data/2026-04.json --out fpa/artifacts/2026-04
/fpa-monthly-close fpa/data/2026-04.json --skip scenario,board-brief
```

## Pipeline

```
enrich → variance → anomaly → scenario → board-brief
```

## Instructions

1. **Resolve the period pack**
   - Use the first positional arg as the period file. Default to `fpa/data/sample-period.json` if not given.
   - Confirm the file exists and reconciles (gross_profit === revenue − cogs.total within $1) before continuing.

2. **Determine output directory**
   - If `--out <dir>` provided, use it. Otherwise default to `fpa/artifacts/<period.label>`.

3. **Run the workflow**
   - Invoke `node fpa/src/index.js run --period <period-file> --out <out-dir>` (pass `--skip` if provided).
   - Report stderr verbatim if the command fails. Do not retry without user input.

4. **Summarize artifacts**
   - Read `<out-dir>/run.json` and list every artifact written.
   - Report:
     - jobs enriched
     - count of budget variances + the top 3 by |Δ|
     - anomaly counts (critical / warning / info)
     - scenario names + FY net income for each
   - Cite the file path next to each fact.

5. **Suggest next steps**
   - If critical anomalies exist → recommend invoking `fpa-anomaly-detector`.
   - If revenue or net income variance is high-materiality → recommend `fpa-variance-analyst`.
   - If the user mentioned a board meeting → recommend `fpa-board-brief-writer`.

## Hard rules

- Do not modify the period pack.
- Do not quote any number you have not read from an artifact file in this run.
- If the workflow fails, surface the actual error; do not synthesize a brief.
