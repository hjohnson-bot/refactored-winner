const fs = require('fs');
const path = require('path');

const REQUIRED = ['company', 'period', 'actuals', 'plan', 'jobs'];

const load = (filePath) => {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`Period file not found: ${abs}`);
  const raw = fs.readFileSync(abs, 'utf8');
  const data = JSON.parse(raw);
  validate(data);
  return data;
};

const validate = (data) => {
  for (const field of REQUIRED) {
    if (!(field in data)) throw new Error(`Period pack missing required field: ${field}`);
  }
  if (!Array.isArray(data.jobs)) throw new Error('jobs must be an array');
  const { revenue, cogs, gross_profit } = data.actuals.pnl;
  const cogsTotal = typeof cogs === 'object' ? cogs.total : cogs;
  const gpCheck = revenue - cogsTotal;
  if (Math.abs(gpCheck - gross_profit) > 1) {
    throw new Error(`gross_profit (${gross_profit}) does not reconcile to revenue - cogs (${gpCheck}) within $1`);
  }
};

module.exports = { load, validate };
