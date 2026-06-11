#!/usr/bin/env python3
"""
Self-healing refresh for the MDG dashboard.

Philosophy: never just report a failure. On a validation failure, DIAGNOSE the
cause, APPLY a targeted fix, rebuild, and re-validate — looping until it passes
or no fix remains. Only then escalate, and even then hand over the exact
solution (not just "it failed").

Flow per attempt:  build_dashboard -> validate -> (heal -> repeat) -> finalize+promote

Environment:
  MDG_LANDING      folder to promote CSVs into on success (optional)
  MDG_REPULL_CMD   command to re-pull a source; called as: <cmd> <token>
                   tokens: jobs:<offset> | pl | cf | bs | ar | ap
                   (on the host this is your Claude/MCP pull; in tests, a stub)
  MDG_MAX_RETRIES  default 3

Exit 0 = data is valid and promoted (possibly after auto-correction).
Exit 1 = could not heal; prints the precise manual remediation.
"""
import json, os, sys, glob, math, shutil, subprocess, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW  = os.path.join(ROOT, "build", "raw")
DATA = os.path.join(ROOT, "data")
sys.path.insert(0, HERE)
from validate_refresh import evaluate  # noqa: E402

LANDING = os.environ.get("MDG_LANDING")
REPULL  = os.environ.get("MDG_REPULL_CMD")
MAX     = int(os.environ.get("MDG_MAX_RETRIES", "3"))

OFFSET_FILE = lambda o: "knowify_jobs_active.json" if o == 0 else f"knowify_jobs_p{o//100 + 1}.json"

def sh(*cmd):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)

def build_data():
    r = sh(sys.executable, os.path.join("scripts", "build_dashboard.py"))
    if r.returncode != 0:
        print("   build_dashboard.py error:\n" + (r.stderr or r.stdout)[-1500:])
    return r.returncode == 0

def load_recon():
    return json.load(open(os.path.join(DATA, "_reconciliation.json"), encoding="utf-8"))

def knowify_state():
    pages = sorted(glob.glob(os.path.join(RAW, "knowify_jobs_*.json")))
    total, union = 0, set()
    for p in pages:
        d = json.load(open(p, encoding="utf-8"))
        total = max(total, d.get("Total", 0))
        union |= {r["ProjectId"] for r in d.get("Data", [])}
    return len(pages), len(union), total

# ---- diagnosis -> remedies -------------------------------------------------
def plan(checks):
    """Return (remedies, human_steps). remedy = ('rebuild',) or ('repull', token)."""
    failed = {name for name, ok, *_ in checks if not ok}
    remedies, steps = [], []
    if "All Knowify job pages captured" in failed:
        npages, unique, total = knowify_state()
        if total and unique == total:
            remedies.append(("rebuild",))
            steps.append("Knowify pages contain duplicates but full coverage — rebuild dedups them.")
        else:
            need = math.ceil(total / 100) if total else npages
            for i in range(need):
                remedies.append(("repull", f"jobs:{i*100}"))
            steps.append(f"Missing job coverage (have {unique} unique, need {total}). "
                         f"Re-pull JobsReport pages at offsets {[i*100 for i in range(need)]} "
                         f"with stable order [['ProjectId','DESC']] into "
                         f"{', '.join(OFFSET_FILE(i*100) for i in range(need))}.")
    if {"YTD revenue ties to QB P&L", "YTD net income ties to QB cash flow"} & failed:
        remedies += [("repull", "pl"), ("repull", "cf")]
        steps.append("Re-pull QuickBooks P&L (YTD) and Cash Flow (YTD) — qb_pl_2026_ytd.json / qb_cf_2026_ytd.json.")
    if "Trade A/R ties to balance sheet" in failed:
        remedies += [("repull", "bs"), ("repull", "ar")]
        steps.append("Re-pull QuickBooks Balance Sheet and A/R Aging Summary (same as-of date).")
    if "A/P ties to balance sheet" in failed:
        remedies += [("repull", "bs"), ("repull", "ap")]
        steps.append("Re-pull QuickBooks Balance Sheet and A/P Aging Summary (same as-of date).")
    # de-dup remedies, keep order
    seen, uniq = set(), []
    for rm in remedies:
        if rm not in seen:
            seen.add(rm); uniq.append(rm)
    return uniq, steps

