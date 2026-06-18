#!/usr/bin/env python3
"""
MDG Executive Financial Dashboard — data build pipeline.

Reads the raw QuickBooks Online + Knowify exports in build/raw/ and emits the
star-schema CSVs in data/ that feed both the Excel dashboard and the Power BI
semantic model. Every number traces to a real source response — no dummy data.

Sources (build/raw/):
  qb_pl_2024.json / qb_pl_2025.json / qb_pl_2026_ytd.json  QuickBooks P&L (account tree)
  months/*.json                                            QuickBooks single-month P&L totals
  qb_balance_sheet.json                                    QuickBooks Balance Sheet (as-of)
  qb_ar_aging_summary.json / qb_ap_aging_summary.json      QuickBooks AR/AP aging by customer/vendor
  qb_cf_2026_ytd.json / qb_cf_2025.json                    QuickBooks cash flow
  knowify_jobs_active*.json / _p2 / _p3                     Knowify JobsReport (AJR) active jobs

Run:  python3 scripts/build_dashboard.py
"""
import csv, json, os, glob, datetime as dt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW  = os.path.join(ROOT, "build", "raw")
OUT  = os.path.join(ROOT, "data")
os.makedirs(OUT, exist_ok=True)

def load(p):
    with open(os.path.join(RAW, p), encoding="utf-8") as f:
        return json.load(f)

# Report as-of date is derived from the live pull itself (the YTD P&L periodEnd),
# so a refresh needs no code edits — just re-pull and rebuild.
def _derive_as_of():
    try:
        return load("qb_pl_2026_ytd.json").get("periodEnd") or dt.date.today().isoformat()
    except Exception:
        return dt.date.today().isoformat()
AS_OF = _derive_as_of()
TODAY = dt.date.fromisoformat(AS_OF)

def num(x):
    if x is None or x == "":
        return 0.0
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0

def write_csv(name, header, rows):
    path = os.path.join(OUT, name)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"  wrote {name:28s} {len(rows):>5} rows")
    return path

# ---------------------------------------------------------------------------
# Division mapping  (Knowify ClassName / QB account-name  ->  canonical key)
# ---------------------------------------------------------------------------
DIVISIONS = [   # clean professional: navy lead + blue/grayscale ramp
    ("TI", "Tenant Improvement", 1, "#1F4E79"),
    ("MF", "Multi-Family",       2, "#2E75B6"),
    ("DW", "Drywall",            3, "#6E7585"),
    ("EN", "Engineering",        4, "#9AA3AF"),
    ("UN", "Unallocated",        9, "#C9D2DD"),
]
def div_from_class(name):
    n = (name or "").lower()
    if "ti division" in n or "tenant" in n:      return "TI"
    if "multi" in n:                              return "MF"
    if "drywall" in n:                            return "DW"
    if "engineer" in n:                           return "EN"
    return "UN"

def div_from_account(name):
    n = (name or "").lower()
    if "engineering" in n: return "EN"
    if "drywall" in n:     return "DW"
    return "ALL"          # company-level / not divisionally tagged in the GL

# ---------------------------------------------------------------------------
# P&L tree parsing -> leaf accounts per section, with subcategory + section
# ---------------------------------------------------------------------------
SECTION_CATEGORY = {
    "Income": "Revenue",
    "Cost of Goods Sold": "COGS",
    "Expenses": "Operating Expense",
    "Other Income": "Other Income",
    "Other Expenses": "Other Expense",
}

def pl_rows(report):
    return (((report.get("reportData") or {}).get("data") or {}).get("rows")) or []

def acct_name(row):
    for c in row.get("cells") or []:
        if c.get("name") == "ACCOUNT_NAME":
            return (c.get("value") or "").strip()
    return ""

def acct_value(row):
    for c in row.get("cells") or []:
        if c.get("name") == "DETAIL_NATURAL_HOME_AMOUNT__TOTAL":
            return num(c.get("value"))
    return 0.0

def acct_value_direct(row):
    """Parent account's OWN direct postings (excludes child sub-accounts)."""
    for c in row.get("cells") or []:
        if c.get("name") == "DETAIL_NATURAL_HOME_AMOUNT__TOTAL_WITHOUT_SUBGROUPS":
            return num(c.get("value"))
    return 0.0

