---
allowed-tools: Bash(npm:*), Bash(npx:*), Bash(jest:*), Bash(cd:*), Bash(ls:*), Bash(cat:*), Read
argument-hint: [--unit | --integration | --e2e | --coverage] [name-pattern]
description: Run this repo's Jest test suite (lives in cli-tool/) with the right scope
---

# Test Runner

Run the test suite for this repository: $ARGUMENTS

## Read this first — where the tests live

The Jest suite lives in **`cli-tool/`**. The root `npm test` is a no-op `echo` — running
it from the repo root does nothing useful. Every test command must run from `cli-tool/`.

Available scripts (defined in `cli-tool/package.json`):

| Script | What it runs |
|---|---|
| `npm test` | Full Jest suite |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Full suite + coverage report |
| `npm run test:unit` | `tests/unit` only |
| `npm run test:integration` | `tests/integration` only |
| `npm run test:e2e` | `tests/e2e` only |

Target: **70%+ coverage** on critical paths and error handling.

## Argument → command mapping

- (no args) → `cd cli-tool && npm test`
- `--unit` → `cd cli-tool && npm run test:unit`
- `--integration` → `cd cli-tool && npm run test:integration`
- `--e2e` → `cd cli-tool && npm run test:e2e`
- `--coverage` → `cd cli-tool && npm run test:coverage`
- a bare `name-pattern` (e.g. `installer`) → `cd cli-tool && npx jest -t "installer"`
  (or a path if it looks like one: `cd cli-tool && npx jest tests/unit/installer.test.js`)

Flags may combine with a pattern, e.g. `/test --unit installer`.

## Step-by-step process

1. **Confirm the suite exists.** If `cli-tool/package.json` is missing, stop and say the
   test suite couldn't be located.
2. **Map the arguments** to exactly one command using the table above.
3. **Run it from `cli-tool/`.** Always `cd cli-tool` first — never run tests from the repo root.
4. **Read the results.** Parse pass/fail counts and any failing test names + assertion output.
5. **On failure:** show the failing test name, the file, and the relevant assertion/stack
   snippet. Give a one-line hypothesis of the cause. Do **not** edit source or tests to make
   them pass unless the user explicitly asked you to fix them.
6. **Summarize** in the exact format below.

## Output format

Always end with this block, filled in:

```
Test Run — <scope>
──────────────────────────────────
Command:   cd cli-tool && npm run test:unit
Result:    PASS | FAIL
Tests:     <passed> passed, <failed> failed, <skipped> skipped  (<total> total)
Suites:    <passed>/<total>
Coverage:  <XX%>   (only when --coverage was run)
Duration:  <Ns>
──────────────────────────────────
```

If anything failed, follow the block with a "Failures" list — each entry is the test name,
its file, and the failing assertion — most informative first.

## Example of a great result

```
$ /test --unit installer

Running: cd cli-tool && npx jest tests/unit -t "installer"

Test Run — unit (pattern: "installer")
──────────────────────────────────
Command:   cd cli-tool && npx jest tests/unit -t "installer"
Result:    FAIL
Tests:     11 passed, 1 failed, 0 skipped  (12 total)
Suites:    2/3
Coverage:  —
Duration:  3.4s
──────────────────────────────────

Failures:
• installer › installs an agent into .claude/agents  (tests/unit/installer.test.js:42)
    Expected path ".claude/agents/frontend-developer.md" to exist, received ENOENT.
    Likely cause: the install target dir isn't created before write when the folder is new.

The other 11 installer tests pass. Want me to look at the create-dir logic?
```

## Do NOT

- ❌ Run `npm test` from the repo root (it's a no-op echo) — always `cd cli-tool` first
- ❌ Edit source files or tests to force a green run unless the user explicitly asks
- ❌ Delete, skip, or `.only`-narrow tests to hide a failure
- ❌ Report "all passing" without showing the actual counts from Jest's output
- ❌ Install new test frameworks or rewrite the test config — use the existing scripts
- ❌ Invent coverage numbers; only report coverage when `--coverage` actually ran
