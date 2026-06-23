const path = require('path');
const assert = require('assert');
const { load } = require('../src/loaders/period');
const workflow = require('../src/workflow');

const period = load(path.join(__dirname, '..', 'data', 'sample-period.json'));
const result = workflow.run(period);

// 1. Enrichment populates per-job metrics for every active job.
assert.strictEqual(result.jobMetrics.jobs.length, period.jobs.length, 'job metrics should match input job count');
for (const j of result.jobMetrics.jobs) {
  assert.ok(j.percent_complete >= 0 && j.percent_complete <= 1, `percent_complete out of range for ${j.id}`);
  assert.ok(typeof j.forecast_margin === 'number', `forecast_margin missing for ${j.id}`);
}

// 2. Variance against budget produces ordered, material flags.
const budgetVariances = result.variance.by_baseline.budget;
assert.ok(Array.isArray(budgetVariances) && budgetVariances.length > 0, 'budget variances should be populated');
for (let i = 1; i < budgetVariances.length; i++) {
  assert.ok(Math.abs(budgetVariances[i - 1].delta) >= Math.abs(budgetVariances[i].delta), 'variances should be sorted by |delta| desc');
}
// Revenue variance for our sample should be unfavorable (revenue under budget).
const revVar = result.variance.summary.revenue;
assert.strictEqual(revVar.direction, 'unfavorable', 'sample revenue should be unfavorable vs budget');

// 3. Anomaly detection catches at least one job-level signal in the sample.
assert.ok(result.anomaly.counts.total > 0, 'sample should produce anomalies');

// 4. Scenarios contain base, upside, downside.
for (const name of ['base', 'upside', 'downside']) {
  assert.ok(result.scenario.scenarios[name], `scenario ${name} missing`);
}

// 5. Board brief markdown contains every required section heading.
const md = result.board_brief.markdown;
for (const h of ['## Headline', '## What drove the result', '## Risks & anomalies', '## Backlog & pipeline', '## Cash & working capital', '## FY scenarios', '## Decisions requested']) {
  assert.ok(md.includes(h), `board brief missing section: ${h}`);
}

// 6. Q&A returns a known intent for known questions.
const q1 = workflow.ask('How did revenue compare to budget?', period, result);
assert.strictEqual(q1.intent, 'revenue_vs_budget');
const q2 = workflow.ask('Which job has the biggest margin fade?', period, result);
assert.strictEqual(q2.intent, 'worst_job');
const q3 = workflow.ask('What is the meaning of life?', period, result);
assert.strictEqual(q3.intent, 'unknown');

console.log('OK — all workflow tests passed.');
console.log(`  ${result.jobMetrics.jobs.length} jobs enriched`);
console.log(`  ${budgetVariances.length} budget variances`);
console.log(`  ${result.anomaly.counts.total} anomaly flags (${result.anomaly.counts.critical} critical)`);
console.log(`  ${Object.keys(result.scenario.scenarios).length} scenarios`);
