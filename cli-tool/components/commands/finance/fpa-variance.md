---
allowed-tools: Read, Bash
argument-hint: [period-file] [--baseline budget|forecast|prior_month|prior_year_month]
description: Generate a variance memo for a construction finance monthly close
---

# FP&A Variance Memo

Produce a variance memo from the FP&A workflow's variance artifact: **$ARGUMENTS**

## Usage

```
/fpa-variance fpa/data/sample-period.json
/fpa-variance fpa/data/2026-04.json --baseline forecast
```

## Instructions

1. **Locate or generate artifacts**
   - Determine the period label from the period pack.
   - Look for `fpa/artifacts/<label>/variances.json`. If missing, run `/fpa-monthly-close` first or invoke `fpa-orchestrator`.

2. **Pick the baseline**
   - Default: `budget`. Allow `forecast`, `prior_month`, `prior_year_month` via `--baseline`.
   - Confirm `variances.by_baseline[<baseline>]` is populated.

3. **Write the memo** (delegate to `fpa-variance-analyst` agent)
   - Headline: revenue, GP, net income variances vs the chosen baseline.
   - Top 5 material variances by |Δ| with driver_hypotheses and job-level evidence.
   - "What we don't yet know" section listing OPEN questions.

4. **Save**
   - Write to `fpa/artifacts/<label>/variance-memo.md`.

## Rules

- Every $ figure must cite the JSON path it came from.
- Do not include scenarios, anomaly flags, or decision items — those belong to other commands.
- Maximum 400 words.
