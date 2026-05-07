#!/usr/bin/env python3
"""
Build the dashboard data snapshot from QuickBooks MCP tool results.

Reads raw P&L (annual + per-month), Cash Flow, and Benchmark JSON files
produced by the QuickBooks MCP and emits a single dashboard-friendly JSON
file. The dashboard front-end reads that file directly. No hardcoded numbers
— every value derives from the QuickBooks reports.

This is the finance + strategy edition: the snapshot includes segment
roll-ups, working-capital changes, and industry benchmarks so the same data
serves CFO, FP&A, Controller, Strategy, and Treasury personas.

The QuickBooks MCP P&L tool's `monthlyBreakdown` field on a multi-month
query does NOT reconcile to its own annual totals. To get accurate monthly
numbers we run individual one-month P&L queries and stash the result under
data/raw/months/YYYY-MM.json. This script reads both shapes.

Usage:
    python build_snapshot.py \
        --pl-current FILE --pl-prior FILE [--pl-prior-2 FILE] \
        --cf-current FILE [--cf-prior FILE] \
        --benchmark FILE \
        --months-dir DIR \
        --as-of YYYY-MM-DD \
        --out cfo-dashboard/data/snapshot.json
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# P&L row-tree parsing: extract leaf accounts grouped under the four
# top-level QuickBooks P&L sections (Income, COGS, Expenses, Other Income).
# ---------------------------------------------------------------------------

def _walk_pl(rows, parent_id, accept_types=("ITEM",)):
    """Yield (name, value) for all rows whose parentId chain leads to parent_id.
    Filters to leaf account rows so subtotals don't double-count."""
    found = []
    for row in rows:
        meta = row.get("metadata") or {}
        if meta.get("parentId") != parent_id:
            continue
        rtype = meta.get("type") or []
        cells = row.get("cells") or []
        name = cells[0].get("value") if len(cells) > 0 else None
        value = cells[1].get("value") if len(cells) > 1 else None
        if not name:
            continue
        if any(t in rtype for t in accept_types):
            if isinstance(value, (int, float)):
                found.append((name, float(value)))
        # Recurse for groups/subtotals
        if "GROUP" in rtype or "SUMMARY" in rtype:
            found.extend(_walk_pl(rows, meta.get("id"), accept_types))
    return found


def extract_segments(pl_report):
    """Build segment roll-ups: every leaf account under Income, COGS, OpEx."""
    rows = (((pl_report.get("reportData") or {}).get("data") or {}).get("rows")) or []
    section_ids = {}
    for row in rows:
        meta = row.get("metadata") or {}
        rtype = meta.get("type") or []
        cells = row.get("cells") or []
        if not cells:
            continue
        name = (cells[0].get("value") or "").strip()
        if "GROUP" in rtype and "SUMMARY" in rtype and meta.get("parentId") == "0":
            if name == "Income":
                section_ids["income"] = meta.get("id")
            elif name == "Cost of Goods Sold":
                section_ids["cogs"] = meta.get("id")
            elif name == "Expenses":
                section_ids["opex"] = meta.get("id")
            elif name == "Other Income":
                section_ids["otherIncome"] = meta.get("id")

    income = _walk_pl(rows, section_ids.get("income", "1"))
    cogs = _walk_pl(rows, section_ids.get("cogs", "2"))
    opex = _walk_pl(rows, section_ids.get("opex", "4"))

    # Roll up COGS into 3 strategic buckets so the Segments tab is readable
    cogs_buckets = {"Labor (contractors + direct)": 0.0, "Materials & supply": 0.0, "Job site & rental": 0.0, "Other COGS": 0.0}
    for name, v in cogs:
        n = name.lower()
        if "labor" in n or "subcontractor" in n:
            cogs_buckets["Labor (contractors + direct)"] += v
        elif "supply" in n or "material" in n or "drywall" in n or "tax" in n:
            cogs_buckets["Materials & supply"] += v
        elif "job site" in n or "equipment rental" in n or "per diem" in n:
            cogs_buckets["Job site & rental"] += v
        else:
            cogs_buckets["Other COGS"] += v

    # Roll up OpEx into 6 strategic buckets
    opex_buckets = {"Payroll & benefits": 0.0, "Facilities (rent + utilities)": 0.0, "Vehicle / fleet": 0.0,
                    "Insurance & professional": 0.0, "G&A (office, IT, dues, travel, M&E)": 0.0, "Other OpEx": 0.0}
    for name, v in opex:
        n = name.lower()
        if any(k in n for k in ["wage", "bonus", "commission", "payroll", "employee benefit", "health insurance", "tax", "fee"]):
            opex_buckets["Payroll & benefits"] += v
        elif any(k in n for k in ["rent", "lease", "utilit", "repair", "depreci"]):
            opex_buckets["Facilities (rent + utilities)"] += v
        elif any(k in n for k in ["car", "truck", "fuel", "def", "dot", "vehicle"]):
            opex_buckets["Vehicle / fleet"] += v
        elif any(k in n for k in ["insurance", "legal", "professional", "outsourced it", "interest"]):
            opex_buckets["Insurance & professional"] += v
        elif any(k in n for k in ["office", "software", "subscription", "advertising", "marketing", "meal", "entertain", "travel", "training", "dues"]):
            opex_buckets["G&A (office, IT, dues, travel, M&E)"] += v
        else:
            opex_buckets["Other OpEx"] += v

    return {
        "incomeAccounts": [{"account": n, "amount": round(v, 2)} for n, v in income if abs(v) > 0.005],
        "cogsBuckets": [{"bucket": k, "amount": round(v, 2)} for k, v in cogs_buckets.items() if abs(v) > 0.005],
        "opexBuckets": [{"bucket": k, "amount": round(v, 2)} for k, v in opex_buckets.items() if abs(v) > 0.005],
    }


