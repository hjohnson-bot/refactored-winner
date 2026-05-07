/**
 * CFO Dashboard — Midwest Design Group LLC
 *
 * Loads cfo-dashboard/data/snapshot.json (built from live QuickBooks data via
 * scripts/refresh.sh) and renders 7 tabs: executive summary, P&L, period
 * comparison, deep dive, forecast, trends, and action flags.
 *
 * No hardcoded financial numbers — every value is computed from snapshot.json.
 */

const fmt = {
  money(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    const sign = n < 0 ? '-' : '';
    const v = Math.abs(n);
    if (v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `${sign}$${(v / 1_000).toFixed(1)}K`;
    return `${sign}$${v.toFixed(0)}`;
  },
  pct(n, digits = 1) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return `${(n * 100).toFixed(digits)}%`;
  },
  pctPoint(n, digits = 1) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    const sign = n >= 0 ? '+' : '';
    return `${sign}${(n * 100).toFixed(digits)}pt`;
  },
  delta(current, prior) {
    if (prior === 0 || prior === null || prior === undefined) return null;
    return (current - prior) / Math.abs(prior);
  },
  signed(n, formatter = fmt.money) {
    if (n === null || n === undefined) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${formatter(n)}`;
  },
  date(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },
};

let SNAPSHOT = null;
let FILTERS = {
  start: null,
  end: null,
  period: 'ytd',
  comparison: 'prior-year',
  account: 'all',
  expenseCat: 'all',
  klass: 'all',
  location: 'all',
};

async function init() {
  const res = await fetch('data/snapshot.json');
  if (!res.ok) {
    document.body.innerHTML = `<div style="padding:40px;color:#f55a5a">
      Failed to load snapshot. Run <code>scripts/refresh.sh</code> first.
    </div>`;
    return;
  }
  SNAPSHOT = await res.json();
  setupHeader();
  setupFilters();
  setupTabs();
  applyFilterState();
  renderAll();
}

function setupHeader() {
  document.getElementById('company-name').textContent = `${SNAPSHOT.company.name} · CFO Dashboard`;
  document.getElementById('company-meta').textContent =
    `${SNAPSHOT.company.industry} · NAICS ${SNAPSHOT.company.naics}`;
  document.getElementById('data-source-badge').textContent = `● Live · ${SNAPSHOT.source}`;
  document.getElementById('source-text').textContent = SNAPSHOT.source;
  document.getElementById('generated-at').textContent = fmt.date(SNAPSHOT.generatedAt);
  document.getElementById('as-of').textContent = fmt.date(SNAPSHOT.asOf);
}

function setupFilters() {
  const cur = SNAPSHOT.periods.current;
  FILTERS.start = cur.periodStart;
  FILTERS.end = cur.periodEnd;
  document.getElementById('filter-start').value = FILTERS.start;
  document.getElementById('filter-end').value = FILTERS.end;

  document.getElementById('filter-period').addEventListener('change', e => {
    FILTERS.period = e.target.value;
    if (FILTERS.period === 'ytd') {
      FILTERS.start = SNAPSHOT.periods.current.periodStart;
      FILTERS.end = SNAPSHOT.periods.current.periodEnd;
    } else if (FILTERS.period === 'fy2025') {
      FILTERS.start = SNAPSHOT.periods.prior.periodStart;
      FILTERS.end = SNAPSHOT.periods.prior.periodEnd;
    } else if (FILTERS.period === 'fy2024' && SNAPSHOT.periods.prior2) {
      FILTERS.start = SNAPSHOT.periods.prior2.periodStart;
      FILTERS.end = SNAPSHOT.periods.prior2.periodEnd;
    }
    document.getElementById('filter-start').value = FILTERS.start;
    document.getElementById('filter-end').value = FILTERS.end;
    renderAll();
  });

  ['filter-start', 'filter-end'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      FILTERS[id === 'filter-start' ? 'start' : 'end'] = e.target.value;
      FILTERS.period = 'custom';
      document.getElementById('filter-period').value = 'custom';
      renderAll();
    });
  });

  ['filter-comparison', 'filter-account', 'filter-expense-cat', 'filter-class', 'filter-location'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('change', e => {
      const key = id.replace('filter-', '').replace('-', '_');
      const map = {
        comparison: 'comparison',
        account: 'account',
        expense_cat: 'expenseCat',
        class: 'klass',
        location: 'location',
      };
      FILTERS[map[key] || key] = e.target.value;
      renderAll();
    });
  });
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('tab-' + t.dataset.tab).classList.add('active');
    });
  });
}

function applyFilterState() {
  document.getElementById('filter-period').value = FILTERS.period;
  document.getElementById('filter-comparison').value = FILTERS.comparison;
}

function pickPeriod() {
  // Choose which snapshot period to treat as "current" based on filter dates.
  // Falls back to the YTD current period for any custom range that doesn't
  // exactly match a stored period (we surface a meta note about this).
  const periods = SNAPSHOT.periods;
  if (FILTERS.start === periods.current.periodStart && FILTERS.end === periods.current.periodEnd) {
    return { period: periods.current, label: 'YTD 2026', exact: true };
  }
  if (FILTERS.start === periods.prior.periodStart && FILTERS.end === periods.prior.periodEnd) {
    return { period: periods.prior, label: 'FY 2025', exact: true };
  }
  if (periods.prior2 && FILTERS.start === periods.prior2.periodStart && FILTERS.end === periods.prior2.periodEnd) {
    return { period: periods.prior2, label: 'FY 2024', exact: true };
  }
  return {
    period: periods.current,
    label: `Custom range — showing closest match (YTD 2026)`,
    exact: false,
  };
}

function pickComparison(activePeriod) {
  const periods = SNAPSHOT.periods;
  if (FILTERS.comparison === 'none') return null;
  if (FILTERS.comparison === 'forecast') {
    const f = SNAPSHOT.forecast;
    return {
      label: 'Year-end forecast',
      revenue: f.yearEndRevenue,
      cogs: f.yearEndRevenue - f.yearEndGrossProfit,
      grossProfit: f.yearEndGrossProfit,
      operatingExpenses: f.yearEndOperatingExpenses,
      netIncome: f.yearEndNetIncome,
      grossMarginPct: f.yearEndGrossMarginPct,
      netMarginPct: f.yearEndNetMarginPct,
    };
  }
  if (FILTERS.comparison === 'prior-2' && periods.prior2) {
    return { label: 'FY 2024', ...periods.prior2 };
  }
  // prior-year: pick the period that's "one step back" from active
  if (activePeriod === periods.current) return { label: 'FY 2025', ...periods.prior };
  if (activePeriod === periods.prior && periods.prior2) return { label: 'FY 2024', ...periods.prior2 };
  return null;
}

// =============================================================================
// Render functions
// =============================================================================

function renderAll() {
  renderExec();
  renderPnl();
  renderCompare();
  renderDeepDive();
  renderForecast();
  renderTrends();
  renderFlags();
}

function renderExec() {
  const { period, label, exact } = pickPeriod();
  const comp = pickComparison(period);
  document.getElementById('exec-period-label').textContent =
    `${label} · ${fmt.date(period.periodStart)} → ${fmt.date(period.periodEnd)}` +
    (exact ? '' : ' (custom range — see P&L tab for the matched period)');

  setKpi('revenue', period.revenue, comp?.revenue, fmt.money);
  setKpi('gp', period.grossProfit, comp?.grossProfit, fmt.money);
  setKpi('gm-pct', period.grossMarginPct, comp?.grossMarginPct, fmt.pct, true);
  setKpi('opex', period.operatingExpenses, comp?.operatingExpenses, fmt.money, false, true);
  setKpi('net', period.netIncome, comp?.netIncome, fmt.money);
  setKpi('nm-pct', period.netMarginPct, comp?.netMarginPct, fmt.pct, true);

  const cf = SNAPSHOT.cashFlow.current;
  if (cf) {
    document.getElementById('kpi-cash').textContent = fmt.money(cf.cashEnding);
    const priorCf = SNAPSHOT.cashFlow.prior;
    if (priorCf) {
      const d = cf.cashEnding - priorCf.cashEnding;
      const el = document.getElementById('kpi-cash-delta');
      el.textContent = `${fmt.signed(d)} vs prior period`;
      el.className = 'kpi-delta ' + (d >= 0 ? 'up' : 'down');
    }
  }
  document.getElementById('kpi-ar').textContent = 'See cash flow tab';

  // Critical flags on exec summary
  const flags = computeActionFlags();
  const exec = document.getElementById('exec-flag-list');
  exec.innerHTML = '';
  const top = flags.filter(f => f.severity === 'bad').slice(0, 4);
  if (top.length === 0) {
    exec.innerHTML = `<li class="flag-good"><span class="flag-tag good">OK</span>No critical flags triggered for the current period.</li>`;
  } else {
    top.forEach(f => exec.appendChild(flagListItem(f)));
  }
}

function setKpi(slug, current, comparison, formatter, isPct = false, opexLogic = false) {
  document.getElementById('kpi-' + slug).textContent = formatter(current);
  const deltaEl = document.getElementById('kpi-' + slug + '-delta');
  if (comparison === undefined || comparison === null) {
    deltaEl.textContent = '—';
    deltaEl.className = 'kpi-delta';
    return;
  }
  if (isPct) {
    const d = current - comparison;
    deltaEl.textContent = `${fmt.pctPoint(d)} vs comparison`;
    deltaEl.className = 'kpi-delta ' + (d >= 0 ? 'up' : 'down');
  } else {
    const d = fmt.delta(current, comparison);
    if (d === null) {
      deltaEl.textContent = '—';
      deltaEl.className = 'kpi-delta';
    } else {
      const isGood = opexLogic ? d <= 0 : d >= 0;
      deltaEl.textContent = `${fmt.pct(d, 1)} vs comparison (${fmt.signed(current - comparison)})`;
      deltaEl.className = 'kpi-delta ' + (isGood ? 'up' : 'down');
    }
  }
}

function renderPnl() {
  const { period, label } = pickPeriod();
  const comp = pickComparison(period);
  document.getElementById('pnl-period-label').textContent =
    `${label} · ${fmt.date(period.periodStart)} → ${fmt.date(period.periodEnd)}`;
  document.getElementById('pnl-col-current').textContent = label;
  document.getElementById('pnl-col-comparison').textContent = comp ? comp.label : '—';

  const rows = [
    { label: 'Revenue', cur: period.revenue, prev: comp?.revenue, type: 'subtotal' },
    { label: 'Cost of Goods Sold (COGS)', cur: period.cogs, prev: comp?.cogs, type: 'indent', invertGood: true },
    { label: 'Gross Profit', cur: period.grossProfit, prev: comp?.grossProfit, type: 'subtotal' },
    { label: 'Gross Margin %', cur: period.grossMarginPct, prev: comp?.grossMarginPct, type: 'indent', isPct: true },
    { label: 'Operating Expenses', cur: period.operatingExpenses, prev: comp?.operatingExpenses, type: 'indent', invertGood: true },
    { label: 'Net Income', cur: period.netIncome, prev: comp?.netIncome, type: 'total' },
    { label: 'Net Margin %', cur: period.netMarginPct, prev: comp?.netMarginPct, type: 'indent', isPct: true },
  ];

  const tb = document.getElementById('pnl-tbody');
  tb.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    if (r.type) tr.className = r.type;
    let curCell = r.isPct ? fmt.pct(r.cur) : fmt.money(r.cur);
    let prevCell = (r.prev === undefined || r.prev === null) ? '—' : (r.isPct ? fmt.pct(r.prev) : fmt.money(r.prev));
    let varDollar = '—', varPct = '—', varClass = '';
    if (r.prev !== undefined && r.prev !== null) {
      if (r.isPct) {
        const d = r.cur - r.prev;
        varDollar = fmt.pctPoint(d);
        varPct = '';
        varClass = (d >= 0) ? 'delta-pos' : 'delta-neg';
      } else {
        const d = r.cur - r.prev;
        const dPct = fmt.delta(r.cur, r.prev);
        varDollar = fmt.signed(d);
        varPct = dPct === null ? '—' : fmt.pct(dPct);
        const isGood = r.invertGood ? d <= 0 : d >= 0;
        varClass = isGood ? 'delta-pos' : 'delta-neg';
      }
    }
    tr.innerHTML = `<td>${r.label}</td>
      <td class="num">${curCell}</td>
      <td class="num">${prevCell}</td>
      <td class="num ${varClass}">${varDollar}</td>
      <td class="num ${varClass}">${varPct}</td>`;
    tb.appendChild(tr);
  });
}

function renderCompare() {
  const periods = SNAPSHOT.periods;
  const tb = document.getElementById('compare-tbody');
  tb.innerHTML = '';

  const metrics = [
    { label: 'Revenue', key: 'revenue', formatter: fmt.money },
    { label: 'Gross Profit', key: 'grossProfit', formatter: fmt.money },
    { label: 'Gross Margin %', key: 'grossMarginPct', formatter: fmt.pct, isPct: true },
    { label: 'Operating Expenses', key: 'operatingExpenses', formatter: fmt.money, invertGood: true },
    { label: 'Net Income', key: 'netIncome', formatter: fmt.money },
    { label: 'Net Margin %', key: 'netMarginPct', formatter: fmt.pct, isPct: true },
  ];
  metrics.forEach(m => {
    const cur = periods.current[m.key];
    const prior = periods.prior[m.key];
    const prior2 = periods.prior2 ? periods.prior2[m.key] : null;
    const yoy = m.isPct ? (cur - prior) : fmt.delta(cur, prior);
    const cagr = (prior2 && prior2 !== 0 && !m.isPct)
      ? Math.pow(Math.abs(cur) / Math.abs(prior2), 1 / 2) * Math.sign(cur / (prior2 || 1)) - 1
      : null;
    const yoyClass = (m.isPct ? yoy >= 0 : yoy >= 0) ? 'delta-pos' : 'delta-neg';
    const cagrFmt = (cagr === null || Number.isNaN(cagr)) ? '—' : fmt.pct(cagr);
    const yoyFmt = m.isPct ? fmt.pctPoint(yoy) : (yoy === null ? '—' : fmt.pct(yoy));
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.label}</td>
      <td class="num">${m.formatter(cur)}</td>
      <td class="num">${m.formatter(prior)}</td>
      <td class="num">${prior2 === null ? '—' : m.formatter(prior2)}</td>
      <td class="num ${yoyClass}">${yoyFmt}</td>
      <td class="num">${cagrFmt}</td>`;
    tb.appendChild(tr);
  });

  // Month vs month
  const mvmTb = document.getElementById('mvm-tbody');
  mvmTb.innerHTML = '';
  SNAPSHOT.verifiedMonths.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.month}</td>
      <td class="num">${fmt.money(m.revenue)}</td>
      <td class="num">${fmt.money(m.grossProfit)}</td>
      <td class="num">${fmt.pct(m.grossMarginPct)}</td>
      <td class="num">${fmt.money(m.netIncome)}</td>
      <td class="num">${fmt.pct(m.netMarginPct)}</td>`;
    mvmTb.appendChild(tr);
  });

  // Quarter-vs-quarter (annualized run-rates per period as a coarse proxy)
  const qvqTb = document.getElementById('qvq-tbody');
  qvqTb.innerHTML = '';
  const quarters = [
    { label: 'YTD 2026 → annualized run rate', src: SNAPSHOT.forecast, mapping: { revenue: 'runRateRevenue', grossProfit: 'runRateGrossProfit', netIncome: 'runRateNetIncome' } },
    { label: 'FY 2025 (annual)', src: periods.prior, mapping: { revenue: 'revenue', grossProfit: 'grossProfit', netIncome: 'netIncome' } },
    { label: 'FY 2024 (annual)', src: periods.prior2, mapping: { revenue: 'revenue', grossProfit: 'grossProfit', netIncome: 'netIncome' } },
  ];
  quarters.forEach(q => {
    if (!q.src) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${q.label}</td>
      <td class="num">${fmt.money(q.src[q.mapping.revenue])}</td>
      <td class="num">${fmt.money(q.src[q.mapping.grossProfit])}</td>
      <td class="num">${fmt.money(q.src[q.mapping.netIncome])}</td>`;
    qvqTb.appendChild(tr);
  });

  // Actual vs Forecast
  const avfTb = document.getElementById('avf-tbody');
  avfTb.innerHTML = '';
  const f = SNAPSHOT.forecast;
  [
    { label: 'Revenue', ytd: f.ytdRevenue, fc: f.yearEndRevenue },
    { label: 'Gross Profit', ytd: f.ytdGrossProfit, fc: f.yearEndGrossProfit },
    { label: 'Operating Expenses', ytd: f.ytdOperatingExpenses, fc: f.yearEndOperatingExpenses },
    { label: 'Net Income', ytd: f.ytdNetIncome, fc: f.yearEndNetIncome },
  ].forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.label}</td>
      <td class="num">${fmt.money(row.ytd)}</td>
      <td class="num">${fmt.money(row.fc)}</td>
      <td class="num">${fmt.money(row.fc - row.ytd)}</td>`;
    avfTb.appendChild(tr);
  });
}

function renderDeepDive() {
  const periods = SNAPSHOT.periods;
  const cur = periods.current, prior = periods.prior;

  const revMix = [
    { label: 'Revenue', cur: cur.revenue, prev: prior.revenue },
    { label: 'COGS', cur: cur.cogs, prev: prior.cogs },
    { label: 'Gross Profit', cur: cur.grossProfit, prev: prior.grossProfit },
    { label: 'Gross Margin %', cur: cur.grossMarginPct, prev: prior.grossMarginPct, isPct: true },
    { label: 'Operating Expenses', cur: cur.operatingExpenses, prev: prior.operatingExpenses },
    { label: 'Net Income', cur: cur.netIncome, prev: prior.netIncome },
  ];
  const rt = document.getElementById('rev-mix-tbody');
  rt.innerHTML = '';
  revMix.forEach(m => {
    const tr = document.createElement('tr');
    const dPct = m.isPct ? (m.cur - m.prev) : fmt.delta(m.cur, m.prev);
    const dStr = m.isPct ? fmt.pctPoint(dPct) : (dPct === null ? '—' : fmt.pct(dPct));
    const cls = dPct >= 0 ? 'delta-pos' : 'delta-neg';
    tr.innerHTML = `<td>${m.label}</td>
      <td class="num">${m.isPct ? fmt.pct(m.cur) : fmt.money(m.cur)}</td>
      <td class="num">${m.isPct ? fmt.pct(m.prev) : fmt.money(m.prev)}</td>
      <td class="num ${cls}">${dStr}</td>`;
    rt.appendChild(tr);
  });

  const mp = document.getElementById('margin-progress-tbody');
  mp.innerHTML = '';
  SNAPSHOT.verifiedMonths.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.month}</td>
      <td class="num">${fmt.money(m.revenue)}</td>
      <td class="num">${fmt.money(m.grossProfit)}</td>
      <td class="num">${fmt.pct(m.grossMarginPct)}</td>`;
    mp.appendChild(tr);
  });

  const cf = SNAPSHOT.cashFlow;
  const cft = document.getElementById('cashflow-tbody');
  cft.innerHTML = '';
  const cfRows = [
    { label: 'Operating activities', cur: cf.current?.operating, prev: cf.prior?.operating },
    { label: 'Investing activities', cur: cf.current?.investing, prev: cf.prior?.investing },
    { label: 'Financing activities', cur: cf.current?.financing, prev: cf.prior?.financing },
    { label: 'Net cash change', cur: cf.current?.netCashChange, prev: cf.prior?.netCashChange },
    { label: 'Cash at beginning', cur: cf.current?.cashBeginning, prev: cf.prior?.cashBeginning },
    { label: 'Cash at end of period', cur: cf.current?.cashEnding, prev: cf.prior?.cashEnding },
  ];
  cfRows.forEach(r => {
    const tr = document.createElement('tr');
    const d = fmt.delta(r.cur, r.prev);
    const cls = (d ?? 0) >= 0 ? 'delta-pos' : 'delta-neg';
    tr.innerHTML = `<td>${r.label}</td>
      <td class="num">${fmt.money(r.cur)}</td>
      <td class="num">${fmt.money(r.prev)}</td>
      <td class="num ${cls}">${d === null ? '—' : fmt.pct(d)}</td>`;
    cft.appendChild(tr);
  });
}

