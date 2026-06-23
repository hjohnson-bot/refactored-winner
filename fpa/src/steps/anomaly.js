const { modifiedZ } = require('../lib/stats');

// Construction-specific anomaly detectors. Each returns null or a flag with
// {severity, kind, subject, signal, evidence, recommendation}.
// Severity: critical | warning | info.

const margiFadeFlag = (job) => {
  const fade = job.margin_fade;
  if (fade >= -0.02) return null;
  const severity = fade <= -0.05 ? 'critical' : 'warning';
  return {
    severity,
    kind: 'margin_fade',
    subject: `${job.id} ${job.name}`,
    signal: `Forecast margin ${(job.forecast_margin * 100).toFixed(1)}% vs bid ${(job.bid_margin * 100).toFixed(1)}% — fading ${(fade * 100).toFixed(1)} pts.`,
    evidence: {
      forecast_margin: job.forecast_margin,
      bid_margin: job.bid_margin,
      eac: job.profit_at_completion,
    },
    recommendation: 'Trigger PM review of EAC. Confirm cost-to-complete is current and no pending change orders are missing.',
  };
};

const eacOverrunFlag = (job, originalRaw) => {
  // job here is the *enriched* summary; we need the raw record for original_contract_value & eac comparison.
  if (!originalRaw) return null;
  const originalContract = originalRaw.original_contract_value ?? originalRaw.contract_value;
  if (!originalContract) return null;
  const originalBidCost = originalContract * (1 - (originalRaw.bid_gross_margin ?? 0));
  if (originalBidCost <= 0) return null;
  const overrunPct = (originalRaw.eac - originalBidCost) / originalBidCost;
  if (overrunPct < 0.03) return null;
  const severity = overrunPct >= 0.10 ? 'critical' : overrunPct >= 0.05 ? 'warning' : 'info';
  return {
    severity,
    kind: 'eac_overrun',
    subject: `${originalRaw.id} ${originalRaw.name}`,
    signal: `EAC is ${(overrunPct * 100).toFixed(1)}% above original bid cost.`,
    evidence: { eac: originalRaw.eac, original_bid_cost: originalBidCost, overrun_pct: overrunPct },
    recommendation: 'Reconcile EAC against approved change orders. Push for pending change order approvals to recover scope creep.',
  };
};

const underbillingFlag = (job) => {
  if (job.over_under_billings >= 0) return null;
  const ratio = Math.abs(job.over_under_billings) / Math.max(1, job.earned_revenue);
  if (ratio < 0.03) return null;
  const severity = ratio >= 0.10 ? 'critical' : 'warning';
  return {
    severity,
    kind: 'underbilling',
    subject: `${job.id} ${job.name}`,
    signal: `Underbilled by $${Math.round(Math.abs(job.over_under_billings)).toLocaleString()} (${(ratio * 100).toFixed(1)}% of earned revenue).`,
    evidence: { earned_revenue: job.earned_revenue, billings_to_date: job.earned_revenue + job.over_under_billings },
    recommendation: 'Billing team should catch up — underbillings are a cash drag and a tax/audit signal.',
  };
};

const customerConcentrationFlag = (jobs, revenueThisPeriod) => {
  if (!revenueThisPeriod) return null;
  const byCustomer = jobs.reduce((acc, j) => {
    acc[j.customer] = (acc[j.customer] ?? 0) + j.earned_revenue;
    return acc;
  }, {});
  const sorted = Object.entries(byCustomer).sort((a, b) => b[1] - a[1]);
  const totalEarned = sorted.reduce((s, [, v]) => s + v, 0);
  if (!sorted.length || !totalEarned) return null;
  const [topCustomer, topRevenue] = sorted[0];
  const share = topRevenue / totalEarned;
  if (share < 0.30) return null;
  const severity = share >= 0.50 ? 'warning' : 'info';
  return {
    severity,
    kind: 'customer_concentration',
    subject: topCustomer,
    signal: `${topCustomer} represents ${(share * 100).toFixed(1)}% of earned revenue across active jobs.`,
    evidence: { customer: topCustomer, earned_revenue: topRevenue, total_earned: totalEarned, share },
    recommendation: 'Discuss diversification of pipeline. Ensure credit terms and AR aging on this customer are clean.',
  };
};