# ---------------------------------------------------------------------------
# Period normalizers
# ---------------------------------------------------------------------------

def normalize_pl_period(report, include_segments=False):
    """Use verified top-level totals only — ignore the unreliable
    monthlyBreakdown field on multi-month queries."""
    revenue = report.get("totalIncome") or 0
    gross = report.get("grossProfit") or 0
    cogs = round(revenue - gross, 2)
    opex = report.get("totalExpenses") or 0
    net = report.get("netIncome") or 0
    out = {
        "periodStart": report.get("periodStart"),
        "periodEnd": report.get("periodEnd"),
        "revenue": round(revenue, 2),
        "cogs": cogs,
        "grossProfit": round(gross, 2),
        "operatingExpenses": round(opex, 2),
        "netIncome": round(net, 2),
        "grossMarginPct": (gross / revenue) if revenue else 0,
        "netMarginPct": (net / revenue) if revenue else 0,
    }
    if include_segments:
        out["segments"] = extract_segments(report)
    return out


def normalize_pl_month(report):
    period = normalize_pl_period(report)
    period["month"] = period["periodStart"][:7]
    return period


def normalize_cf(report):
    if not report:
        return None
    return {
        "periodStart": report.get("periodStart"),
        "periodEnd": report.get("periodEnd"),
        "operating": round(report.get("operatingActivities") or 0, 2),
        "investing": round(report.get("investingActivities") or 0, 2),
        "financing": round(report.get("financingActivities") or 0, 2),
        "netCashChange": round(report.get("netCashIncrease") or 0, 2),
        "cashBeginning": round(report.get("cashAtBeginning") or 0, 2),
        "cashEnding": round(report.get("cashAtEnd") or 0, 2),
        "netIncome": round(report.get("netIncome") or 0, 2),
        "workingCapital": report.get("workingCapital") or {},
    }


def months_completed(period_start, as_of):
    start = datetime.fromisoformat(period_start)
    end = datetime.fromisoformat(as_of)
    months = (end.year - start.year) * 12 + (end.month - start.month) + 1
    return max(1, months)


def load_months(months_dir):
    months_dir = Path(months_dir)
    months = []
    if months_dir.exists():
        for f in sorted(months_dir.glob("*.json")):
            try:
                months.append(normalize_pl_month(load_json(f)))
            except (KeyError, ValueError):
                pass
    months.sort(key=lambda r: r["month"])
    return months


