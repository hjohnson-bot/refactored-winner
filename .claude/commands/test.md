---
allowed-tools: Bash(npm:*), Bash(node:*), Bash(python3:*), Bash(cd:*), Bash(ls:*), Read, Grep, Glob
argument-hint: "[all | cli | api | finance | <path>]"
description: Run this repo's real test suites (cli-tool Jest, api tests, finance validations) and report a pass/fail table
---

# Test Runner

Run the test suites that actually exist in THIS repository and report results in a fixed format. This repo is Node.js + Astro + Python scripts — there is no pytest, no Django, no unittest here.

## Test areas in this repo

| Area | Command | What it covers |
|------|---------|----------------|
| `cli` | `cd cli-tool && npm test` | Jest suite for the CLI tool (the main product) |
| `api` | `cd api && npm test` | Legacy Vercel API endpoint tests (required before deploy) |
| `finance` | `python3 -c "import json; json.load(open('cfo-dashboard/data/snapshot.json'))"` + `node --check cfo-dashboard/app.js` + `node --check cfo-dashboard/scripts/refresh-quickbooks.mjs` | CFO dashboard data integrity + JS syntax |

The root `npm test` is a no-op (`echo 'No tests specified'`) — never report it as a passing suite.

## Process

1. **Determine scope from `$ARGUMENTS`:**
   - Empty or `all` → run every area above.
   - `cli`, `api`, or `finance` → run just that area.
   - A file path → run only the suite whose area contains that path (e.g. anything under `cli-tool/` → `cli`).
2. **Before running**, confirm each area's prerequisites exist (`cli-tool/package.json`, `api/package.json`, `cfo-dashboard/data/snapshot.json`). If `node_modules` is missing in an area, run `npm install` there first and say so.
3. **Run each suite sequentially.** Capture pass/fail counts and the first failure message if any.
4. **Report** using the exact output format below. Never bury a failure in prose.

## Output format (always use this)

```
Test Results — <date>
──────────────────────────────────────────
Area      Status   Detail
cli       ✅ PASS   112 passed, 0 failed (14.2s)
api       ✅ PASS   8 passed, 0 failed (2.1s)
finance   ❌ FAIL   snapshot.json: invalid JSON at line 4102
──────────────────────────────────────────
Overall: FAIL (1 of 3 areas failing)
```

If anything failed, follow the table with:
- The exact failing test name(s) and error output (trimmed to the relevant lines)
- The most likely cause in one sentence
- The suggested next command to debug it

## Example of a great run

User: `/test cli`
```
Test Results — 2026-07-06
──────────────────────────────────────────
Area      Status   Detail
cli       ✅ PASS   112 passed, 0 failed (13.8s)
──────────────────────────────────────────
Overall: PASS
```
One line after the table: "cli-tool suite green — safe to publish or deploy."

## Do NOT

- Do NOT run pytest, flake8, unittest, or `manage.py` — this is not a Python application repo.
- Do NOT report the root `npm test` no-op as a real passing suite.
- Do NOT install global packages; only `npm install` inside an area that's missing `node_modules`.
- Do NOT stop at the first failing area when scope is `all` — run everything, then report all results together.
- Do NOT edit any source files to "make tests pass" — report failures, fix only when asked.
