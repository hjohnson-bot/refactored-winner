---
allowed-tools: Read, Bash
argument-hint: "<question>" --period <period-file>
description: Ask a finance question grounded in the FP&A workflow artifacts
---

# FP&A Finance Q&A

Answer an ad-hoc finance question using only the FP&A workflow artifacts: **$ARGUMENTS**

## Usage

```
/fpa-qa "How did revenue compare to budget?" --period fpa/data/sample-period.json
/fpa-qa "Which job has the biggest margin fade?" --period fpa/data/sample-period.json
/fpa-qa "Show me the downside scenario" --period fpa/data/sample-period.json
```

## Instructions

1. Treat the question as a single string argument.
2. Invoke `node fpa/src/index.js ask "<question>" --period <period-file>`.
3. Parse the output:
   - If `intent` is one of the supported intents, quote the `answer` and `sources` verbatim.
   - If `intent === 'unknown'`, tell the user the resolver did not match. Show the supported list:
     - `revenue_vs_budget`
     - `gross_margin`
     - `cash_position`
     - `worst_job`
     - `underbillings`
     - `ar_aging`
     - `backlog`
     - `scenario_downside`
4. Delegate to `fpa-finance-qa` agent for any additional context.

## Rules

- Never invent numbers. The resolver returns structured facts — quote them.
- Two-sentence answers max.
- If the user wants per-job lookup or an intent not yet supported, do not approximate. Propose extending `fpa/src/steps/qa.js:intents`.
