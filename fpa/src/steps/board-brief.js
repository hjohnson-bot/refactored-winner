const { currency, percent, signed } = require('../lib/format');

// The board brief is rendered from structured signals — not free text. Each
// section is a deterministic function of the workflow artifacts. An LLM
// rewrite layer can rephrase, but the *facts* are fixed.

const headline = (period, variance) => {
  const { revenue, gross_profit, net_income } = period.actuals.pnl;
  const cash = period.actuals.balance_sheet?.cash;
  const v = variance.summary;
  const gm = gross_profit / Math.max(1, revenue);
  return {
    title: `${period.company.name} — ${period.period.label} close`,
    metrics: {
      revenue: { value: revenue, vs_budget: v?.revenue?.delta ?? null, vs_budget_pct: v?.revenue?.pct ?? null },
      gross_profit: { value: gross_profit, margin: gm, vs_budget: v?.gross_profit?.delta ?? null, vs_budget_pct: v?.gross_profit?.pct ?? null },
      net_income: { value: net_income, vs_budget: v?.net_income?.delta ?? null, vs_budget_pct: v?.net_income?.pct ?? null },
      cash_position: { value: cash },
    },
  };
};

const drivers = (variance, n = 3) => {
  const list = variance.by_baseline.budget ?? [];
  return list
    .filter((v) => v.materiality !== 'low')
    .slice(0, n)
    .map((v) => ({
      line: v.line,
      direction: v.direction,
      delta: v.delta,
      pct: v.pct,
      hypotheses: v.driver_hypotheses ?? [],
    }));
};

const risks = (anomaly) => {
  return anomaly.flags
    .filter((f) => f.severity === 'critical' || f.severity === 'warning')
    .map((f) => ({ kind: f.kind, subject: f.subject, severity: f.severity, signal: f.signal, recommendation: f.recommendation }));
};

const backlogSection = (period) => {
  const b = period.backlog ?? {};
  const monthlyRevenue = period.actuals.pnl.revenue;
  const burn = monthlyRevenue ? (b.total_backlog ?? 0) / monthlyRevenue : null;
  return {
    total_backlog: b.total_backlog ?? null,
    signed_not_started: b.signed_not_started ?? null,
    verbal_commitments: b.verbal_commitments ?? null,
    months_of_revenue_in_backlog: burn ? Number(burn.toFixed(1)) : null,
  };
};

const cashSection = (period) => {
  const bs = period.actuals.balance_sheet ?? {};
  const cf = period.actuals.cash_flow ?? {};
  return {
    cash: bs.cash,
    ar: bs.ar,
    ap: bs.ap,
    net_underbillings: (bs.underbillings ?? 0) - (bs.overbillings ?? 0),
    operating_cash_flow: cf.operating,
    net_change: cf.net_change,
  };
};

const scenarioSection = (scenario) => {
  return Object.entries(scenario.scenarios).map(([name, s]) => ({
    name,
    annual_revenue: s.projection.annual.revenue,
    annual_gross_margin: s.projection.annual.gross_margin,
    annual_net_income: s.projection.annual.net_income,
  }));
};

const decisions = (variance, anomaly) => {
  const items = [];
  const grouped = anomaly.flags
    .filter((x) => x.severity === 'critical')
    .reduce((acc, f) => {
      (acc[f.kind] ||= { recommendation: f.recommendation, subjects: [] }).subjects.push(f.subject);
      return acc;
    }, {});
  for (const [kind, group] of Object.entries(grouped)) {
    items.push(`Decision (${kind}, ${group.subjects.length} jobs): ${group.recommendation} — affected: ${group.subjects.join('; ')}.`);
  }
  const revVar = variance.summary?.revenue;
  if (revVar && revVar.materiality === 'high' && revVar.direction === 'unfavorable') {
    items.push('Decision: Confirm whether revenue gap is timing (catch-up next period) or structural (reforecast FY).');
  }
  const niVar = variance.summary?.net_income;
  if (niVar && niVar.materiality === 'high' && niVar.direction === 'unfavorable') {
    items.push('Decision: Approve cost-containment actions or accept lower FY landing.');
  }
  if (items.length === 0) items.push('No board-level decisions required this period.');
  return items;
};

const render = (sections) => {
  const lines = [];
  lines.push(`# ${sections.headline.title}`, '');
  const m = sections.headline.metrics;
  lines.push('## Headline');
  lines.push(`- Revenue: **${currency(m.revenue.value)}** (${signed(m.revenue.vs_budget)} / ${m.revenue.vs_budget_pct !== null ? percent(m.revenue.vs_budget_pct) : 'n/a'} vs budget)`);
  lines.push(`- Gross profit: **${currency(m.gross_profit.value)}** @ ${percent(m.gross_profit.margin)} margin (${signed(m.gross_profit.vs_budget)} vs budget)`);
  lines.push(`- Net income: **${currency(m.net_income.value)}** (${signed(m.net_income.vs_budget)} vs budget)`);
  lines.push(`- Cash: **${currency(m.cash_position.value)}**`);
  lines.push('');

  lines.push('## What drove the result');
  if (!sections.drivers.length) lines.push('- All material lines tracked plan.');
  for (const d of sections.drivers) {
    lines.push(`- **${d.line}**: ${signed(d.delta)} (${d.pct !== null ? percent(d.pct) : 'n/a'}) — ${d.direction}`);
    for (const h of d.hypotheses) lines.push(`  - ${h}`);
  }
  lines.push('');

  lines.push('## Risks & anomalies');
  if (!sections.risks.length) lines.push('- No critical or warning-level anomalies flagged.');
  for (const r of sections.risks) {
    lines.push(`- [${r.severity.toUpperCase()}] **${r.kind}** — ${r.subject}: ${r.signal}`);
    lines.push(`  - Action: ${r.recommendation}`);
  }
  lines.push('');

  const b = sections.backlog;
  lines.push('## Backlog & pipeline');
  lines.push(`- Total backlog: ${currency(b.total_backlog)}`);
  lines.push(`- Signed not started: ${currency(b.signed_not_started)}`);
  lines.push(`- Verbal commitments: ${currency(b.verbal_commitments)}`);
  lines.push(`- Months of revenue in backlog: ${b.months_of_revenue_in_backlog ?? 'n/a'}`);
  lines.push('');

  const c = sections.cash;
  lines.push('## Cash & working capital');
  lines.push(`- Cash: ${currency(c.cash)}`);
  lines.push(`- A/R: ${currency(c.ar)}  |  A/P: ${currency(c.ap)}`);
  lines.push(`- Net underbillings: ${currency(c.net_underbillings)}`);
  lines.push(`- Operating CF (period): ${currency(c.operating_cash_flow)}  |  Net change: ${currency(c.net_change)}`);
  lines.push('');

  lines.push('## FY scenarios');
  for (const s of sections.scenarios) {
    lines.push(`- **${s.name}**: revenue ${currency(s.annual_revenue)}, GM ${percent(s.annual_gross_margin)}, net income ${currency(s.annual_net_income)}`);
  }
  lines.push('');

  lines.push('## Decisions requested');
  for (const d of sections.decisions) lines.push(`- ${d}`);
  lines.push('');

  return lines.join('\n');
};

const run = (period, variance, anomaly, scenario) => {
  const sections = {
    headline: headline(period, variance),
    drivers: drivers(variance),
    risks: risks(anomaly),
    backlog: backlogSection(period),
    cash: cashSection(period),
    scenarios: scenarioSection(scenario),
    decisions: decisions(variance, anomaly),
  };
  return { sections, markdown: render(sections) };
};

module.exports = { run };
