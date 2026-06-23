const { variancePct } = require('../lib/stats');

// Materiality bands — any variance crossing both an absolute and a percentage floor.
const MATERIALITY = {
  high: { absUsd: 50_000, absPct: 0.05 },
  medium: { absUsd: 15_000, absPct: 0.03 },
  low: { absUsd: 0, absPct: 0 },
};

const classify = (delta, baseline) => {
  const absDelta = Math.abs(delta);
  const absPct = baseline ? Math.abs(delta / baseline) : 0;
  if (absDelta >= MATERIALITY.high.absUsd && absPct >= MATERIALITY.high.absPct) return 'high';
  if (absDelta >= MATERIALITY.medium.absUsd && absPct >= MATERIALITY.medium.absPct) return 'medium';
  return 'low';
};

// Cost lines are "inverted" — over budget is unfavorable.
const directionFor = (line, delta) => {
  const costLines = /cogs|opex|materials|labor|subcontractors|equipment|insurance|fees|salaries|rent|software|travel|marketing/i;
  const isCost = costLines.test(line);
  if (delta === 0) return 'flat';
  if (isCost) return delta > 0 ? 'unfavorable' : 'favorable';
  return delta > 0 ? 'favorable' : 'unfavorable';
};

const compareLine = (line, current, baseline) => {
  if (baseline === null || baseline === undefined) return null;
  const delta = current - baseline;
  const pct = variancePct(current, baseline);
  return {
    line,
    current,
    baseline,
    delta,
    pct,
    materiality: classify(delta, baseline),
    direction: directionFor(line, delta),
  };
};

const flatten = (obj, prefix = '') => {
  if (typeof obj !== 'object' || obj === null) return { [prefix]: obj };
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) Object.assign(result, flatten(v, key));
    else result[key] = v;
  }
  return result;
};

// Hypothesis generator: tie a variance back to a plausible business driver from
// other lines in the same period. This is deterministic — it surfaces *candidate*
// drivers, not certainties.
const proposeDriver = (variance, period) => {
  const { line, direction, current, baseline } = variance;
  const drivers = [];
  if (line === 'revenue' && direction === 'unfavorable') {
    const earned = period.jobMetrics?.portfolio.total_earned_revenue;
    if (earned && earned < baseline) drivers.push(`Earned revenue (POC method) is ${((earned / baseline - 1) * 100).toFixed(1)}% vs baseline — likely job timing or scope deferrals.`);
    const underbillings = period.actuals.balance_sheet?.underbillings ?? 0;
    if (underbillings > 0) drivers.push(`Underbillings of $${Math.round(underbillings).toLocaleString()} on the balance sheet — work done but not yet billed could be deferring recognized revenue.`);
  }
  if (/cogs|materials|labor|subcontractors/.test(line) && direction === 'unfavorable') {
    const fadingJobs = (period.jobMetrics?.jobs ?? []).filter((j) => j.margin_fade < -0.01);
    if (fadingJobs.length) {
      const worst = fadingJobs.sort((a, b) => a.margin_fade - b.margin_fade)[0];
      drivers.push(`Margin fade on ${worst.id} (${worst.name}): forecast margin ${(worst.forecast_margin * 100).toFixed(1)}% vs bid ${(worst.bid_margin * 100).toFixed(1)}%.`);
    }
  }
  if (line === 'gross_profit' && direction === 'unfavorable') {
    const revShift = (current && baseline) ? null : null;
    drivers.push(`Driven by COGS mix and/or revenue mix — review job-level forecast margins for fade.`);
  }
  if (drivers.length === 0) drivers.push('No structured driver identified — escalate to ops review.');
  return drivers;
};

const run = (period) => {
  const actuals = flatten(period.actuals.pnl);
  const baselines = {};
  for (const [name, plan] of Object.entries(period.plan ?? {})) {
    if (!plan) continue;
    baselines[name] = flatten(plan);
  }

  const results = {};
  for (const [baselineName, lines] of Object.entries(baselines)) {
    const comparisons = [];
    for (const [line, current] of Object.entries(actuals)) {
      if (typeof current !== 'number') continue;
      const baseline = lines[line];
      if (typeof baseline !== 'number') continue;
      const v = compareLine(line, current, baseline);
      if (v) comparisons.push(v);
    }
    comparisons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    results[baselineName] = comparisons;
  }

  // Attach driver hypotheses to material variances against budget.
  if (results.budget) {
    for (const v of results.budget) {
      if (v.materiality !== 'low') v.driver_hypotheses = proposeDriver(v, period);
    }
  }

  // Headline summary against budget — what a CFO scans first.
  const summary = results.budget
    ? {
        revenue: results.budget.find((v) => v.line === 'revenue'),
        gross_profit: results.budget.find((v) => v.line === 'gross_profit'),
        opex_total: results.budget.find((v) => v.line === 'opex_total'),
        net_income: results.budget.find((v) => v.line === 'net_income'),
      }
    : null;

  return {
    summary,
    by_baseline: results,
    materiality_thresholds: MATERIALITY,
  };
};

module.exports = { run, compareLine, classify, directionFor };