def section_ids(rows):
    ids = {}
    for r in rows:
        meta = r.get("metadata") or {}
        if meta.get("parentId") == "0":
            nm = acct_name(r)
            if nm in SECTION_CATEGORY:
                ids[nm] = meta.get("id")
    return ids

def walk_leaves(rows, parent_id, subcat, out):
    """Collect leaf ITEM accounts under parent_id. subcat = nearest group label."""
    for r in rows:
        meta = r.get("metadata") or {}
        if meta.get("parentId") != parent_id:
            continue
        rtype = meta.get("type") or []
        nm = acct_name(r)
        if not nm or nm.startswith("Total for"):
            continue
        if "GROUP" in rtype or "SUMMARY" in rtype:
            # A parent account may carry its own direct postings (without_subgroups)
            # in addition to child sub-accounts. Capture both, no double count.
            direct = acct_value_direct(r)
            if abs(direct) > 0.005:
                out.append((nm, direct, subcat))
            walk_leaves(rows, meta.get("id"), nm, out)
        elif "ITEM" in rtype:
            out.append((nm, acct_value(r), subcat))

def section_header_total(rows, sid):
    """The QB section header's rolled-up TOTAL (authoritative section total)."""
    for r in rows:
        if (r.get("metadata") or {}).get("id") == sid:
            return acct_value(r)
    return 0.0

def extract_pl(report):
    """Return {section_name: ([(account, value, subcat),...], header_total)}.
    Adds an 'Unitemized' plug line when itemized leaves fall short of the QB
    section header total (happens on some exports), so Fact_GL ties to QB."""
    rows = pl_rows(report)
    ids = section_ids(rows)
    result = {}
    for sec, sid in ids.items():
        leaves = []
        walk_leaves(rows, sid, sec, leaves)
        header = section_header_total(rows, sid)
        leaf_sum = sum(v for _, v, _ in leaves)
        gap = header - leaf_sum
        if abs(gap) > 0.5:
            leaves.append((f"{sec} — Unitemized", round(gap, 2), sec))
        result[sec] = (leaves, header)
    return result

# ---------------------------------------------------------------------------
# 1. Periods: parse the three fiscal P&L trees
# ---------------------------------------------------------------------------
PERIODS = [
    ("FY2024",   "2024-12-31", "qb_pl_2024.json"),
    ("FY2025",   "2025-12-31", "qb_pl_2025.json"),
    ("YTD2026",  AS_OF,        "qb_pl_2026_ytd.json"),
]
print("Parsing P&L periods...")
gl_rows = []                 # Fact_GL
account_meta = {}            # Account -> (Statement, Category, Subcategory, DivKey)
period_totals = {}
for pkey, pend, fname in PERIODS:
    rep = load(fname)
    pl = extract_pl(rep)
    tot = {"Revenue": 0.0, "COGS": 0.0, "Operating Expense": 0.0,
           "Other Income": 0.0, "Other Expense": 0.0}
    for sec, (leaves, header) in pl.items():
        cat = SECTION_CATEGORY[sec]
        for name, val, subcat in leaves:
            if abs(val) < 0.005:
                continue
            dk = div_from_account(name)
            gl_rows.append([name, pkey, pend, dk, round(val, 2), cat])
            tot[cat] += val
            statement = "P&L"
            account_meta.setdefault(name, ("P&L", cat, subcat, dk))
    gp = tot["Revenue"] - tot["COGS"]
    ni = gp - tot["Operating Expense"] + tot["Other Income"] - tot["Other Expense"]
    period_totals[pkey] = {
        "revenue": tot["Revenue"], "cogs": tot["COGS"], "grossProfit": gp,
        "opex": tot["Operating Expense"], "otherIncome": tot["Other Income"],
        "otherExpense": tot["Other Expense"], "netIncome": ni,
    }
    print(f"  {pkey}: Rev {tot['Revenue']:,.0f}  COGS {tot['COGS']:,.0f}  "
          f"GP {gp:,.0f}  OpEx {tot['Operating Expense']:,.0f}  NI {ni:,.0f}")