def compute_working_capital(cf_current, cf_prior):
    """Surface the working-capital rollup the dashboard actually uses."""
    def wc_total(cf, keys):
        wc = (cf or {}).get("workingCapital") or {}
        return sum(wc.get(k, 0) or 0 for k in keys)

    keys_main = [
        "accountsPayableChange", "accountsReceivableChange",
        "retainageReceivableChange", "inventoryDrywallChange",
        "wipOverbillingsChange", "wipUnderbillingsChange",
    ]
    return {
        "current": {
            "ar": (cf_current or {}).get("workingCapital", {}).get("accountsReceivableChange", 0),
            "ap": (cf_current or {}).get("workingCapital", {}).get("accountsPayableChange", 0),
            "retainage": (cf_current or {}).get("workingCapital", {}).get("retainageReceivableChange", 0),
            "inventory": (cf_current or {}).get("workingCapital", {}).get("inventoryDrywallChange", 0),
            "wipOverbillings": (cf_current or {}).get("workingCapital", {}).get("wipOverbillingsChange", 0),
            "wipUnderbillings": (cf_current or {}).get("workingCapital", {}).get("wipUnderbillingsChange", 0),
            "lineOfCreditDraw": (cf_current or {}).get("workingCapital", {}).get("lineOfCreditDraw", 0),
            "totalWorkingCapitalChange": wc_total(cf_current, keys_main),
        },
        "prior": {
            "ar": (cf_prior or {}).get("workingCapital", {}).get("accountsReceivableChange", 0),
            "ap": (cf_prior or {}).get("workingCapital", {}).get("accountsPayableChange", 0),
            "retainage": (cf_prior or {}).get("workingCapital", {}).get("retainageReceivableChange", 0),
            "inventory": (cf_prior or {}).get("workingCapital", {}).get("inventoryDrywallChange", 0),
            "wipOverbillings": (cf_prior or {}).get("workingCapital", {}).get("wipOverbillingsChange", 0),
            "wipUnderbillings": (cf_prior or {}).get("workingCapital", {}).get("wipUnderbillingsChange", 0),
            "lineOfCreditDraw": (cf_prior or {}).get("workingCapital", {}).get("lineOfCreditDraw", 0),
            "totalWorkingCapitalChange": wc_total(cf_prior, keys_main),
        },
    }


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------

