---
allowed-tools: Bash(cd:*), Bash(npm:*), Bash(npx:*), Bash(black:*), Bash(flake8:*), Bash(isort:*), Bash(ruff:*), Bash(mypy:*), Bash(pylint:*), Bash(ls:*), Bash(cat:*), Bash(git:*)
argument-hint: [path] | [--fix] | [--check]
description: Lint and format the changed code with the right tool for its language (Python + JS/TS), then report what changed
---

# Linter

Lint and format the code being changed, using the correct tool for each language in this mixed repo. Default to reporting issues; only auto-fix when asked. `$ARGUMENTS`

## Purpose

This repo mixes **Python** (`scripts/`, `cfo-dashboard/`) and **JavaScript/TypeScript** (`cli-tool/`, `dashboard/`, `docu/`). Run the linter that matches the files under change — don't run Python tools on the Astro dashboard or vice-versa. Use this before committing so style stays consistent and diffs stay small.

## Preconditions

1. Determine which files changed: `git status --short` / `git diff --name-only`.
2. Prefer the tool the project already configures (check for `pyproject.toml`, `.flake8`, `ruff.toml`, `.eslintrc*`, `.prettierrc*`). If none is configured, use the sensible defaults below and say so.
3. `--fix` mutates files (formatting + safe autofixes). `--check` only reports and must exit non-zero on problems. Default (no flag) = report, don't write.

## Process

1. **Scope** to the changed area from `$ARGUMENTS` or `git status`. If a path is given, lint only that path.
2. **Python files** → run, in order: `isort` (import order) → `black` (format) → `flake8` (style) → `mypy` (types, only if configured). `ruff` may substitute for isort+flake8 if the project uses it.
3. **JS/TS files** → run the project's ESLint/Prettier if configured (`npx eslint`, `npx prettier`). If not configured, note that and skip rather than imposing a random style.
4. **With `--fix`**: apply `black`, `isort`, `prettier` and re-run the checkers to confirm the tree is clean afterward. Show `git diff --stat` of what formatting changed.
5. **Report** using the output format below. List each remaining issue with `file:line — rule — message`.

## Command Reference

### Python
```bash
isort .            # or: isort --check-only .
black .            # or: black --check .
flake8 . --max-line-length=88 --extend-ignore=E203,W503
mypy .             # only if mypy is configured
ruff check .       # if the project uses ruff (replaces flake8/isort)
ruff check --fix .
```

### JS / TS (only if the project configures them)
```bash
npx prettier --write .     # or --check .
npx eslint . --fix         # or without --fix to report
```

## Output Format

End with this block, filled from the real run:

```
Lint Summary
──────────────────────────────────
Scope:    <paths / language(s) linted>
Tools:    <isort, black, flake8, ... or eslint/prettier>
Mode:     report | --fix | --check
Result:   CLEAN ✅  |  ISSUES ❌ (<N> remaining)
Fixed:    <N files reformatted>  (only with --fix)
──────────────────────────────────
```

If ISSUES, list each below as:
`❌ <file>:<line> — <rule/code> — <message>`

## Examples

**Example 1 — Python, report only, clean:**
> Ran `isort --check-only . && black --check . && flake8 .` on `scripts/`.
> ```
> Result:   CLEAN ✅
> Tools:    isort, black, flake8
> ```

**Example 2 — Python, `--fix`:**
> Ran black + isort with `--fix` on `cfo-dashboard/scripts/build_snapshot.py`.
> ```
> Result:   CLEAN ✅
> Fixed:    1 file reformatted (black: 1, isort: 1)
> ```
> `git diff --stat`: `build_snapshot.py | 6 +++---`. Remaining flake8: none.

## Never Do

- **Never impose a formatter on a language the project doesn't configure it for** (e.g. don't ESLint-fix the whole dashboard on a whim) — note it's unconfigured and skip.
- **Never run Python linters on JS/TS files or vice-versa.**
- **Never auto-fix under the default mode** — only `--fix` writes to files. `--check`/default report only.
- Never silence a real error by adding blanket `# noqa` / `eslint-disable` just to get a clean run — report it instead.
- Never commit or push from this command — it lints and reports; committing is a separate step.
