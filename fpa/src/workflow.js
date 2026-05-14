const { portfolioMetrics } = require('./lib/construction-metrics');
const variance = require('./steps/variance');
const anomaly = require('./steps/anomaly');
const scenario = require('./steps/scenario');
const boardBrief = require('./steps/board-brief');
const qa = require('./steps/qa');

const STEPS = ['enrich', 'variance', 'anomaly', 'scenario', 'board-brief'];

const enrich = (period) => {
  const jobMetrics = portfolioMetrics(period.jobs ?? []);
  return { ...period, jobMetrics };
};

const run = (period, options = {}) => {
  const skip = new Set(options.skip ?? []);
  const trace = [];
  const t0 = Date.now();

  const enriched = enrich(period);
  trace.push({ step: 'enrich', ms: Date.now() - t0 });

  const t1 = Date.now();
  const varianceResult = skip.has('variance') ? null : variance.run(enriched);
  trace.push({ step: 'variance', ms: Date.now() - t1 });

  const t2 = Date.now();
  const anomalyResult = skip.has('anomaly') ? null : anomaly.run(enriched);
  trace.push({ step: 'anomaly', ms: Date.now() - t2 });

  const t3 = Date.now();
  const scenarioResult = skip.has('scenario') ? null : scenario.run(enriched, options.scenarios);
  trace.push({ step: 'scenario', ms: Date.now() - t3 });

  const t4 = Date.now();
  const briefResult = (skip.has('board-brief') || !varianceResult || !anomalyResult || !scenarioResult)
    ? null
    : boardBrief.run(enriched, varianceResult, anomalyResult, scenarioResult);
  trace.push({ step: 'board-brief', ms: Date.now() - t4 });

  return {
    period: {
      label: enriched.period.label,
      company: enriched.company.name,
    },
    jobMetrics: enriched.jobMetrics,
    variance: varianceResult,
    anomaly: anomalyResult,
    scenario: scenarioResult,
    board_brief: briefResult,
    trace,
  };
};

// Q&A is a separate entry point because it operates on an already-run workflow.
const ask = (question, period, runResult) => {
  const enriched = enrich(period);
  const artifacts = {
    period: enriched,
    jobMetrics: enriched.jobMetrics,
    variance: runResult.variance,
    anomaly: runResult.anomaly,
    scenario: runResult.scenario,
  };
  return qa.ask(question, artifacts);
};

module.exports = { run, ask, enrich, STEPS };
