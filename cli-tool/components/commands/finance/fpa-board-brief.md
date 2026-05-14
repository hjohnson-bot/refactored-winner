---
name: fpa-board-brief
allowed-tools: Read, Write, Edit
argument-hint: '[period-file] [--tone <voice>] [--max-words <n>]'
description: Render the FP&A board brief into CFO-grade narrative
---

# FP&A Board Brief

Rewrite the deterministic board brief into board-ready narrative: **$ARGUMENTS**

## Usage

```
/fpa-board-brief fpa/data/sample-period.json
/fpa-board-brief fpa/data/2026-04.json --tone direct --max-words 400
```

## Instructions

1. Read `fpa/artifacts/<period-label>/board-brief.json` and `board-brief.md`.
2. If either is missing, run `/fpa-monthly-close` first.
3. Delegate to `fpa-board-brief-writer` agent.
4. Confirm every figure in the draft is traceable to `board-brief.json`. If not, remove it.
5. Save the result to `fpa/artifacts/<period-label>/board-brief.final.md`.

## Sections (fixed order)

1. Headline
2. What drove the result
3. Risks & anomalies
4. Backlog & pipeline
5. Cash & working capital
6. FY scenarios
7. Decisions requested

## Rules

- No invented numbers. No invented risks. No softened anomalies.
- Default ~400 words; tighten further only if asked.
- Two decimal places on percent margins, $ figures rounded to nearest $1K / $10K / $100K based on magnitude.
- Do not commit. Only write the file.
