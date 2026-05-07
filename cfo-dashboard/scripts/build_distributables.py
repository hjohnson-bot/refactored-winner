#!/usr/bin/env python3
"""
Build distributable artifacts from the CFO dashboard:

  1. dist/cfo-dashboard.html  — single-file standalone HTML, all CSS/JS/data
     inlined so the user can double-click it (no server, no fetches).
  2. dist/cfo-dashboard.xlsx  — Excel workbook with one sheet per dashboard
     tab. Numbers tie to QuickBooks, formulas are live so the CFO can edit.

Usage:
    python scripts/build_distributables.py [--snapshot data/snapshot.json] [--out dist]
"""

import argparse
import json
import re
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter


# ---------------------------------------------------------------------------
# Standalone HTML builder
# ---------------------------------------------------------------------------

def build_standalone_html(root: Path, snapshot: dict, out_path: Path):
    """Inline styles.css, app.js, and snapshot.json into a single HTML file."""
    html = (root / "index.html").read_text(encoding="utf-8")
    css = (root / "styles.css").read_text(encoding="utf-8")
    js = (root / "app.js").read_text(encoding="utf-8")

    # 1) replace external <link> with inline <style>. Lambda replacement so
    #    re.sub doesn't process escape sequences in the CSS body.
    inline_style = f"<style>\n{css}\n</style>"
    html = re.sub(
        r'<link\s+rel="stylesheet"\s+href="styles\.css"\s*/?>',
        lambda _: inline_style,
        html,
    )

    # 2) replace external <script src="app.js"> with inline script.
    #    Inject the snapshot as a global before app.js so the dashboard can
    #    skip fetch() entirely.
    snapshot_js = (
        "const __EMBEDDED_SNAPSHOT__ = "
        + json.dumps(snapshot, ensure_ascii=False)
        + ";\n"
    )

    # Patch app.js so init() reads from the embedded snapshot instead of fetch().
    # Use a regex to tolerate formatting changes inside the fetch error branch.
    pattern = re.compile(
        r"async function init\(\)\s*\{[^}]*?fetch\('data/snapshot\.json'\)[\s\S]*?SNAPSHOT\s*=\s*await\s*res\.json\(\)\s*;",
        re.DOTALL,
    )
    patched_js, count = pattern.subn(
        "async function init() {\n  SNAPSHOT = __EMBEDDED_SNAPSHOT__;",
        js,
    )
    if count == 0:
        raise RuntimeError(
            "Failed to patch app.js — could not match init()/fetch() block. "
            "Update build_distributables.py if init() changed shape."
        )

    # NOTE: re.sub interprets \n, \t, \\, etc. in the replacement string. The
    # patched JS has plenty of those (string literals like '\n', escaped quotes,
    # template strings). Use a lambda replacement so re.sub passes the bytes
    # through verbatim.
    new_script = f"<script>\n{snapshot_js}\n{patched_js}\n</script>"
    html = re.sub(
        r'<script\s+src="app\.js"\s*></script>',
        lambda _: new_script,
        html,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    return len(html)


# ---------------------------------------------------------------------------
# Excel workbook builder
# ---------------------------------------------------------------------------

THIN = Side(style="thin", color="DDDDDD")
THICK = Side(style="medium", color="333333")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
TITLE_FONT = Font(name="Calibri", size=18, bold=True, color="0B1220")
H2_FONT = Font(name="Calibri", size=12, bold=True, color="333333")
HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
HEADER_FILL = PatternFill("solid", fgColor="4D8DF6")
SUBTOTAL_FONT = Font(name="Calibri", size=11, bold=True)
SUBTOTAL_FILL = PatternFill("solid", fgColor="EAF1FE")
GOOD_FILL = PatternFill("solid", fgColor="DDF7E7")
BAD_FILL = PatternFill("solid", fgColor="FCE0E0")
WARN_FILL = PatternFill("solid", fgColor="FFF1D6")
META_FONT = Font(name="Calibri", size=10, italic=True, color="666666")

MONEY = '"$"#,##0;[Red]-"$"#,##0'
MONEY_M = '"$"#,##0.00,,"M";[Red]-"$"#,##0.00,,"M"'
PCT = "0.00%;[Red]-0.00%"


def _set_cell(ws, row, col, value, fmt=None, font=None, fill=None, align=None, border=BORDER):
    cell = ws.cell(row=row, column=col, value=value)
    if fmt:
        cell.number_format = fmt
    if font:
        cell.font = font
    if fill:
        cell.fill = fill
    cell.border = border
    if align:
        cell.alignment = align
    else:
        cell.alignment = Alignment(vertical="center")
    return cell


def _title(ws, row, text, span=8):
    ws.cell(row=row, column=1, value=text).font = TITLE_FONT
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=span)


def _meta(ws, row, text, span=8):
    ws.cell(row=row, column=1, value=text).font = META_FONT
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=span)


def _headers(ws, row, headers, fill=HEADER_FILL, font=HEADER_FONT):
    for i, h in enumerate(headers, start=1):
        c = ws.cell(row=row, column=i, value=h)
        c.font = font
        c.fill = fill
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = BORDER