# ---------------------------------------------------------------------------
# 2. Monthly P&L (trend) — from months/*.json (two key styles supported)
# ---------------------------------------------------------------------------
print("Parsing monthly P&L...")
month_rows = []
for mp in sorted(glob.glob(os.path.join(RAW, "months", "*.json"))):
    m = json.load(open(mp))
    rev = num(m.get("revenue", m.get("totalIncome")))
    cogs = num(m.get("cogs", m.get("totalCogs")))
    gp = num(m.get("grossProfit")) or (rev - cogs)
    opex = num(m.get("operatingExpenses", m.get("totalExpenses")))
    ni = num(m.get("netIncome"))
    mend = m.get("periodEnd")
    gm = gp / rev if rev else 0.0
    nm = ni / rev if rev else 0.0
    month_rows.append([mend, round(rev,2), round(cogs,2), round(gp,2),
                       round(opex,2), round(ni,2), round(gm,4), round(nm,4)])
month_rows.sort()
for r in month_rows:
    print(f"  {r[0]}: Rev {r[1]:,.0f}  NI {r[5]:,.0f}")

# ---------------------------------------------------------------------------
# 3. Knowify jobs -> Fact_WIP + Dim_Job + Dim_PM
# ---------------------------------------------------------------------------
print("Parsing Knowify jobs (AJR)...")
job_files = sorted(os.path.basename(p) for p in glob.glob(os.path.join(RAW, "knowify_jobs_*.json")))
jobs = []
seen = set()
for jf in job_files:
    if not os.path.exists(os.path.join(RAW, jf)):
        continue
    d = load(jf)
    for r in d.get("Data", []):
        pid = r.get("ProjectId")
        if pid in seen:
            continue
        seen.add(pid)
        jobs.append(r)
print(f"  {len(jobs)} unique active jobs")

def dnorm(s):
    return (s or "")[:10] if s else ""

wip_rows = []
pms = {}
job_dim = []
customers = set()
for r in jobs:
    pid = r.get("ProjectId")
    name = (r.get("ProjectName") or "").strip()
    pm = (r.get("ProjectManager") or "").strip() or "(Unassigned)"
    dk = div_from_class(r.get("ClassName"))
    cust = (r.get("ClientName") or "").strip()
    if cust:
        customers.add(cust)
    contract = num(r.get("ContractTotal"))
    change   = num(r.get("ChangeOrders"))
    invoiced = num(r.get("Invoiced"))
    paid     = num(r.get("PaymentsInvoices"))
    budget   = num(r.get("BudgetTotal"))
    actual   = (num(r.get("MaterialsActual")) + num(r.get("SubsActual")) +
                num(r.get("EquipmentActual")) + num(r.get("MiscActual")) +
                num(r.get("LaborCommitted")))
    pct      = num(r.get("PercCompleted"))
    pctf     = pct / 100.0
    profit_amt = num(r.get("ProfitAmount"))
    profit_pct = num(r.get("Profit"))                 # current booked margin, a %
    proj_raw   = num(r.get("ProjectedProfit"))        # Knowify ProjectedProfit is a % (not $)
    knowify_wip = num(r.get("WIP"))
    retain    = num(r.get("Retainage"))
    open_ar   = invoiced - paid
    # Revenue-based (cost-to-cost) earned revenue + WIP per the spec
    earned    = contract * pctf
    wip_net   = earned - invoiced                     # +underbilled / -overbilled
    over      = -wip_net if wip_net < 0 else 0.0
    under     = wip_net if wip_net > 0 else 0.0
    # Margins. Profit Fade % = forecast margin at completion - current booked margin
    # (both from Knowify's computed percentages). ProjectedProfit == +/-100 is a
    # Knowify placeholder for "no real forecast" -> treat fade as 0 (not eroding).
    has_budget   = budget > 0 and contract > 0
    managed      = (pm != "(Unassigned)") and has_budget and contract >= 1000
    cur_margin   = profit_pct / 100.0
    proj_margin  = proj_raw / 100.0
    proj_dollars = proj_margin * contract
    est_margin   = (contract - budget) / contract if has_budget else 0.0
    forecast_ok  = abs(proj_raw) < 100.0              # exclude +/-100 placeholders
    fade         = (proj_margin - cur_margin) if forecast_ok else 0.0
    wip_rows.append([
        AS_OF, pid, name, dk, pm, cust, r.get("Status","").replace("#",""),
        round(contract,2), round(change,2), round(invoiced,2), round(paid,2),
        round(budget,2), round(actual,2), round(pctf,4), round(earned,2),
        round(wip_net,2), round(knowify_wip,2), round(over,2), round(under,2),
        round(profit_amt,2), round(cur_margin,4), round(proj_dollars,2),
        round(proj_margin,4), round(est_margin,4), round(fade,4),
        round(retain,2), round(open_ar,2),
        "TRUE" if has_budget else "FALSE", "TRUE" if managed else "FALSE",
    ])
    pms.setdefault(pm, 0)
    pms[pm] += 1
    job_dim.append([name, pid, dk, pm, cust, r.get("Status","").replace("#",""),
                    (r.get("ContractType") or "").replace("#",""),
                    (r.get("City") or ""), (r.get("StateProvince") or ""),
                    dnorm(r.get("DateActive")), dnorm(r.get("StartDate")),
                    dnorm(r.get("EndDate"))])

