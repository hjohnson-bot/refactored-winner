// JobsView.tsx — portfolio job list with filters, sorting, tabs and drill-down.
import React from "react";
import type { DashboardState } from "../../hooks/dashboardState";
import type { DashboardActions } from "../../hooks/useDashboardState";
import {
  JOBS,
  contractYears,
  filterJobs,
  mask,
  profitability,
  projectManagers,
  sortJobs,
  type Job,
} from "./data";

interface Props {
  state: DashboardState;
  actions: DashboardActions;
}

const STATUS_COLORS: Record<Job["status"], string> = {
  active: "#2563eb",
  completed: "#178a6e",
  "at-risk": "#dc2626",
};

const TYPE_LABELS: Record<Job["type"], string> = {
  fixed: "Fixed Price",
  tm: "T&M",
  service: "Service",
};

const COLUMNS: { key: string; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Job" },
  { key: "client", label: "Client" },
  { key: "pm", label: "PM" },
  { key: "contract", label: "Contract", numeric: true },
  { key: "actualCost", label: "Actual Cost", numeric: true },
  { key: "profit", label: "Profit", numeric: true },
  { key: "profitability", label: "Profit %", numeric: true },
  { key: "completion", label: "Complete", numeric: true },
];

function selectStyle(): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#374151",
    fontSize: 13,
    cursor: "pointer",
  };
}

export default function JobsView({ state, actions }: Props) {
  const show = state.showNumbers;
  const filtered = filterJobs(JOBS, state);
  const rows = sortJobs(filtered, state.listSort);
  const drill = state.drillJob
    ? JOBS.find((j) => j.name === state.drillJob) ?? null
    : null;

  const totalContract = filtered.reduce((s, j) => s + j.contract, 0);
  const totalProfit = filtered.reduce((s, j) => s + j.profit, 0);

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#111827" }}>Jobs Portfolio</h2>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            {filtered.length} of {JOBS.length} jobs · ${mask(totalContract, show)} contract · ${mask(totalProfit, show)} profit
          </div>
        </div>
        <button
          onClick={actions.toggleShowNumbers}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db",
            background: "#fff", color: "#374151", cursor: "pointer", fontWeight: 600, fontSize: 13,
          }}
        >
          {show ? "Hide $" : "Show $"}
        </button>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
        {(["projects", "charts"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => actions.setTab(tab)}
            style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 14, fontWeight: 600,
              color: state.tab === tab ? "#2563eb" : "#6b7280",
              borderBottom: state.tab === tab ? "2px solid #2563eb" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {tab === "projects" ? "Table" : "Charts"}
          </button>
        ))}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <input
          type="text"
          value={state.listSearch}
          onChange={(e) => actions.setListSearch(e.target.value)}
          placeholder="Search job, client, PM…"
          style={{ ...selectStyle(), cursor: "text", minWidth: 200, flex: 1 }}
        />
        <select value={state.pmFilter} onChange={(e) => actions.setPmFilter(e.target.value)} style={selectStyle()}>
          <option value="all">All PMs</option>
          {projectManagers().map((pm) => (
            <option key={pm} value={pm}>{pm}</option>
          ))}
        </select>
        <select
          value={state.typeFilter}
          onChange={(e) => actions.setTypeFilter(e.target.value as DashboardState["typeFilter"])}
          style={selectStyle()}
        >
          <option value="all">All Types</option>
          <option value="fixed">Fixed Price</option>
          <option value="tm">T&M</option>
          <option value="service">Service</option>
        </select>
        <select value={state.yearFilter} onChange={(e) => actions.setYearFilter(e.target.value)} style={selectStyle()}>
          <option value="all">All Years</option>
          {contractYears().map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={state.filter}
          onChange={(e) => actions.setFilter(e.target.value as DashboardState["filter"])}
          style={selectStyle()}
        >
          <option value="all">Any Status</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="at-risk">At Risk</option>
        </select>

        {/* Profit bucket toggle */}
        <div style={{ display: "flex", border: "1px solid #d1d5db", borderRadius: 6, overflow: "hidden" }}>
          {(["all", "profit", "breakeven", "loss"] as const).map((b) => (
            <button
              key={b}
              onClick={() => actions.setProfitFilter(b)}
              style={{
                padding: "8px 12px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                textTransform: "capitalize",
                background: state.profitFilter === b ? "#2563eb" : "#fff",
                color: state.profitFilter === b ? "#fff" : "#374151",
              }}
            >
              {b}
            </button>
          ))}
        </div>

        <button
          onClick={actions.resetFilters}
          style={{ ...selectStyle(), fontWeight: 600 }}
        >
          Reset
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      {state.tab === "projects" ? (
        <JobsTable
          rows={rows}
          show={show}
          sortKey={state.listSort}
          drillJob={state.drillJob}
          onSort={actions.setListSort}
          onDrill={actions.setDrillJob}
        />
      ) : (
        <ProfitabilityChart rows={rows} show={show} />
      )}

      {drill && <DrillPanel job={drill} show={show} onClose={() => actions.setDrillJob(null)} />}
    </div>
  );
}

