import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ComposedChart, Cell,
} from "recharts";
import { loadSnapshotData } from "./snapshotAdapter.js";

// ─── Color System ───
const C = {
  navy: "#0F1F3D", navy2: "#1E3A5F", navy3: "#2A4A6B", navyLight: "#334E6F",
  slate: "#3B5068", bg: "#F7F8FA", card: "#FFFFFF", border: "#E2E6EC",
  borderLight: "#EEF0F4", text: "#0F1F3D", textSec: "#5A6B80", textTert: "#8A96A6",
  green: "#1B7A4A", greenBg: "#E8F5EE", red: "#C0392B", redBg: "#FDEAEA",
  amber: "#D4820A", amberBg: "#FFF5E0", blue: "#2471A3", blueBg: "#E8F0FA",
  accent: "#3498DB",
};

// ─── Formatters ───
const fmt = (n, dec = 0) => {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n < 0 ? "-" : "") + "$" + (abs / 1e6).toFixed(dec || 1) + "M";
  if (abs >= 1e3) return (n < 0 ? "-" : "") + "$" + (abs / 1e3).toFixed(dec || 0) + "K";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: dec });
};
const fmtFull = (n) => n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US");
const pct = (n) => n == null || isNaN(n) ? "—" : (n * 100).toFixed(1) + "%";
const pctPts = (n) => n == null || isNaN(n) ? "—" : (n > 0 ? "+" : "") + (n * 100).toFixed(1) + " pts";
const varPct = (curr, prev) => {
  if (!prev || prev === 0) return null;
  return (curr - prev) / Math.abs(prev);
};

// ─── Month Utilities ───
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;

// ─── Sample Data Generator (used until QuickBooks data loads) ───
function generateSampleData() {
  const data = {};
  const baseRev = 850000;
  const years = [2024, 2025, 2026];
  years.forEach(y => {
    const maxM = y === 2026 ? 3 : 11;
    for (let m = 0; m <= maxM; m++) {
      const seasonal = 1 + 0.12 * Math.sin((m - 2) * Math.PI / 6);
      const growth = y === 2024 ? 1 : y === 2025 ? 1.08 : 1.15;
      const rev = Math.round(baseRev * seasonal * growth * (0.95 + Math.random() * 0.1));
      const cogsRate = 0.62 + (Math.random() * 0.06 - 0.03);
      const cogs = Math.round(rev * cogsRate);
      const gp = rev - cogs;
      const opex = Math.round(rev * (0.22 + Math.random() * 0.04));
      const ni = gp - opex;
      const ar = Math.round(rev * (0.35 + Math.random() * 0.1));
      const ap = Math.round(cogs * (0.25 + Math.random() * 0.08));
      const cash = Math.round(150000 + ni * 0.4 + (Math.random() - 0.5) * 80000);
      data[monthKey(y, m)] = {
        year: y, month: m, monthName: MONTHS[m], revenue: rev, cogs, grossProfit: gp,
        grossMargin: gp / rev, opex, netIncome: ni, netMargin: ni / rev,
        ar, ap, cash, ebitda: ni + Math.round(opex * 0.08),
      };
    }
  });
  return data;
}