# ---------------------------------------------------------------------------
# 4. AR / AP aging summaries (dedup: top-level customers, parentId == "0")
# ---------------------------------------------------------------------------
def aging_top_rows(report, buckets):
    rows = report["reportData"]["rows"]
    def cv(r, n):
        for c in r.get("cells") or []:
            if c.get("name") == n:
                return c.get("value")
        return None
    out = []
    for r in rows:
        meta = r.get("metadata") or {}
        if meta.get("parentId") != "0":
            continue
        name = (cv(r, report["displayColumns"][0]["key"]) or "").strip()
        if not name or name.startswith("Total for"):
            continue
        vals = {b: num(cv(r, b)) for b in buckets}
        total = num(cv(r, "Total"))
        out.append((name, vals, total))
    return out

print("Parsing AR / AP aging...")
ar = load("qb_ar_aging_summary.json")
AR_BUCKETS = ["Current", "1-30", "31-60", "61-90", "91+"]
ar_top = aging_top_rows(ar, AR_BUCKETS)
ar_rows = []
ar_total = 0.0
for name, vals, total in ar_top:
    for b in AR_BUCKETS:
        if abs(vals[b]) > 0.005:
            ar_rows.append([name, b, round(vals[b], 2), "FALSE", AS_OF])
    ar_total += total
# Retainage receivable (separate GL account, from balance sheet)
bs = load("qb_balance_sheet.json")
def bs_account_value(bs, target):
    found = [0.0]
    def walk(rows):
        for r in rows:
            cells = r.get("cells") or []
            nm = None; val = None
            for c in cells:
                if c.get("id") == "1" or c.get("name") in ("ACCOUNT_NAME","ACCOUNT_FULL_NAME"):
                    nm = c.get("value")
            for c in cells:
                if isinstance(c.get("value"), (int, float)):
                    val = c.get("value")
            if nm and nm.strip() == target and val is not None:
                found[0] = float(val)
            if r.get("rows"):
                walk(r["rows"])
    walk(bs.get("reportData", {}).get("rows", []))
    return found[0]

retainage = bs_account_value(bs, "Retainage Receivable")
ar_rows.append(["(Retainage Receivable)", "Retainage", round(retainage, 2), "TRUE", AS_OF])

ap = load("qb_ap_aging_summary.json")
AP_BUCKETS = ["Current", "1 - 30", "31 - 60", "61 - 90", "91+"]
ap_top = aging_top_rows(ap, AP_BUCKETS)
ap_rows = []
ap_total = 0.0
vendors = set()
for name, vals, total in ap_top:
    vendors.add(name)
    for b in AP_BUCKETS:
        if abs(vals[b]) > 0.005:
            ap_rows.append([name, b.replace(" ", ""), round(vals[b], 2), AS_OF])
    ap_total += total