// ── Table ──────────────────────────────────────────────────────────────────
function JobsTable({
  rows,
  show,
  sortKey,
  drillJob,
  onSort,
  onDrill,
}: {
  rows: Job[];
  show: boolean;
  sortKey: string;
  drillJob: string | null;
  onSort: (key: string) => void;
  onDrill: (job: string | null) => void;
}) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#6b7280", background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb" }}>
        No jobs match the current filters.
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => onSort(col.key)}
                style={{
                  padding: "10px 12px", textAlign: col.numeric ? "right" : "left",
                  cursor: "pointer", color: sortKey === col.key ? "#2563eb" : "#6b7280",
                  fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5,
                  whiteSpace: "nowrap",
                }}
              >
                {col.label} {sortKey === col.key ? "▾" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((job) => {
            const pct = profitability(job);
            const selected = drillJob === job.name;
            return (
              <tr
                key={job.name}
                onClick={() => onDrill(selected ? null : job.name)}
                style={{
                  borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                  background: selected ? "#eff6ff" : "transparent",
                }}
              >
                <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: STATUS_COLORS[job.status], display: "inline-block" }} />
                    {job.name}
                  </span>
                </td>
                <td style={{ padding: "10px 12px", color: "#374151" }}>{job.client}</td>
                <td style={{ padding: "10px 12px", color: "#374151" }}>{job.pm}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "#374151" }}>${mask(job.contract, show)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "#374151" }}>${mask(job.actualCost, show)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: job.profit < 0 ? "#dc2626" : "#178a6e" }}>
                  {job.profit < 0 ? "-$" : "$"}{mask(Math.abs(job.profit), show)}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: pct < 0 ? "#dc2626" : "#374151" }}>{pct.toFixed(1)}%</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "#374151" }}>{job.completion}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Charts tab ───────────────────────────────────────────────────────────────
function ProfitabilityChart({ rows, show }: { rows: Job[]; show: boolean }) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#6b7280", background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb" }}>
        No jobs match the current filters.
      </div>
    );
  }
  const maxAbs = Math.max(...rows.map((j) => Math.abs(j.profit)), 1);
  return (
    <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 16 }}>Profit by job</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((job) => (
          <div key={job.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 180, fontSize: 12, color: "#374151", textAlign: "right", flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {job.name}
            </span>
            <div style={{ flex: 1, height: 16, position: "relative", background: "#f3f4f6", borderRadius: 2 }}>
              <div
                style={{
                  position: "absolute", left: 0, height: "100%", borderRadius: 2,
                  width: `${(Math.abs(job.profit) / maxAbs) * 100}%`,
                  background: job.profit < 0 ? "#dc2626" : "#178a6e",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <span style={{ width: 90, fontSize: 12, color: job.profit < 0 ? "#dc2626" : "#374151", flexShrink: 0 }}>
              {job.profit < 0 ? "-$" : "$"}{mask(Math.abs(job.profit), show)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Drill-down panel ─────────────────────────────────────────────────────────
function DrillPanel({ job, show, onClose }: { job: Job; show: boolean; onClose: () => void }) {
  const pct = profitability(job);
  const rows: { label: string; value: string }[] = [
    { label: "Client", value: job.client },
    { label: "Project Manager", value: job.pm },
    { label: "Foreman", value: job.foreman },
    { label: "Crew Size", value: String(job.crew) },
    { label: "Type", value: TYPE_LABELS[job.type] },
    { label: "Contract Year", value: job.year },
    { label: "Contract Value", value: `$${mask(job.contract, show)}` },
    { label: "Actual Cost", value: `$${mask(job.actualCost, show)}` },
    { label: "Projected Profit", value: `${job.profit < 0 ? "-$" : "$"}${mask(Math.abs(job.profit), show)} (${pct.toFixed(1)}%)` },
    { label: "Completion", value: `${job.completion}%` },
  ];
  return (
    <div style={{ marginTop: 16, background: "#fff", borderRadius: 8, border: "1px solid #2563eb", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>{job.name}</h3>
        <button
          onClick={onClose}
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#6b7280", lineHeight: 1 }}
          aria-label="Close detail"
        >
          ×
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px 24px" }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6", padding: "6px 0", fontSize: 13 }}>
            <span style={{ color: "#6b7280" }}>{row.label}</span>
            <span style={{ fontWeight: 600, color: "#111827" }}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
