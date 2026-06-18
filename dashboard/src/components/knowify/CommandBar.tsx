// CommandBar.tsx — global search + saved presets, shown across every view.
import React from "react";
import type { DashboardState } from "../../hooks/dashboardState";
import type { DashboardActions } from "../../hooks/useDashboardState";
import { JOBS, profitability, type Job } from "./data";

interface Props {
  state: DashboardState;
  actions: DashboardActions;
}

interface Preset {
  id: string;
  label: string;
  preset: Partial<DashboardState>;
}

// Each preset only declares the fields it changes; LOAD_PRESET merges the rest.
const PRESETS: Preset[] = [
  { id: "at-risk", label: "⚠ At-risk jobs", preset: { view: "jobs", tab: "projects", filter: "at-risk", profitFilter: "all", pmFilter: "all", typeFilter: "all", yearFilter: "all", listSearch: "", drillJob: null } },
  { id: "losers", label: "📉 Unprofitable", preset: { view: "jobs", tab: "projects", profitFilter: "loss", filter: "all", listSearch: "", drillJob: null } },
  { id: "pipeline", label: "🏗 2026 active", preset: { view: "jobs", tab: "projects", yearFilter: "2026", filter: "active", profitFilter: "all", listSearch: "", drillJob: null } },
  { id: "pm-load", label: "👷 PM workload", preset: { view: "capacity", capRole: "pm" } },
  { id: "quarterly", label: "📈 Quarterly trend", preset: { view: "trends", gran: "quarter" } },
];

function matchJobs(query: string): Job[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return JOBS.filter((job) =>
    `${job.name} ${job.client} ${job.pm}`.toLowerCase().includes(q)
  ).slice(0, 6);
}

export default function CommandBar({ state, actions }: Props) {
  const results = matchJobs(state.search);

  const jumpTo = (job: Job) => {
    // Navigate straight to the job's drill-down, then clear the search.
    actions.loadPreset({ view: "jobs", tab: "projects", drillJob: job.name });
    actions.setSearch("");
  };

  return (
    <div style={{ maxWidth: 1200, margin: "16px auto 0", padding: "0 24px" }}>
      <div
        style={{
          display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
          padding: "12px 16px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        {/* ── Global search ─────────────────────────────────────── */}
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <input
            type="text"
            value={state.search}
            onChange={(e) => actions.setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) jumpTo(results[0]);
              if (e.key === "Escape") actions.setSearch("");
            }}
            placeholder="Search all jobs…  (↵ to open first match)"
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 6,
              border: "1px solid #d1d5db", fontSize: 13, color: "#374151",
            }}
          />
          {results.length > 0 && (
            <div
              style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10,
                background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6,
                boxShadow: "0 6px 20px rgba(0,0,0,0.12)", overflow: "hidden",
              }}
            >
              {results.map((job) => (
                <div
                  key={job.name}
                  onClick={() => jumpTo(job)}
                  style={{
                    display: "flex", justifyContent: "space-between", gap: 12,
                    padding: "8px 12px", cursor: "pointer", fontSize: 13,
                    borderBottom: "1px solid #f3f4f6",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  <span style={{ fontWeight: 600, color: "#111827" }}>{job.name}</span>
                  <span style={{ color: "#6b7280" }}>
                    {job.pm} · {profitability(job).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Saved presets ─────────────────────────────────────── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => actions.loadPreset(p.preset)}
              style={{
                padding: "7px 12px", borderRadius: 999, border: "1px solid #d1d5db",
                background: "#f9fafb", color: "#374151", cursor: "pointer",
                fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={actions.resetUI}
            title="Reset view, panels, sorting and granularity to defaults"
            style={{
              padding: "7px 12px", borderRadius: 999, border: "1px solid #d1d5db",
              background: "#fff", color: "#6b7280", cursor: "pointer",
              fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
            }}
          >
            ↺ Reset UI
          </button>
        </div>
      </div>
    </div>
  );
}