# ---------------------------------------------------------------------------
# 5. Balance sheet -> Fact_BalanceSheet + cash inputs
# ---------------------------------------------------------------------------
print("Parsing balance sheet...")
bs_summary = bs.get("summary", {})
ab = bs_summary.get("assetBreakdown", {})
lb = bs_summary.get("liabilityBreakdown", {})
bs_rows = []
def add_bs(account, section, amount):
    if abs(num(amount)) > 0.005:
        bs_rows.append([account, section, round(num(amount), 2), AS_OF])
add_bs("Cash", "Assets", ab.get("cash"))
add_bs("Accounts Receivable", "Assets", ab.get("accountsReceivable"))
add_bs("Retainage Receivable", "Assets", retainage)
add_bs("Drywall Inventory", "Assets", bs_account_value(bs, "Drywall Inventory"))
add_bs("WIP Underbillings", "Assets", bs_account_value(bs, "WIP Adj - Underbillings"))
add_bs("Other Current Assets (net)", "Assets",
       num(ab.get("otherCurrentAssets")) - retainage
       - bs_account_value(bs, "Drywall Inventory")
       - bs_account_value(bs, "WIP Adj - Underbillings"))
add_bs("Fixed Assets", "Assets", ab.get("fixedAssets"))
add_bs("Other Assets", "Assets", ab.get("otherAssets"))
add_bs("Accounts Payable", "Liabilities", lb.get("accountsPayable"))
add_bs("Credit Cards", "Liabilities", lb.get("creditCards"))
loc_drawn = bs_account_value(bs, "Forum Line of Credit - LOC (0874)")
loc_capx  = bs_account_value(bs, "Forum CAP X LOC (1708)")
add_bs("Line of Credit (Forum 0874)", "Liabilities", loc_drawn)
add_bs("CapX Line of Credit (Forum 1708)", "Liabilities", loc_capx)
add_bs("WIP Overbillings", "Liabilities", bs_account_value(bs, "WIP Adj - Overbillings"))
add_bs("Other Current Liabilities (net)", "Liabilities",
       num(lb.get("otherCurrentLiabilities")) - loc_drawn - loc_capx
       - bs_account_value(bs, "WIP Adj - Overbillings"))
add_bs("Long-term Liabilities", "Liabilities", lb.get("longTermLiabilities"))
add_bs("Total Equity", "Equity", bs_summary.get("totalEquity"))

# ---------------------------------------------------------------------------
# 6. Cash flow + Fact_Cash (real cash/LOC + USER-INPUT covenant params)
# ---------------------------------------------------------------------------
cf = load("qb_cf_2026_ytd.json")
cash_balance = num(ab.get("cash"))
# USER INPUT defaults (parameterized — see Param_Cash.csv / README)
LOC_LIMIT    = 8000000.0     # <-- USER INPUT: Forum LOC commitment
ADVANCE_RATE = 0.80          # <-- USER INPUT: borrowing-base advance rate
eligible_ar  = ar_total      # eligible AR basis (trade AR), user may refine
cash_rows = [[
    AS_OF, round(cash_balance,2), round(loc_drawn,2), round(loc_capx,2),
    round(num(cf.get("operatingActivities")),2),
    round(num(cf.get("investingActivities")),2),
    round(num(cf.get("financingActivities")),2),
    round(num(cf.get("netCashIncrease")),2),
    round(LOC_LIMIT,2), round(ADVANCE_RATE,4), round(eligible_ar,2),
    round(num(ab.get("currentAssets")),2), round(num(lb.get("currentLiabilities")),2),
]]
param_rows = [
    ["LOC Limit", LOC_LIMIT, "USER INPUT — Forum line-of-credit commitment (not in QuickBooks)"],
    ["Advance Rate", ADVANCE_RATE, "USER INPUT — borrowing-base advance rate on eligible AR"],
    ["Eligible AR", eligible_ar, "Defaulted to total trade AR; refine to eligible basis"],
    ["LOC Drawn", loc_drawn, "REAL — QuickBooks balance sheet, Forum LOC (0874)"],
    ["Cash Balance", cash_balance, "REAL — QuickBooks balance sheet cash"],
]

