# CLAUDE.md — CLI tool

The npm package (`claude-code-templates` / `cct`) and the component library.

Tests live here, not at the repo root — **root `npm test` is a no-op `echo`**.
Run `cd cli-tool && npm test`; see `package.json` for the watch/coverage/
unit/integration/e2e variants.

## Component Creation Workflow

1. Create component file in `components/{type}/{category}/{name}.md`
2. Use descriptive hyphenated names (kebab-case)
3. Include clear descriptions and usage examples
4. **REVIEW with the component-reviewer agent** — this step is mandatory
5. Fix any issues identified by the reviewer
6. Run `python scripts/generate_components_json.py` to update the catalog

The reviewer returns prioritized feedback: **❌ Critical Issues** must be fixed
before merge, **⚠️ Warnings** should be fixed, **📋 Suggestions** are optional.

Skills are the one type with a different layout: `{category}/{skill-name}/SKILL.md`
plus any reference files alongside it.

**Do not add non-component `.md` files under `components/`.** The security
auditor (`src/security-audit.js`) recursively scans every `.md` file in that
tree and validates it as a component, and the `component-security-validation`
workflow triggers on `components/**/*.md`. Guidance files belong here instead.