def build_snapshot(args):
    pl_current_raw = load_json(args.pl_current)
    pl_prior_raw = load_json(args.pl_prior)
    pl_prior_2_raw = load_json(args.pl_prior_2) if args.pl_prior_2 else None

    pl_current = normalize_pl_period(pl_current_raw, include_segments=True)
    pl_prior = normalize_pl_period(pl_prior_raw, include_segments=True)
    pl_prior_2 = normalize_pl_period(pl_prior_2_raw) if pl_prior_2_raw else None

    cf_current_raw = load_json(args.cf_current) if args.cf_current else None
    cf_prior_raw = load_json(args.cf_prior) if args.cf_prior else None
    cf_current = normalize_cf(cf_current_raw)
    cf_prior = normalize_cf(cf_prior_raw)

    benchmark = load_json(args.benchmark) if args.benchmark else None

    # Back-fill 2025 net income from cash-flow when P&L returned 0 (a known
    # MCP quirk — the P&L's `netIncome` field is 0 for FY 2025)
    if pl_prior["netIncome"] == 0 and pl_prior["operatingExpenses"] == 0 and cf_prior:
        pl_prior["netIncome"] = round(cf_prior_raw.get("netIncome") or 0, 2)
        pl_prior["operatingExpenses"] = round(pl_prior["grossProfit"] - pl_prior["netIncome"], 2)
        pl_prior["netMarginPct"] = (pl_prior["netIncome"] / pl_prior["revenue"]) if pl_prior["revenue"] else 0

    completed = months_completed(pl_current["periodStart"], args.as_of)
    remaining = max(0, 12 - completed)
    avg_rev = pl_current["revenue"] / completed
    avg_gp = pl_current["grossProfit"] / completed
    avg_opex = pl_current["operatingExpenses"] / completed
    avg_net = pl_current["netIncome"] / completed
    forecast = {
        "completedMonths": completed,
        "remainingMonths": remaining,
        "ytdRevenue": pl_current["revenue"],
        "ytdGrossProfit": pl_current["grossProfit"],
        "ytdOperatingExpenses": pl_current["operatingExpenses"],
        "ytdNetIncome": pl_current["netIncome"],
        "avgMonthlyRevenue": round(avg_rev, 2),
        "avgMonthlyGrossProfit": round(avg_gp, 2),
        "avgMonthlyOperatingExpenses": round(avg_opex, 2),
        "avgMonthlyNetIncome": round(avg_net, 2),
        "yearEndRevenue": round(pl_current["revenue"] + avg_rev * remaining, 2),
        "yearEndGrossProfit": round(pl_current["grossProfit"] + avg_gp * remaining, 2),
        "yearEndOperatingExpenses": round(pl_current["operatingExpenses"] + avg_opex * remaining, 2),
        "yearEndNetIncome": round(pl_current["netIncome"] + avg_net * remaining, 2),
        "runRateRevenue": round(avg_rev * 12, 2),
        "runRateGrossProfit": round(avg_gp * 12, 2),
        "runRateOperatingExpenses": round(avg_opex * 12, 2),
        "runRateNetIncome": round(avg_net * 12, 2),
    }
    forecast["yearEndGrossMarginPct"] = (forecast["yearEndGrossProfit"] / forecast["yearEndRevenue"]) if forecast["yearEndRevenue"] else 0
    forecast["yearEndNetMarginPct"] = (forecast["yearEndNetIncome"] / forecast["yearEndRevenue"]) if forecast["yearEndRevenue"] else 0
    if cf_current:
        avg_op_cash = cf_current["operating"] / completed
        avg_inv_cash = cf_current["investing"] / completed
        avg_fin_cash = cf_current["financing"] / completed
        forecast["yearEndCash"] = round(
            cf_current["cashBeginning"]
            + cf_current["operating"] + avg_op_cash * remaining
            + cf_current["investing"] + avg_inv_cash * remaining
            + cf_current["financing"] + avg_fin_cash * remaining,
            2,
        )
        forecast["yearEndOperatingCash"] = round(cf_current["operating"] + avg_op_cash * remaining, 2)
    else:
        forecast["yearEndCash"] = None
        forecast["yearEndOperatingCash"] = None

    months = load_months(args.months_dir)

    snapshot = {
        "company": {
            "name": "Midwest Design Group LLC",
            "industry": "Commercial and Institutional Building Construction",
            "naics": "236220",
            "state": "IN",
        },
        "asOf": args.as_of,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "QuickBooks Online (live, via QuickBooks MCP)",
        "personas": _persona_definitions(),
        "periods": {
            "current": pl_current,
            "prior": pl_prior,
            "prior2": pl_prior_2,
        },
        "cashFlow": {
            "current": cf_current,
            "prior": cf_prior,
        },
        "workingCapital": compute_working_capital(cf_current_raw, cf_prior_raw),
        "forecast": forecast,
        "verifiedMonths": months,
        "benchmark": benchmark,
    }
    return snapshot


def _persona_definitions():
    """Personas that drive KPI emphasis on the executive summary."""
    return [
        {"id": "cfo", "label": "CFO", "kpis": ["revenue", "grossProfit", "netIncome", "netMarginPct", "cashEnding", "yearEndForecast"]},
        {"id": "fpa", "label": "FP&A", "kpis": ["revenue", "grossMarginPct", "operatingExpenses", "yearEndForecast", "varianceVsForecast", "monthlyTrend"]},
        {"id": "controller", "label": "Controller", "kpis": ["netIncome", "operatingExpenses", "ar", "ap", "retainage", "wipNet"]},
        {"id": "strategy", "label": "Strategy", "kpis": ["revenue", "yoyGrowth", "twoYearCagr", "vsRegional", "segmentMix", "marginExpansion"]},
        {"id": "treasury", "label": "Treasury", "kpis": ["cashEnding", "operatingCash", "lineOfCreditDraw", "yearEndCash", "ar", "ap"]},
    ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pl-current", required=True)
    parser.add_argument("--pl-prior", required=True)
    parser.add_argument("--pl-prior-2")
    parser.add_argument("--cf-current")
    parser.add_argument("--cf-prior")
    parser.add_argument("--benchmark")
    parser.add_argument("--months-dir", default="cfo-dashboard/data/raw/months")
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    snap = build_snapshot(args)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(snap, f, indent=2)
    print(f"Wrote {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
