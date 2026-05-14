// Deterministic scenario engine. Each scenario applies a set of *levers* to the
// current period and projects FY end. We use a run-rate + remaining-months
// projection (consistent with how a controller would build a quick forecast).
//
// Levers (all optional, all multiplicative around 1.0):
//   revenue_growth        — applied to revenue and proportional COGS
//   material_cost_change  — applied to materials line
//   labor_cost_change     — applied to labor line
//   subcontractor_change  — applied to subcontractors line
//   opex_change           — applied to opex_total
//   schedule_slip_months  — months of revenue pushed out of FY (deferred)
//
// Output: per-scenario projected FY revenue, gross_profit, net_income, cash
// proxy, and the *contribution of each lever* to net income.

const DEFAULT_SCENARIOS = {
  base: {},
  upside: {
    revenue_growth: 0.05,
    material_cost_change: -0.02,
  },
  downside: {
    revenue_growth: -0.08,
    material_cost_change: 0.06,
    schedule_slip_months: 1,
  },
  labor_squeeze: {
    labor_cost_change: 0.08,
  },
  schedule_slip: {
    schedule_slip_months: 2,
  },
};

const applyLevers = (period, levers) => {
  const { revenue, cogs, opex_total } = period.actuals.pnl;
  const cogsObj = typeof cogs === 'object' ? cogs : { total: cogs };

  // Step 1 — adjust line items.
  const adjMaterials = (cogsObj.materials ?? 0) * (1 + (levers.material_cost_change ?? 0));
  const adjLabor = (cogsObj.labor ?? 0) * (1 + (levers.labor_cost_change ?? 0));
  const adjSubs = (cogsObj.subcontractors ?? 0) * (1 + (levers.subcontractor_change ?? 0));
  const adjEquipOther = (cogsObj.equipment ?? 0) + (cogsObj.other ?? 0);
  const adjCogsTotal = adjMaterials + adjLabor + adjSubs + adjEquipOther;
  const adjOpex = opex_total * (1 + (levers.opex_change ?? 0));
  const adjRevenue = revenue * (1 + (levers.revenue_growth ?? 0));

  // Step 2 — apply schedule slip (defer N months of *period* revenue and proportional COGS).
  const slipMonths = levers.schedule_slip_months ?? 0;
  const monthlyRevImpact = adjRevenue * slipMonths;
  const monthlyCogsImpact = adjCogsTotal * slipMonths * 0.85; // costs lag, ~85% defer with revenue
  const periodRevenuePostSlip = adjRevenue;
  const periodGpPostSlip = adjRevenue - adjCogsTotal;

  // Step 3 — annualize.
  const completedMonths = period.period.completed_months_ytd ?? 1;
  const remainingMonths = Math.max(0, 12 - completedMonths);
  const annualRevenue = periodRevenuePostSlip * 12 - monthlyRevImpact;
  const annualCogs = adjCogsTotal * 12 - monthlyCogsImpact;
  const annualGrossProfit = annualRevenue - annualCogs;
  const annualOpex = adjOpex * 12;
  const annualNetIncome = annualGrossProfit - annualOpex;

  return {
    period: {
      revenue: periodRevenuePostSlip,
      cogs_total: adjCogsTotal,
      gross_profit: periodGpPostSlip,
      gross_margin: periodGpPostSlip / Math.max(1, periodRevenuePostSlip),
      opex_total: adjOpex,
      net_income: periodGpPostSlip - adjOpex,
    },
    annual: {
      revenue: annualRevenue,
      cogs_total: annualCogs,
      gross_profit: annualGrossProfit,
      gross_margin: annualGrossProfit / Math.max(1, annualRevenue),
      opex_total: annualOpex,
      net_income: annualNetIncome,
      remaining_months: remainingMonths,
    },
  };
};

// Sensitivity attribution: run each lever in isolation off base, measure delta to net income.
const attribute = (period, levers) => {
  if (Object.keys(levers).length === 0) return [];
  const base = applyLevers(period, {}).annual.net_income;
  const contributions = [];
  for (const [lever, value] of Object.entries(levers)) {
    if (!value) continue;
    const isolated = applyLevers(period, { [lever]: value });
    contributions.push({
      lever,
      magnitude: value,
      annual_net_income_delta: isolated.annual.net_income - base,
    });
  }
  contributions.sort((a, b) => Math.abs(b.annual_net_income_delta) - Math.abs(a.annual_net_income_delta));
  return contributions;
};

const run = (period, scenarioSet = DEFAULT_SCENARIOS) => {
  const scenarios = {};
  for (const [name, levers] of Object.entries(scenarioSet)) {
    scenarios[name] = {
      levers,
      projection: applyLevers(period, levers),
      lever_contributions: attribute(period, levers),
    };
  }
  return { scenarios };
};

module.exports = { run, applyLevers, attribute, DEFAULT_SCENARIOS };
