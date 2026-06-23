const currency = (value, currency = 'USD') => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

const percent = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `${(value * 100).toFixed(digits)}%`;
};

const signed = (value, formatter = currency) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatter(value)}`;
};

const table = (rows, columns) => {
  const widths = columns.map((c) => Math.max(c.header.length, ...rows.map((r) => String(r[c.key] ?? '').length)));
  const sep = widths.map((w) => '-'.repeat(w)).join(' | ');
  const head = columns.map((c, i) => c.header.padEnd(widths[i])).join(' | ');
  const body = rows
    .map((r) => columns.map((c, i) => String(r[c.key] ?? '').padEnd(widths[i])).join(' | '))
    .join('\n');
  return `${head}\n${sep}\n${body}`;
};

module.exports = { currency, percent, signed, table };
