// Construction-specific finance metrics derived from a single job record.
// These match the formulas used in standard WIP schedules (AICPA POC method).

const percentComplete = (job) => {
  if (!job.eac || job.eac <= 0) return 0;
  return Math.min(1, job.cost_to_date / job.eac);
};

// Revenue earned under percentage-of-completion method.
const earnedRevenue = (job) => job.contract_value * percentComplete(job);

// Positive = billed ahead of work (overbilled); negative = behind (underbilled).
const overUnderBillings = (job) => job.billings_to_date - earnedRevenue(job);

// Forecast margin = (contract - EAC) / contract.
const forecastMargin = (job) => {
  if (!job.contract_value || job.contract_value <= 0) return 0;
  return (job.contract_value - job.eac) / job.contract_value;
};

// Margin fade: drift from bid margin to forecast margin (negative = fading).
const marginFade = (job) => forecastMargin(job) - (job.bid_gross_margin ?? 0);

// Estimated profit at completion.
const profitAtCompletion = (job) => job.contract_value - job.eac;

// Earned profit to date (POC × forecast profit).
const earnedProfit = (job) => profitAtCompletion(job) * percentComplete(job);

const summarize = (job) => ({
  id: job.id,
  name: job.name,
  customer: job.customer,
  percent_complete: percentComplete(job),
  earned_revenue: earnedRevenue(job),
  over_under_billings: overUnderBillings(job),
  forecast_margin: forecastMargin(job),
  bid_margin: job.bid_gross_margin ?? null,
  margin_fade: marginFade(job),
  profit_at_completion: profitAtCompletion(job),
  earned_profit: earnedProfit(job),
  change_orders_pending: job.change_orders_pending ?? 0,
  retainage: job.retainage ?? 0,
});

const portfolioMetrics = (jobs) => {
  const summaries = jobs.map(summarize);
  const totalContract = jobs.reduce((s, j) => s + j.contract_value, 0);
  const totalEarnedRevenue = summaries.reduce((s, j) => s + j.earned_revenue, 0);
  const totalCostToDate = jobs.reduce((s, j) => s + j.cost_to_date, 0);
  const totalEac = jobs.reduce((s, j) => s + j.eac, 0);
  const totalUnder = summaries.filter((j) => j.over_under_billings < 0).reduce((s, j) => s + j.over_under_billings, 0);
  const totalOver = summaries.filter((j) => j.over_under_billings > 0).reduce((s, j) => s + j.over_under_billings, 0);
  return {
    jobs: summaries,
    portfolio: {
      total_contract_value: totalContract,
      total_earned_revenue: totalEarnedRevenue,
      total_cost_to_date: totalCostToDate,
      total_eac: totalEac,
      portfolio_forecast_margin: totalContract ? (totalContract - totalEac) / totalContract : 0,
      total_underbillings: totalUnder,
      total_overbillings: totalOver,
    },
  };
};

module.exports = {
  percentComplete,
  earnedRevenue,
  overUnderBillings,
  forecastMargin,
  marginFade,
  profitAtCompletion,
  earnedProfit,
  summarize,
  portfolioMetrics,
};
