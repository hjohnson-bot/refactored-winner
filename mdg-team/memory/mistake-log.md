# Mistake Log

Corrections that must never repeat. Every agent checks this list before delivering.
Entries are appended only after Hunter approves them (via `/mdg` delivery or
`/mdg-retro`). Newest first.

Entry format:

```text
## YYYY-MM-DD short-slug
Mistake: what went wrong
Correction: the rule that prevents it
Applies to: which agents or all
```

## 2026-07-21 job-map-mobile-layout
Mistake: Delivered a job map file without visually verifying the mobile layout.
Labels overlapped and the file was hard to use on a phone.
Correction: Before delivering any rendered output (map, dashboard, HTML, chart),
render or preview it and confirm phone usability, label overlap, filter visibility,
and access. Never claim a rendering issue is fixed without visual verification.
Applies to: mdg-doc-quality, mdg-exec-briefing, all agents producing rendered files.

## 2026-07-21 source-of-truth-assumed
Mistake: An old forecast file was treated as authoritative without confirming the
version and date, which polluted a bridge analysis.
Correction: Never treat a file as the source of truth unless its version and date
are confirmed. If two candidate sources conflict, stop and escalate before any
downstream analysis relies on them.
Applies to: all agents.
