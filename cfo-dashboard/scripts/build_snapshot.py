#!/usr/bin/env python3
"""
Build a CFO dashboard data snapshot from QuickBooks MCP tool results.

Reads raw P&L (annual + per-month) and Cash Flow JSON files produced by the
QuickBooks MCP and emits a single dashboard-friendly JSON file. The dashboard
front-end reads that file directly. No hardcoded numbers — every value derives
from the QuickBooks reports.

The QuickBooks MCP P&L tool's `monthlyBreakdown` field on a multi-month query
does NOT reconcile to its own annual totals. To get accurate monthly numbers
we run individual one-month P&L queries and stash the result under
data/raw/months/YYYY-MM.json. This script reads both shapes.

Usage:
    python build_snapshot.py \
        --pl-current FILE --pl-prior FILE [--pl-prior-2 FILE] \
        --cf-current FILE [--cf-prior FILE] \
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


def normalize_pl_period(report):
    """Normalize a P&L period response (annual or multi-month) into a flat structure.
    Uses verified top-level totals only — ignores the unreliable monthlyBreakdown."""
    revenue = report.get("totalIncome") or 0
    gross = report.get("grossProfit") or 0
    cogs = round(revenue - gross, 2)
    opex = report.get("totalExpenses") or 0
    net = report.get("netIncome") or 0
    return {
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


def normalize_pl_month(report):
    """Normalize a single-month P&L response."""
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
    }


def months_completed(period_start, as_of):
    """Whole calendar months from period_start through the month containing as_of."""
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


def build_snapshot(args):
    pl_current = normalize_pl_period(load_json(args.pl_current))
    pl_prior = normalize_pl_period(load_json(args.pl_prior))
    pl_prior_2 = normalize_pl_period(load_json(args.pl_prior_2)) if args.pl_prior_2 else None
    cf_current = normalize_cf(load_json(args.cf_current)) if args.cf_current else None
    cf_prior = normalize_cf(load_json(args.cf_prior)) if args.cf_prior else None

    # The 2025 P&L annual response has totalExpenses=0 / netIncome=0 (an MCP
    # quirk). Cash flow exposes the real net income — back-fill from there.
    if pl_prior["netIncome"] == 0 and pl_prior["operatingExpenses"] == 0 and cf_prior:
        # Cash flow's "Net Income" is the first row under operating activities,
        # which we expose as a top-level field on cf_prior raw input.
        raw_cf_prior = load_json(args.cf_prior)
        cf_net_income = None
        for row in (raw_cf_prior.get("reportRows") or []):
            cells = row.get("cells") or []
            if cells and cells[0].get("value") == "Net Income":
                cf_net_income = cells[1].get("value") if len(cells) > 1 else None
                break
        if cf_net_income is None:
            cf_net_income = raw_cf_prior.get("netIncome")
        if cf_net_income is not None:
            pl_prior["netIncome"] = round(cf_net_income, 2)
            # Operating expenses = gross profit - net income
            pl_prior["operatingExpenses"] = round(
                pl_prior["grossProfit"] - pl_prior["netIncome"], 2
            )
            pl_prior["netMarginPct"] = (
                pl_prior["netIncome"] / pl_prior["revenue"] if pl_prior["revenue"] else 0
            )

    completed = months_completed(pl_current["periodStart"], args.as_of)

    # Forecast: YTD actual + (avg monthly run rate * remaining months)
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
        "yearEndOperatingExpenses": round(
            pl_current["operatingExpenses"] + avg_opex * remaining, 2
        ),
        "yearEndNetIncome": round(pl_current["netIncome"] + avg_net * remaining, 2),
        "runRateRevenue": round(avg_rev * 12, 2),
        "runRateGrossProfit": round(avg_gp * 12, 2),
        "runRateOperatingExpenses": round(avg_opex * 12, 2),
        "runRateNetIncome": round(avg_net * 12, 2),
    }
    forecast["yearEndGrossMarginPct"] = (
        forecast["yearEndGrossProfit"] / forecast["yearEndRevenue"]
        if forecast["yearEndRevenue"]
        else 0
    )
    forecast["yearEndNetMarginPct"] = (
        forecast["yearEndNetIncome"] / forecast["yearEndRevenue"]
        if forecast["yearEndRevenue"]
        else 0
    )
    if cf_current:
        avg_op_cash = cf_current["operating"] / completed
        avg_inv_cash = cf_current["investing"] / completed
        avg_fin_cash = cf_current["financing"] / completed
        forecast["yearEndCash"] = round(
            cf_current["cashBeginning"]
            + cf_current["operating"]
            + avg_op_cash * remaining
            + cf_current["investing"]
            + avg_inv_cash * remaining
            + cf_current["financing"]
            + avg_fin_cash * remaining,
            2,
        )
        forecast["yearEndOperatingCash"] = round(
            cf_current["operating"] + avg_op_cash * remaining, 2
        )
    else:
        forecast["yearEndCash"] = None
        forecast["yearEndOperatingCash"] = None

    months = load_months(args.months_dir)

    snapshot = {
        "company": {
            "name": "Midwest Design Group LLC",
            "industry": "Commercial and Institutional Building Construction",
            "naics": "236220",
        },
        "asOf": args.as_of,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "QuickBooks Online (live, via QuickBooks MCP)",
        "periods": {
            "current": pl_current,
            "prior": pl_prior,
            "prior2": pl_prior_2,
        },
        "cashFlow": {
            "current": cf_current,
            "prior": cf_prior,
        },
        "forecast": forecast,
        "verifiedMonths": months,
    }
    return snapshot


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pl-current", required=True)
    parser.add_argument("--pl-prior", required=True)
    parser.add_argument("--pl-prior-2")
    parser.add_argument("--cf-current")
    parser.add_argument("--cf-prior")
    parser.add_argument("--months-dir", default="cfo-dashboard/data/raw/months")
    parser.add_argument("--as-of", required=True, help="YYYY-MM-DD")
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
