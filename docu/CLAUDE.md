# CLAUDE.md — Docusaurus Site

A **separate** Docusaurus documentation project with its own `package.json`,
`vercel.json`, and `docusaurus.config.ts`. Do not confuse it with the legacy
`docs/` static site or the `cli-tool/docs_to_claude/` Docusaurus content.

This project uses **yarn**, not npm:

```bash
cd docu
yarn          # install
yarn start    # local dev server
yarn build    # static build → build/
```