def _autosize(ws, widths):
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def build_xlsx(snapshot: dict, out_path: Path):
    wb = Workbook()
    company = snapshot["company"]
    periods = snapshot["periods"]
    cur, prior, prior2 = periods["current"], periods["prior"], periods["prior2"]
    cf = snapshot["cashFlow"]
    fc = snapshot["forecast"]
    months = snapshot["verifiedMonths"]

    # --- Sheet 1: Executive Summary ----------------------------------------
    ws = wb.active
    ws.title = "1. Executive Summary"
    _title(ws, 1, f"CFO Dashboard — {company['name']}")
    _meta(ws, 2, f"{company['industry']} (NAICS {company['naics']})  ·  As of {snapshot['asOf']}  ·  Source: {snapshot['source']}")
    ws.row_dimensions[1].height = 28

    _headers(ws, 4, ["Metric", "Current (YTD 2026)", "Prior (FY 2025)", "Δ vs prior", "Δ %", "2 yrs prior (FY 2024)"])
    rows = [
        ("Revenue", cur["revenue"], prior["revenue"], prior2["revenue"], MONEY),
        ("Gross Profit", cur["grossProfit"], prior["grossProfit"], prior2["grossProfit"], MONEY),
        ("Gross Margin %", cur["grossMarginPct"], prior["grossMarginPct"], prior2["grossMarginPct"], PCT),
        ("Operating Expenses", cur["operatingExpenses"], prior["operatingExpenses"], prior2["operatingExpenses"], MONEY),
        ("Net Income", cur["netIncome"], prior["netIncome"], prior2["netIncome"], MONEY),
        ("Net Margin %", cur["netMarginPct"], prior["netMarginPct"], prior2["netMarginPct"], PCT),
        ("Cash Position (end of period)", cf["current"]["cashEnding"], cf["prior"]["cashEnding"], None, MONEY),
        ("Operating cash YTD", cf["current"]["operating"], cf["prior"]["operating"], None, MONEY),
    ]
    r = 5
    for label, c, p, p2, fmt in rows:
        _set_cell(ws, r, 1, label, font=Font(bold=True))
        _set_cell(ws, r, 2, c, fmt=fmt)
        _set_cell(ws, r, 3, p, fmt=fmt)
        # Δ as live formula
        _set_cell(ws, r, 4, f"=B{r}-C{r}", fmt=fmt)
        _set_cell(ws, r, 5, f"=IFERROR((B{r}-C{r})/ABS(C{r}),\"\")", fmt=PCT)
        if p2 is not None:
            _set_cell(ws, r, 6, p2, fmt=fmt)
        r += 1

    _meta(ws, r + 1, "Δ and Δ% are live Excel formulas — edit B/C columns and they recompute.")
    _autosize(ws, [34, 18, 18, 18, 12, 18])

    # --- Sheet 2: P&L Dashboard --------------------------------------------
    ws = wb.create_sheet("2. P&L Dashboard")
    _title(ws, 1, "Profit & Loss")
    _meta(ws, 2, f"YTD 2026 ({cur['periodStart']} → {cur['periodEnd']}) vs FY 2025")
    _headers(ws, 4, ["Line item", "YTD 2026", "FY 2025", "$ Variance", "% Variance"])
    rows = [
        ("Revenue", cur["revenue"], prior["revenue"], MONEY, "subtotal"),
        ("  Cost of Goods Sold (COGS)", cur["cogs"], prior["cogs"], MONEY, "indent"),
        ("Gross Profit (Revenue − COGS)", None, None, MONEY, "subtotal_formula"),
        ("  Gross Margin %", None, None, PCT, "indent_pct_formula"),
        ("  Operating Expenses", cur["operatingExpenses"], prior["operatingExpenses"], MONEY, "indent"),
        ("Net Income (Revenue − COGS − OpEx)", None, None, MONEY, "total_formula"),
        ("  Net Margin %", None, None, PCT, "indent_pct_formula"),
    ]
    r = 5
    for label, c, p, fmt, kind in rows:
        if kind == "subtotal_formula":
            # Gross Profit row: B = B(rev) - B(cogs)
            _set_cell(ws, r, 1, label, font=SUBTOTAL_FONT, fill=SUBTOTAL_FILL)
            _set_cell(ws, r, 2, f"=B{r-2}-B{r-1}", fmt=fmt, font=SUBTOTAL_FONT, fill=SUBTOTAL_FILL)
            _set_cell(ws, r, 3, f"=C{r-2}-C{r-1}", fmt=fmt, font=SUBTOTAL_FONT, fill=SUBTOTAL_FILL)
            _set_cell(ws, r, 4, f"=B{r}-C{r}", fmt=fmt, fill=SUBTOTAL_FILL)
            _set_cell(ws, r, 5, f"=IFERROR((B{r}-C{r})/ABS(C{r}),\"\")", fmt=PCT, fill=SUBTOTAL_FILL)
        elif kind == "indent_pct_formula":
            _set_cell(ws, r, 1, label)
            # GM% relative to its preceding GP / Revenue rows
            if "Gross Margin" in label:
                _set_cell(ws, r, 2, f"=IFERROR(B{r-1}/B{r-3},0)", fmt=fmt)
                _set_cell(ws, r, 3, f"=IFERROR(C{r-1}/C{r-3},0)", fmt=fmt)
            else:  # Net Margin %
                _set_cell(ws, r, 2, f"=IFERROR(B{r-1}/B{r-6},0)", fmt=fmt)
                _set_cell(ws, r, 3, f"=IFERROR(C{r-1}/C{r-6},0)", fmt=fmt)
            _set_cell(ws, r, 4, f"=B{r}-C{r}", fmt=fmt)
            _set_cell(ws, r, 5, "")
        elif kind == "total_formula":
            _set_cell(ws, r, 1, label, font=Font(bold=True, size=12), fill=SUBTOTAL_FILL)
            _set_cell(ws, r, 2, f"=B{r-3}-B{r-1}", fmt=fmt, font=Font(bold=True, size=12), fill=SUBTOTAL_FILL)
            _set_cell(ws, r, 3, f"=C{r-3}-C{r-1}", fmt=fmt, font=Font(bold=True, size=12), fill=SUBTOTAL_FILL)
            _set_cell(ws, r, 4, f"=B{r}-C{r}", fmt=fmt, fill=SUBTOTAL_FILL)
            _set_cell(ws, r, 5, f"=IFERROR((B{r}-C{r})/ABS(C{r}),\"\")", fmt=PCT, fill=SUBTOTAL_FILL)
        else:
            _set_cell(ws, r, 1, label, font=Font(bold=(kind == "subtotal")), fill=SUBTOTAL_FILL if kind == "subtotal" else None)
            _set_cell(ws, r, 2, c, fmt=fmt)
            _set_cell(ws, r, 3, p, fmt=fmt)
            _set_cell(ws, r, 4, f"=B{r}-C{r}", fmt=fmt)
            _set_cell(ws, r, 5, f"=IFERROR((B{r}-C{r})/ABS(C{r}),\"\")", fmt=PCT)
        r += 1
    _meta(ws, r + 1, "All bold rows are live Excel formulas. Change Revenue or COGS and Gross Profit, GM%, Net Income, NM% all recompute.")
    _autosize(ws, [42, 18, 18, 18, 14])

    # --- Sheet 3: Period Comparison ----------------------------------------
    ws = wb.create_sheet("3. Period Comparison")
    _title(ws, 1, "Period Comparison")
    _meta(ws, 2, "Year-over-year + 2-year CAGR for every key metric.")
    _headers(ws, 4, ["Metric", "YTD 2026", "FY 2025", "FY 2024", "YoY %", "2-yr CAGR"])
    rows = [
        ("Revenue", cur["revenue"], prior["revenue"], prior2["revenue"], MONEY),
        ("Gross Profit", cur["grossProfit"], prior["grossProfit"], prior2["grossProfit"], MONEY),
        ("Gross Margin %", cur["grossMarginPct"], prior["grossMarginPct"], prior2["grossMarginPct"], PCT),
        ("Operating Expenses", cur["operatingExpenses"], prior["operatingExpenses"], prior2["operatingExpenses"], MONEY),
        ("Net Income", cur["netIncome"], prior["netIncome"], prior2["netIncome"], MONEY),
        ("Net Margin %", cur["netMarginPct"], prior["netMarginPct"], prior2["netMarginPct"], PCT),
    ]
    r = 5
    for label, c, p, p2, fmt in rows:
        _set_cell(ws, r, 1, label, font=Font(bold=True))
        _set_cell(ws, r, 2, c, fmt=fmt)
        _set_cell(ws, r, 3, p, fmt=fmt)
        _set_cell(ws, r, 4, p2, fmt=fmt)
        _set_cell(ws, r, 5, f"=IFERROR((B{r}-C{r})/ABS(C{r}),\"\")", fmt=PCT)
        # CAGR only meaningful for non-percentage metrics
        if fmt == MONEY:
            _set_cell(ws, r, 6, f"=IFERROR((B{r}/D{r})^(1/2)-1,\"\")", fmt=PCT)
        r += 1
    _autosize(ws, [22, 18, 18, 18, 14, 14])

    # Month-vs-month sub-table
    r += 2
    _set_cell(ws, r, 1, "Month vs Month (verified months)", font=H2_FONT)
    r += 1
    _headers(ws, r, ["Month", "Revenue", "COGS", "Gross Profit", "GM %", "OpEx", "Net Income", "NM %"])
    r += 1
    for m in months:
        _set_cell(ws, r, 1, m["month"])
        _set_cell(ws, r, 2, m["revenue"], fmt=MONEY)
        _set_cell(ws, r, 3, m["cogs"], fmt=MONEY)
        _set_cell(ws, r, 4, f"=B{r}-C{r}", fmt=MONEY)
        _set_cell(ws, r, 5, f"=IFERROR(D{r}/B{r},0)", fmt=PCT)
        _set_cell(ws, r, 6, m["operatingExpenses"], fmt=MONEY)
        _set_cell(ws, r, 7, f"=D{r}-F{r}", fmt=MONEY)
        _set_cell(ws, r, 8, f"=IFERROR(G{r}/B{r},0)", fmt=PCT)
        r += 1

    # --- Sheet 4: Deep Dive -------------------------------------------------
    ws = wb.create_sheet("4. Deep Dive")
    _title(ws, 1, "Deep Dive Analysis")

    _set_cell(ws, 4, 1, "Revenue & profitability mix", font=H2_FONT)
    _headers(ws, 5, ["Metric", "YTD 2026", "FY 2025", "Δ"])
    rows = [
        ("Revenue", cur["revenue"], prior["revenue"], MONEY),
        ("COGS", cur["cogs"], prior["cogs"], MONEY),
        ("Gross Profit", cur["grossProfit"], prior["grossProfit"], MONEY),
        ("Gross Margin %", cur["grossMarginPct"], prior["grossMarginPct"], PCT),
        ("Operating Expenses", cur["operatingExpenses"], prior["operatingExpenses"], MONEY),
        ("Net Income", cur["netIncome"], prior["netIncome"], MONEY),
    ]
    r = 6
    for label, c, p, fmt in rows:
        _set_cell(ws, r, 1, label, font=Font(bold=True))
        _set_cell(ws, r, 2, c, fmt=fmt)
        _set_cell(ws, r, 3, p, fmt=fmt)
        _set_cell(ws, r, 4, f"=B{r}-C{r}", fmt=fmt)
        r += 1

    r += 2
    _set_cell(ws, r, 1, "Cash flow decomposition (live formula sums)", font=H2_FONT)
    r += 1
    _headers(ws, r, ["Activity", "YTD 2026", "FY 2025", "Δ"])
    r += 1
    cfrows = [
        ("Operating activities", cf["current"]["operating"], cf["prior"]["operating"]),
        ("Investing activities", cf["current"]["investing"], cf["prior"]["investing"]),
        ("Financing activities", cf["current"]["financing"], cf["prior"]["financing"]),
    ]
    cf_start_row = r
    for label, c, p in cfrows:
        _set_cell(ws, r, 1, label)
        _set_cell(ws, r, 2, c, fmt=MONEY)
        _set_cell(ws, r, 3, p, fmt=MONEY)
        _set_cell(ws, r, 4, f"=B{r}-C{r}", fmt=MONEY)
        r += 1
    _set_cell(ws, r, 1, "Net cash change (live sum of above)", font=Font(bold=True), fill=SUBTOTAL_FILL)
    _set_cell(ws, r, 2, f"=SUM(B{cf_start_row}:B{r-1})", fmt=MONEY, font=Font(bold=True), fill=SUBTOTAL_FILL)
    _set_cell(ws, r, 3, f"=SUM(C{cf_start_row}:C{r-1})", fmt=MONEY, font=Font(bold=True), fill=SUBTOTAL_FILL)
    _set_cell(ws, r, 4, f"=B{r}-C{r}", fmt=MONEY, fill=SUBTOTAL_FILL)
    r += 1
    _set_cell(ws, r, 1, "Cash at beginning")
    _set_cell(ws, r, 2, cf["current"]["cashBeginning"], fmt=MONEY)
    _set_cell(ws, r, 3, cf["prior"]["cashBeginning"], fmt=MONEY)
    _set_cell(ws, r, 4, f"=B{r}-C{r}", fmt=MONEY)
    r += 1
    _set_cell(ws, r, 1, "Cash at end of period (live: beginning + net change)", font=Font(bold=True), fill=SUBTOTAL_FILL)
    _set_cell(ws, r, 2, f"=B{r-1}+B{r-2}", fmt=MONEY, font=Font(bold=True), fill=SUBTOTAL_FILL)
    _set_cell(ws, r, 3, f"=C{r-1}+C{r-2}", fmt=MONEY, font=Font(bold=True), fill=SUBTOTAL_FILL)
    _set_cell(ws, r, 4, f"=B{r}-C{r}", fmt=MONEY, fill=SUBTOTAL_FILL)
    _autosize(ws, [42, 18, 18, 18])

    # --- Sheet 5: Forecast --------------------------------------------------
    ws = wb.create_sheet("5. Forecast")
    _title(ws, 1, "Forecast & Year-End Projection")
    _meta(ws, 2, f"{fc['completedMonths']} of 12 months completed · {fc['remainingMonths']} remaining. Year-End Forecast = YTD + (Avg Monthly × Remaining).")
    _headers(ws, 4, ["Metric", "YTD actual", "Avg monthly", "Year-end forecast (live)", "Run-rate (avg × 12, live)"])
    rows = [
        ("Revenue", fc["ytdRevenue"], fc["avgMonthlyRevenue"], MONEY),
        ("Gross Profit", fc["ytdGrossProfit"], fc["avgMonthlyGrossProfit"], MONEY),
        ("Operating Expenses", fc["ytdOperatingExpenses"], fc["avgMonthlyOperatingExpenses"], MONEY),
        ("Net Income", fc["ytdNetIncome"], fc["avgMonthlyNetIncome"], MONEY),
    ]
    r = 5
    for label, ytd, avg, fmt in rows:
        _set_cell(ws, r, 1, label, font=Font(bold=True))
        _set_cell(ws, r, 2, ytd, fmt=fmt)
        _set_cell(ws, r, 3, avg, fmt=fmt)
        _set_cell(ws, r, 4, f"=B{r}+C{r}*{fc['remainingMonths']}", fmt=fmt)
        _set_cell(ws, r, 5, f"=C{r}*12", fmt=fmt)
        r += 1
    r += 1
    _set_cell(ws, r, 1, "Year-end Gross Margin %", font=Font(bold=True))
    _set_cell(ws, r, 4, f"=D6/D5", fmt=PCT)
    r += 1
    _set_cell(ws, r, 1, "Year-end Net Margin %", font=Font(bold=True))
    _set_cell(ws, r, 4, f"=D8/D5", fmt=PCT)
    r += 1
    _set_cell(ws, r, 1, "Year-end Cash position", font=Font(bold=True))
    _set_cell(ws, r, 4, fc["yearEndCash"], fmt=MONEY)
    _autosize(ws, [30, 18, 18, 24, 24])

    # --- Sheet 6: Trends ----------------------------------------------------
    ws = wb.create_sheet("6. Trends")
    _title(ws, 1, "Trends")
    _meta(ws, 2, "Annual trend uses verified totals; monthly trend uses individually verified per-month QB queries.")
    _headers(ws, 4, ["Period", "Revenue", "Gross Profit", "GM %", "Net Income", "NM %"])
    rows = [
        ("FY 2024", prior2["revenue"], prior2["grossProfit"], prior2["grossMarginPct"], prior2["netIncome"], prior2["netMarginPct"]),
        ("FY 2025", prior["revenue"], prior["grossProfit"], prior["grossMarginPct"], prior["netIncome"], prior["netMarginPct"]),
        ("YTD 2026", cur["revenue"], cur["grossProfit"], cur["grossMarginPct"], cur["netIncome"], cur["netMarginPct"]),
        ("2026 forecast", fc["yearEndRevenue"], fc["yearEndGrossProfit"], fc["yearEndGrossMarginPct"], fc["yearEndNetIncome"], fc["yearEndNetMarginPct"]),
    ]
    r = 5
    for row in rows:
        _set_cell(ws, r, 1, row[0], font=Font(bold=True))
        _set_cell(ws, r, 2, row[1], fmt=MONEY)
        _set_cell(ws, r, 3, row[2], fmt=MONEY)
        _set_cell(ws, r, 4, row[3], fmt=PCT)
        _set_cell(ws, r, 5, row[4], fmt=MONEY)
        _set_cell(ws, r, 6, row[5], fmt=PCT)
        r += 1

    r += 2
    _set_cell(ws, r, 1, "Verified monthly P&L", font=H2_FONT)
    r += 1
    _headers(ws, r, ["Month", "Revenue", "COGS", "Gross Profit", "OpEx", "Net Income", "GM %", "NM %"])
    r += 1
    for m in months:
        _set_cell(ws, r, 1, m["month"])
        _set_cell(ws, r, 2, m["revenue"], fmt=MONEY)
        _set_cell(ws, r, 3, m["cogs"], fmt=MONEY)
        _set_cell(ws, r, 4, m["grossProfit"], fmt=MONEY)
        _set_cell(ws, r, 5, m["operatingExpenses"], fmt=MONEY)
        _set_cell(ws, r, 6, m["netIncome"], fmt=MONEY)
        _set_cell(ws, r, 7, m["grossMarginPct"], fmt=PCT)
        _set_cell(ws, r, 8, m["netMarginPct"], fmt=PCT)
        r += 1
    _autosize(ws, [12, 18, 18, 18, 18, 18, 12, 12])

    # --- Sheet 7: Segments --------------------------------------------------
    ws = wb.create_sheet("7. Segments")
    _title(ws, 1, "Segments & Cost Structure")
    _meta(ws, 2, "Revenue mix, COGS structure, and OpEx structure for FP&A and Strategy.")
    cur_seg = (cur.get("segments") or {})
    prior_seg = (prior.get("segments") or {})

    _set_cell(ws, 4, 1, "Revenue by income account", font=H2_FONT)
    _headers(ws, 5, ["Account", "YTD 2026", "% of revenue (live)", "FY 2025"])
    r = 6
    for a in cur_seg.get("incomeAccounts", []):
        prior_match = next((x for x in prior_seg.get("incomeAccounts", []) if x["account"] == a["account"]), None)
        _set_cell(ws, r, 1, a["account"])
        _set_cell(ws, r, 2, a["amount"], fmt=MONEY)
        _set_cell(ws, r, 3, f"=B{r}/{cur['revenue']}", fmt=PCT)
        _set_cell(ws, r, 4, prior_match["amount"] if prior_match else None, fmt=MONEY)
        r += 1

    r += 2
    _set_cell(ws, r, 1, "COGS structure (3 buckets)", font=H2_FONT)
    r += 1
    _headers(ws, r, ["Bucket", "YTD 2026", "% of COGS (live)", "FY 2025"])
    r += 1
    for b in cur_seg.get("cogsBuckets", []):
        prior_match = next((x for x in prior_seg.get("cogsBuckets", []) if x["bucket"] == b["bucket"]), None)
        _set_cell(ws, r, 1, b["bucket"])
        _set_cell(ws, r, 2, b["amount"], fmt=MONEY)
        _set_cell(ws, r, 3, f"=B{r}/{cur['cogs']}", fmt=PCT)
        _set_cell(ws, r, 4, prior_match["amount"] if prior_match else None, fmt=MONEY)
        r += 1

    r += 2
    _set_cell(ws, r, 1, "OpEx structure (6 buckets)", font=H2_FONT)
    r += 1
    _headers(ws, r, ["Bucket", "YTD 2026", "% of OpEx (live)", "FY 2025", "Δ %"])
    r += 1
    for b in cur_seg.get("opexBuckets", []):
        prior_match = next((x for x in prior_seg.get("opexBuckets", []) if x["bucket"] == b["bucket"]), None)
        _set_cell(ws, r, 1, b["bucket"])
        _set_cell(ws, r, 2, b["amount"], fmt=MONEY)
        _set_cell(ws, r, 3, f"=B{r}/{cur['operatingExpenses']}", fmt=PCT)
        _set_cell(ws, r, 4, prior_match["amount"] if prior_match else None, fmt=MONEY)
        _set_cell(ws, r, 5, f"=IFERROR((B{r}-D{r})/ABS(D{r}),\"\")" if prior_match else "", fmt=PCT)
        r += 1
    _autosize(ws, [44, 18, 18, 18, 12])

    # --- Sheet 8: Working Capital -------------------------------------------
    ws = wb.create_sheet("8. Working Capital")
    _title(ws, 1, "Working Capital — Controller / Treasury view")
    _meta(ws, 2, "A/R, A/P, retainage, inventory, WIP. Drives free cash flow conversion.")
    wc = snapshot.get("workingCapital", {})
    _headers(ws, 4, ["Account", "YTD 2026", "FY 2025", "Δ %", "Cash impact"])
    rows = [
        ("Accounts Receivable", wc["current"].get("ar", 0), wc["prior"].get("ar", 0)),
        ("Accounts Payable", wc["current"].get("ap", 0), wc["prior"].get("ap", 0)),
        ("Retainage Receivable", wc["current"].get("retainage", 0), wc["prior"].get("retainage", 0)),
        ("Drywall Inventory", wc["current"].get("inventory", 0), wc["prior"].get("inventory", 0)),
        ("WIP Overbillings", wc["current"].get("wipOverbillings", 0), wc["prior"].get("wipOverbillings", 0)),
        ("WIP Underbillings", wc["current"].get("wipUnderbillings", 0), wc["prior"].get("wipUnderbillings", 0)),
        ("Line of Credit draw", wc["current"].get("lineOfCreditDraw", 0), wc["prior"].get("lineOfCreditDraw", 0)),
    ]
    r = 5
    for label, c, p in rows:
        _set_cell(ws, r, 1, label)
        _set_cell(ws, r, 2, c, fmt=MONEY)
        _set_cell(ws, r, 3, p, fmt=MONEY)
        _set_cell(ws, r, 4, f"=IFERROR((B{r}-C{r})/ABS(C{r}),\"\")", fmt=PCT)
        _set_cell(ws, r, 5, "Source of cash" if c > 0 else "Use of cash" if c < 0 else "—",
                  fill=GOOD_FILL if c > 0 else (BAD_FILL if c < 0 else None))
        r += 1
    _set_cell(ws, r, 1, "Total working-capital change (live sum)", font=Font(bold=True), fill=SUBTOTAL_FILL)
    _set_cell(ws, r, 2, f"=SUM(B5:B{r-1})", fmt=MONEY, font=Font(bold=True), fill=SUBTOTAL_FILL)
    _set_cell(ws, r, 3, f"=SUM(C5:C{r-1})", fmt=MONEY, font=Font(bold=True), fill=SUBTOTAL_FILL)
    _autosize(ws, [38, 18, 18, 14, 22])

    # --- Sheet 9: Scenarios -------------------------------------------------
    ws = wb.create_sheet("9. Scenarios")
    _title(ws, 1, "Scenario Modeling — FP&A / Strategy")
    _meta(ws, 2, "Inputs in B6:B8 are the only cells you edit. Year-end outcome below recomputes automatically.")
    _set_cell(ws, 4, 1, "Inputs", font=H2_FONT)
    _set_cell(ws, 5, 1, "YTD revenue (locked)")
    _set_cell(ws, 5, 2, fc["ytdRevenue"], fmt=MONEY)
    _set_cell(ws, 6, 1, "2H revenue growth vs run-rate (e.g., 0.05 = +5%)", font=Font(bold=True))
    _set_cell(ws, 6, 2, 0.0, fmt=PCT, fill=GOOD_FILL)
    _set_cell(ws, 7, 1, "Gross margin shift (pts; e.g., -0.01 = -1pt)", font=Font(bold=True))
    _set_cell(ws, 7, 2, 0.0, fmt=PCT, fill=GOOD_FILL)
    _set_cell(ws, 8, 1, "OpEx % vs run-rate (e.g., 0.10 = +10%)", font=Font(bold=True))
    _set_cell(ws, 8, 2, 0.0, fmt=PCT, fill=GOOD_FILL)

    _set_cell(ws, 10, 1, "Year-end outcome (live)", font=H2_FONT)
    _headers(ws, 11, ["Metric", "Base forecast", "Scenario", "Δ vs base"])
    r = 12
    # Scenario formulas reference the inputs above by absolute cell address.
    base_rev = fc["yearEndRevenue"]
    base_gp = fc["yearEndGrossProfit"]
    base_op = fc["yearEndOperatingExpenses"]
    base_net = fc["yearEndNetIncome"]
    base_gm = fc["yearEndGrossMarginPct"]
    base_nm = fc["yearEndNetMarginPct"]

    avg_rev = fc["avgMonthlyRevenue"]
    avg_op = fc["avgMonthlyOperatingExpenses"]
    rem = fc["remainingMonths"]

    rows_scn = [
        ("Revenue", base_rev, f"=B5+({avg_rev}*{rem})*(1+$B$6)", MONEY, False),
        ("Gross Margin %", base_gm, f"={base_gm}+$B$7", PCT, True),
        ("Gross Profit", base_gp, f"=C12*C13", MONEY, False),
        ("Operating Expenses", base_op, f"={fc['ytdOperatingExpenses']}+({avg_op}*{rem})*(1+$B$8)", MONEY, False),
        ("Net Income", base_net, f"=C14-C15", MONEY, False),
        ("Net Margin %", base_nm, f"=C16/C12", PCT, True),
    ]
    for label, base, scn_formula, fmt, _is_pct in rows_scn:
        _set_cell(ws, r, 1, label, font=Font(bold=True))
        _set_cell(ws, r, 2, base, fmt=fmt)
        _set_cell(ws, r, 3, scn_formula, fmt=fmt)
        _set_cell(ws, r, 4, f"=C{r}-B{r}", fmt=fmt)
        r += 1
    _autosize(ws, [44, 18, 18, 18])

    # --- Sheet 10: Industry Benchmark ---------------------------------------
    ws = wb.create_sheet("10. Industry Benchmark")
    bench = snapshot.get("benchmark") or {}
    _title(ws, 1, "Industry Benchmark — Strategy")
    _meta(ws, 2, f"{bench.get('industryType','')}  ·  NAICS {bench.get('naicsCode','')}  ·  {bench.get('location','')}  ·  {bench.get('benchmarkPeriodRange','')}")
    _headers(ws, 4, ["Metric", "Value"])
    bench_rows = [
        ("Annualized profit (12-mo)", bench.get("metricValue"), MONEY),
        (f"{bench.get('location','')} regional average", bench.get("regionalAverage"), MONEY),
        ("Above regional average by (live)", None, PCT),
        ("Multiple vs regional (live)", None, "0.0\"x\""),
    ]
    r = 5
    for label, value, fmt in bench_rows:
        _set_cell(ws, r, 1, label, font=Font(bold=True))
        if "live" in label and "Above" in label:
            _set_cell(ws, r, 2, "=(B5-B6)/B6", fmt=PCT)
        elif "live" in label and "Multiple" in label:
            _set_cell(ws, r, 2, "=B5/B6", fmt=fmt)
        else:
            _set_cell(ws, r, 2, value, fmt=fmt)
        r += 1
    _autosize(ws, [44, 22])

    # --- Sheet 11: Action Flags ---------------------------------------------
    ws = wb.create_sheet("11. Action Flags")
    _title(ws, 1, "Action Flags")
    _meta(ws, 2, "Computed live from current period vs prior + forecast. Severities: bad / warn / good.")
    _headers(ws, 4, ["Flag", "Severity", "Triggered?", "Detail"])
    flags = _compute_flags(snapshot)
    r = 5
    for flag in flags:
        fill = BAD_FILL if flag["severity"] == "bad" else WARN_FILL if flag["severity"] == "warn" else GOOD_FILL
        _set_cell(ws, r, 1, flag["title"], font=Font(bold=True), fill=fill)
        _set_cell(ws, r, 2, flag["severity"].upper(), fill=fill)
        _set_cell(ws, r, 3, "YES" if flag.get("triggered", True) else "no", fill=fill)
        _set_cell(ws, r, 4, flag["detail"], fill=fill, align=Alignment(wrap_text=True, vertical="center"))
        ws.row_dimensions[r].height = 36
        r += 1
    _autosize(ws, [44, 14, 14, 70])

    # --- Sheet 12: Raw snapshot --------------------------------------------
    ws = wb.create_sheet("12. Raw snapshot.json")
    _title(ws, 1, "Raw snapshot.json values")
    _meta(ws, 2, "Source of truth for every other tab. Edit at your own risk — formulas elsewhere reference these.")
    _headers(ws, 4, ["Path", "Value"])
    flat = _flatten(snapshot)
    r = 5
    for path, value in flat:
        _set_cell(ws, r, 1, path, font=Font(name="Consolas", size=10))
        if isinstance(value, (int, float)):
            _set_cell(ws, r, 2, value, fmt=MONEY if abs(value) > 1 else PCT)
        else:
            _set_cell(ws, r, 2, str(value))
        r += 1
    _autosize(ws, [60, 30])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out_path)
    return out_path.stat().st_size