# ---------------------------------------------------------------------------
# 7. Fact_Budget (division x snapshot) from job-cost (AJR) data
# ---------------------------------------------------------------------------
budget_by_div = {}
for w in wip_rows:
    dk = w[3]; contract = w[7]; budget = w[11]; actual = w[12]; invoiced = w[9]
    b = budget_by_div.setdefault(dk, [0.0, 0.0, 0.0, 0.0])
    b[0] += contract; b[1] += budget; b[2] += actual; b[3] += invoiced
budget_rows = [[dk, "Active", round(v[0],2), round(v[1],2), round(v[2],2), round(v[3],2)]
               for dk, v in sorted(budget_by_div.items())]

# ---------------------------------------------------------------------------
# 8. Dimensions
# ---------------------------------------------------------------------------
# Dim_Date
start = dt.date(2024, 1, 1); end = dt.date(2026, 12, 31)
date_rows = []
d = start
while d <= end:
    q = (d.month - 1)//3 + 1
    date_rows.append([d.isoformat(), d.year, f"Q{q}", q, d.strftime("%b"), d.month,
                      d.strftime("%b %Y"), d.strftime("%Y-%m"),
                      "TRUE" if (d.year==TODAY.year and d.month==TODAY.month) else "FALSE"])
    d += dt.timedelta(days=1)

ALL_PMS = ["Ben Garza","Cole Garriott","Dustin Hurt","Kelden Tyson","Shawn Welcher",
           "Spencer Anderson","Ted Wells","Tommy Cohoat","Trevor Anderson"]
pm_rows = []
for pm in sorted(set(list(pms.keys()) + ALL_PMS)):
    active = "TRUE" if pm in ALL_PMS else "FALSE"
    pm_rows.append([pm, pms.get(pm, 0), active])

acct_rows = []
order = 0
for acct, (stmt, cat, subcat, dk) in sorted(account_meta.items(),
        key=lambda kv: (["Revenue","COGS","Operating Expense","Other Income","Other Expense"].index(kv[1][1]), kv[0])):
    order += 1
    acct_rows.append([acct, stmt, cat, subcat, dk, order])

# ---------------------------------------------------------------------------
# Write all CSVs
# ---------------------------------------------------------------------------
print("\nWriting CSVs...")
write_csv("Dim_Date.csv",
          ["Date","Year","Quarter","QuarterNum","Month","MonthNum","MonthYear","YearMonth","IsCurrentMonth"],
          date_rows)
write_csv("Dim_Division.csv", ["DivKey","Division","Sort","Color"], DIVISIONS)
write_csv("Dim_PM.csv", ["PMName","ActiveJobs","Active"], pm_rows)
write_csv("Dim_Job.csv",
          ["Job","ProjectId","DivKey","PMName","Customer","Status","ContractType","City","State","DateActive","StartDate","EndDate"],
          job_dim)
write_csv("Dim_Account.csv", ["Account","Statement","Category","Subcategory","DivKey","Sort"], acct_rows)
write_csv("Dim_Customer.csv", ["Customer"], [[c] for c in sorted(customers)])
write_csv("Dim_Vendor.csv", ["Vendor"], [[v] for v in sorted(vendors)])
write_csv("Fact_GL.csv", ["Account","Period","PeriodEnd","DivKey","Amount","Category"], gl_rows)
write_csv("Fact_PL_Monthly.csv",
          ["MonthEnd","Revenue","COGS","GrossProfit","OpEx","NetIncome","GrossMarginPct","NetMarginPct"],
          month_rows)
write_csv("Fact_WIP.csv",
          ["SnapshotDate","ProjectId","Job","DivKey","PMName","Customer","Status",
           "ContractTotal","ChangeOrders","Invoiced","PaymentsInvoices","BudgetTotal","ActualCost",
           "PctComplete","EarnedRevenue","WIPNet","KnowifyWIP","Overbilled","Underbilled",
           "ProfitAmount","ProfitPct","ProjectedProfit","ProjectedProfitPct","EstMarginPct","ProfitFadePct",
           "Retainage","OpenAR","HasBudget","Managed"],
          wip_rows)
