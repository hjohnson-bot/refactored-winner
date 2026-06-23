// Structured finance Q&A. Resolves the user's question against the workflow
// artifacts using a small intent classifier. The point is to give finance
// teams an answer grounded in the period pack — when it can't, it says so.
//
// This is intentionally *not* an LLM call. It is a deterministic resolver.
// The Claude Code agent that wraps this step can call it for facts and add
// narrative on top, but the numbers come from here.

const { currency, percent } = require('../lib/format');

const intents = [
  {
    name: 'revenue_vs_budget',
    matches: /revenue.*(budget|plan|target)/i,
    answer: (a) => {
      const v = a.variance.summary?.revenue;
      if (!v) return { answer: 'No budget data available to compare revenue.', sources: [] };
      return {
        answer: `Revenue was ${currency(v.current)} vs budget of ${currency(v.baseline)}: ${v.delta >= 0 ? 'beat' : 'miss'} of ${currency(Math.abs(v.delta))} (${percent(v.pct)}).`,
        data: v,
        sources: ['variance.budget.revenue'],
      };
    },
  },
  {
    name: 'worst_job',
    matches: /worst job|biggest fade|margin fade|losing job/i,
    answer: (a) => {
      const jobs = (a.jobMetrics?.jobs ?? []).slice().sort((x, y) => x.margin_fade - y.margin_fade);
      if (!jobs.length) return { answer: 'No active jobs in the period pack.', sources: [] };
      const worst = jobs[0];
      return {
        answer: `${worst.id} ${worst.name} (${worst.customer}) has the largest margin fade: forecast ${percent(worst.forecast_margin)} vs bid ${percent(worst.bid_margin ?? 0)}, fade ${percent(worst.margin_fade, 2)}.`,
        data: worst,
        sources: [`jobMetrics.jobs[${worst.id}]`],
      };
    },
  },
  {
    name: 'gross_margin',
    matches: /gross margin|gm%|margin/i,
    answer: (a) => {
      const r = a.period.actuals.pnl.revenue;
      const gp = a.period.actuals.pnl.gross_profit;
      const gm = gp / Math.max(1, r);
      const fade = a.jobMetrics?.portfolio.portfolio_forecast_margin;
      return {
        answer: `Period GM was ${percent(gm)} (GP ${currency(gp)} / revenue ${currency(r)}). Portfolio forecast margin across active jobs is ${percent(fade ?? 0)}.`,
        data: { gross_margin: gm, portfolio_forecast_margin: fade },
        sources: ['period.actuals.pnl', 'jobMetrics.portfolio'],
      };
    },
  },
  {
    name: 'cash_position',
    matches: /cash position|cash on hand|cash balance/i,
    answer: (a) => {
      const cash = a.period.actuals.balance_sheet?.cash;
      const cf = a.period.actuals.cash_flow?.operating;
      return {
        answer: `Cash on hand is ${currency(cash)}. Operating cash flow for the period was ${currency(cf)}.`,
        data: { cash, operating_cash_flow: cf },
        sources: ['period.actuals.balance_sheet.cash', 'period.actuals.cash_flow.operating'],
      };
    },
  },
  {
    name: 'underbillings',
    matches: /underbilling|under-billing|under billed|cash drag/i,
    answer: (a) => {
      const total = a.jobMetrics?.portfolio.total_underbillings ?? 0;
      const offenders = (a.jobMetrics?.jobs ?? []).filter((j) => j.over_under_billings < 0).sort((x, y) => x.over_under_billings - y.over_under_billings);
      return {
        answer: `Net underbillings across the portfolio: ${currency(Math.abs(total))}. Top contributors: ${offenders.slice(0, 3).map((j) => `${j.id} (${currency(Math.abs(j.over_under_billings))})`).join(', ') || 'none'}.`,
        data: { total, offenders: offenders.slice(0, 3) },
        sources: ['jobMetrics.portfolio.total_underbillings'],
      };
    },
  },
  {
    name: 'ar_aging',
    matches: /\ba\/?r\b|aging|receivable|collection/i,
    answer: (a) => {
      const aging = a.period.actuals.ar_aging;
      if (!aging) return { answer: 'No A/R aging data in the period pack.', sources: [] };
      const total = Object.values(aging).reduce((s, v) => s + (v || 0), 0);
      const stale = (aging.d61_90 || 0) + (aging.d90_plus || 0);
      return {
        answer: `Total A/R ${currency(total)}; over 60 days ${currency(stale)} (${percent(stale / Math.max(1, total))}). >90d bucket: ${currency(aging.d90_plus)}.`,
        data: aging,
        sources: ['period.actuals.ar_aging'],
      };
    },
  },
  {
    name: 'backlog',
    matches: /backlog|pipeline|book(ed)?[- ]?to[- ]?bill/i,
    answer: (a) => {
      const b = a.period.backlog;
      if (!b) return { answer: 'No backlog data in the period pack.', sources: [] };
      const monthsOfRevenue = a.period.actuals.pnl.revenue ? (b.total_backlog ?? 0) / a.period.actuals.pnl.revenue : null;
      return {
        answer: `Backlog: ${currency(b.total_backlog)}. Signed-not-started: ${currency(b.signed_not_started)}. Verbal: ${currency(b.verbal_commitments)}. ${monthsOfRevenue ? `Roughly ${monthsOfRevenue.toFixed(1)} months of current revenue.` : ''}`,
        data: b,
        sources: ['period.backlog'],
      };
    },
  },
  {
    name: 'scenario_downside',
    matches: /downside|worst case|recession|stress/i,
    answer: (a) => {
      const s = a.scenario.scenarios.downside;
      if (!s) return { answer: 'Downside scenario not run.', sources: [] };
      return {
        answer: `Downside FY: revenue ${currency(s.projection.annual.revenue)}, GM ${percent(s.projection.annual.gross_margin)}, net income ${currency(s.projection.annual.net_income)}.`,
        data: s.projection.annual,
        sources: ['scenario.scenarios.downside.projection.annual'],
      };
    },
  },
];

const ask = (question, artifacts) => {
  const trimmed = (question || '').trim();
  if (!trimmed) return { question, answer: 'Empty question.', sources: [] };
  for (const intent of intents) {
    if (intent.matches.test(trimmed)) {
      return { question, intent: intent.name, ...intent.answer(artifacts) };
    }
  }
  return {
    question,
    intent: 'unknown',
    answer: "I don't have a structured answer for that question. Try asking about revenue vs budget, gross margin, cash position, worst job, underbillings, A/R aging, backlog, or the downside scenario.",
    sources: [],
  };
};

module.exports = { ask, intents };
