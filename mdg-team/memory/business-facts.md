# MDG Business Facts

Stable company knowledge every agent loads before working. Facts seeded from the July
2026 planning conversation are marked `verify` and must be confirmed against a live
source before appearing in a final deliverable. Update only through the approval flow
in `/mdg` or `/mdg-retro`.

Format: one fact per line: `- [confidence] fact (source, date added)`

## Company

- [high] Legal name: Midwest Design Group LLC ("MDG"). (Knowify company profile, 2026-07-22)
- [high] Office: 9500 Priority Way W. Drive, Indianapolis. Moved from 6205 Rucker Road on 01/26/2026. (planning conversation, 2026-07-22)
- [high] Company time zone: America/Indianapolis. (Knowify company profile, 2026-07-22)
- [verify] Divisions: TI (Tenant Improvement), MF (Multi-Family), DS (Drywall Services), Engineering/Owner Rep. (planning conversation, 2026-07-22)
- [verify] 2026 revenue target: $46M. (planning conversation, 2026-07-22)

## Systems of record

- [high] Financial actuals: QuickBooks Online, accessed read-only through the QuickBooks MCP. (CLAUDE.md, 2026-07-22)
- [high] Project management and WIP: Knowify, accessed read-only through the Knowify MCP. Advanced Jobs Report exports land in the AJR Reports folder via `/knowify-report` (daily at 23:35). (CLAUDE.md, 2026-07-22)
- [high] CFO dashboard snapshot: `cfo-dashboard/data/snapshot.json`, built from raw QuickBooks pulls in `cfo-dashboard/data/raw/`. Raw files are the verifiable source of truth. (CLAUDE.md, 2026-07-22)
- [verify] Account mapping reference: `cfo-dashboard/ACCOUNT_MAP.md` maps every QuickBooks account to a dashboard KPI. (repo, 2026-07-22)

## Classification rules

- [verify] Priority Way and MDG Warehouse Demising Wall jobs are classified as TI. (planning conversation, 2026-07-22)

## Active jobs referenced in recent analysis

- [verify] Union Flats: watched for margin/revenue movement between forecast versions. (planning conversation, 2026-07-22)
- [verify] Westfield Police: watched for forecast movement; needs job-level bridge. (planning conversation, 2026-07-22)
- [verify] Andretti: watched for H2 shift; confirm whether work moved to 2027. (planning conversation, 2026-07-22)
- [verify] Howard County Jail: revenue and scope changed materially; confirm alternates and deducts are reflected. (planning conversation, 2026-07-22)

## People (roles only; keep compensation out of this file)

- [verify] PMs referenced in meeting prep: Cole, Trevor, Ben. (planning conversation, 2026-07-22)
- [verify] 2026 mid-year field hires referenced in payroll bridges: Ali, Luis, Delbin, Baldemar. (planning conversation, 2026-07-22)