def apply(remedies):
    """Apply remedies. Return True if all actionable were applied."""
    all_ok = True
    for rm in remedies:
        if rm[0] == "rebuild":
            continue  # the next loop's build_data() reparses (dedups)
        token = rm[1]
        if not REPULL:
            all_ok = False
            continue
        print(f"   self-heal: re-pull {token}")
        r = sh(*REPULL.split(), token) if " " in REPULL else sh(REPULL, token)
        if r.returncode != 0:
            print("     repull failed:", (r.stderr or r.stdout).strip()[-300:])
            all_ok = False
        elif r.stdout.strip():
            print("     " + r.stdout.strip().splitlines()[-1])
    return all_ok

def finalize():
    sh(sys.executable, os.path.join("scripts", "build_excel.py"))
    sh(sys.executable, os.path.join("scripts", "build_powerbi.py"))
    z = os.path.join(ROOT, "output", "MDG_PowerBI_Kit.zip")
    if os.path.exists(z): os.remove(z)
    sh("bash", "-lc",
       "cd '%s' && zip -q -r output/MDG_PowerBI_Kit.zip powerbi/ data/*.csv scripts/ deploy/ "
       "README.md RECONCILIATION.md SOP_Automated_Refresh.md -x 'scripts/__pycache__/*'" % ROOT)
    if LANDING:
        os.makedirs(LANDING, exist_ok=True)
        for c in glob.glob(os.path.join(DATA, "*.csv")):
            shutil.copy2(c, LANDING)
        print(f"   promoted {len(glob.glob(os.path.join(DATA, '*.csv')))} CSVs -> {LANDING}")

def escalate(checks, steps, attempts):
    print("\n================  REFRESH BLOCKED  ================")
    print(f"Auto-heal attempted {attempts} time(s); the data still does not tie to source.")
    print("Failing checks:")
    for name, ok, model, source in checks:
        if not ok:
            print(f"  [FAIL] {name}: model={model}  source={source}")
    print("\nExact fix (run, then re-run this job):")
    for i, s in enumerate(steps, 1):
        print(f"  {i}. {s}")
    if not REPULL:
        print("\nNote: MDG_REPULL_CMD is not set, so re-pulls could not be auto-applied.")
        print("Wire it (a Claude/MCP pull on the host) to make these fixes hands-free.")
    print("The Power BI landing folder was NOT updated — viewers keep the last good data.")
    print("==================================================")

def main():
    attempts = 0
    last_checks, last_steps = [], []
    while attempts <= MAX:
        attempts += 1
        print(f"[attempt {attempts}/{MAX+1}] build + validate")
        if not build_data():
            # a hard build error: one retry, else escalate
            last_steps = ["build_dashboard.py failed to run — check build/raw/ inputs and Python env."]
            if attempts > MAX: escalate(last_checks, last_steps, attempts); return 1
            time.sleep(2); continue
        recon = load_recon()
        ok, checks = evaluate(recon)
        last_checks = checks
        for name, passed, model, source in checks:
            print(f"   [{'PASS' if passed else 'FAIL'}] {name}")
        if ok:
            print("   validation PASS")
            finalize()
            note = "" if attempts == 1 else f"  (auto-corrected after {attempts-1} fix round(s))"
            print(f"[DONE] refresh valid and promoted{note}. As-of {recon.get('as_of')}")
            return 0
        remedies, steps = plan(checks)
        last_steps = steps
        print("   diagnosis:")
        for s in steps: print("     - " + s)
        if attempts > MAX:
            break
        actionable = apply(remedies)
        if not actionable and all(rm[0] != "rebuild" for rm in remedies):
            break  # nothing we can auto-apply -> escalate now with the solution
        time.sleep(1)
    escalate(last_checks, last_steps, attempts)
    return 1

if __name__ == "__main__":
    sys.exit(main())