const arAgingFlag = (aging) => {
  if (!aging) return null;
  const total = Object.values(aging).reduce((s, v) => s + (v || 0), 0);
  if (!total) return null;
  const stale = (aging.d61_90 || 0) + (aging.d90_plus || 0);
  const staleShare = stale / total;
  if (staleShare < 0.05) return null;
  const severity = staleShare >= 0.15 ? 'critical' : staleShare >= 0.10 ? 'warning' : 'info';
  return {
    severity,
    kind: 'ar_aging',
    subject: 'A/R aging',
    signal: `${(staleShare * 100).toFixed(1)}% of A/R is over 60 days ($${Math.round(stale).toLocaleString()} of $${Math.round(total).toLocaleString()}).`,
    evidence: { stale, total, staleShare, d90_plus: aging.d90_plus },
    recommendation: 'Run collections cadence on >60d buckets. Escalate >90d to controller for write-off review.',
  };
};

// Statistical anomaly on opex lines — any line whose modified z-score across
// the *historical baselines we have* (budget, forecast, prior_month, prior_year_month, current)
// flags as an outlier.
const opexOutlierFlags = (period) => {
  const sources = [];
  const candidates = ['budget', 'forecast', 'prior_month', 'prior_year_month'];
  for (const c of candidates) if (period.plan?.[c]?.opex) sources.push({ name: c, opex: period.plan[c].opex });
  sources.push({ name: 'actual', opex: period.actuals.pnl.opex });
  const lineNames = new Set();
  for (const s of sources) Object.keys(s.opex ?? {}).forEach((k) => lineNames.add(k));
  const flags = [];
  for (const line of lineNames) {
    const series = sources.map((s) => s.opex?.[line] ?? null).filter((v) => v !== null);
    if (series.length < 3) continue;
    const currentValue = period.actuals.pnl.opex?.[line];
    if (currentValue === null || currentValue === undefined) continue;
    const z = modifiedZ(currentValue, series);
    if (Math.abs(z) < 2.5) continue;
    flags.push({
      severity: Math.abs(z) >= 3.5 ? 'warning' : 'info',
      kind: 'opex_outlier',
      subject: `opex.${line}`,
      signal: `Modified z-score ${z.toFixed(2)} (robust outlier vs budget/forecast/prior).`,
      evidence: { current: currentValue, series, z },
      recommendation: 'Confirm one-time charge vs trend break. Reclassify or accrue if mis-coded.',
    });
  }
  return flags;
};

const run = (period) => {
  const flags = [];
  const jobs = period.jobMetrics?.jobs ?? [];

  for (const job of jobs) {
    const raw = period.jobs.find((j) => j.id === job.id);
    [margiFadeFlag(job), eacOverrunFlag(job, raw), underbillingFlag(job)]
      .filter(Boolean)
      .forEach((f) => flags.push(f));
  }

  const concentration = customerConcentrationFlag(jobs, period.actuals.pnl.revenue);
  if (concentration) flags.push(concentration);

  const aging = arAgingFlag(period.actuals.ar_aging);
  if (aging) flags.push(aging);

  flags.push(...opexOutlierFlags(period));

  // Order: critical → warning → info, then by kind.
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  flags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.kind.localeCompare(b.kind));

  return {
    counts: {
      critical: flags.filter((f) => f.severity === 'critical').length,
      warning: flags.filter((f) => f.severity === 'warning').length,
      info: flags.filter((f) => f.severity === 'info').length,
      total: flags.length,
    },
    flags,
  };
};

module.exports = { run };
