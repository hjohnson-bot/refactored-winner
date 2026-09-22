# CLAUDE.md — Component Library

## Component Creation Workflow

1. Create component file in `cli-tool/components/{type}/{category}/{name}.md`
2. Use descriptive hyphenated names (kebab-case)
3. Include clear descriptions and usage examples
4. **REVIEW with the component-reviewer agent** — this step is mandatory
5. Fix any issues identified by the reviewer
6. Run `python scripts/generate_components_json.py` to update the catalog

The reviewer returns prioritized feedback: **❌ Critical Issues** must be fixed
before merge, **⚠️ Warnings** should be fixed, **📋 Suggestions** are optional.

Skills are the one type with a different layout: `{category}/{skill-name}/SKILL.md`
plus any reference files alongside it.
