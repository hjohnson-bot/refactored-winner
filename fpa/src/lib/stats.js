const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

const stdDev = (values) => {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const mad = (values) => {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
};

// Modified z-score using MAD — robust to small samples and outliers (Iglewicz & Hoaglin).
const modifiedZ = (value, values) => {
  const m = median(values);
  const d = mad(values);
  if (d === 0) return 0;
  return (0.6745 * (value - m)) / d;
};

const variancePct = (current, baseline) => {
  if (baseline === 0 || baseline === null || baseline === undefined) return null;
  return (current - baseline) / Math.abs(baseline);
};

module.exports = { mean, stdDev, median, mad, modifiedZ, variancePct };
