#!/usr/bin/env node
// Build a period.json from raw QuickBooks + Knowify snapshots in fpa/data/raw/.
//
// Inputs (all from refresh.sh / MCP pulls):
//   data/raw/pnl-<YYYY-MM>.json            — QB P&L for the period
//   data/raw/pnl-<prior-month>.json        — QB P&L for prior month
//   data/raw/pnl-<prior-year-month>.json   — QB P&L for prior year same month
//   data/raw/balance-sheet-summary.json    — QB BS summary
//   data/raw/ar-aging-summary.json         — QB AR aging
//   data/raw/ap-aging-summary.json         — QB AP aging
//   data/raw/knowify-jobs.json             — Knowify JobsReport (active jobs)
//
// Output: data/period-<label>.json (validated by fpa/src/loaders/period.js)

const fs = require('fs');
const path = require('path');

const RAW_DIR = path.resolve(__dirname, '..', 'data', 'raw');
const OUT_DIR = path.resolve(__dirname, '..', 'data');

const readJson = (name) => {
  const p = path.join(RAW_DIR, name);
  if (!fs.existsSync(p)) throw new Error(`Missing raw input: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

const optionalJson = (name) => {
  const p = path.join(RAW_DIR, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

// Build a PnL block that matches our period.schema.json shape.
const buildPnl = (qbPnl) => {
  // Note: QB returns positive expenses; our schema uses positive values too.
  // Revenue in our schema is the income line. Gross profit = revenue - cogs.total.
  const revenue = qbPnl.totalIncome;
  const cogsTotal = qbPnl.cogs?.total ?? 0;
  const opexTotal = qbPnl.totalExpenses;
  const grossProfit = revenue - cogsTotal;
  return {
    revenue,
    cogs: {
      total: cogsTotal,
      // QB-Midwest specific mapping — see fpa/data/raw/pnl-*.json for source fields.
      materials: (qbPnl.cogs?.materials_external ?? 0) + (qbPnl.cogs?.materials_internal ?? 0),
      labor: (qbPnl.cogs?.labor_contractors ?? 0) + (qbPnl.cogs?.labor_direct ?? 0),
      subcontractors: 0,
      equipment: qbPnl.cogs?.equipment_rental ?? 0,
      other: (qbPnl.cogs?.job_site_other ?? 0) + (qbPnl.cogs?.per_diem ?? 0),
    },
    gross_profit: grossProfit,
    opex: qbPnl.opex ?? {},
    opex_total: opexTotal,
    net_income: qbPnl.netIncome,
  };
};

// Map Knowify ContractType into our schema's enum.
const mapContractType = (kt) => {
  if (!kt) return 'fixed-price';
  if (kt.includes('FIXED_PRICE')) return 'fixed-price';
  if (kt.includes('COST_PLUS')) return 'cost-plus';
  if (kt.includes('T_M') || kt.includes('TIME')) return 'time-and-materials';
  if (kt.includes('UNIT')) return 'unit-price';
  return 'fixed-price';
};

// Translate Knowify's JobsReport row into our jobs[] schema item.
// Key Knowify fields:
//   ContractTotal     — current contract value (incl. change orders)
//   ChangeOrders      — approved change orders so far
//   BudgetTotal       — current EAC across all categories (Knowify's view)
//   Invoiced          — billings-to-date
//   PercCompleted     — % complete (Knowify methodology; we use it directly)
//   ProjectedProfit   — current forecast margin (%)
//   Profit            — actual-to-date margin (%)
//   Retainage         — retainage held by GC
const knowifyJobToWorkflowJob = (j) => {
  const contractValue = j.ContractTotal ?? 0;
  const changeOrders = j.ChangeOrders ?? 0;
  const originalContract = contractValue - changeOrders;
  const eac = j.BudgetTotal ?? 0;
  // cost_to_date is not directly in JobsReport; derive from PercCompleted × EAC.
  const pctComplete = (j.PercCompleted ?? 0) / 100;
  const costToDate = pctComplete * eac;
  const etc = Math.max(0, eac - costToDate);

  // Use Knowify's ProjectedProfit as bid margin (forecast at start of project,
  // before cost drift). The workflow's forecast_margin = (contract - EAC) / contract
  // will reflect current EAC.
  const bidMargin = (j.ProjectedProfit ?? 0) / 100;

  return {
    id: `J-${j.ProjectId}`,
    name: j.ProjectName,
    customer: j.ClientName?.trim() || 'Unknown',
    type: mapContractType(j.ContractType),
    start_date: j.StartDate ? j.StartDate.slice(0, 10) : null,
    scheduled_completion: j.EndDate ? j.EndDate.slice(0, 10) : null,
    contract_value: contractValue,
    original_contract_value: originalContract,
    change_orders_approved: changeOrders,
    change_orders_pending: 0,
    bid_gross_margin: bidMargin,
    cost_to_date: costToDate,
    etc,
    eac,
    billings_to_date: j.Invoiced ?? 0,
    retainage: j.Retainage ?? 0,
  };
};

const buildBalanceSheet = (bs) => {
  if (!bs) return {};
  return {
    cash: bs.assetBreakdown?.cash ?? 0,
    ar: bs.assetBreakdown?.accountsReceivable ?? 0,
    underbillings: 0,
    overbillings: 0,
    ap: bs.liabilityBreakdown?.accountsPayable ?? 0,
    retainage_held: 0,
    retainage_payable: 0,
    debt: (bs.liabilityBreakdown?.creditCards ?? 0) + (bs.liabilityBreakdown?.longTermLiabilities ?? 0),
  };
};

const buildArAging = (ar) => {
  if (!ar?.bucketTotals) return undefined;
  const b = ar.bucketTotals;
  return {
    current: b.Current ?? 0,
    d1_30: b['1-30'] ?? 0,
    d31_60: b['31-60'] ?? 0,
    d61_90: b['61-90'] ?? 0,
    d90_plus: b['91+'] ?? 0,
  };
};

const main = () => {
  const args = process.argv.slice(2);
  const periodArg = args[0] || '2026-04';
  const [yy, mm] = periodArg.split('-').map(Number);
  const priorMonth = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, '0')}`;
  const priorYearMonth = `${yy - 1}-${String(mm).padStart(2, '0')}`;

  const pnlCurrent = readJson(`pnl-${periodArg}.json`);
  const pnlPriorMonth = optionalJson(`pnl-${priorMonth}.json`);
  const pnlPriorYearMonth = optionalJson(`pnl-${priorYearMonth}.json`);
  const bs = optionalJson('balance-sheet-summary.json');
  const arAging = optionalJson('ar-aging-summary.json');
  const knowify = optionalJson('knowify-jobs.json');

  const start = `${yy}-${String(mm).padStart(2, '0')}-01`;
  const endDate = new Date(yy, mm, 0).getDate(); // last day of month
  const end = `${yy}-${String(mm).padStart(2, '0')}-${String(endDate).padStart(2, '0')}`;

  const period = {
    company: {
      name: pnlCurrent.companyName || 'Midwest Design Group LLC',
      industry: 'construction-commercial',
      fiscal_year_end: '12-31',
      currency: 'USD',
    },
    period: {
      label: periodArg,
      type: 'month',
      start,
      end,
      completed_months_ytd: mm,
    },
    actuals: {
      pnl: buildPnl(pnlCurrent),
      balance_sheet: buildBalanceSheet(bs),
      cash_flow: {
        operating: null,
        investing: null,
        financing: null,
        net_change: null,
      },
      ar_aging: buildArAging(arAging),
      headcount: null,
    },
    plan: {},
    jobs: (knowify?.jobs ?? []).map(knowifyJobToWorkflowJob).filter((j) => j.contract_value > 0),
    backlog: knowify ? {
      total_backlog: (knowify.jobs ?? [])
        .filter((j) => (j.PercCompleted ?? 0) < 100)
        .reduce((s, j) => s + Math.max(0, (j.ContractTotal ?? 0) - (j.Invoiced ?? 0)), 0),
      signed_not_started: (knowify.jobs ?? [])
        .filter((j) => (j.PercCompleted ?? 0) === 0)
        .reduce((s, j) => s + (j.ContractTotal ?? 0), 0),
      verbal_commitments: 0,
    } : undefined,
  };

  if (pnlPriorMonth) period.plan.prior_month = buildPnl(pnlPriorMonth);
  if (pnlPriorYearMonth) period.plan.prior_year_month = buildPnl(pnlPriorYearMonth);

  const outFile = path.join(OUT_DIR, `period-${periodArg}.json`);
  fs.writeFileSync(outFile, JSON.stringify(period, null, 2));
  console.log(`Wrote ${outFile}`);
  console.log(`  company:         ${period.company.name}`);
  console.log(`  period:          ${period.period.label} (${period.period.start} → ${period.period.end})`);
  console.log(`  revenue:         $${period.actuals.pnl.revenue.toLocaleString()}`);
  console.log(`  gross profit:    $${period.actuals.pnl.gross_profit.toLocaleString()}`);
  console.log(`  net income:      $${period.actuals.pnl.net_income.toLocaleString()}`);
  console.log(`  active jobs:     ${period.jobs.length}`);
  console.log(`  prior_month:     ${pnlPriorMonth ? 'yes' : 'no'}`);
  console.log(`  prior_year:      ${pnlPriorYearMonth ? 'yes' : 'no'}`);
};

if (require.main === module) main();