def _compute_flags(snapshot):
    """Mirror of computeActionFlags() in app.js (kept in sync manually)."""
    p = snapshot["periods"]
    f = snapshot["forecast"]
    cf = snapshot["cashFlow"]
    flags = []

    # Revenue trajectory
    if f["runRateRevenue"] < p["prior"]["revenue"]:
        flags.append({"severity": "bad", "title": "Revenue decline projected vs prior year",
                      "detail": f"Run-rate ${f['runRateRevenue']:,.0f} below FY 2025 ${p['prior']['revenue']:,.0f}."})
    else:
        flags.append({"severity": "good", "title": "Revenue trajectory above prior year",
                      "detail": f"Run-rate ${f['runRateRevenue']:,.0f} vs FY 2025 ${p['prior']['revenue']:,.0f}."})

    # Margin
    gm_d = p["current"]["grossMarginPct"] - p["prior"]["grossMarginPct"]
    if gm_d < -0.01:
        flags.append({"severity": "bad", "title": "Gross margin compression vs prior year",
                      "detail": f"GM% {p['current']['grossMarginPct']*100:.2f}% vs prior {p['prior']['grossMarginPct']*100:.2f}% ({gm_d*100:+.2f}pt)."})
    elif gm_d > 0.01:
        flags.append({"severity": "good", "title": "Gross margin expansion vs prior year",
                      "detail": f"GM% {p['current']['grossMarginPct']*100:.2f}% vs prior {p['prior']['grossMarginPct']*100:.2f}% (+{gm_d*100:.2f}pt)."})

    # Expense spike
    opex_pct = (f["runRateOperatingExpenses"] / p["prior"]["operatingExpenses"]) - 1
    if opex_pct > 0.05:
        flags.append({"severity": "warn", "title": "Operating expense run-rate above prior year",
                      "detail": f"OpEx run-rate ${f['runRateOperatingExpenses']:,.0f} vs prior ${p['prior']['operatingExpenses']:,.0f} (+{opex_pct*100:.1f}%)."})

    if cf["current"]["netCashChange"] < 0:
        flags.append({"severity": "bad", "title": "Negative net cash flow YTD",
                      "detail": f"YTD net cash ${cf['current']['netCashChange']:,.0f} (Op ${cf['current']['operating']:,.0f} + Inv ${cf['current']['investing']:,.0f} + Fin ${cf['current']['financing']:,.0f})."})
    if cf["current"]["cashEnding"] < 0:
        flags.append({"severity": "bad", "title": "Negative cash position",
                      "detail": f"Cash at end of period ${cf['current']['cashEnding']:,.0f} (LoC drawn). Beginning ${cf['current']['cashBeginning']:,.0f}."})
    if cf["current"]["cashEnding"] < cf["prior"]["cashEnding"] - 100000:
        flags.append({"severity": "warn", "title": "A/R collection risk",
                      "detail": f"Cash deteriorated by ${cf['current']['cashEnding']-cf['prior']['cashEnding']:,.0f} vs prior year-end."})
    if f["yearEndNetMarginPct"] < p["prior"]["netMarginPct"] - 0.01:
        flags.append({"severity": "warn", "title": "Forecast net margin below prior year",
                      "detail": f"Forecast NM% {f['yearEndNetMarginPct']*100:.2f}% vs prior {p['prior']['netMarginPct']*100:.2f}%."})
    return flags


def _flatten(obj, prefix=""):
    out = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.extend(_flatten(v, f"{prefix}.{k}" if prefix else k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out.extend(_flatten(v, f"{prefix}[{i}]"))
    else:
        out.append((prefix, obj))
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", default="data/snapshot.json")
    parser.add_argument("--out", default="downloads")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent  # cfo-dashboard/
    snap = json.loads((root / args.snapshot).read_text(encoding="utf-8"))
    out_dir = root / args.out

    html_size = build_standalone_html(root, snap, out_dir / "cfo-dashboard.html")
    xlsx_size = build_xlsx(snap, out_dir / "cfo-dashboard.xlsx")

    print(f"Wrote {out_dir/'cfo-dashboard.html'} ({html_size:,} bytes)")
    print(f"Wrote {out_dir/'cfo-dashboard.xlsx'} ({xlsx_size:,} bytes)")


if __name__ == "__main__":
    main()
