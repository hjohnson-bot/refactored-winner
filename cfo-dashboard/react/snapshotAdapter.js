/**
 * snapshotAdapter.js
 *
 * Converts the dashboard's snapshot.json (built from live QuickBooks data via
 * scripts/refresh.sh and the QuickBooks MCP) into the `{months: {...}}` shape
 * the React CFODashboard component expects.
 *
 * Snapshot input shape (cfo-dashboard/data/snapshot.json):
 *   periods.current / prior / prior2: { revenue, cogs, grossProfit, operatingExpenses, netIncome, periodStart, periodEnd, ... }
 *   verifiedMonths: [{ month, revenue, cogs, grossProfit, operatingExpenses, netIncome, ... }]
 *   cashFlow.current / prior: { cashEnding, ... }
 *   workingCapital.current / prior: { ar, ap, retainage, ... }
 *
 * Component-expected output shape:
 *   { months: { "YYYY-MM": { revenue, cogs, grossProfit, opex, netIncome, ar, ap, cash, ... } } }
 */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * Build per-month entries from the snapshot.
 *
 * Verified months come from individual QB month queries → use those values
 * directly. For periods without verified months (FY 2024, FY 2025, parts of
 * 2026), distribute the period total evenly across its months so trends and
 * KPIs render. The dashboard treats verified months as ground truth and the
 * estimated months as projections — verifiedMonths[i].month is authoritative.
 */
export function snapshotToMonths(snapshot) {
  const monthsByKey = {};
  const cf = snapshot.cashFlow || {};
  const wc = snapshot.workingCapital || {};

  // 1) Authoritative monthly data (verified pulls from QB per-month).
  (snapshot.verifiedMonths || []).forEach(m => {
    const [year, monthNum] = m.month.split("-").map(Number);
    monthsByKey[m.month] = {
      year,
      month: monthNum - 1,
      monthName: MONTHS[monthNum - 1],
      revenue: m.revenue,
      cogs: m.cogs,
      grossProfit: m.grossProfit,
      grossMargin: m.grossMarginPct,
      opex: m.operatingExpenses,
      netIncome: m.netIncome,
      netMargin: m.netMarginPct,
      ebitda: m.netIncome + Math.round((m.operatingExpenses || 0) * 0.08),
      // Balance-sheet items are period-end — only the most recent month gets the live value.
      ar: 0, ap: 0, cash: 0,
      _verified: true,
    };
  });

  // 2) Distribute non-verified period totals across their months so the
  //    trend chart isn't all gaps. This is clearly marked as estimated.
  const distributePeriod = (periodKey, label) => {
    const p = snapshot.periods?.[periodKey];
    if (!p || !p.periodStart || !p.periodEnd) return;
    const start = new Date(p.periodStart);
    const end = new Date(p.periodEnd);
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      months.push({ y: cursor.getFullYear(), m: cursor.getMonth() });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (months.length === 0) return;
    months.forEach(({ y, m }) => {
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      if (monthsByKey[key]?._verified) return;
      const share = 1 / months.length;
      monthsByKey[key] = {
        year: y,
        month: m,
        monthName: MONTHS[m],
        revenue: Math.round((p.revenue || 0) * share),
        cogs: Math.round((p.cogs || 0) * share),
        grossProfit: Math.round((p.grossProfit || 0) * share),
        grossMargin: p.grossMarginPct || 0,
        opex: Math.round((p.operatingExpenses || 0) * share),
        netIncome: Math.round((p.netIncome || 0) * share),
        netMargin: p.netMarginPct || 0,
        ebitda: Math.round(((p.netIncome || 0) + (p.operatingExpenses || 0) * 0.08) * share),
        ar: 0, ap: 0, cash: 0,
        _verified: false,
        _sourcePeriod: label,
      };
    });
  };
  distributePeriod("prior2", "FY 2024");
  distributePeriod("prior", "FY 2025");
  distributePeriod("current", "YTD 2026");

  // 3) Lay balance-sheet values (cash, AR, AP) onto the correct period-end
  //    months. The cash flow statement's `cashAtEnd` is the cash position at
  //    `periodEnd`; A/R and A/P here are the period CHANGE — we surface the
  //    absolute level on the period-end month by deriving cumulative levels
  //    from the change values.
  const stampPeriodEnd = (periodKey, cashState, wcState) => {
    const p = snapshot.periods?.[periodKey];
    if (!p?.periodEnd) return;
    const end = new Date(p.periodEnd);
    const key = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`;
    if (!monthsByKey[key]) return;
    if (cashState?.cashEnding !== undefined) monthsByKey[key].cash = cashState.cashEnding;
    if (wcState?.ar !== undefined) monthsByKey[key].ar = Math.abs(wcState.ar);
    if (wcState?.ap !== undefined) monthsByKey[key].ap = Math.abs(wcState.ap);
  };
  stampPeriodEnd("current", cf.current, wc.current);
  stampPeriodEnd("prior", cf.prior, wc.prior);

  // 4) Forward-fill the balance-sheet values so every month has a value.
  const sortedKeys = Object.keys(monthsByKey).sort();
  let lastCash = 0, lastAr = 0, lastAp = 0;
  sortedKeys.forEach(k => {
    const m = monthsByKey[k];
    if (m.cash) lastCash = m.cash; else m.cash = lastCash;
    if (m.ar) lastAr = m.ar; else m.ar = lastAr;
    if (m.ap) lastAp = m.ap; else m.ap = lastAp;
  });

  return monthsByKey;
}

/**
 * Convenience: full data fetch.
 *
 * 1. Try the local snapshot.json (written by scripts/refresh.sh from live QB).
 * 2. Fall back gracefully — caller decides what to do on null.
 */
export async function loadSnapshotData(snapshotUrl = "/data/snapshot.json") {
  try {
    const res = await fetch(snapshotUrl, { cache: "no-store" });
    if (!res.ok) return null;
    const snap = await res.json();
    return {
      months: snapshotToMonths(snap),
      meta: {
        company: snap.company,
        asOf: snap.asOf,
        generatedAt: snap.generatedAt,
        source: snap.source,
        benchmark: snap.benchmark,
        forecast: snap.forecast,
        workingCapital: snap.workingCapital,
        cashFlow: snap.cashFlow,
      },
    };
  } catch (e) {
    return null;
  }
}
