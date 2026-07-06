---
allowed-tools: Bash(ruff:*), Bash(black:*), Bash(flake8:*), Bash(isort:*), Bash(mypy:*), Bash(pylint:*), Bash(python:*), Bash(python3:*), Bash(ls:*), Bash(find:*), Read, Edit
argument-hint: [--fix] [path]
description: Lint and format this repo's Python code (scripts/, cfo-dashboard/, database tooling)
---

# Python Linter

Check (and optionally fix) the Python code in this repository for style, formatting, and type issues: $ARGUMENTS

This repo is mostly Node.js, but it ships real Python that this command targets:
`scripts/*.py` (catalog + blog + deploy generators), `cfo-dashboard/scripts/*.py`
(snapshot + distributables builders), and any Python under `database/`. JavaScript/TypeScript
is **not** in scope here — use the project's own JS tooling for that.

## Scope rules

- **Default target** (no path argument): every tracked `.py` file in `scripts/` and
  `cfo-dashboard/scripts/`.
- **Path argument**: lint only that file or directory.
- **Never** touch `node_modules/`, `.venv/`, `venv/`, `dist/`, `build/`, `__pycache__/`,
  or anything git-ignored.
- **Mode**: report-only by default. Only apply changes when `--fix` is passed.

## Step-by-step process

1. **Discover the Python.** List the in-scope files (`git ls-files '*.py'` filtered to the
   scope above, or the given path). If there are zero, say so and stop — do not go hunting
   elsewhere.
2. **Detect config.** Look for `pyproject.toml`, `.flake8`, `setup.cfg`, or `ruff.toml` at
   the repo root and honor whatever is configured (line length, ignores, profile). If none
   exists, use the defaults in "Assumed defaults" below and say you did.
3. **Pick the available tools.** Prefer `ruff` (it replaces flake8+isort+pyupgrade) if
   installed; otherwise fall back to `black` + `isort` + `flake8`. Run `mypy` only if the
   project already configures it. Skip any tool that isn't installed — note it as skipped,
   don't try to install it.
4. **Run in this order** and capture each tool's output:
   - Formatting: `ruff format` (or `black`) then import order (`ruff check --select I` or `isort`)
   - Lint: `ruff check` (or `flake8`)
   - Types (only if configured): `mypy`
5. **Report-only mode (default):** run every tool in check mode
   (`ruff format --check`, `ruff check`, `black --check`, `isort --check-only`) so nothing
   on disk changes. Collect the findings.
6. **Fix mode (`--fix`):** apply auto-fixable formatting and import order
   (`ruff format`, `ruff check --fix`, or `black` + `isort`), then re-run the linters in
   check mode to report what remains (things a human must fix — undefined names, unused
   imports it won't auto-remove, type errors). Show the list of files you changed.
7. **Summarize** in the exact format below.

## Assumed defaults (when the repo has no config)

- Line length: **88** (Black default)
- isort profile: **black**
- flake8 ignores: `E203,W503`
- Exclude: `.git,__pycache__,node_modules,.venv,venv,dist,build`

## Output format

Always end with this summary block, filled in:

```
Python Lint — <report | fixed>
──────────────────────────────────
Files scanned:   <N>
Files changed:   <N>   (0 in report mode)
Tools run:       ruff, mypy        (skipped: pylint — not installed)
Remaining issues: <N>
──────────────────────────────────
```

If there are remaining issues, list them grouped by file, each as
`path:line  CODE  message`, most severe first. If everything is clean, say
"✅ All clean — no issues found."

## Example of a great result

```
$ /lint

Scanned 6 files in scripts/ and cfo-dashboard/scripts/.
Config: none found — using assumed defaults (line length 88, isort profile black).
ruff installed; mypy not configured (skipped).

Python Lint — report
──────────────────────────────────
Files scanned:   6
Files changed:   0
Tools run:       ruff        (skipped: mypy — not configured, pylint — not installed)
Remaining issues: 3
──────────────────────────────────

scripts/generate_components_json.py
  12:1   F401  'os.path' imported but unused
  88:80  E501  line too long (94 > 88)
cfo-dashboard/scripts/build_snapshot.py
  40:5   F841  local variable 'total' is assigned to but never used

Run `/lint --fix` to auto-fix formatting; the 3 issues above need manual edits.
```

## Do NOT

- ❌ Reformat files outside the scope, or files the user didn't ask about — no repo-wide `black .`
- ❌ Apply any change in the default (report-only) mode; `--fix` is required to write
- ❌ Auto-delete code to satisfy a linter (e.g. ripping out an "unused" import that's a
  side-effecting import) — flag it and let the user decide
- ❌ Install linters, create config files, or change line-length/ignore settings that the
  repo already defines
- ❌ Touch `node_modules/`, virtualenvs, build output, or git-ignored files
- ❌ Claim success if a tool errored out — report the failure with its output
