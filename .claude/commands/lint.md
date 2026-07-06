---
allowed-tools: Bash(npx:*), Bash(node:*), Bash(python3:*), Bash(cd:*), Bash(ls:*), Read, Grep, Glob
argument-hint: "[all | js | astro | python | <path>]"
description: Lint/check only what THIS repo is configured for (JS syntax, Astro build check, Python compile) and report a fixed-format table
---

# Linter

Check code quality using only the tools this repository is actually set up for. This is a JavaScript/Astro repo with supporting Python scripts — there is no flake8/black/pylint/mypy configuration here, so do not run them.

## What "lint" means in this repo

| Area | Check | Why this and not more |
|------|-------|----------------------|
| `js` | `node --check` on every changed/target `.js`/`.mjs` file | No ESLint config exists at root — syntax validity is the honest baseline |
| `astro` | `cd dashboard && npx astro check` (if `@astrojs/check` resolves; otherwise `npx astro build --dry-run` is not a thing — fall back to `npx astro sync`) | Catches TS/component errors in the dashboard |
| `python` | `python3 -m py_compile <file>` for every target `.py` under `scripts/`, `cfo-dashboard/scripts/`, `mdg-powerbi/scripts/` | No linter configs exist; compile check catches real breakage |

If you discover a real linter config while scanning (e.g. someone adds `.eslintrc` or `pyproject.toml [tool.black]` later), USE it and say which config you found.

## Process

1. **Scope from `$ARGUMENTS`:** empty/`all` → all three areas on files changed vs the default branch (`git diff --name-only origin/<default>...HEAD`), or the whole repo if not on a branch. `js`/`astro`/`python` → that area. A path → just that path with the matching checker.
2. **Run the checks.** Collect every error with file:line.
3. **Report** in the exact format below.
4. **Auto-fix policy:** only trivially safe fixes (trailing whitespace, missing final newline) and only when the user asked to fix. Otherwise report only.

## Output format (always)

```
Lint Results — <scope>
──────────────────────────────────────────
Area     Files   Status   Issues
js       14      ✅ PASS   0
astro    1       ⚠️  WARN   2 type warnings (non-blocking)
python   6       ❌ FAIL   1 syntax error
──────────────────────────────────────────
cfo-dashboard/scripts/build_snapshot.py:214  SyntaxError: unexpected indent
```

Every issue line: `path:line  <tool>: <message>`.

## Example of a great run

User: `/lint python`
```
Lint Results — python
──────────────────────────────────────────
Area     Files   Status   Issues
python   9       ✅ PASS   0
──────────────────────────────────────────
```
Follow-up line: "All 9 Python scripts compile clean (scripts/, cfo-dashboard/scripts/, mdg-powerbi/scripts/)."

## Do NOT

- Do NOT run flake8, black, isort, pylint, or mypy — none are configured here and their defaults would produce noise, not signal.
- Do NOT install any linter globally or add config files unless explicitly asked.
- Do NOT reformat files wholesale; report first.
- Do NOT lint `node_modules/`, `cli-tool/components/**` (shipped product catalog content), or generated files (`docs/components.json`, `cfo-dashboard/downloads/`).
- Do NOT hide warnings to make the table look green — WARN is a valid, honest status.