// ─── Badge Component ───
function Badge({ value, type }) {
  if (value == null) return null;
  const isPos = value > 0;
  const color = type === "inverse" ? (isPos ? C.red : C.green) : (isPos ? C.green : C.red);
  const bg = type === "inverse" ? (isPos ? C.redBg : C.greenBg) : (isPos ? C.greenBg : C.redBg);
  return (
    <span style={{ color, background: bg, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {isPos ? "▲" : "▼"} {Math.abs(value * 100).toFixed(1)}%
    </span>
  );
}

// ─── KPI Card ───
function KpiCard({ label, value, change, subtext, icon, accentColor }) {
  return (
    <div style={{ background: C.card, borderRadius: 10, padding: "20px 22px", border: `1px solid ${C.border}`, flex: "1 1 200px", minWidth: 180 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: C.textSec, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
        {icon && <span style={{ fontSize: 18, opacity: 0.5 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accentColor || C.navy, marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {change != null && <Badge value={change} />}
        {subtext && <span style={{ fontSize: 11, color: C.textTert }}>{subtext}</span>}
      </div>
    </div>
  );
}

// ─── Data Table ───
function DataTable({ columns, rows, compact }) {
  return (
    <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: compact ? 12 : 13 }}>
        <thead>
          <tr style={{ background: C.navy, color: "#fff" }}>
            {columns.map((col, i) => (
              <th key={i} style={{ padding: compact ? "8px 10px" : "10px 14px", textAlign: col.align || "left", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: row._highlight ? C.blueBg : ri % 2 ? C.bg : C.card, borderBottom: `1px solid ${C.borderLight}`, fontWeight: row._bold ? 700 : 400 }}>
              {columns.map((col, ci) => {
                const val = row[col.key];
                const style = { padding: compact ? "7px 10px" : "9px 14px", textAlign: col.align || "left", color: col.color ? col.color(val, row) : C.text, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
                return <td key={ci} style={style}>{col.format ? col.format(val, row) : val}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section Wrapper ───
function Section({ title, subtitle, children, actions }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: 0 }}>{title}</h3>
          {subtitle && <p style={{ fontSize: 12, color: C.textSec, margin: "2px 0 0" }}>{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

// ─── Alert Flag ───
function AlertFlag({ severity, title, detail, metric }) {
  const colors = {
    critical: { bg: C.redBg, border: C.red, icon: "⚠" },
    warning: { bg: C.amberBg, border: C.amber, icon: "⚡" },
    info: { bg: C.blueBg, border: C.blue, icon: "ℹ" },
  };
  const s = colors[severity] || colors.info;
  return (
    <div style={{ background: s.bg, borderLeft: `4px solid ${s.border}`, borderRadius: "0 8px 8px 0", padding: "12px 16px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.navy, marginBottom: 2 }}>{s.icon} {title}</div>
          <div style={{ fontSize: 12, color: C.textSec }}>{detail}</div>
        </div>
        {metric && <span style={{ fontSize: 14, fontWeight: 700, color: s.border }}>{metric}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════
// ─── MAIN DASHBOARD ───
// ═══════════════════════════════════
/**
 * Props:
 *   snapshotUrl    - URL of the QuickBooks-built snapshot JSON
 *                    (default: "/data/snapshot.json"). Override if you mount
 *                    the dashboard at a different base path.
 *   refreshUrl     - Optional backend endpoint that triggers a fresh QuickBooks
 *                    pull and rewrites snapshot.json. If omitted, the Refresh
 *                    button just re-fetches snapshot.json (assumes a cron or
 *                    `scripts/refresh.sh` regenerates it server-side).
 *   anthropicProxyUrl - Optional. URL of a server you control that proxies an
 *                    Anthropic Messages API call with the QuickBooks MCP.
 *                    Use this for a true "live pull from QB" button that does
 *                    not require a pre-built snapshot.
 */
export default function CFODashboard({
  snapshotUrl = "/data/snapshot.json",
  refreshUrl = null,
  anthropicProxyUrl = null,
} = {}) {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [qbConnected, setQbConnected] = useState(false);
  const [qbError, setQbError] = useState(null);
  const [rawData, setRawData] = useState(() => generateSampleData());
  const [dataSource, setDataSource] = useState("sample");
  const [snapshotMeta, setSnapshotMeta] = useState(null);

  // Filters
  const [startDate, setStartDate] = useState("2026-01");
  const [endDate, setEndDate] = useState("2026-03");
  const [compStart, setCompStart] = useState("2025-01");
  const [compEnd, setCompEnd] = useState("2025-03");

  // Forecast assumption
  const [forecastGrowth, setForecastGrowth] = useState(0.05);

  const tabs = [
    { label: "Executive Summary", icon: "◆" },
    { label: "P&L Dashboard", icon: "▦" },
    { label: "Period Comparison", icon: "⇄" },
    { label: "Deep Dive", icon: "⬡" },
    { label: "Forecast", icon: "↗" },
    { label: "Trends", icon: "〰" },
    { label: "Action Flags", icon: "⚑" },
  ];

  // ─── Apply snapshot data when it loads ──────────────────────────────────
  const applySnapshot = useCallback((bundle, sourceLabel) => {
    if (!bundle || !bundle.months || Object.keys(bundle.months).length === 0) return false;
    setRawData(bundle.months);
    setSnapshotMeta(bundle.meta || null);
    setDataSource(sourceLabel);
    setQbConnected(true);

    // Auto-tune the filter bar to the most recent verified period.
    const allKeys = Object.keys(bundle.months).sort();
    if (allKeys.length > 0) {
      const last = allKeys[allKeys.length - 1];
      const startCandidates = allKeys.filter(k => k.startsWith(last.split("-")[0]));
      if (startCandidates.length > 0) {
        setStartDate(startCandidates[0]);
        setEndDate(last);
        const priorYear = String(parseInt(last.split("-")[0]) - 1);
        const priorRange = allKeys.filter(k => k.startsWith(priorYear));
        if (priorRange.length > 0) {
          setCompStart(priorRange[0]);
          setCompEnd(priorRange[Math.min(priorRange.length - 1, startCandidates.length - 1)]);
        }
      }
    }
    return true;
  }, []);

  // ─── Auto-load snapshot.json on mount ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bundle = await loadSnapshotData(snapshotUrl);
      if (cancelled) return;
      if (bundle) applySnapshot(bundle, "quickbooks");
    })();
    return () => { cancelled = true; };
  }, [snapshotUrl, applySnapshot]);

  // ─── Refresh button ─────────────────────────────────────────────────────
  // Three connection paths, tried in order. The first one that returns data wins.
  //
  //   1. refreshUrl     — server endpoint that rebuilds snapshot.json from QB.
  //   2. snapshotUrl    — re-fetch the local snapshot (for cron/CI pipelines).
  //   3. anthropicProxyUrl — server proxy that calls Anthropic Messages API
  //                          with the QuickBooks MCP server attached.
  //
  // The browser cannot call api.anthropic.com directly because of CORS and
  // because the QuickBooks MCP requires Intuit OAuth on a server you control.
  const connectQuickBooks = useCallback(async () => {
    setLoading(true);
    setQbError(null);

    try {
      // Path 1: trigger a server-side refresh
      if (refreshUrl) {
        const r = await fetch(refreshUrl, { method: "POST" });
        if (r.ok) {
          const bundle = await loadSnapshotData(snapshotUrl);
          if (applySnapshot(bundle, "quickbooks")) return;
        } else {
          setQbError(`Refresh endpoint returned ${r.status}`);
        }
      }

      // Path 2: just re-read the snapshot (cron/CI keeps it fresh)
      const bundle = await loadSnapshotData(snapshotUrl);
      if (applySnapshot(bundle, "quickbooks")) return;

      // Path 3: server proxy that calls Anthropic with the QB MCP
      if (anthropicProxyUrl) {
        const resp = await fetch(anthropicProxyUrl, { method: "POST" });
        if (resp.ok) {
          const data = await resp.json();
          const months = data.months || data.snapshot?.months;
          if (months && applySnapshot({ months, meta: data.meta }, "quickbooks")) return;
        } else {
          setQbError(`Proxy returned ${resp.status}`);
        }
      }

      setQbError("No QuickBooks data source available — run scripts/refresh.sh, or provide refreshUrl/anthropicProxyUrl props.");
    } catch (err) {
      setQbError(err.message || "Connection failed");
    } finally {
      setLoading(false);
    }
  }, [refreshUrl, snapshotUrl, anthropicProxyUrl, applySnapshot]);

  // ─── Computed Data ──────────────────────────────────────────────────────
  const allKeys = useMemo(() => Object.keys(rawData).sort(), [rawData]);

  const getRange = useCallback((start, end) => {
    return allKeys.filter(k => k >= start && k <= end).map(k => rawData[k]);
  }, [allKeys, rawData]);

  const currentPeriod = useMemo(() => getRange(startDate, endDate), [getRange, startDate, endDate]);
  const compPeriod = useMemo(() => getRange(compStart, compEnd), [getRange, compStart, compEnd]);

  const sumField = (arr, field) => arr.reduce((s, r) => s + (r[field] || 0), 0);

  const curr = useMemo(() => {
    if (!currentPeriod.length) return {};
    return {
      revenue: sumField(currentPeriod, "revenue"),
      cogs: sumField(currentPeriod, "cogs"),
      grossProfit: sumField(currentPeriod, "grossProfit"),
      opex: sumField(currentPeriod, "opex"),
      netIncome: sumField(currentPeriod, "netIncome"),
      ebitda: sumField(currentPeriod, "ebitda"),
      ar: currentPeriod[currentPeriod.length - 1]?.ar || 0,
      ap: currentPeriod[currentPeriod.length - 1]?.ap || 0,
      cash: currentPeriod[currentPeriod.length - 1]?.cash || 0,
    };
  }, [currentPeriod]);

  const comp = useMemo(() => {
    if (!compPeriod.length) return {};
    return {
      revenue: sumField(compPeriod, "revenue"),
      cogs: sumField(compPeriod, "cogs"),
      grossProfit: sumField(compPeriod, "grossProfit"),
      opex: sumField(compPeriod, "opex"),
      netIncome: sumField(compPeriod, "netIncome"),
      ebitda: sumField(compPeriod, "ebitda"),
      ar: compPeriod[compPeriod.length - 1]?.ar || 0,
      ap: compPeriod[compPeriod.length - 1]?.ap || 0,
      cash: compPeriod[compPeriod.length - 1]?.cash || 0,
    };
  }, [compPeriod]);

  const grossMarginCurr = curr.revenue ? curr.grossProfit / curr.revenue : 0;
  const netMarginCurr = curr.revenue ? curr.netIncome / curr.revenue : 0;
  const grossMarginComp = comp.revenue ? comp.grossProfit / comp.revenue : 0;
  const netMarginComp = comp.revenue ? comp.netIncome / comp.revenue : 0;

  const trendData = useMemo(() => {
    const last12 = allKeys.slice(-12);
    return last12.map(k => ({
      label: rawData[k].monthName + " " + String(rawData[k].year).slice(2),
      ...rawData[k],
    }));
  }, [allKeys, rawData]);

  const ytdData = useMemo(() => {
    if (allKeys.length === 0) return [];
    const currentYear = Math.max(...Object.values(rawData).map(d => d.year));
    return allKeys.filter(k => rawData[k].year === currentYear).map(k => rawData[k]);
  }, [allKeys, rawData]);

  const forecast = useMemo(() => {
    if (!ytdData.length) return {};
    const completedMonths = ytdData.length;
    const remaining = 12 - completedMonths;
    const ytdRev = sumField(ytdData, "revenue");
    const ytdCogs = sumField(ytdData, "cogs");
    const ytdOpex = sumField(ytdData, "opex");
    const ytdNI = sumField(ytdData, "netIncome");
    const avgMonthlyRev = ytdRev / completedMonths;
    const avgMonthlyCogs = ytdCogs / completedMonths;
    const avgMonthlyOpex = ytdOpex / completedMonths;
    const projRev = ytdRev + avgMonthlyRev * (1 + forecastGrowth) * remaining;
    const projCogs = ytdCogs + avgMonthlyCogs * (1 + forecastGrowth * 0.8) * remaining;
    const projOpex = ytdOpex + avgMonthlyOpex * remaining;
    const projGP = projRev - projCogs;
    const projNI = projGP - projOpex;
    const runRateRev = (ytdRev / completedMonths) * 12;
    const runRateNI = (ytdNI / completedMonths) * 12;
    return {
      completedMonths, remaining, ytdRev, ytdCogs, ytdOpex, ytdNI,
      projRev, projCogs, projOpex, projGP, projNI,
      projGrossMargin: projRev ? projGP / projRev : 0,
      projNetMargin: projRev ? projNI / projRev : 0,
      runRateRev, runRateNI,
      monthlyForecast: MONTHS.map((name, i) => {
        const actual = ytdData.find(d => d.month === i);
        if (actual) return { month: name, revenue: actual.revenue, grossProfit: actual.grossProfit, netIncome: actual.netIncome, type: "actual" };
        return {
          month: name,
          revenue: Math.round(avgMonthlyRev * (1 + forecastGrowth)),
          grossProfit: Math.round((avgMonthlyRev * (1 + forecastGrowth)) - (avgMonthlyCogs * (1 + forecastGrowth * 0.8))),
          netIncome: Math.round((avgMonthlyRev * (1 + forecastGrowth)) - (avgMonthlyCogs * (1 + forecastGrowth * 0.8)) - avgMonthlyOpex),
          type: "forecast",
        };
      }),
    };
  }, [ytdData, forecastGrowth]);

  const actionFlags = useMemo(() => {
    const flags = [];
    const revChange = varPct(curr.revenue, comp.revenue);
    if (revChange != null && revChange < -0.05) flags.push({ severity: "critical", title: "Revenue Decline", detail: `Revenue is down ${(Math.abs(revChange) * 100).toFixed(1)}% vs comparison period`, metric: fmt(curr.revenue - comp.revenue) });

    const marginDelta = grossMarginCurr - grossMarginComp;
    if (marginDelta < -0.02) flags.push({ severity: "critical", title: "Margin Compression", detail: `Gross margin contracted ${pctPts(marginDelta)} vs comparison period`, metric: pct(grossMarginCurr) });

    if (trendData.length >= 3) {
      const last3Opex = trendData.slice(-3);
      const opexGrowth = last3Opex[2]?.opex && last3Opex[0]?.opex ? (last3Opex[2].opex - last3Opex[0].opex) / last3Opex[0].opex : 0;
      if (opexGrowth > 0.1) flags.push({ severity: "warning", title: "Expense Spike", detail: `OpEx increased ${(opexGrowth * 100).toFixed(1)}% over last 3 months`, metric: fmt(last3Opex[2].opex) });
    }

    if (curr.cash < 0) flags.push({ severity: "critical", title: "Negative Cash Position", detail: "Cash balance has turned negative", metric: fmtFull(curr.cash) });
    else if (curr.cash < curr.opex) flags.push({ severity: "warning", title: "Low Cash Coverage", detail: "Cash covers less than 1 month of operating expenses", metric: fmt(curr.cash) });

    if (curr.ar > curr.revenue * 0.5) flags.push({ severity: "warning", title: "AR Risk — High Receivables", detail: `AR is ${pct(curr.ar / (curr.revenue || 1))} of period revenue`, metric: fmtFull(curr.ar) });

    if (curr.ap > curr.cogs * 0.5) flags.push({ severity: "info", title: "AP Monitoring", detail: `Payables are elevated relative to COGS`, metric: fmtFull(curr.ap) });

    if (forecast.projNetMargin != null && forecast.projNetMargin < 0.03) flags.push({ severity: "warning", title: "Tight Projected Margins", detail: `Year-end net margin forecast at ${pct(forecast.projNetMargin)}`, metric: pct(forecast.projNetMargin) });

    const netMarginDelta = netMarginCurr - netMarginComp;
    if (netMarginDelta < -0.03) flags.push({ severity: "critical", title: "Net Margin Erosion", detail: `Net margin down ${pctPts(netMarginDelta)} vs comparison period`, metric: pct(netMarginCurr) });

    if (flags.length === 0) flags.push({ severity: "info", title: "No Flags Triggered", detail: "All metrics within acceptable ranges for the selected period", metric: "✓" });
    return flags;
  }, [curr, comp, grossMarginCurr, grossMarginComp, netMarginCurr, netMarginComp, trendData, forecast]);

  const dateOptions = useMemo(() => allKeys.map(k => ({ value: k, label: MONTHS[parseInt(k.split("-")[1]) - 1] + " " + k.split("-")[0] })), [allKeys]);

  // ═════════════════════════════
  // ─── RENDER ───
  // ═════════════════════════════
  return (
    <div style={{ fontFamily: "'IBM Plex Sans', 'SF Pro Display', -apple-system, sans-serif", background: C.bg, minHeight: "100vh", color: C.text }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navy2} 100%)`, padding: "20px 28px 16px", borderBottom: `3px solid ${C.accent}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.3px" }}>CFO Financial Dashboard</h1>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, margin: "3px 0 0" }}>
              {snapshotMeta?.company?.name || "Midwest Design Group"} — Financial Operations Command Center
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: dataSource === "quickbooks" ? C.greenBg : "rgba(255,255,255,0.1)", color: dataSource === "quickbooks" ? C.green : "rgba(255,255,255,0.7)", border: `1px solid ${dataSource === "quickbooks" ? C.green : "rgba(255,255,255,0.15)"}` }}>
              {dataSource === "quickbooks" ? "● QB Connected" : "○ Sample Data"}
            </div>
            <button onClick={connectQuickBooks} disabled={loading} style={{ padding: "7px 16px", borderRadius: 6, border: "none", background: loading ? C.slate : C.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Connecting…" : "Refresh from QB"}
            </button>
          </div>
        </div>
        {qbError && <div style={{ color: "#ff9b9b", fontSize: 11, marginTop: 6 }}>Connection note: {qbError}</div>}
        {snapshotMeta && (
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginTop: 6 }}>
            {snapshotMeta.source} · As of {snapshotMeta.asOf}{snapshotMeta.benchmark ? ` · ${(snapshotMeta.benchmark.metricValue / snapshotMeta.benchmark.regionalAverage).toFixed(1)}× ${snapshotMeta.benchmark.location} regional profit average` : ""}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginTop: 16, overflowX: "auto", paddingBottom: 2 }}>
          {tabs.map((t, i) => (
            <button key={i} onClick={() => setTab(i)} style={{
              padding: "9px 16px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: 12, fontWeight: tab === i ? 700 : 500, whiteSpace: "nowrap",
              background: tab === i ? C.bg : "transparent", color: tab === i ? C.navy : "rgba(255,255,255,0.6)",
              transition: "all 0.15s",
            }}>
              <span style={{ marginRight: 5, fontSize: 10 }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: "12px 28px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>PERIOD</span>
          <select value={startDate} onChange={e => setStartDate(e.target.value)} style={selectStyle}>{dateOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <span style={{ fontSize: 11, color: C.textTert }}>to</span>
          <select value={endDate} onChange={e => setEndDate(e.target.value)} style={selectStyle}>{dateOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </div>
        <div style={{ width: 1, height: 24, background: C.border }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>VS</span>
          <select value={compStart} onChange={e => setCompStart(e.target.value)} style={selectStyle}>{dateOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <span style={{ fontSize: 11, color: C.textTert }}>to</span>
          <select value={compEnd} onChange={e => setCompEnd(e.target.value)} style={selectStyle}>{dateOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: C.textTert }}>
          {currentPeriod.length} month{currentPeriod.length !== 1 ? "s" : ""} selected
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "24px 28px", maxWidth: 1280, margin: "0 auto" }}>

        {tab === 0 && (
          <>
            <Section title="Key Performance Indicators" subtitle="Selected period performance">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                <KpiCard label="Revenue" value={fmt(curr.revenue)} change={varPct(curr.revenue, comp.revenue)} subtext="vs comparison" icon="$" />
                <KpiCard label="Gross Profit" value={fmt(curr.grossProfit)} change={varPct(curr.grossProfit, comp.grossProfit)} subtext={`${pct(grossMarginCurr)} margin`} icon="◈" />
                <KpiCard label="Net Income" value={fmt(curr.netIncome)} change={varPct(curr.netIncome, comp.netIncome)} subtext={`${pct(netMarginCurr)} margin`} icon="▣" accentColor={curr.netIncome >= 0 ? C.green : C.red} />
                <KpiCard label="EBITDA" value={fmt(curr.ebitda)} change={varPct(curr.ebitda, comp.ebitda)} icon="◇" />
                <KpiCard label="Cash Position" value={fmt(curr.cash)} subtext="end of period" icon="◉" accentColor={curr.cash >= 0 ? C.navy : C.red} />
              </div>
            </Section>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <Section title="Revenue & Margin Trend" subtitle="Last 12 months">
                <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.textTert }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10, fill: C.textTert }} tickFormatter={v => fmt(v)} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: C.textTert }} tickFormatter={v => pct(v)} domain={[0, 0.6]} />
                      <Tooltip formatter={(v, name) => name.includes("Margin") ? pct(v) : fmtFull(v)} />
                      <Bar yAxisId="left" dataKey="revenue" fill={C.navy2} radius={[3, 3, 0, 0]} name="Revenue" />
                      <Line yAxisId="right" type="monotone" dataKey="grossMargin" stroke={C.green} strokeWidth={2} dot={false} name="Gross Margin" />
                      <Line yAxisId="right" type="monotone" dataKey="netMargin" stroke={C.accent} strokeWidth={2} dot={false} name="Net Margin" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Section>

              <Section title="Active Alerts" subtitle={`${actionFlags.filter(f => f.severity !== "info" || f.title === "No Flags Triggered").length} items`}>
                <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}`, maxHeight: 250, overflowY: "auto" }}>
                  {actionFlags.slice(0, 5).map((f, i) => <AlertFlag key={i} {...f} />)}
                </div>
              </Section>
            </div>

            <Section title="Period Snapshot" subtitle="Current vs comparison">
              <DataTable
                columns={[
                  { key: "metric", label: "Metric" },
                  { key: "current", label: "Current Period", align: "right", format: fmtFull },
                  { key: "comparison", label: "Comparison Period", align: "right", format: fmtFull },
                  { key: "variance", label: "Variance $", align: "right", format: fmtFull, color: (v) => v > 0 ? C.green : v < 0 ? C.red : C.text },
                  { key: "varPct", label: "Variance %", align: "right", format: (v) => v != null ? (v > 0 ? "+" : "") + (v * 100).toFixed(1) + "%" : "—", color: (v) => v > 0 ? C.green : v < 0 ? C.red : C.text },
                ]}
                rows={[
                  { metric: "Revenue", current: curr.revenue, comparison: comp.revenue, variance: curr.revenue - comp.revenue, varPct: varPct(curr.revenue, comp.revenue), _bold: true },
                  { metric: "COGS", current: curr.cogs, comparison: comp.cogs, variance: curr.cogs - comp.cogs, varPct: varPct(curr.cogs, comp.cogs) },
                  { metric: "Gross Profit", current: curr.grossProfit, comparison: comp.grossProfit, variance: curr.grossProfit - comp.grossProfit, varPct: varPct(curr.grossProfit, comp.grossProfit), _bold: true },
                  { metric: "Operating Expenses", current: curr.opex, comparison: comp.opex, variance: curr.opex - comp.opex, varPct: varPct(curr.opex, comp.opex) },
                  { metric: "Net Income", current: curr.netIncome, comparison: comp.netIncome, variance: curr.netIncome - comp.netIncome, varPct: varPct(curr.netIncome, comp.netIncome), _bold: true, _highlight: true },
                ]}
              />
            </Section>
          </>
        )}

        {tab === 1 && (
          <>
            <Section title="Profit & Loss Statement" subtitle="Selected period">
              <DataTable
                columns={[
                  { key: "line", label: "Line Item" },
                  { key: "amount", label: "Amount", align: "right", format: fmtFull },
                  { key: "pctRev", label: "% of Revenue", align: "right", format: pct },
                  { key: "compAmount", label: "Prior Period", align: "right", format: fmtFull },
                  { key: "compPctRev", label: "Prior % Rev", align: "right", format: pct },
                  { key: "change", label: "$ Change", align: "right", format: fmtFull, color: (v, r) => r._invertColor ? (v > 0 ? C.red : C.green) : (v > 0 ? C.green : v < 0 ? C.red : C.text) },
                ]}
                rows={[
                  { line: "Revenue", amount: curr.revenue, pctRev: 1, compAmount: comp.revenue, compPctRev: 1, change: curr.revenue - comp.revenue, _bold: true },
                  { line: "Cost of Goods Sold", amount: curr.cogs, pctRev: curr.revenue ? curr.cogs / curr.revenue : 0, compAmount: comp.cogs, compPctRev: comp.revenue ? comp.cogs / comp.revenue : 0, change: curr.cogs - comp.cogs, _invertColor: true },
                  { line: "Gross Profit", amount: curr.grossProfit, pctRev: grossMarginCurr, compAmount: comp.grossProfit, compPctRev: grossMarginComp, change: curr.grossProfit - comp.grossProfit, _bold: true, _highlight: true },
                  { line: "Operating Expenses", amount: curr.opex, pctRev: curr.revenue ? curr.opex / curr.revenue : 0, compAmount: comp.opex, compPctRev: comp.revenue ? comp.opex / comp.revenue : 0, change: curr.opex - comp.opex, _invertColor: true },
                  { line: "EBITDA", amount: curr.ebitda, pctRev: curr.revenue ? curr.ebitda / curr.revenue : 0, compAmount: comp.ebitda, compPctRev: comp.revenue ? comp.ebitda / comp.revenue : 0, change: curr.ebitda - comp.ebitda, _bold: true },
                  { line: "Net Income", amount: curr.netIncome, pctRev: netMarginCurr, compAmount: comp.netIncome, compPctRev: netMarginComp, change: curr.netIncome - comp.netIncome, _bold: true, _highlight: true },
                ]}
              />
            </Section>

            <Section title="Monthly P&L Breakdown" subtitle="Current period months">
              <DataTable compact
                columns={[
                  { key: "monthName", label: "Month" },
                  { key: "revenue", label: "Revenue", align: "right", format: fmtFull },
                  { key: "cogs", label: "COGS", align: "right", format: fmtFull },
                  { key: "grossProfit", label: "Gross Profit", align: "right", format: fmtFull },
                  { key: "grossMargin", label: "GM%", align: "right", format: pct },
                  { key: "opex", label: "OpEx", align: "right", format: fmtFull },
                  { key: "netIncome", label: "Net Income", align: "right", format: fmtFull, color: v => v >= 0 ? C.green : C.red },
                  { key: "netMargin", label: "NM%", align: "right", format: pct, color: v => v >= 0 ? C.green : C.red },
                ]}
                rows={currentPeriod}
              />
            </Section>

            <Section title="Margin Waterfall">
              <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={[
                    { name: "Revenue", value: curr.revenue, fill: C.navy2 },
                    { name: "COGS", value: -curr.cogs, fill: C.red },
                    { name: "Gross Profit", value: curr.grossProfit, fill: C.green },
                    { name: "OpEx", value: -curr.opex, fill: C.amber },
                    { name: "Net Income", value: curr.netIncome, fill: curr.netIncome >= 0 ? C.accent : C.red },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.textSec }} />
                    <YAxis tick={{ fontSize: 10, fill: C.textTert }} tickFormatter={v => fmt(v)} />
                    <Tooltip formatter={v => fmtFull(Math.abs(v))} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {[C.navy2, C.red, C.green, C.amber, curr.netIncome >= 0 ? C.accent : C.red].map((color, i) => (
                        <Cell key={i} fill={color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </>
        )}

        {tab === 2 && (
          <>
            <Section title="Period-over-Period Comparison" subtitle="Side-by-side variance analysis">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                {[
                  { label: "Revenue", curr: curr.revenue, comp: comp.revenue },
                  { label: "Gross Profit", curr: curr.grossProfit, comp: comp.grossProfit },
                  { label: "Net Income", curr: curr.netIncome, comp: comp.netIncome },
                  { label: "EBITDA", curr: curr.ebitda, comp: comp.ebitda },
                ].map((item, i) => {
                  const v = varPct(item.curr, item.comp);
                  return (
                    <div key={i} style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>{item.label}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                        <div>
                          <div style={{ fontSize: 11, color: C.textTert }}>Current</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: C.navy }}>{fmt(item.curr)}</div>
                        </div>
                        <div style={{ textAlign: "center", padding: "0 12px" }}>
                          <Badge value={v} />
                          <div style={{ fontSize: 11, color: C.textTert, marginTop: 2 }}>{fmtFull(item.curr - item.comp)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: C.textTert }}>Prior</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: C.slate }}>{fmt(item.comp)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="Margin Comparison" subtitle="Profitability shift analysis">
              <DataTable
                columns={[
                  { key: "metric", label: "Margin Metric" },
                  { key: "current", label: "Current", align: "right", format: pct },
                  { key: "prior", label: "Prior", align: "right", format: pct },
                  { key: "delta", label: "Change", align: "right", format: pctPts, color: v => v > 0 ? C.green : v < 0 ? C.red : C.text },
                ]}
                rows={[
                  { metric: "Gross Margin", current: grossMarginCurr, prior: grossMarginComp, delta: grossMarginCurr - grossMarginComp },
                  { metric: "COGS as % of Revenue", current: curr.revenue ? curr.cogs / curr.revenue : 0, prior: comp.revenue ? comp.cogs / comp.revenue : 0, delta: (curr.revenue ? curr.cogs / curr.revenue : 0) - (comp.revenue ? comp.cogs / comp.revenue : 0) },
                  { metric: "OpEx as % of Revenue", current: curr.revenue ? curr.opex / curr.revenue : 0, prior: comp.revenue ? comp.opex / comp.revenue : 0, delta: (curr.revenue ? curr.opex / curr.revenue : 0) - (comp.revenue ? comp.opex / comp.revenue : 0) },
                  { metric: "EBITDA Margin", current: curr.revenue ? curr.ebitda / curr.revenue : 0, prior: comp.revenue ? comp.ebitda / comp.revenue : 0, delta: (curr.revenue ? curr.ebitda / curr.revenue : 0) - (comp.revenue ? comp.ebitda / comp.revenue : 0) },
                  { metric: "Net Margin", current: netMarginCurr, prior: netMarginComp, delta: netMarginCurr - netMarginComp, _bold: true, _highlight: true },
                ]}
              />
            </Section>

            <Section title="Revenue vs COGS Comparison">
              <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[
                    { name: "Revenue", Current: curr.revenue, Prior: comp.revenue },
                    { name: "COGS", Current: curr.cogs, Prior: comp.cogs },
                    { name: "Gross Profit", Current: curr.grossProfit, Prior: comp.grossProfit },
                    { name: "OpEx", Current: curr.opex, Prior: comp.opex },
                    { name: "Net Income", Current: curr.netIncome, Prior: comp.netIncome },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.textSec }} />
                    <YAxis tick={{ fontSize: 10, fill: C.textTert }} tickFormatter={v => fmt(v)} />
                    <Tooltip formatter={v => fmtFull(v)} />
                    <Legend />
                    <Bar dataKey="Current" fill={C.navy2} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Prior" fill={C.textTert} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </>
        )}

        {tab === 3 && (
          <>
            <Section title="Monthly Deep Dive — Revenue Composition" subtitle="Revenue, cost, and profit by month">
              <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.textTert }} />
                    <YAxis tick={{ fontSize: 10, fill: C.textTert }} tickFormatter={v => fmt(v)} />
                    <Tooltip formatter={v => fmtFull(v)} />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" stackId="1" stroke={C.navy2} fill={C.navy2} fillOpacity={0.3} name="Revenue" />
                    <Area type="monotone" dataKey="grossProfit" stackId="2" stroke={C.green} fill={C.green} fillOpacity={0.2} name="Gross Profit" />
                    <Area type="monotone" dataKey="netIncome" stackId="3" stroke={C.accent} fill={C.accent} fillOpacity={0.15} name="Net Income" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Cost Structure Analysis" subtitle="COGS and OpEx as percentage of revenue">
              <DataTable compact
                columns={[
                  { key: "label", label: "Month" },
                  { key: "revenue", label: "Revenue", align: "right", format: fmtFull },
                  { key: "cogs", label: "COGS", align: "right", format: fmtFull },
                  { key: "cogsPct", label: "COGS%", align: "right", format: pct },
                  { key: "opex", label: "OpEx", align: "right", format: fmtFull },
                  { key: "opexPct", label: "OpEx%", align: "right", format: pct },
                  { key: "netMargin", label: "Net Margin", align: "right", format: pct, color: v => v >= 0 ? C.green : C.red },
                ]}
                rows={trendData.map(d => ({
                  ...d,
                  cogsPct: d.revenue ? d.cogs / d.revenue : 0,
                  opexPct: d.revenue ? d.opex / d.revenue : 0,
                }))}
              />
            </Section>

            <Section title="Cash, AR & AP Trend" subtitle="Balance sheet items over time">
              <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.textTert }} />
                    <YAxis tick={{ fontSize: 10, fill: C.textTert }} tickFormatter={v => fmt(v)} />
                    <Tooltip formatter={v => fmtFull(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="cash" stroke={C.green} strokeWidth={2.5} dot={false} name="Cash" />
                    <Line type="monotone" dataKey="ar" stroke={C.accent} strokeWidth={2} dot={false} name="AR" />
                    <Line type="monotone" dataKey="ap" stroke={C.amber} strokeWidth={2} dot={false} name="AP" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </>
        )}

        {tab === 4 && (
          <>
            <Section title="Year-End Projection" subtitle={`${forecast.completedMonths || 0} months actual, ${forecast.remaining || 0} months projected`}
              actions={
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: C.textSec }}>Growth assumption:</span>
                  <select value={forecastGrowth} onChange={e => setForecastGrowth(parseFloat(e.target.value))} style={selectStyle}>
                    {[-0.05, 0, 0.02, 0.05, 0.08, 0.1, 0.15].map(v => <option key={v} value={v}>{(v * 100).toFixed(0)}%</option>)}
                  </select>
                </div>
              }
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 20 }}>
                <KpiCard label="Projected Revenue" value={fmt(forecast.projRev)} subtext="year-end" icon="↗" />
                <KpiCard label="Projected Net Income" value={fmt(forecast.projNI)} subtext={`${pct(forecast.projNetMargin)} margin`} icon="◈" accentColor={forecast.projNI >= 0 ? C.green : C.red} />
                <KpiCard label="Projected Gross Margin" value={pct(forecast.projGrossMargin)} icon="%" />
                <KpiCard label="Run Rate Revenue" value={fmt(forecast.runRateRev)} subtext="annualized" icon="⟳" />
              </div>
            </Section>

            <Section title="Monthly Actual vs Forecast">
              <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={forecast.monthlyForecast || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: C.textTert }} />
                    <YAxis tick={{ fontSize: 10, fill: C.textTert }} tickFormatter={v => fmt(v)} />
                    <Tooltip formatter={v => fmtFull(v)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" radius={[3, 3, 0, 0]}>
                      {(forecast.monthlyForecast || []).map((d, i) => (
                        <Cell key={i} fill={d.type === "actual" ? C.navy2 : C.navy3} fillOpacity={d.type === "actual" ? 1 : 0.45} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="netIncome" stroke={C.green} strokeWidth={2} name="Net Income" dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: C.textSec }}>■ <span style={{ color: C.navy2 }}>Actual</span></span>
                  <span style={{ fontSize: 11, color: C.textSec }}>□ <span style={{ color: C.navy3, opacity: 0.6 }}>Projected</span></span>
                </div>
              </div>
            </Section>

            <Section title="Forecast Detail">
              <DataTable compact
                columns={[
                  { key: "month", label: "Month" },
                  { key: "type", label: "Status", format: v => v === "actual" ? "Actual" : "Forecast" },
                  { key: "revenue", label: "Revenue", align: "right", format: fmtFull },
                  { key: "grossProfit", label: "Gross Profit", align: "right", format: fmtFull },
                  { key: "netIncome", label: "Net Income", align: "right", format: fmtFull, color: v => v >= 0 ? C.green : C.red },
                ]}
                rows={(forecast.monthlyForecast || []).map(d => ({ ...d, _highlight: d.type === "forecast" }))}
              />
            </Section>
          </>
        )}

        {tab === 5 && (
          <>
            <Section title="Revenue Trend — 12-Month View">
              <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.navy2} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={C.navy2} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.textTert }} />
                    <YAxis tick={{ fontSize: 10, fill: C.textTert }} tickFormatter={v => fmt(v)} />
                    <Tooltip formatter={v => fmtFull(v)} />
                    <Area type="monotone" dataKey="revenue" stroke={C.navy2} fill="url(#revGrad)" strokeWidth={2.5} dot={{ r: 3, fill: C.navy2 }} name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Margin Trends">
              <div style={{ background: C.card, borderRadius: 10, padding: 16, border: `1px solid ${C.border}` }}>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.textTert }} />
                    <YAxis tick={{ fontSize: 10, fill: C.textTert }} tickFormatter={v => pct(v)} domain={['auto', 'auto']} />
                    <Tooltip formatter={v => pct(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="grossMargin" stroke={C.green} strokeWidth={2.5} dot={{ r: 3 }} name="Gross Margin" />
                    <Line type="monotone" dataKey="netMargin" stroke={C.accent} strokeWidth={2.5} dot={{ r: 3 }} name="Net Margin" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Month-over-Month Changes" subtitle="Sequential growth rates">
              <DataTable compact
                columns={[
                  { key: "label", label: "Month" },
                  { key: "revenue", label: "Revenue", align: "right", format: fmtFull },
                  { key: "revMoM", label: "Rev MoM", align: "right", format: v => v != null ? (v > 0 ? "+" : "") + (v * 100).toFixed(1) + "%" : "—", color: v => v > 0 ? C.green : v < 0 ? C.red : C.text },
                  { key: "grossMargin", label: "GM%", align: "right", format: pct },
                  { key: "gmDelta", label: "GM Δ", align: "right", format: v => v != null ? pctPts(v) : "—", color: v => v > 0 ? C.green : v < 0 ? C.red : C.text },
                  { key: "netMargin", label: "NM%", align: "right", format: pct, color: v => v >= 0 ? C.green : C.red },
                ]}
                rows={trendData.map((d, i) => ({
                  ...d,
                  revMoM: i > 0 && trendData[i - 1].revenue ? (d.revenue - trendData[i - 1].revenue) / trendData[i - 1].revenue : null,
                  gmDelta: i > 0 ? d.grossMargin - trendData[i - 1].grossMargin : null,
                }))}
              />
            </Section>
          </>
        )}

        {tab === 6 && (
          <>
            <Section title="Action Flags & Risk Indicators" subtitle="Automated monitoring based on selected period and thresholds">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Critical", count: actionFlags.filter(f => f.severity === "critical").length, color: C.red, bg: C.redBg },
                  { label: "Warning", count: actionFlags.filter(f => f.severity === "warning").length, color: C.amber, bg: C.amberBg },
                  { label: "Info", count: actionFlags.filter(f => f.severity === "info").length, color: C.blue, bg: C.blueBg },
                ].map((s, i) => (
                  <div key={i} style={{ background: s.bg, borderRadius: 10, padding: "14px 18px", border: `1px solid ${s.color}22`, textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.count}</div>
                    <div style={{ fontSize: 11, color: s.color, fontWeight: 600, textTransform: "uppercase" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="All Active Flags">
              {actionFlags.map((f, i) => <AlertFlag key={i} {...f} />)}
            </Section>

            <Section title="Threshold Reference" subtitle="Flag trigger conditions">
              <DataTable compact
                columns={[
                  { key: "flag", label: "Flag" },
                  { key: "condition", label: "Trigger Condition" },
                  { key: "severity", label: "Severity" },
                ]}
                rows={[
                  { flag: "Revenue Decline", condition: "Revenue down >5% vs comparison period", severity: "Critical" },
                  { flag: "Margin Compression", condition: "Gross margin contracts >2 points", severity: "Critical" },
                  { flag: "Net Margin Erosion", condition: "Net margin contracts >3 points", severity: "Critical" },
                  { flag: "Negative Cash", condition: "Cash balance turns negative", severity: "Critical" },
                  { flag: "Expense Spike", condition: "OpEx increases >10% over 3 months", severity: "Warning" },
                  { flag: "Low Cash Coverage", condition: "Cash < 1 month OpEx", severity: "Warning" },
                  { flag: "AR Risk", condition: "AR exceeds 50% of period revenue", severity: "Warning" },
                  { flag: "Tight Forecast Margin", condition: "Projected year-end net margin <3%", severity: "Warning" },
                  { flag: "AP Monitoring", condition: "Payables elevated relative to COGS", severity: "Info" },
                ]}
              />
            </Section>
          </>
        )}

        <div style={{ marginTop: 32, padding: "16px 0", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.textTert }}>
            Data source: {dataSource === "quickbooks" ? `QuickBooks Online (live, via MCP)${snapshotMeta?.asOf ? ` — as of ${snapshotMeta.asOf}` : ""}` : "Sample data — refresh to load actuals"}
          </span>
          <span style={{ fontSize: 11, color: C.textTert }}>
            Financial Operations · Live QuickBooks data via Anthropic MCP
          </span>
        </div>
      </div>
    </div>
  );
}

const selectStyle = {
  padding: "5px 10px", borderRadius: 5, border: `1px solid ${C.border}`, fontSize: 12,
  background: C.card, color: C.text, cursor: "pointer",
};
