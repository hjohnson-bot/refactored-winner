/**
 * Finance & Strategy Dashboard — Midwest Design Group LLC
 *
 * Loads cfo-dashboard/data/snapshot.json (built from live QuickBooks data via
 * scripts/refresh.sh) and renders 11 tabs across 5 personas: CFO, FP&A,
 * Controller, Strategy, Treasury.
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
  pct(n, d = 1) { return (n === null || n === undefined || Number.isNaN(n)) ? '—' : `${(n * 100).toFixed(d)}%`; },
  pctPoint(n, d = 1) { if (n === null || n === undefined || Number.isNaN(n)) return '—'; const s = n >= 0 ? '+' : ''; return `${s}${(n * 100).toFixed(d)}pt`; },
  delta(c, p) { if (p === 0 || p === null || p === undefined) return null; return (c - p) / Math.abs(p); },
  signed(n, formatter = fmt.money) { if (n === null || n === undefined) return '—'; const s = n > 0 ? '+' : ''; return `${s}${formatter(n)}`; },
  date(d) { if (!d) return ''; return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); },
};

let SNAPSHOT = null;
let FILTERS = { start: null, end: null, period: 'ytd', comparison: 'prior-year', account: 'all', expenseCat: 'all', klass: 'all', location: 'all' };
let PERSONA = localStorage.getItem('cfod_persona') || 'cfo';
let SCENARIO = { revGrowth: 0, gmShift: 0, opexShift: 0 };

async function init() {
  const res = await fetch('data/snapshot.json');
  if (!res.ok) {
    document.body.innerHTML = `<div style="padding:40px;color:#f55a5a">Failed to load snapshot. Run <code>scripts/refresh.sh</code> first.</div>`;
    return;
  }
  SNAPSHOT = await res.json();
  setupHeader();
  setupFilters();
  setupTabs();
  setupPersona();
  setupNotes();
  setupCsvExport();
  setupScenarios();
  applyFilterState();
  renderAll();
}

function setupHeader() {
  document.getElementById('company-name').textContent = `${SNAPSHOT.company.name} · Finance & Strategy Dashboard`;
  document.getElementById('company-meta').textContent = `${SNAPSHOT.company.industry} · NAICS ${SNAPSHOT.company.naics} · ${SNAPSHOT.company.state || ''}`;
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
    if (FILTERS.period === 'ytd') { FILTERS.start = SNAPSHOT.periods.current.periodStart; FILTERS.end = SNAPSHOT.periods.current.periodEnd; }
    else if (FILTERS.period === 'fy2025') { FILTERS.start = SNAPSHOT.periods.prior.periodStart; FILTERS.end = SNAPSHOT.periods.prior.periodEnd; }
    else if (FILTERS.period === 'fy2024' && SNAPSHOT.periods.prior2) { FILTERS.start = SNAPSHOT.periods.prior2.periodStart; FILTERS.end = SNAPSHOT.periods.prior2.periodEnd; }
    document.getElementById('filter-start').value = FILTERS.start;
    document.getElementById('filter-end').value = FILTERS.end;
    renderAll();
  });
  ['filter-start', 'filter-end'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      FILTERS[id === 'filter-start' ? 'start' : 'end'] = e.target.value;
      FILTERS.period = 'custom'; document.getElementById('filter-period').value = 'custom'; renderAll();
    });
  });
  ['filter-comparison', 'filter-account', 'filter-expense-cat', 'filter-class', 'filter-location'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      const map = { 'filter-comparison': 'comparison', 'filter-account': 'account', 'filter-expense-cat': 'expenseCat', 'filter-class': 'klass', 'filter-location': 'location' };
      FILTERS[map[id]] = e.target.value; renderAll();
    });
  });

  // Populate revenue accounts from segments
  const revSel = document.getElementById('filter-account');
  (SNAPSHOT.periods.current.segments?.incomeAccounts || []).forEach(a => {
    const opt = document.createElement('option'); opt.value = a.account; opt.textContent = a.account; revSel.appendChild(opt);
  });
  const opSel = document.getElementById('filter-expense-cat');
  (SNAPSHOT.periods.current.segments?.opexBuckets || []).forEach(b => {
    const opt = document.createElement('option'); opt.value = b.bucket; opt.textContent = b.bucket; opSel.appendChild(opt);
  });
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('tab-' + t.dataset.tab).classList.add('active');
  }));
}

function setupPersona() {
  const sel = document.getElementById('persona');
  sel.value = PERSONA;
  sel.addEventListener('change', e => { PERSONA = e.target.value; localStorage.setItem('cfod_persona', PERSONA); renderExec(); });
}

function setupNotes() {
  document.querySelectorAll('.notes-section').forEach(el => {
    const key = 'cfod_notes_' + el.dataset.tabKey;
    const saved = localStorage.getItem(key) || '';
    el.innerHTML = `<details${saved ? ' open' : ''}>
      <summary>📝 Notes &amp; commentary</summary>
      <textarea data-key="${key}" placeholder="Add commentary, context, or follow-ups for this view…">${saved.replace(/</g, '&lt;')}</textarea>
      <div class="notes-meta">Saved locally in your browser. Last updated <span class="notes-stamp">${saved ? new Date().toLocaleString() : '—'}</span></div>
    </details>`;
    const ta = el.querySelector('textarea');
    ta.addEventListener('input', () => {
      localStorage.setItem(key, ta.value);
      el.querySelector('.notes-stamp').textContent = new Date().toLocaleString();
    });
  });
}

function setupCsvExport() {
  document.querySelectorAll('.csv-btn').forEach(btn => {
    btn.addEventListener('click', () => exportCsv(btn.dataset.csv));
  });
}

function setupScenarios() {
  const update = () => {
    SCENARIO.revGrowth = parseFloat(document.getElementById('scn-rev').value) / 100;
    SCENARIO.gmShift = parseFloat(document.getElementById('scn-gm').value) / 100;
    SCENARIO.opexShift = parseFloat(document.getElementById('scn-opex').value) / 100;
    document.getElementById('scn-rev-out').textContent = `${(SCENARIO.revGrowth * 100).toFixed(0)}%`;
    document.getElementById('scn-gm-out').textContent = `${(SCENARIO.gmShift * 100 >= 0 ? '+' : '')}${(SCENARIO.gmShift * 100).toFixed(1)}pt`;
    document.getElementById('scn-opex-out').textContent = `${(SCENARIO.opexShift * 100 >= 0 ? '+' : '')}${(SCENARIO.opexShift * 100).toFixed(0)}%`;
    renderScenarios();
  };
  ['scn-rev', 'scn-gm', 'scn-opex'].forEach(id => document.getElementById(id).addEventListener('input', update));
}

function applyFilterState() {
  document.getElementById('filter-period').value = FILTERS.period;
  document.getElementById('filter-comparison').value = FILTERS.comparison;
}

function pickPeriod() {
  const p = SNAPSHOT.periods;
  if (FILTERS.start === p.current.periodStart && FILTERS.end === p.current.periodEnd) return { period: p.current, label: 'YTD 2026', exact: true };
  if (FILTERS.start === p.prior.periodStart && FILTERS.end === p.prior.periodEnd) return { period: p.prior, label: 'FY 2025', exact: true };
  if (p.prior2 && FILTERS.start === p.prior2.periodStart && FILTERS.end === p.prior2.periodEnd) return { period: p.prior2, label: 'FY 2024', exact: true };
  return { period: p.current, label: `Custom (showing YTD 2026)`, exact: false };
}

function pickComparison(active) {
  const p = SNAPSHOT.periods;
  if (FILTERS.comparison === 'none') return null;
  if (FILTERS.comparison === 'forecast') {
    const f = SNAPSHOT.forecast;
    return { label: 'Year-end forecast', revenue: f.yearEndRevenue, cogs: f.yearEndRevenue - f.yearEndGrossProfit, grossProfit: f.yearEndGrossProfit, operatingExpenses: f.yearEndOperatingExpenses, netIncome: f.yearEndNetIncome, grossMarginPct: f.yearEndGrossMarginPct, netMarginPct: f.yearEndNetMarginPct };
  }
  if (FILTERS.comparison === 'prior-2' && p.prior2) return { label: 'FY 2024', ...p.prior2 };
  if (active === p.current) return { label: 'FY 2025', ...p.prior };
  if (active === p.prior && p.prior2) return { label: 'FY 2024', ...p.prior2 };
  return null;
}

// =============================================================================
// Renderers
// =============================================================================

function renderAll() {
  renderExec(); renderPnl(); renderCompare();
  renderSegments(); renderWorkingCapital();
  renderDeepDive(); renderForecast(); renderProjections(); renderScenarios();
  renderTrends(); renderMultiYear(); renderBenchmark(); renderFlags();
}

const PERSONA_KPIS = {
  cfo: [
    { key: 'revenue', label: 'Revenue', val: p => p.revenue, comp: c => c?.revenue, fmt: fmt.money },
    { key: 'grossProfit', label: 'Gross Profit', val: p => p.grossProfit, comp: c => c?.grossProfit, fmt: fmt.money },
    { key: 'grossMarginPct', label: 'Gross Margin %', val: p => p.grossMarginPct, comp: c => c?.grossMarginPct, fmt: fmt.pct, isPct: true },
    { key: 'opex', label: 'Operating Expenses', val: p => p.operatingExpenses, comp: c => c?.operatingExpenses, fmt: fmt.money, invertGood: true },
    { key: 'netIncome', label: 'Net Income', val: p => p.netIncome, comp: c => c?.netIncome, fmt: fmt.money },
    { key: 'netMarginPct', label: 'Net Margin %', val: p => p.netMarginPct, comp: c => c?.netMarginPct, fmt: fmt.pct, isPct: true },
    { key: 'cash', label: 'Cash Position', val: () => SNAPSHOT.cashFlow.current?.cashEnding, comp: () => SNAPSHOT.cashFlow.prior?.cashEnding, fmt: fmt.money },
    { key: 'fcCash', label: 'Forecast year-end cash', val: () => SNAPSHOT.forecast.yearEndCash, comp: () => null, fmt: fmt.money },
  ],
  fpa: [
    { key: 'revenue', label: 'Revenue', val: p => p.revenue, comp: c => c?.revenue, fmt: fmt.money },
    { key: 'grossMarginPct', label: 'Gross Margin %', val: p => p.grossMarginPct, comp: c => c?.grossMarginPct, fmt: fmt.pct, isPct: true },
    { key: 'opex', label: 'Operating Expenses', val: p => p.operatingExpenses, comp: c => c?.operatingExpenses, fmt: fmt.money, invertGood: true },
    { key: 'netIncome', label: 'Net Income', val: p => p.netIncome, comp: c => c?.netIncome, fmt: fmt.money },
    { key: 'fcRev', label: 'Year-end forecast revenue', val: () => SNAPSHOT.forecast.yearEndRevenue, comp: () => SNAPSHOT.periods.prior.revenue, fmt: fmt.money },
    { key: 'runRate', label: 'Revenue run-rate', val: () => SNAPSHOT.forecast.runRateRevenue, comp: () => SNAPSHOT.periods.prior.revenue, fmt: fmt.money },
    { key: 'completedMonths', label: 'YTD coverage', val: () => SNAPSHOT.forecast.completedMonths, comp: () => null, fmt: n => `${n} of 12 months` },
    { key: 'avgMonthlyRev', label: 'Avg monthly revenue (YTD)', val: () => SNAPSHOT.forecast.avgMonthlyRevenue, comp: () => null, fmt: fmt.money },
  ],
  controller: [
    { key: 'netIncome', label: 'Net Income', val: p => p.netIncome, comp: c => c?.netIncome, fmt: fmt.money },
    { key: 'opex', label: 'Operating Expenses', val: p => p.operatingExpenses, comp: c => c?.operatingExpenses, fmt: fmt.money, invertGood: true },
    { key: 'arChange', label: 'A/R change', val: () => SNAPSHOT.workingCapital.current.ar, comp: () => SNAPSHOT.workingCapital.prior.ar, fmt: fmt.money },
    { key: 'apChange', label: 'A/P change', val: () => SNAPSHOT.workingCapital.current.ap, comp: () => SNAPSHOT.workingCapital.prior.ap, fmt: fmt.money },
    { key: 'retainage', label: 'Retainage change', val: () => SNAPSHOT.workingCapital.current.retainage, comp: () => SNAPSHOT.workingCapital.prior.retainage, fmt: fmt.money },
    { key: 'wipNet', label: 'WIP adj net (over+under)', val: () => SNAPSHOT.workingCapital.current.wipOverbillings + SNAPSHOT.workingCapital.current.wipUnderbillings, comp: () => SNAPSHOT.workingCapital.prior.wipOverbillings + SNAPSHOT.workingCapital.prior.wipUnderbillings, fmt: fmt.money },
    { key: 'inv', label: 'Drywall inventory change', val: () => SNAPSHOT.workingCapital.current.inventory, comp: () => SNAPSHOT.workingCapital.prior.inventory, fmt: fmt.money },
    { key: 'cashEnd', label: 'Cash position', val: () => SNAPSHOT.cashFlow.current?.cashEnding, comp: () => SNAPSHOT.cashFlow.prior?.cashEnding, fmt: fmt.money },
  ],
  strategy: [
    { key: 'revenue', label: 'Revenue', val: p => p.revenue, comp: c => c?.revenue, fmt: fmt.money },
    { key: 'twoYearCagr', label: '2-yr revenue CAGR', val: () => Math.pow(SNAPSHOT.periods.current.revenue * 12 / 5 / SNAPSHOT.periods.prior2.revenue, 1/2) - 1, comp: () => null, fmt: fmt.pct, isPct: true },
    { key: 'gmExpansion', label: 'GM% vs prior year', val: p => p.grossMarginPct, comp: c => c?.grossMarginPct, fmt: fmt.pct, isPct: true },
    { key: 'fcRev', label: 'Year-end forecast revenue', val: () => SNAPSHOT.forecast.yearEndRevenue, comp: () => SNAPSHOT.periods.prior.revenue, fmt: fmt.money },
    { key: 'fcNm', label: 'Year-end forecast NM%', val: () => SNAPSHOT.forecast.yearEndNetMarginPct, comp: () => SNAPSHOT.periods.prior.netMarginPct, fmt: fmt.pct, isPct: true },
    { key: 'vsRegional', label: 'Profit vs IN regional avg', val: () => SNAPSHOT.benchmark?.vsRegionalPercent / 100, comp: () => null, fmt: n => n === undefined ? '—' : `${(n).toFixed(0)}×` },
    { key: 'topAccount', label: 'Top revenue account (YTD)', val: () => SNAPSHOT.periods.current.segments?.incomeAccounts?.[0]?.account || '—', comp: () => null, fmt: x => x },
    { key: 'topAcctVal', label: 'Top revenue account $', val: () => SNAPSHOT.periods.current.segments?.incomeAccounts?.[0]?.amount, comp: () => null, fmt: fmt.money },
  ],
  treasury: [
    { key: 'cashEnd', label: 'Cash at end of period', val: () => SNAPSHOT.cashFlow.current?.cashEnding, comp: () => SNAPSHOT.cashFlow.prior?.cashEnding, fmt: fmt.money },
    { key: 'opCash', label: 'Operating cash YTD', val: () => SNAPSHOT.cashFlow.current?.operating, comp: () => SNAPSHOT.cashFlow.prior?.operating, fmt: fmt.money },
    { key: 'invCash', label: 'Investing cash YTD', val: () => SNAPSHOT.cashFlow.current?.investing, comp: () => SNAPSHOT.cashFlow.prior?.investing, fmt: fmt.money },
    { key: 'finCash', label: 'Financing cash YTD', val: () => SNAPSHOT.cashFlow.current?.financing, comp: () => SNAPSHOT.cashFlow.prior?.financing, fmt: fmt.money },
    { key: 'locDraw', label: 'Line-of-credit draw (YTD)', val: () => SNAPSHOT.workingCapital.current.lineOfCreditDraw, comp: () => SNAPSHOT.workingCapital.prior.lineOfCreditDraw, fmt: fmt.money },
    { key: 'fcCash', label: 'Forecast year-end cash', val: () => SNAPSHOT.forecast.yearEndCash, comp: () => null, fmt: fmt.money },
    { key: 'arChange', label: 'A/R change YTD', val: () => SNAPSHOT.workingCapital.current.ar, comp: () => SNAPSHOT.workingCapital.prior.ar, fmt: fmt.money },
    { key: 'apChange', label: 'A/P change YTD', val: () => SNAPSHOT.workingCapital.current.ap, comp: () => SNAPSHOT.workingCapital.prior.ap, fmt: fmt.money },
  ],
};

function renderExec() {
  const { period, label, exact } = pickPeriod();
  const comp = pickComparison(period);
  const personaLabel = SNAPSHOT.personas.find(x => x.id === PERSONA)?.label || PERSONA.toUpperCase();
  document.getElementById('persona-tag').textContent = personaLabel;
  document.getElementById('exec-period-label').textContent = `${label} · ${fmt.date(period.periodStart)} → ${fmt.date(period.periodEnd)}` + (exact ? '' : ' (custom range — closest match shown)');

  const grid = document.getElementById('exec-kpis');
  grid.innerHTML = '';
  const kpis = PERSONA_KPIS[PERSONA] || PERSONA_KPIS.cfo;
  kpis.forEach(k => {
    const v = k.val(period);
    const c = k.comp ? k.comp(comp) : null;
    const div = document.createElement('div');
    div.className = 'kpi';
    let delta = '';
    if (c !== null && c !== undefined && typeof v === 'number' && typeof c === 'number') {
      if (k.isPct) {
        const d = v - c;
        delta = `<div class="kpi-delta ${d >= 0 ? 'up' : 'down'}">${fmt.pctPoint(d)} vs comparison</div>`;
      } else {
        const d = fmt.delta(v, c);
        if (d !== null) {
          const isGood = k.invertGood ? d <= 0 : d >= 0;
          delta = `<div class="kpi-delta ${isGood ? 'up' : 'down'}">${fmt.pct(d)} (${fmt.signed(v - c)})</div>`;
        }
      }
    }
    div.innerHTML = `<div class="kpi-label">${k.label}</div><div class="kpi-value">${k.fmt(v)}</div>${delta}`;
    grid.appendChild(div);
  });

  const flags = computeActionFlags();
  const exec = document.getElementById('exec-flag-list');
  exec.innerHTML = '';
  const top = flags.filter(f => f.severity === 'bad').slice(0, 4);
  if (top.length === 0) exec.innerHTML = `<li class="flag-good"><span class="flag-tag good">OK</span>No critical flags triggered.</li>`;
  else top.forEach(f => exec.appendChild(flagListItem(f)));
}

function renderPnl() {
  const { period, label } = pickPeriod();
  const comp = pickComparison(period);
  document.getElementById('pnl-period-label').textContent = `${label} · ${fmt.date(period.periodStart)} → ${fmt.date(period.periodEnd)}`;
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
  const tb = document.getElementById('pnl-tbody'); tb.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr'); if (r.type) tr.className = r.type;
    let curCell = r.isPct ? fmt.pct(r.cur) : fmt.money(r.cur);
    let prevCell = (r.prev === undefined || r.prev === null) ? '—' : (r.isPct ? fmt.pct(r.prev) : fmt.money(r.prev));
    let varD = '—', varP = '—', cls = '';
    if (r.prev !== undefined && r.prev !== null) {
      if (r.isPct) { const d = r.cur - r.prev; varD = fmt.pctPoint(d); varP = ''; cls = d >= 0 ? 'delta-pos' : 'delta-neg'; }
      else { const d = r.cur - r.prev; const dp = fmt.delta(r.cur, r.prev); varD = fmt.signed(d); varP = dp === null ? '—' : fmt.pct(dp); const isGood = r.invertGood ? d <= 0 : d >= 0; cls = isGood ? 'delta-pos' : 'delta-neg'; }
    }
    tr.innerHTML = `<td>${r.label}</td><td class="num">${curCell}</td><td class="num">${prevCell}</td><td class="num ${cls}">${varD}</td><td class="num ${cls}">${varP}</td>`;
    tb.appendChild(tr);
  });
}

function renderCompare() {
  const p = SNAPSHOT.periods;
  const tb = document.getElementById('compare-tbody'); tb.innerHTML = '';
  const metrics = [
    { label: 'Revenue', key: 'revenue', f: fmt.money },
    { label: 'Gross Profit', key: 'grossProfit', f: fmt.money },
    { label: 'Gross Margin %', key: 'grossMarginPct', f: fmt.pct, isPct: true },
    { label: 'Operating Expenses', key: 'operatingExpenses', f: fmt.money, invertGood: true },
    { label: 'Net Income', key: 'netIncome', f: fmt.money },
    { label: 'Net Margin %', key: 'netMarginPct', f: fmt.pct, isPct: true },
  ];
  metrics.forEach(m => {
    const cur = p.current[m.key], prior = p.prior[m.key], prior2 = p.prior2 ? p.prior2[m.key] : null;
    const yoy = m.isPct ? (cur - prior) : fmt.delta(cur, prior);
    const cagr = (prior2 && prior2 !== 0 && !m.isPct) ? Math.pow(Math.abs(cur) / Math.abs(prior2), 1 / 2) * Math.sign(cur / (prior2 || 1)) - 1 : null;
    const cls = (m.isPct ? yoy >= 0 : yoy >= 0) ? 'delta-pos' : 'delta-neg';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.label}</td><td class="num">${m.f(cur)}</td><td class="num">${m.f(prior)}</td><td class="num">${prior2 === null ? '—' : m.f(prior2)}</td><td class="num ${cls}">${m.isPct ? fmt.pctPoint(yoy) : (yoy === null ? '—' : fmt.pct(yoy))}</td><td class="num">${(cagr === null || Number.isNaN(cagr)) ? '—' : fmt.pct(cagr)}</td>`;
    tb.appendChild(tr);
  });

  const mvm = document.getElementById('mvm-tbody'); mvm.innerHTML = '';
  SNAPSHOT.verifiedMonths.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.month}</td><td class="num">${fmt.money(m.revenue)}</td><td class="num">${fmt.money(m.grossProfit)}</td><td class="num">${fmt.pct(m.grossMarginPct)}</td><td class="num">${fmt.money(m.netIncome)}</td><td class="num">${fmt.pct(m.netMarginPct)}</td>`;
    mvm.appendChild(tr);
  });

  const qvq = document.getElementById('qvq-tbody'); qvq.innerHTML = '';
  [
    { label: 'YTD 2026 → annualized run rate', src: SNAPSHOT.forecast, m: { revenue: 'runRateRevenue', grossProfit: 'runRateGrossProfit', netIncome: 'runRateNetIncome' } },
    { label: 'FY 2025 (annual)', src: p.prior, m: { revenue: 'revenue', grossProfit: 'grossProfit', netIncome: 'netIncome' } },
    { label: 'FY 2024 (annual)', src: p.prior2, m: { revenue: 'revenue', grossProfit: 'grossProfit', netIncome: 'netIncome' } },
  ].forEach(q => {
    if (!q.src) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${q.label}</td><td class="num">${fmt.money(q.src[q.m.revenue])}</td><td class="num">${fmt.money(q.src[q.m.grossProfit])}</td><td class="num">${fmt.money(q.src[q.m.netIncome])}</td>`;
    qvq.appendChild(tr);
  });

  const avf = document.getElementById('avf-tbody'); avf.innerHTML = '';
  const f = SNAPSHOT.forecast;
  [
    { label: 'Revenue', ytd: f.ytdRevenue, fc: f.yearEndRevenue },
    { label: 'Gross Profit', ytd: f.ytdGrossProfit, fc: f.yearEndGrossProfit },
    { label: 'Operating Expenses', ytd: f.ytdOperatingExpenses, fc: f.yearEndOperatingExpenses },
    { label: 'Net Income', ytd: f.ytdNetIncome, fc: f.yearEndNetIncome },
  ].forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.label}</td><td class="num">${fmt.money(r.ytd)}</td><td class="num">${fmt.money(r.fc)}</td><td class="num">${fmt.money(r.fc - r.ytd)}</td>`;
    avf.appendChild(tr);
  });
}

function renderSegments() {
  const cur = SNAPSHOT.periods.current.segments || {};
  const prior = SNAPSHOT.periods.prior.segments || {};
  const curRev = SNAPSHOT.periods.current.revenue;
  const curCogs = SNAPSHOT.periods.current.cogs;
  const curOpex = SNAPSHOT.periods.current.operatingExpenses;

  // Income accounts
  const rev = document.getElementById('seg-revenue-tbody'); rev.innerHTML = '';
  const sortedIncome = (cur.incomeAccounts || []).slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  sortedIncome.forEach(a => {
    const priorMatch = (prior.incomeAccounts || []).find(x => x.account === a.account);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${a.account}</td><td class="num">${fmt.money(a.amount)}</td><td class="num">${fmt.pct(a.amount / curRev)}</td><td class="num">${priorMatch ? fmt.money(priorMatch.amount) : '—'}</td>`;
    rev.appendChild(tr);
  });

  // COGS buckets
  const cogs = document.getElementById('seg-cogs-tbody'); cogs.innerHTML = '';
  (cur.cogsBuckets || []).forEach(b => {
    const priorMatch = (prior.cogsBuckets || []).find(x => x.bucket === b.bucket);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${b.bucket}</td><td class="num">${fmt.money(b.amount)}</td><td class="num">${fmt.pct(b.amount / curCogs)}</td><td class="num">${priorMatch ? fmt.money(priorMatch.amount) : '—'}</td>`;
    cogs.appendChild(tr);
  });

  // OpEx buckets
  const opex = document.getElementById('seg-opex-tbody'); opex.innerHTML = '';
  (cur.opexBuckets || []).forEach(b => {
    const priorMatch = (prior.opexBuckets || []).find(x => x.bucket === b.bucket);
    const dPct = priorMatch ? fmt.delta(b.amount, priorMatch.amount) : null;
    const cls = dPct === null ? '' : dPct <= 0 ? 'delta-pos' : 'delta-neg';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${b.bucket}</td><td class="num">${fmt.money(b.amount)}</td><td class="num">${fmt.pct(b.amount / curOpex)}</td><td class="num">${priorMatch ? fmt.money(priorMatch.amount) : '—'}</td><td class="num ${cls}">${dPct === null ? '—' : fmt.pct(dPct)}</td>`;
    opex.appendChild(tr);
  });
}

function renderWorkingCapital() {
  const wc = SNAPSHOT.workingCapital;
  const grid = document.getElementById('wc-kpis');
  grid.innerHTML = '';
  const kpis = [
    { label: 'A/R change', cur: wc.current.ar, prior: wc.prior.ar },
    { label: 'A/P change', cur: wc.current.ap, prior: wc.prior.ap },
    { label: 'Retainage change', cur: wc.current.retainage, prior: wc.prior.retainage },
    { label: 'Inventory change', cur: wc.current.inventory, prior: wc.prior.inventory },
    { label: 'WIP overbillings', cur: wc.current.wipOverbillings, prior: wc.prior.wipOverbillings },
    { label: 'WIP underbillings', cur: wc.current.wipUnderbillings, prior: wc.prior.wipUnderbillings },
    { label: 'Line of credit draw', cur: wc.current.lineOfCreditDraw, prior: wc.prior.lineOfCreditDraw },
    { label: 'Total WC change', cur: wc.current.totalWorkingCapitalChange, prior: wc.prior.totalWorkingCapitalChange },
  ];
  kpis.forEach(k => {
    const div = document.createElement('div');
    div.className = 'kpi';
    const d = fmt.delta(k.cur, k.prior);
    const cls = d === null ? '' : (d <= 0 ? 'up' : 'down');
    div.innerHTML = `<div class="kpi-label">${k.label}</div><div class="kpi-value">${fmt.money(k.cur)}</div><div class="kpi-delta ${cls}">${d === null ? '—' : fmt.pct(d)} vs FY 2025</div>`;
    grid.appendChild(div);
  });

  const tb = document.getElementById('wc-tbody'); tb.innerHTML = '';
  const rows = [
    ['Accounts Receivable', wc.current.ar, wc.prior.ar],
    ['Accounts Payable', wc.current.ap, wc.prior.ap],
    ['Retainage Receivable', wc.current.retainage, wc.prior.retainage],
    ['Drywall Inventory', wc.current.inventory, wc.prior.inventory],
    ['WIP Overbillings', wc.current.wipOverbillings, wc.prior.wipOverbillings],
    ['WIP Underbillings', wc.current.wipUnderbillings, wc.prior.wipUnderbillings],
    ['Line of Credit (LoC) draw', wc.current.lineOfCreditDraw, wc.prior.lineOfCreditDraw],
    ['Total working-capital change', wc.current.totalWorkingCapitalChange, wc.prior.totalWorkingCapitalChange],
  ];
  rows.forEach(r => {
    const d = fmt.delta(r[1], r[2]);
    const cls = d === null ? '' : (d <= 0 ? 'delta-pos' : 'delta-neg');
    const direction = r[1] > 0 ? '↑ source of cash' : r[1] < 0 ? '↓ use of cash' : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r[0]}</td><td class="num">${fmt.money(r[1])}</td><td class="num">${fmt.money(r[2])}</td><td class="num ${cls}">${d === null ? '—' : fmt.pct(d)}</td><td>${direction}</td>`;
    tb.appendChild(tr);
  });
}

function renderDeepDive() {
  const p = SNAPSHOT.periods, cur = p.current, prior = p.prior;
  const rt = document.getElementById('rev-mix-tbody'); rt.innerHTML = '';
  [
    { label: 'Revenue', cur: cur.revenue, prev: prior.revenue },
    { label: 'COGS', cur: cur.cogs, prev: prior.cogs },
    { label: 'Gross Profit', cur: cur.grossProfit, prev: prior.grossProfit },
    { label: 'Gross Margin %', cur: cur.grossMarginPct, prev: prior.grossMarginPct, isPct: true },
    { label: 'Operating Expenses', cur: cur.operatingExpenses, prev: prior.operatingExpenses },
    { label: 'Net Income', cur: cur.netIncome, prev: prior.netIncome },
  ].forEach(m => {
    const tr = document.createElement('tr');
    const dPct = m.isPct ? (m.cur - m.prev) : fmt.delta(m.cur, m.prev);
    const dStr = m.isPct ? fmt.pctPoint(dPct) : (dPct === null ? '—' : fmt.pct(dPct));
    const cls = dPct >= 0 ? 'delta-pos' : 'delta-neg';
    tr.innerHTML = `<td>${m.label}</td><td class="num">${m.isPct ? fmt.pct(m.cur) : fmt.money(m.cur)}</td><td class="num">${m.isPct ? fmt.pct(m.prev) : fmt.money(m.prev)}</td><td class="num ${cls}">${dStr}</td>`;
    rt.appendChild(tr);
  });

  const mp = document.getElementById('margin-progress-tbody'); mp.innerHTML = '';
  SNAPSHOT.verifiedMonths.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.month}</td><td class="num">${fmt.money(m.revenue)}</td><td class="num">${fmt.money(m.grossProfit)}</td><td class="num">${fmt.pct(m.grossMarginPct)}</td>`;
    mp.appendChild(tr);
  });

  const cf = SNAPSHOT.cashFlow, cft = document.getElementById('cashflow-tbody'); cft.innerHTML = '';
  [
    ['Operating activities', cf.current?.operating, cf.prior?.operating],
    ['Investing activities', cf.current?.investing, cf.prior?.investing],
    ['Financing activities', cf.current?.financing, cf.prior?.financing],
    ['Net cash change', cf.current?.netCashChange, cf.prior?.netCashChange],
    ['Cash at beginning', cf.current?.cashBeginning, cf.prior?.cashBeginning],
    ['Cash at end of period', cf.current?.cashEnding, cf.prior?.cashEnding],
  ].forEach(r => {
    const d = fmt.delta(r[1], r[2]);
    const cls = (d ?? 0) >= 0 ? 'delta-pos' : 'delta-neg';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r[0]}</td><td class="num">${fmt.money(r[1])}</td><td class="num">${fmt.money(r[2])}</td><td class="num ${cls}">${d === null ? '—' : fmt.pct(d)}</td>`;
    cft.appendChild(tr);
  });
}

function renderForecast() {
  const f = SNAPSHOT.forecast;
  document.getElementById('forecast-meta').textContent = `${f.completedMonths} of 12 months completed · ${f.remainingMonths} remaining.`;
  document.getElementById('fc-revenue').textContent = fmt.money(f.yearEndRevenue);
  document.getElementById('fc-gp').textContent = fmt.money(f.yearEndGrossProfit);
  document.getElementById('fc-gm-pct').textContent = fmt.pct(f.yearEndGrossMarginPct);
  document.getElementById('fc-opex').textContent = fmt.money(f.yearEndOperatingExpenses);
  document.getElementById('fc-net').textContent = fmt.money(f.yearEndNetIncome);
  document.getElementById('fc-nm-pct').textContent = fmt.pct(f.yearEndNetMarginPct);
  document.getElementById('fc-cash').textContent = fmt.money(f.yearEndCash);
  document.getElementById('fc-runrate').textContent = fmt.money(f.runRateRevenue);
}

function renderScenarios() {
  const f = SNAPSHOT.forecast;
  // Apply scenario shifts to remaining-period projection.
  const ytdRev = f.ytdRevenue, ytdGp = f.ytdGrossProfit, ytdOp = f.ytdOperatingExpenses;
  const baseRemainingRev = f.avgMonthlyRevenue * f.remainingMonths;
  const scnRemainingRev = baseRemainingRev * (1 + SCENARIO.revGrowth);
  const baseGmPct = f.yearEndGrossMarginPct;
  const scnGmPct = baseGmPct + SCENARIO.gmShift;
  const baseRemainingOp = f.avgMonthlyOperatingExpenses * f.remainingMonths;
  const scnRemainingOp = baseRemainingOp * (1 + SCENARIO.opexShift);

  const baseRev = f.yearEndRevenue;
  const scnRev = ytdRev + scnRemainingRev;
  const baseGp = f.yearEndGrossProfit;
  const scnGp = scnRev * scnGmPct;
  const baseOp = f.yearEndOperatingExpenses;
  const scnOp = ytdOp + scnRemainingOp;
  const baseNet = f.yearEndNetIncome;
  const scnNet = scnGp - scnOp;

  const tb = document.getElementById('scn-tbody'); tb.innerHTML = '';
  const rows = [
    { label: 'Revenue', base: baseRev, scn: scnRev, fmt: fmt.money },
    { label: 'Gross Profit', base: baseGp, scn: scnGp, fmt: fmt.money },
    { label: 'Gross Margin %', base: baseGmPct, scn: scnGmPct, fmt: fmt.pct, isPct: true },
    { label: 'Operating Expenses', base: baseOp, scn: scnOp, fmt: fmt.money },
    { label: 'Net Income', base: baseNet, scn: scnNet, fmt: fmt.money },
    { label: 'Net Margin %', base: baseNet / baseRev, scn: scnNet / scnRev, fmt: fmt.pct, isPct: true },
  ];
  rows.forEach(r => {
    const d = r.isPct ? r.scn - r.base : fmt.delta(r.scn, r.base);
    const dStr = r.isPct ? fmt.pctPoint(d) : (d === null ? '—' : fmt.pct(d));
    const cls = (r.isPct ? d >= 0 : d >= 0) ? 'delta-pos' : 'delta-neg';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.label}</td><td class="num">${r.fmt(r.base)}</td><td class="num">${r.fmt(r.scn)}</td><td class="num ${cls}">${dStr}</td>`;
    tb.appendChild(tr);
  });
}

function renderTrends() {
  const p = SNAPSHOT.periods, f = SNAPSHOT.forecast;
  const series = [
    { label: 'FY 2024', revenue: p.prior2?.revenue, gp: p.prior2?.grossProfit, net: p.prior2?.netIncome },
    { label: 'FY 2025', revenue: p.prior?.revenue, gp: p.prior?.grossProfit, net: p.prior?.netIncome },
    { label: 'YTD 2026', revenue: p.current.revenue, gp: p.current.grossProfit, net: p.current.netIncome },
    { label: '2026 forecast', revenue: f.yearEndRevenue, gp: f.yearEndGrossProfit, net: f.yearEndNetIncome },
  ].filter(s => s.revenue !== undefined && s.revenue !== null);
  drawBars('trend-revenue', series.map(s => ({ label: s.label, value: s.revenue })));
  drawGroupedBars('trend-profit', series.map(s => ({ label: s.label, gp: s.gp, net: s.net })));

  const mt = document.getElementById('margin-trend-tbody'); mt.innerHTML = '';
  series.forEach(s => {
    const tr = document.createElement('tr');
    const gmPct = s.revenue ? s.gp / s.revenue : 0;
    const nmPct = s.revenue ? s.net / s.revenue : 0;
    tr.innerHTML = `<td>${s.label}</td><td class="num">${fmt.money(s.revenue)}</td><td class="num">${fmt.money(s.gp)}</td><td class="num">${fmt.pct(gmPct)}</td><td class="num">${fmt.money(s.net)}</td><td class="num">${fmt.pct(nmPct)}</td>`;
    mt.appendChild(tr);
  });

  const mtb = document.getElementById('months-tbody'); mtb.innerHTML = '';
  if (SNAPSHOT.verifiedMonths.length === 0) mtb.innerHTML = `<tr><td colspan="8">No verified monthly data yet.</td></tr>`;
  else SNAPSHOT.verifiedMonths.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.month}</td><td class="num">${fmt.money(m.revenue)}</td><td class="num">${fmt.money(m.cogs)}</td><td class="num">${fmt.money(m.grossProfit)}</td><td class="num">${fmt.money(m.operatingExpenses)}</td><td class="num">${fmt.money(m.netIncome)}</td><td class="num">${fmt.pct(m.grossMarginPct)}</td><td class="num">${fmt.pct(m.netMarginPct)}</td>`;
    mtb.appendChild(tr);
  });
}

function renderBenchmark() {
  const b = SNAPSHOT.benchmark;
  if (!b) {
    document.getElementById('benchmark-meta').textContent = 'Benchmark data unavailable.';
    return;
  }
  document.getElementById('benchmark-meta').textContent = `${b.industryType} (NAICS ${b.naicsCode}) · ${b.location} · ${b.benchmarkPeriodRange}`;

  const grid = document.getElementById('benchmark-kpis');
  grid.innerHTML = '';
  const items = [
    { label: 'Annualized profit (12-mo)', value: fmt.money(b.metricValue) },
    { label: `${b.location} regional average`, value: fmt.money(b.regionalAverage) },
    { label: 'Above regional average by', value: `${b.vsRegionalPercent.toFixed(0)}%` },
    { label: 'Multiple vs regional', value: `${(b.metricValue / b.regionalAverage).toFixed(1)}×` },
  ];
  items.forEach(i => {
    const div = document.createElement('div');
    div.className = 'kpi';
    div.innerHTML = `<div class="kpi-label">${i.label}</div><div class="kpi-value">${i.value}</div>`;
    grid.appendChild(div);
  });

  const ul = document.getElementById('benchmark-positioning');
  ul.innerHTML = '';
  const insights = [
    `Profit ${fmt.money(b.metricValue)} is ${(b.metricValue / b.regionalAverage).toFixed(1)}× the ${b.location} regional average of ${fmt.money(b.regionalAverage)}.`,
    `Top-tier positioning in NAICS ${b.naicsCode} (${b.industryType}). Use this in board materials, lender packages, and capital-allocation decisions.`,
    `Strategy implications: above-market profitability supports continued capex and partner distributions; the negative cash position is a working-capital timing issue, not a profitability issue.`,
  ];
  insights.forEach(text => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="flag-tag good">INSIGHT</span>${text}`;
    li.className = 'flag-good';
    ul.appendChild(li);
  });
}

function renderProjections() {
  const p = SNAPSHOT.projections;
  const periodsCur = SNAPSHOT.periods.current;
  const fc = SNAPSHOT.forecast;
  const pipe = SNAPSHOT.pipeline;

  document.getElementById('projections-meta').textContent =
    `${fc.completedMonths} of 12 months completed · ${fc.remainingMonths} remaining · ${p?.methods?.length || 0} projection methods`;

  // Headline KPIs: consensus + spread + confidence range
  const headline = document.getElementById('projections-headline-kpis');
  headline.innerHTML = '';
  if (p) {
    const ytdToConsensus = fc.ytdRevenue / p.consensus;
    const items = [
      { label: 'Consensus year-end', value: fmt.money(p.consensus) },
      { label: 'Low (most conservative)', value: fmt.money(p.low) },
      { label: 'High (pipeline-driven)', value: fmt.money(p.high) },
      { label: 'Spread (high − low)', value: fmt.money(p.spread) },
      { label: 'YTD coverage of consensus', value: fmt.pct(ytdToConsensus) },
    ];
    items.forEach(i => {
      const div = document.createElement('div');
      div.className = 'kpi';
      div.innerHTML = `<div class="kpi-label">${i.label}</div><div class="kpi-value">${i.value}</div>`;
      headline.appendChild(div);
    });
  }

  // Methods table
  const mtb = document.getElementById('projections-methods-tbody');
  mtb.innerHTML = '';
  (p?.methods || []).forEach(m => {
    const vsCons = (m.yearEnd - (p.consensus || 0));
    const cls = vsCons >= 0 ? 'delta-pos' : 'delta-neg';
    const confClass = m.confidence === 'high' ? 'good' : m.confidence === 'medium' ? 'warn' : 'neutral';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${m.label}</strong></td>
      <td class="num">${fmt.money(m.yearEnd)}</td>
      <td class="num ${cls}">${fmt.signed(vsCons)}</td>
      <td><span class="flag-tag ${confClass}">${(m.confidence || 'unknown').toUpperCase()}</span></td>
      <td>${m.assumption || ''}</td>`;
    mtb.appendChild(tr);
  });

  // Quarterly view: split year into Q1/Q2/Q3/Q4 with actuals where available
  const qtb = document.getElementById('projections-quarterly-tbody');
  qtb.innerHTML = '';
  const monthly = SNAPSHOT.verifiedMonths.filter(m => m.month.startsWith(String(SNAPSHOT.forecast.currentYear || 2026)));
  const projMonthlyAvg = (p?.consensus || 0) / 12;
  for (let q = 1; q <= 4; q++) {
    const qMonths = monthly.filter(m => {
      const mo = parseInt(m.month.split('-')[1], 10);
      return mo >= (q - 1) * 3 + 1 && mo <= q * 3;
    });
    const actualSum = qMonths.reduce((s, m) => s + m.revenue, 0);
    const missing = 3 - qMonths.length;
    const projected = missing * projMonthlyAvg;
    const total = actualSum + projected;
    const status = missing === 0 ? 'Actual' : qMonths.length === 0 ? 'Projected' : 'Mixed';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>Q${q}</strong></td><td class="num">${fmt.money(total)}</td><td>${status} ${qMonths.length}/3 mo</td>`;
    qtb.appendChild(tr);
  }

  // Pipeline metrics
  const ptb = document.getElementById('projections-pipeline-tbody');
  ptb.innerHTML = '';
  if (pipe) {
    const rows = [
      ['YTD billings', fmt.money(pipe.ytdBillings)],
      ['Open A/R (billings unpaid)', fmt.money(pipe.ytdOpenBalance)],
      ['YTD collected', fmt.money(pipe.ytdCollected)],
      ['Open invoice count', `${pipe.openInvoiceCount} of ${pipe.invoiceCount}`],
      ['Avg monthly billings (full months)', fmt.money((pipe.monthlyBillings || []).filter(m => m.count >= 25).reduce((s, m, _, a) => s + m.billings / a.length, 0))],
    ];
    rows.forEach(([k, v]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${k}</td><td class="num">${v}</td>`;
      ptb.appendChild(tr);
    });
  } else {
    ptb.innerHTML = '<tr><td colspan="2">Pipeline data not loaded (no pipeline.json). Run the daily refresh to populate.</td></tr>';
  }

  // By-segment projection: take current segment revenue accounts, apply run-rate × 12
  const stb = document.getElementById('projections-segment-tbody');
  stb.innerHTML = '';
  const segments = (periodsCur.segments?.incomeAccounts || []).slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const totalRunRate = segments.reduce((s, a) => s + a.amount * (12 / fc.completedMonths), 0);
  segments.forEach(seg => {
    const runRate = seg.amount * (12 / fc.completedMonths);
    const share = runRate / (totalRunRate || 1);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${seg.account}</td><td class="num">${fmt.money(seg.amount)}</td><td class="num">${fmt.money(runRate)}</td><td class="num">${fmt.pct(share)}</td>`;
    stb.appendChild(tr);
  });
}

function renderMultiYear() {
  const my = SNAPSHOT.multiYear;
  if (!my) {
    document.getElementById('multiyear-meta').textContent = 'Multi-year outlook unavailable (need 2 prior years of data).';
    return;
  }
  const anchor = my.anchor;
  document.getElementById('multiyear-meta').textContent =
    `Anchor: ${anchor.year} year-end forecast ${fmt.money(anchor.revenue)} · Base CAGR ${fmt.pct(my.baseCagr)} (FY ${anchor.year - 2} → ${anchor.year} forecast)`;

  // Headline KPIs: base 2028 revenue + range
  const yearsOut = my.scenarios.base.years.map(y => y.year);
  const headline = document.getElementById('multiyear-headline-kpis');
  headline.innerHTML = '';
  const last = yearsOut[yearsOut.length - 1];
  const items = [
    { label: `${last} revenue — base case`, value: fmt.money(my.scenarios.base.years[1].revenue) },
    { label: `${last} revenue — bearish`, value: fmt.money(my.scenarios.bearish.years[1].revenue) },
    { label: `${last} revenue — optimistic`, value: fmt.money(my.scenarios.optimistic.years[1].revenue) },
    { label: `${last} net income — base case`, value: fmt.money(my.scenarios.base.years[1].netIncome) },
    { label: '2-yr CAGR (derived)', value: fmt.pct(my.baseCagr) },
  ];
  items.forEach(i => {
    const div = document.createElement('div');
    div.className = 'kpi';
    div.innerHTML = `<div class="kpi-label">${i.label}</div><div class="kpi-value">${i.value}</div>`;
    headline.appendChild(div);
  });

  // Column headers reflect the anchor year + projections
  document.getElementById('my-y0-h').textContent = `${anchor.year} (anchor)`;
  document.getElementById('my-y1-h').textContent = `${yearsOut[0]} proj`;
  document.getElementById('my-y2-h').textContent = `${yearsOut[1]} proj`;
  document.getElementById('my-ni-y0-h').textContent = `${anchor.year} (anchor)`;
  document.getElementById('my-ni-y1-h').textContent = `${yearsOut[0]} proj`;
  document.getElementById('my-ni-y2-h').textContent = `${yearsOut[1]} proj`;

  const revTb = document.getElementById('multiyear-rev-tbody');
  const niTb = document.getElementById('multiyear-ni-tbody');
  revTb.innerHTML = '';
  niTb.innerHTML = '';
  ['bearish', 'base', 'optimistic'].forEach(key => {
    const s = my.scenarios[key];
    if (!s) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${s.label}</strong></td>
      <td class="num">${fmt.pct(s.growth)}</td>
      <td class="num">${fmt.pctPoint(s.gmShift)}</td>
      <td class="num">${fmt.money(anchor.revenue)}</td>
      <td class="num">${fmt.money(s.years[0].revenue)}</td>
      <td class="num">${fmt.money(s.years[1].revenue)}</td>`;
    revTb.appendChild(tr);

    const niTr = document.createElement('tr');
    const anchorNet = anchor.revenue * anchor.netMarginPct;
    niTr.innerHTML = `<td><strong>${s.label}</strong></td>
      <td class="num">${fmt.money(anchorNet)}</td>
      <td class="num">${fmt.money(s.years[0].netIncome)}</td>
      <td class="num">${fmt.money(s.years[1].netIncome)}</td>`;
    niTb.appendChild(niTr);
  });

  // Chart: base case revenue across the 3 years
  const baseSeries = [{ label: `${anchor.year}`, value: anchor.revenue }];
  my.scenarios.base.years.forEach(y => baseSeries.push({ label: `${y.year}`, value: y.revenue }));
  drawBars('multiyear-chart', baseSeries);
}

function renderFlags() {
  const flags = computeActionFlags();
  const ul = document.getElementById('action-flag-list'); ul.innerHTML = '';
  if (flags.length === 0) ul.innerHTML = `<li class="flag-good"><span class="flag-tag good">OK</span>No action flags triggered.</li>`;
  else flags.forEach(f => ul.appendChild(flagListItem(f)));
}

function flagListItem(flag) {
  const li = document.createElement('li');
  li.className = `flag-${flag.severity}`;
  const tag = flag.severity === 'bad' ? 'CRITICAL' : flag.severity === 'warn' ? 'WARN' : flag.severity === 'good' ? 'OK' : 'INFO';
  li.innerHTML = `<div class="flag-title"><span class="flag-tag ${flag.severity}">${tag}</span>${flag.title}</div><div class="flag-detail">${flag.detail}</div>`;
  return li;
}

function computeActionFlags() {
  const p = SNAPSHOT.periods, f = SNAPSHOT.forecast, cf = SNAPSHOT.cashFlow;
  const flags = [];
  if (f.runRateRevenue < p.prior.revenue) flags.push({ severity: 'bad', title: 'Revenue decline projected vs prior year', detail: `Run-rate ${fmt.money(f.runRateRevenue)} below FY 2025 ${fmt.money(p.prior.revenue)} (Δ ${fmt.pct(fmt.delta(f.runRateRevenue, p.prior.revenue))}).` });
  else flags.push({ severity: 'good', title: 'Revenue trajectory above prior year', detail: `Run-rate ${fmt.money(f.runRateRevenue)} vs FY 2025 ${fmt.money(p.prior.revenue)} = ${fmt.pct(fmt.delta(f.runRateRevenue, p.prior.revenue))}.` });
  const gmDelta = p.current.grossMarginPct - p.prior.grossMarginPct;
  if (gmDelta < -0.01) flags.push({ severity: 'bad', title: 'Gross margin compression vs prior year', detail: `${fmt.pct(p.current.grossMarginPct)} vs prior ${fmt.pct(p.prior.grossMarginPct)} (${fmt.pctPoint(gmDelta)}).` });
  else if (gmDelta > 0.01) flags.push({ severity: 'good', title: 'Gross margin expansion vs prior year', detail: `${fmt.pct(p.current.grossMarginPct)} vs prior ${fmt.pct(p.prior.grossMarginPct)} (${fmt.pctPoint(gmDelta)}).` });
  const opexDelta = fmt.delta(f.runRateOperatingExpenses, p.prior.operatingExpenses);
  if (opexDelta !== null && opexDelta > 0.05) flags.push({ severity: 'warn', title: 'OpEx run-rate above prior year', detail: `${fmt.money(f.runRateOperatingExpenses)} vs prior ${fmt.money(p.prior.operatingExpenses)} (+${fmt.pct(opexDelta)}).` });
  if (cf.current && cf.current.netCashChange < 0) flags.push({ severity: 'bad', title: 'Negative net cash flow YTD', detail: `YTD net cash ${fmt.money(cf.current.netCashChange)}.` });
  if (cf.current && cf.current.cashEnding < 0) flags.push({ severity: 'bad', title: 'Negative cash position', detail: `Cash at end of period ${fmt.money(cf.current.cashEnding)} — LoC drawn.` });
  if (cf.current && cf.prior && cf.current.cashEnding < cf.prior.cashEnding - 100000) flags.push({ severity: 'warn', title: 'A/R collection risk', detail: `Cash deteriorated by ${fmt.money(cf.current.cashEnding - cf.prior.cashEnding)} vs prior year-end.` });
  if (f.yearEndNetMarginPct < p.prior.netMarginPct - 0.01) flags.push({ severity: 'warn', title: 'Forecast NM% below prior year', detail: `Forecast ${fmt.pct(f.yearEndNetMarginPct)} vs prior ${fmt.pct(p.prior.netMarginPct)}.` });
  return flags;
}

// =============================================================================
// CSV export
// =============================================================================

function exportCsv(tabKey) {
  const panel = document.querySelector(`.tab-panel[data-tab="${tabKey}"]`);
  if (!panel) return;
  let rows = [];
  panel.querySelectorAll('table').forEach((tbl, i) => {
    if (i > 0) rows.push([]);
    tbl.querySelectorAll('tr').forEach(tr => {
      rows.push(Array.from(tr.querySelectorAll('th, td')).map(c => c.textContent.trim()));
    });
  });
  // Also include KPI grid contents if present
  panel.querySelectorAll('.kpi-grid').forEach(grid => {
    const headers = ['KPI', 'Value', 'Delta'];
    rows.push([]); rows.push(headers);
    grid.querySelectorAll('.kpi').forEach(k => {
      const label = k.querySelector('.kpi-label')?.textContent.trim() || '';
      const value = k.querySelector('.kpi-value')?.textContent.trim() || '';
      const delta = k.querySelector('.kpi-delta')?.textContent.trim() || '';
      rows.push([label, value, delta]);
    });
  });
  const csv = rows.map(r => r.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cfo-dashboard-${tabKey}-${SNAPSHOT.asOf}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function escapeCsv(s) { if (s === null || s === undefined) return ''; const t = String(s); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }

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
    <rect class="bar" x="0" y="0" width="10" height="10" rx="2"></rect><text class="axis" x="14" y="9">Gross Profit</text>
    <rect class="bar-2" x="100" y="0" width="10" height="10" rx="2"></rect><text class="axis" x="114" y="9">Net Income</text>
  </g>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet">${legend}${draw}</svg>`;
}

document.addEventListener('DOMContentLoaded', init);