write_csv("Fact_AR.csv", ["Customer","Bucket","Amount","IsRetainage","AsOfDate"], ar_rows)
write_csv("Fact_AP.csv", ["Vendor","Bucket","Amount","AsOfDate"], ap_rows)
write_csv("Fact_Cash.csv",
          ["Date","CashBalance","LOCDrawn","LOCCapX","OperatingCF","InvestingCF","FinancingCF","NetCashChange","LOCLimit","AdvanceRate","EligibleAR","CurrentAssets","CurrentLiabilities"],
          cash_rows)
write_csv("Fact_Budget.csv", ["DivKey","Period","ContractTotal","BudgetTotal","ActualCost","Invoiced"], budget_rows)
write_csv("Fact_BalanceSheet.csv", ["Account","Section","Amount","AsOfDate"], bs_rows)
write_csv("Param_Cash.csv", ["Param","Value","Note"], param_rows)

# ---------------------------------------------------------------------------
# Reconciliation report
# ---------------------------------------------------------------------------
wip_contract = sum(w[7] for w in wip_rows)
wip_invoiced = sum(w[9] for w in wip_rows)
wip_profit   = sum(w[19] for w in wip_rows)
wip_retain   = sum(w[25] for w in wip_rows)
recon = {
    "as_of": AS_OF,
    "periods": period_totals,
    "monthly_count": len(month_rows),
    "jobs": len(jobs),
    "wip_contract_total": round(wip_contract, 2),
    "wip_invoiced_total": round(wip_invoiced, 2),
    "wip_profit_total": round(wip_profit, 2),
    "wip_retainage_total": round(wip_retain, 2),
    "ar_trade_total": round(ar_total, 2),
    "ar_balance_sheet": round(num(ab.get("accountsReceivable")), 2),
    "retainage_balance_sheet": round(retainage, 2),
    "ap_total": round(ap_total, 2),
    "ap_balance_sheet": round(num(lb.get("accountsPayable")), 2),
    "cash_balance": round(cash_balance, 2),
    "loc_drawn": round(loc_drawn, 2),
    "total_assets": round(num(bs_summary.get("totalAssets")), 2),
    "total_liabilities": round(num(bs_summary.get("totalLiabilities")), 2),
    "total_equity": round(num(bs_summary.get("totalEquity")), 2),
    "qb_pl_income": round(num(load("qb_pl_2026_ytd.json").get("totalIncome")), 2),
    "qb_cf_netincome": round(num(cf.get("netIncome")), 2),
    "qb_jobs_total": max((load(jf).get("Total", 0) for jf in job_files if os.path.exists(os.path.join(RAW, jf))), default=len(jobs)),
}
with open(os.path.join(OUT, "_reconciliation.json"), "w") as f:
    json.dump(recon, f, indent=2)

qb_pl_income = num(load("qb_pl_2026_ytd.json").get("totalIncome"))
qb_cf_ni = num(cf.get("netIncome"))
qb_jobs_total = max((load(jf).get("Total", 0) for jf in job_files if os.path.exists(os.path.join(RAW, jf))), default=len(jobs))
print("\n=== RECONCILIATION ===")
print(f"  YTD2026 Revenue (Fact_GL)         {period_totals['YTD2026']['revenue']:>16,.2f}   QB P&L totalIncome {qb_pl_income:,.2f}")
print(f"  YTD2026 Net Income (Fact_GL)      {period_totals['YTD2026']['netIncome']:>16,.2f}   QB cashflow NetIncome {qb_cf_ni:,.2f}")
print(f"  AR trade (Fact_AR dedup)          {ar_total:>16,.2f}   QB balance sheet A/R {num(ab.get('accountsReceivable')):,.2f}")
print(f"  Retainage                         {retainage:>16,.2f}   (balance sheet)")
print(f"  AP (Fact_AP dedup)                {ap_total:>16,.2f}   QB balance sheet A/P {num(lb.get('accountsPayable')):,.2f}")
print(f"  Active jobs                        {len(jobs):>16}   Knowify JobsReport Total {qb_jobs_total}")
print(f"  WIP contract total                {wip_contract:>16,.2f}")
print(f"  LOC drawn                         {loc_drawn:>16,.2f}   balance sheet Forum LOC 0874")
print(f"  Total assets                      {num(bs_summary.get('totalAssets')):>16,.2f}")
print("\nDone.")
