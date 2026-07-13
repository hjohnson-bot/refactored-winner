---
allowed-tools: Bash(cd:*), Bash(npm:*), Bash(npx:*), Bash(jest:*), Bash(pytest:*), Bash(python:*), Bash(python3:*), Bash(coverage:*), Bash(ls:*), Bash(cat:*)
argument-hint: [path or -k pattern] | [--unit|--integration|--e2e] | [--coverage]
description: Run this repo's test suites (Jest for the CLI, pytest for Python) and report a clear pass/fail summary
---

# Test Runner

Run the correct test suite for whatever part of this repo is being changed, then report a clean pass/fail summary. `$ARGUMENTS`

## Purpose

This repo is **not** a single-language project. Pick the right runner for the code under test:

- **`cli-tool/` (the published npm CLI)** — the real test suite. Jest, run from `cli-tool/`. The **root `npm test` is a no-op** (`echo 'No tests specified'`), so never rely on it.
- **`scripts/`, `cfo-dashboard/`** — Python. Use `pytest` if tests exist, otherwise run the module directly to confirm it executes.
- **`dashboard/`, `docu/`** — Astro/Docusaurus; these have no unit suite. Prefer `npm run build` to catch breakage.

Use this command before committing, before a version bump, and before any deploy (broken CLI tests break download tracking).

## Preconditions

1. Know which half of the repo changed. If unsure, run `git status --short` and infer from the paths.
2. For Jest: `cd cli-tool` first — the Jest config and `node_modules` live there, not at the repo root.

## Process

1. **Detect scope** from `$ARGUMENTS` and `git status`:
   - Paths under `cli-tool/` → Jest.
   - Paths under `scripts/` or `cfo-dashboard/` → pytest/python.
   - No argument → run the full Jest suite (the primary suite), then mention the Python check if Python files changed.
2. **Run the suite** (see command reference below). Pass `$ARGUMENTS` through: a bare path scopes the run, `-k <pattern>` filters by name, `--coverage`/`--unit`/`--integration`/`--e2e` map to the scripts below.
3. **On failure**, do NOT stop at the summary line. Show the failing test name(s), the assertion/diff, and the file:line. Re-run just the failing test with `-t "<name>"` (Jest) or `-k "<name>"` (pytest) to confirm it's real and not flaky.
4. **Report** using the output format below. Never claim "tests pass" unless the runner exited 0 — quote the exit status.

## Command Reference

### Jest — the CLI suite (primary)
```bash
cd cli-tool
npm test                 # full suite
npm run test:unit        # tests/unit only
npm run test:integration # tests/integration only
npm run test:e2e         # tests/e2e only
npm run test:coverage    # coverage report (aim 70%+)
npx jest path/to/file.test.js          # one file
npx jest -t "installs a single agent"  # one test by name
```

### pytest — Python (scripts / cfo-dashboard)
```bash
pytest -v                          # if a tests/ dir exists
pytest -k "snapshot"               # filter by name
python scripts/generate_components_json.py   # smoke-run a generator that has no tests
python cfo-dashboard/scripts/build_snapshot.py --check 2>/dev/null || \
  python cfo-dashboard/scripts/build_snapshot.py   # confirm the build script runs
```

## Output Format

Always end with this block, filled in from the real run:

```
Test Summary
──────────────────────────────────
Suite:    <Jest cli-tool | pytest scripts | ...>
Command:  <exact command run>
Result:   PASS ✅  |  FAIL ❌   (exit <code>)
Tests:    <passed> passed, <failed> failed, <skipped> skipped
Coverage: <NN%>  (only if --coverage was run)
──────────────────────────────────
```

If FAIL, list each failure underneath as:
`❌ <test name> — <file>:<line> — <one-line reason>`

## Examples

**Example 1 — full CLI suite, all green:**
> Ran `cd cli-tool && npm test`.
> ```
> Test Summary
> ──────────────────────────────────
> Suite:    Jest (cli-tool)
> Command:  npm test
> Result:   PASS ✅  (exit 0)
> Tests:    214 passed, 0 failed, 3 skipped
> ──────────────────────────────────
> ```

**Example 2 — scoped run with a failure:**
> Ran `cd cli-tool && npx jest -t "installs a single agent"`.
> ```
> Result:   FAIL ❌  (exit 1)
> Tests:    0 passed, 1 failed, 0 skipped
> ```
> ❌ installs a single agent — tests/unit/install.test.js:42 — expected `.claude/agents/frontend-developer.md` to exist; installer wrote to `.claude/agent/` (typo in destPath).
> Re-ran in isolation — reproduces, not flaky.

## Never Do

- **Never run the root `npm test`** and report its output as a pass — it's a no-op echo. Jest lives in `cli-tool/`.
- **Never report "passing" without the exit code being 0.** Silence from a runner is not success.
- **Never auto-fix a failing test's assertion to make it green.** Report the failure; fix the code (or ask) — don't move the goalposts.
- Never `cd` out of `cli-tool` mid-run for Jest, and never install global test tools without saying so.
- Never commit or push from this command — it only runs tests and reports.
