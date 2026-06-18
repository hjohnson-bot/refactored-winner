// TrendsView.tsx — portfolio revenue/profit over time at selectable granularity.
import React from "react";
import type { DashboardState } from "../../hooks/dashboardState";
import type { DashboardActions } from "../../hooks/useDashboardState";
import { MONTHLY_TREND, aggregateTrend, mask } from "./data";

interface Props {
  state: DashboardState;
  actions: DashboardActions;
}

export default function TrendsView({ state, actions }: Props) {
  const show = state.showNumbers;
  const points = aggregateTrend(MONTHLY_TREND, state.gran);
  const maxRevenue = Math.max(...points.map((p) => p.revenue), 1);
  // Profit is far smaller than revenue, so it gets its own scale (dual-axis
  // overlay). Using the absolute value keeps loss periods visible as a bar.
  const maxAbsProfit = Math.max(...points.map((p) => Math.abs(p.profit)), 1);

  const totalRevenue = points.reduce((s, p) => s + p.revenue, 0);
  const totalProfit = points.reduce((s, p) => s + p.profit, 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#111827" }}>Trends Over Time</h2>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            ${mask(totalRevenue, show)} revenue · ${mask(totalProfit, show)} profit across {points.length} periods
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

      {/* Granularity toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <div style={{ display: "flex", border: "1px solid #d1d5db", borderRadius: 6, overflow: "hidden" }}>
          {(["month", "quarter", "year"] as const).map((g) => (
            <button
              key={g}
              onClick={() => actions.setGran(g)}
              style={{
                padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                textTransform: "capitalize",
                background: state.gran === g ? "#2563eb" : "#fff",
                color: state.gran === g ? "#fff" : "#374151",
              }}
            >
              {g}ly
            </button>
          ))}
        </div>
      </div>

      {/* Column chart */}
      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 220 }}>
          {points.map((p) => {
            const revH = (p.revenue / maxRevenue) * 100;
            const profH = (Math.abs(p.profit) / maxAbsProfit) * 100;
            return (
              <div key={p.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                <div style={{ position: "relative", width: "70%", height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  {/* Revenue bar */}
                  <div style={{ width: "100%", height: `${revH}%`, background: "#dbeafe", borderRadius: "3px 3px 0 0", transition: "height 0.4s ease" }} />
                  {/* Profit bar overlaid */}
                  <div
                    style={{
                      position: "absolute", bottom: 0, width: "55%",
                      height: `${profH}%`,
                      background: p.profit < 0 ? "#dc2626" : "#178a6e",
                      borderRadius: "3px 3px 0 0", transition: "height 0.4s ease",
                    }}
                    title={`Profit: ${p.profit < 0 ? "-$" : "$"}${mask(Math.abs(p.profit), show)}`}
                  />
                </div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6, whiteSpace: "nowrap" }}>{p.label}</div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 20, marginTop: 16, fontSize: 12, color: "#6b7280" }}>
          <Legend color="#dbeafe" label="Revenue" />
          <Legend color="#178a6e" label="Profit" />
          <Legend color="#dc2626" label="Loss" />
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: 2, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
