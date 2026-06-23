#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { load } = require('./loaders/period');
const workflow = require('./workflow');

const usage = () => {
  console.log(`fpa — AI-native FP&A workflow for construction finance

Usage:
  fpa run    --period <file> [--out <dir>] [--skip <step,step>]
  fpa step   <step> --period <file> [--out <dir>]   # step: variance|anomaly|scenario|board-brief|qa
  fpa ask    "<question>" --period <file> [--from <artifacts-dir>]
  fpa schema                                          # print the period schema path

Steps run in order: enrich → variance → anomaly → scenario → board-brief.
Q&A operates on a completed run's artifacts.
`);
};

const parseArgs = (argv) => {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
};

const writeArtifact = (dir, name, payload) => {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  if (name.endsWith('.json')) fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  else fs.writeFileSync(file, payload);
  return file;
};

const cmdRun = (args) => {
  if (!args.period) { console.error('Missing --period'); process.exit(2); }
  const period = load(args.period);
  const outDir = args.out ? path.resolve(args.out) : path.join(process.cwd(), 'fpa/artifacts', period.period.label);
  const skip = args.skip ? args.skip.split(',').map((s) => s.trim()) : [];
  const result = workflow.run(period, { skip });

  const written = [];
  if (result.variance) written.push(writeArtifact(outDir, 'variances.json', result.variance));
  if (result.anomaly) written.push(writeArtifact(outDir, 'anomalies.json', result.anomaly));
  if (result.scenario) written.push(writeArtifact(outDir, 'scenarios.json', result.scenario));
  if (result.board_brief) {
    written.push(writeArtifact(outDir, 'board-brief.json', result.board_brief.sections));
    written.push(writeArtifact(outDir, 'board-brief.md', result.board_brief.markdown));
  }
  written.push(writeArtifact(outDir, 'job-metrics.json', result.jobMetrics));
  written.push(writeArtifact(outDir, 'run.json', { period: result.period, trace: result.trace, artifacts: written.map((p) => path.basename(p)) }));

  console.log(`FP&A workflow run: ${period.company.name} — ${period.period.label}`);
  console.log(`  enrich   → ${result.jobMetrics.jobs.length} active jobs`);
  if (result.variance) console.log(`  variance → ${result.variance.by_baseline.budget?.length ?? 0} budget lines compared`);
  if (result.anomaly) console.log(`  anomaly  → ${result.anomaly.counts.critical} critical, ${result.anomaly.counts.warning} warning, ${result.anomaly.counts.info} info`);
  if (result.scenario) console.log(`  scenario → ${Object.keys(result.scenario.scenarios).length} scenarios`);
  if (result.board_brief) console.log(`  brief    → ${outDir}/board-brief.md`);
  console.log(`Artifacts written to: ${outDir}`);
};

const cmdStep = (args) => {
  const step = args._[0];
  if (!step) { console.error('Missing step name'); process.exit(2); }
  if (!args.period) { console.error('Missing --period'); process.exit(2); }
  const period = load(args.period);
  const result = workflow.run(period);
  const outDir = args.out ? path.resolve(args.out) : path.join(process.cwd(), 'fpa/artifacts', period.period.label);
  const map = { variance: result.variance, anomaly: result.anomaly, scenario: result.scenario, 'board-brief': result.board_brief?.markdown };
  if (!(step in map)) { console.error(`Unknown step: ${step}`); process.exit(2); }
  const file = writeArtifact(outDir, step === 'board-brief' ? 'board-brief.md' : `${step}.json`, map[step]);
  console.log(`Step ${step} → ${file}`);
};

const cmdAsk = (args) => {
  const question = args._[0];
  if (!question) { console.error('Missing question'); process.exit(2); }
  if (!args.period) { console.error('Missing --period'); process.exit(2); }
  const period = load(args.period);
  const result = workflow.run(period);
  const answer = workflow.ask(question, period, result);
  console.log(`Q: ${answer.question}`);
  if (answer.intent) console.log(`Intent: ${answer.intent}`);
  console.log(`A: ${answer.answer}`);
  if (answer.sources?.length) console.log(`Sources: ${answer.sources.join(', ')}`);
};

const main = () => {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') return usage();
  const [cmd, ...rest] = argv;
  const args = parseArgs(rest);
  switch (cmd) {
    case 'run': return cmdRun(args);
    case 'step': return cmdStep(args);
    case 'ask': return cmdAsk(args);
    case 'schema': return console.log(path.resolve(__dirname, 'schema/period.schema.json'));
    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
      process.exit(2);
  }
};

if (require.main === module) main();

module.exports = { main };