function renderForecast() {
  const f = SNAPSHOT.forecast;
  document.getElementById('forecast-meta').textContent =
    `${f.completedMonths} of 12 months completed · ${f.remainingMonths} remaining. Run-rate methodology — see formulas below.`;
  document.getElementById('fc-revenue').textContent = fmt.money(f.yearEndRevenue);
  document.getElementById('fc-gp').textContent = fmt.money(f.yearEndGrossProfit);
  document.getElementById('fc-gm-pct').textContent = fmt.pct(f.yearEndGrossMarginPct);
  document.getElementById('fc-opex').textContent = fmt.money(f.yearEndOperatingExpenses);
  document.getElementById('fc-net').textContent = fmt.money(f.yearEndNetIncome);
  document.getElementById('fc-nm-pct').textContent = fmt.pct(f.yearEndNetMarginPct);
  document.getElementById('fc-cash').textContent = fmt.money(f.yearEndCash);
  document.getElementById('fc-runrate').textContent = fmt.money(f.runRateRevenue);
}

function renderTrends() {
  // Annual revenue trend
  const periods = SNAPSHOT.periods;
  const f = SNAPSHOT.forecast;
  const series = [
    { label: 'FY 2024', revenue: periods.prior2?.revenue, gp: periods.prior2?.grossProfit, net: periods.prior2?.netIncome },
    { label: 'FY 2025', revenue: periods.prior?.revenue, gp: periods.prior?.grossProfit, net: periods.prior?.netIncome },
    { label: 'YTD 2026', revenue: periods.current.revenue, gp: periods.current.grossProfit, net: periods.current.netIncome },
    { label: '2026 forecast', revenue: f.yearEndRevenue, gp: f.yearEndGrossProfit, net: f.yearEndNetIncome },
  ].filter(s => s.revenue !== undefined && s.revenue !== null);

  drawBars('trend-revenue', series.map(s => ({ label: s.label, value: s.revenue })));
  drawGroupedBars('trend-profit', series.map(s => ({ label: s.label, gp: s.gp, net: s.net })));

  const mt = document.getElementById('margin-trend-tbody');
  mt.innerHTML = '';
  series.forEach(s => {
    const tr = document.createElement('tr');
    const gmPct = s.revenue ? s.gp / s.revenue : 0;
    const nmPct = s.revenue ? s.net / s.revenue : 0;
    tr.innerHTML = `<td>${s.label}</td>
      <td class="num">${fmt.money(s.revenue)}</td>
      <td class="num">${fmt.money(s.gp)}</td>
      <td class="num">${fmt.pct(gmPct)}</td>
      <td class="num">${fmt.money(s.net)}</td>
      <td class="num">${fmt.pct(nmPct)}</td>`;
    mt.appendChild(tr);
  });

  const mtb = document.getElementById('months-tbody');
  mtb.innerHTML = '';
  if (SNAPSHOT.verifiedMonths.length === 0) {
    mtb.innerHTML = `<tr><td colspan="8">No verified monthly data yet. Run <code>scripts/refresh.sh</code>.</td></tr>`;
  } else {
    SNAPSHOT.verifiedMonths.forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${m.month}</td>
        <td class="num">${fmt.money(m.revenue)}</td>
        <td class="num">${fmt.money(m.cogs)}</td>
        <td class="num">${fmt.money(m.grossProfit)}</td>
        <td class="num">${fmt.money(m.operatingExpenses)}</td>
        <td class="num">${fmt.money(m.netIncome)}</td>
        <td class="num">${fmt.pct(m.grossMarginPct)}</td>
        <td class="num">${fmt.pct(m.netMarginPct)}</td>`;
      mtb.appendChild(tr);
    });
  }
}

function renderFlags() {
  const flags = computeActionFlags();
  const ul = document.getElementById('action-flag-list');
  ul.innerHTML = '';
  if (flags.length === 0) {
    ul.innerHTML = `<li class="flag-good"><span class="flag-tag good">OK</span>No action flags triggered.</li>`;
    return;
  }
  flags.forEach(f => ul.appendChild(flagListItem(f)));
}

function flagListItem(flag) {
  const li = document.createElement('li');
  li.className = `flag-${flag.severity}`;
  const tag = flag.severity === 'bad' ? 'CRITICAL'
            : flag.severity === 'warn' ? 'WARN'
            : flag.severity === 'good' ? 'OK' : 'INFO';
  li.innerHTML = `<div class="flag-title"><span class="flag-tag ${flag.severity}">${tag}</span>${flag.title}</div>
    <div class="flag-detail">${flag.detail}</div>`;
  return li;
}

function computeActionFlags() {
  const periods = SNAPSHOT.periods;
  const f = SNAPSHOT.forecast;
  const cf = SNAPSHOT.cashFlow;
  const flags = [];

  // Revenue decline: run-rate vs prior year
  if (f.runRateRevenue < periods.prior.revenue) {
    flags.push({
      severity: 'bad',
      title: 'Revenue decline projected vs prior year',
      detail: `Run-rate revenue ${fmt.money(f.runRateRevenue)} is below FY 2025 actual ${fmt.money(periods.prior.revenue)} (Δ ${fmt.pct(fmt.delta(f.runRateRevenue, periods.prior.revenue))}).`,
    });
  } else {
    flags.push({
      severity: 'good',
      title: 'Revenue trajectory above prior year',
      detail: `Run-rate revenue ${fmt.money(f.runRateRevenue)} vs FY 2025 ${fmt.money(periods.prior.revenue)} = ${fmt.pct(fmt.delta(f.runRateRevenue, periods.prior.revenue))}.`,
    });
  }

  // Margin compression
  const gmDelta = periods.current.grossMarginPct - periods.prior.grossMarginPct;
  if (gmDelta < -0.01) {
    flags.push({
      severity: 'bad',
      title: 'Gross margin compression vs prior year',
      detail: `Gross margin % ${fmt.pct(periods.current.grossMarginPct)} vs prior ${fmt.pct(periods.prior.grossMarginPct)} (${fmt.pctPoint(gmDelta)}).`,
    });
  } else if (gmDelta > 0.01) {
    flags.push({
      severity: 'good',
      title: 'Gross margin expansion vs prior year',
      detail: `Gross margin % ${fmt.pct(periods.current.grossMarginPct)} vs prior ${fmt.pct(periods.prior.grossMarginPct)} (${fmt.pctPoint(gmDelta)}).`,
    });
  }

  // Expense spike
  const opexRunRate = f.runRateOperatingExpenses;
  const opexDelta = fmt.delta(opexRunRate, periods.prior.operatingExpenses);
  if (opexDelta !== null && opexDelta > 0.05) {
    flags.push({
      severity: 'warn',
      title: 'Operating expense run-rate above prior year',
      detail: `OpEx run-rate ${fmt.money(opexRunRate)} vs prior ${fmt.money(periods.prior.operatingExpenses)} (+${fmt.pct(opexDelta)}).`,
    });
  }

  // Negative cash flow + cash position
  if (cf.current && cf.current.netCashChange < 0) {
    flags.push({
      severity: 'bad',
      title: 'Negative net cash flow YTD',
      detail: `YTD net cash change ${fmt.money(cf.current.netCashChange)} (Operating ${fmt.money(cf.current.operating)} + Investing ${fmt.money(cf.current.investing)} + Financing ${fmt.money(cf.current.financing)}).`,
    });
  }
  if (cf.current && cf.current.cashEnding < 0) {
    flags.push({
      severity: 'bad',
      title: 'Negative cash position',
      detail: `Cash at end of period ${fmt.money(cf.current.cashEnding)} (overdraft / line-of-credit drawn). Beginning cash ${fmt.money(cf.current.cashBeginning)}.`,
    });
  }

  // A/R risk: large negative A/R movement (uncollected) — read from cf raw if present
  // Surfaced via the deep-dive cash flow tab; simplified flag here based on net cash trend
  if (cf.current && cf.prior && cf.current.cashEnding < cf.prior.cashEnding - 100000) {
    flags.push({
      severity: 'warn',
      title: 'A/R collection risk',
      detail: `Cash position deteriorated by ${fmt.money(cf.current.cashEnding - cf.prior.cashEnding)} vs prior year-end. Review A/R aging and collection cadence.`,
    });
  }

  // Forecast miss
  if (f.yearEndNetMarginPct < periods.prior.netMarginPct - 0.01) {
    flags.push({
      severity: 'warn',
      title: 'Forecast net margin below prior year',
      detail: `Forecast net margin ${fmt.pct(f.yearEndNetMarginPct)} vs prior year ${fmt.pct(periods.prior.netMarginPct)} (${fmt.pctPoint(f.yearEndNetMarginPct - periods.prior.netMarginPct)}).`,
    });
  }

  return flags;
}

// =============================================================================
// Tiny SVG bar chart helpers
// =============================================================================

function drawBars(elId, items) {
  const el = document.getElementById(elId);
  if (!el || items.length === 0) return;
  const W = 720, H = 200, pad = { l: 64, r: 12, t: 16, b: 36 };
  const max = Math.max(...items.map(i => Math.abs(i.value)));
  const barW = (W - pad.l - pad.r) / items.length - 12;
  const bars = items.map((it, i) => {
    const h = (Math.abs(it.value) / max) * (H - pad.t - pad.b);
    const x = pad.l + i * (barW + 12);
    const y = it.value >= 0 ? H - pad.b - h : H - pad.b;
    return `<rect class="bar" x="${x}" y="${y}" width="${barW}" height="${h}" rx="4"></rect>
      <text class="axis" x="${x + barW / 2}" y="${H - pad.b + 16}" text-anchor="middle">${it.label}</text>
      <text class="axis" x="${x + barW / 2}" y="${y - 4}" text-anchor="middle">${fmt.money(it.value)}</text>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet">${bars}</svg>`;
}

function drawGroupedBars(elId, items) {
  const el = document.getElementById(elId);
  if (!el || items.length === 0) return;
  const W = 720, H = 220, pad = { l: 64, r: 12, t: 16, b: 36 };
  const max = Math.max(...items.flatMap(i => [Math.abs(i.gp), Math.abs(i.net)]));
  const groupW = (W - pad.l - pad.r) / items.length;
  const barW = groupW / 2 - 8;
  const draw = items.map((it, i) => {
    const x = pad.l + i * groupW + 4;
    const hGp = (Math.abs(it.gp) / max) * (H - pad.t - pad.b);
    const hNet = (Math.abs(it.net) / max) * (H - pad.t - pad.b);
    return `<rect class="bar" x="${x}" y="${H - pad.b - hGp}" width="${barW}" height="${hGp}" rx="3"></rect>
      <rect class="bar-2" x="${x + barW + 6}" y="${H - pad.b - hNet}" width="${barW}" height="${hNet}" rx="3"></rect>
      <text class="axis" x="${x + groupW / 2}" y="${H - pad.b + 16}" text-anchor="middle">${it.label}</text>
      <text class="axis" x="${x + barW / 2}" y="${H - pad.b - hGp - 4}" text-anchor="middle">${fmt.money(it.gp)}</text>
      <text class="axis" x="${x + barW + 6 + barW / 2}" y="${H - pad.b - hNet - 4}" text-anchor="middle">${fmt.money(it.net)}</text>`;
  }).join('');
  const legend = `<g transform="translate(${pad.l}, 8)">
    <rect class="bar" x="0" y="0" width="10" height="10" rx="2"></rect>
    <text class="axis" x="14" y="9">Gross Profit</text>
    <rect class="bar-2" x="100" y="0" width="10" height="10" rx="2"></rect>
    <text class="axis" x="114" y="9">Net Income</text>
  </g>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet">${legend}${draw}</svg>`;
}

document.addEventListener('DOMContentLoaded', init);
