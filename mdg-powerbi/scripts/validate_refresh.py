#!/usr/bin/env python3
"""
Phase-7 validation gate for the MDG dashboard automated refresh.

Reads data/_reconciliation.json (written by build_dashboard.py) and asserts the
model ties to the QuickBooks + Knowify sources. Exits 0 = PASS (safe to promote
the CSVs to the Power BI landing folder), 1 = FAIL (do NOT promote; alert).

Usage:
    python scripts/validate_refresh.py [path/to/_reconciliation.json]
"""
import json, os, sys

# Tolerances (dollars; job count is exact)
TOL_PL   = 1.0      # revenue / net income vs QB
TOL_AR   = 50.0     # trade A/R vs balance sheet (penny-invoice residuals)
TOL_AP   = 50.0     # A/P vs balance sheet

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "_reconciliation.json")
    try:
        r = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        print(f"FAIL: cannot read {path}: {e}")
        return 1

    y = r.get("periods", {}).get("YTD2026", {})
    checks = [
        ("YTD revenue ties to QB P&L",
         abs(y.get("revenue", 0) - r.get("qb_pl_income", 1e9)) <= TOL_PL,
         y.get("revenue"), r.get("qb_pl_income")),
        ("YTD net income ties to QB cash flow",
         abs(y.get("netIncome", 0) - r.get("qb_cf_netincome", 1e9)) <= TOL_PL,
         y.get("netIncome"), r.get("qb_cf_netincome")),
        ("Trade A/R ties to balance sheet",
         abs(r.get("ar_trade_total", 0) - r.get("ar_balance_sheet", 1e9)) <= TOL_AR,
         r.get("ar_trade_total"), r.get("ar_balance_sheet")),
        ("A/P ties to balance sheet",
         abs(r.get("ap_total", 0) - r.get("ap_balance_sheet", 1e9)) <= TOL_AP,
         r.get("ap_total"), r.get("ap_balance_sheet")),
        ("All Knowify job pages captured",
         r.get("jobs", -1) == r.get("qb_jobs_total", -2),
         r.get("jobs"), r.get("qb_jobs_total")),
    ]

    print(f"Validation of refresh as-of {r.get('as_of','?')}:")
    ok = True
    for name, passed, model, source in checks:
        ok = ok and passed
        flag = "PASS" if passed else "FAIL"
        print(f"  [{flag}] {name:42s} model={model!s:>16}  source={source!s:>16}")
    print("RESULT:", "PASS — safe to promote." if ok else "FAIL — DO NOT promote; investigate.")
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
