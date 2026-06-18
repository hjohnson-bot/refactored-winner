// CapacityView.tsx — team load grouped by resource (PM / foreman), expandable.
import React from "react";
import type { DashboardState } from "../../hooks/dashboardState";
import type { DashboardActions } from "../../hooks/useDashboardState";
import { JOBS, mask, type Job } from "./data";

interface Props {
  state: DashboardState;
  actions: DashboardActions;
}

type Role = "pm" | "foreman";

interface Resource {
  name: string;
  role: Role;
  jobs: Job[];
}

function buildResources(role: DashboardState["capRole"]): Resource[] {
  const map = new Map<string, Resource>();
  const include = (key: string, name: string, r: Role, job: Job) => {
    const existing = map.get(key);
    if (existing) existing.jobs.push(job);
    else map.set(key, { name, role: r, jobs: [job] });
  };

  for (const job of JOBS) {
    if (role === "all" || role === "pm") include(`pm:${job.pm}`, job.pm, "pm", job);
    if (role === "all" || role === "foreman") include(`fm:${job.foreman}`, job.foreman, "foreman", job);
  }

  return [...map.values()].sort((a, b) => activeCount(b) - activeCount(a));
}

function activeCount(r: Resource): number {
  return r.jobs.filter((j) => j.status === "active").length;
}

const ROLE_LABELS: Record<Role, string> = { pm: "PM", foreman: "Foreman" };

export default function CapacityView({ state, actions }: Props) {
  const show = state.showNumbers;
  const resources = buildResources(state.capRole);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#111827" }}>Team Capacity</h2>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            {resources.length} resources · active job load by person
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

      {/* Role lens */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "flex", border: "1px solid #d1d5db", borderRadius: 6, overflow: "hidden" }}>
          {(["all", "pm", "foreman"] as const).map((role) => (
            <button
              key={role}
              onClick={() => actions.setCapRole(role)}
              style={{
                padding: "8px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                textTransform: "capitalize",
                background: state.capRole === role ? "#2563eb" : "#fff",
                color: state.capRole === role ? "#fff" : "#374151",
              }}
            >
              {role === "pm" ? "PMs" : role === "foreman" ? "Foremen" : "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Resource rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {resources.map((res) => {
          const key = `${res.role}:${res.name}`;
          const expanded = state.capExpanded.includes(key);
          const active = activeCount(res);
          const crew = res.jobs.filter((j) => j.status === "active").reduce((s, j) => s + j.crew, 0);
          const contract = res.jobs.reduce((s, j) => s + j.contract, 0);

          return (
            <div key={key} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden" }}>
              <div
                onClick={() => actions.toggleCapExpanded(key)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }}
              >
                <span style={{ color: "#6b7280", fontSize: 12, width: 12 }}>{expanded ? "▾" : "▸"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: "#111827", fontSize: 14 }}>{res.name}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{ROLE_LABELS[res.role]}</div>
                </div>
                <Stat label="Active" value={String(active)} />
                <Stat label="Crew" value={String(crew)} />
                <Stat label="Backlog" value={`$${mask(contract, show)}`} />
              </div>

              {expanded && (
                <div style={{ borderTop: "1px solid #f3f4f6", padding: "8px 16px 12px 40px" }}>
                  {res.jobs.map((job) => (
                    <div key={job.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #f9fafb" }}>
                      <span style={{ color: "#374151" }}>
                        {job.name}
                        <span style={{ color: "#9ca3af", marginLeft: 8, textTransform: "capitalize" }}>· {job.status}</span>
                      </span>
                      <span style={{ color: "#6b7280" }}>{job.completion}% · {job.crew} crew</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "right", minWidth: 80 }}>
      <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{value}</div>
    </div>
  );
}
