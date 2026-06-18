// data.ts
//
// Sample portfolio data + pure helpers shared by the Knowify dashboard views
// (jobs list, capacity, trends). All amounts are USD. In a real deployment this
// module would be backed by the Knowify API instead of static fixtures.

import type { DashboardState } from "../../hooks/dashboardState";

// ── Types ────────────────────────────────────────────────────────────────────

export type JobType = "fixed" | "tm" | "service";
export type JobStatus = "active" | "completed" | "at-risk";

export interface Job {
  name: string;
  client: string;
  pm: string;
  foreman: string;
  crew: number; // crew members assigned
  type: JobType;
  year: string; // contract year
  status: JobStatus;
  contract: number; // contract value
  actualCost: number; // cost incurred to date
  profit: number; // projected profit $ (can be negative)
  completion: number; // percent complete 0-100
}

export interface TrendPoint {
  period: string; // YYYY-MM
  revenue: number;
  profit: number;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

export const JOBS: Job[] = [
  { name: "Sunset Plaza High School", client: "LAUSD", pm: "Dana Reyes", foreman: "Joe Pike", crew: 8, type: "fixed", year: "2026", status: "active", contract: 1207000, actualCost: 106960, profit: 359550, completion: 35 },
  { name: "Harborview Medical Wing", client: "Harborview Health", pm: "Dana Reyes", foreman: "Bill Ortiz", crew: 12, type: "fixed", year: "2026", status: "active", contract: 2480000, actualCost: 1490000, profit: 410000, completion: 62 },
  { name: "Maple Street Townhomes", client: "Maple Dev Group", pm: "Marcus Lee", foreman: "Joe Pike", crew: 6, type: "fixed", year: "2025", status: "at-risk", contract: 940000, actualCost: 905000, profit: -38000, completion: 88 },
  { name: "Riverside Office Retrofit", client: "Riverside Holdings", pm: "Marcus Lee", foreman: "Ana Cruz", crew: 5, type: "tm", year: "2025", status: "completed", contract: 615000, actualCost: 498000, profit: 117000, completion: 100 },
  { name: "Cedar Park Pavilion", client: "City of Cedar Park", pm: "Priya Shah", foreman: "Ana Cruz", crew: 4, type: "fixed", year: "2025", status: "completed", contract: 388000, actualCost: 372000, profit: 9000, completion: 100 },
  { name: "Glenwood Data Center", client: "Glenwood Cloud", pm: "Priya Shah", foreman: "Bill Ortiz", crew: 14, type: "fixed", year: "2026", status: "active", contract: 3950000, actualCost: 1180000, profit: 690000, completion: 28 },
  { name: "Oakridge Tenant Buildout", client: "Oakridge Partners", pm: "Marcus Lee", foreman: "Ana Cruz", crew: 3, type: "tm", year: "2025", status: "active", contract: 272000, actualCost: 188000, profit: 41000, completion: 71 },
  { name: "Pinecrest HVAC Service", client: "Pinecrest Schools", pm: "Dana Reyes", foreman: "Joe Pike", crew: 2, type: "service", year: "2024", status: "completed", contract: 96000, actualCost: 71000, profit: 18000, completion: 100 },
  { name: "Lakeshore Parking Deck", client: "Lakeshore Authority", pm: "Priya Shah", foreman: "Bill Ortiz", crew: 9, type: "fixed", year: "2024", status: "completed", contract: 1620000, actualCost: 1710000, profit: -120000, completion: 100 },
  { name: "Westgate Retail Refresh", client: "Westgate Malls", pm: "Marcus Lee", foreman: "Ana Cruz", crew: 4, type: "service", year: "2026", status: "active", contract: 158000, actualCost: 92000, profit: 31000, completion: 54 },
  { name: "Brookfield Warehouse", client: "Brookfield Logistics", pm: "Dana Reyes", foreman: "Bill Ortiz", crew: 7, type: "fixed", year: "2025", status: "active", contract: 1340000, actualCost: 770000, profit: 205000, completion: 58 },
  { name: "Summit Ridge Clinic", client: "Summit Ridge Care", pm: "Priya Shah", foreman: "Joe Pike", crew: 5, type: "tm", year: "2024", status: "completed", contract: 505000, actualCost: 489000, profit: 11000, completion: 100 },
];

export const MONTHLY_TREND: TrendPoint[] = [
  { period: "2025-01", revenue: 410000, profit: 52000 },
  { period: "2025-02", revenue: 455000, profit: 58000 },
  { period: "2025-03", revenue: 520000, profit: 41000 },
  { period: "2025-04", revenue: 498000, profit: 63000 },
  { period: "2025-05", revenue: 612000, profit: 88000 },
  { period: "2025-06", revenue: 588000, profit: 72000 },
  { period: "2025-07", revenue: 640000, profit: 95000 },
  { period: "2025-08", revenue: 705000, profit: 84000 },
  { period: "2025-09", revenue: 668000, profit: -12000 },
  { period: "2025-10", revenue: 720000, profit: 101000 },
  { period: "2025-11", revenue: 690000, profit: 77000 },
  { period: "2025-12", revenue: 815000, profit: 132000 },
  { period: "2026-01", revenue: 760000, profit: 96000 },
  { period: "2026-02", revenue: 802000, profit: 110000 },
  { period: "2026-03", revenue: 870000, profit: 121000 },
  { period: "2026-04", revenue: 845000, profit: 88000 },
];

// ── Formatting ───────────────────────────────────────────────────────────────

export function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Mask currency when privacy mode (showNumbers === false) is on. */
export function mask(n: number, show: boolean): string {
  return show ? fmt(n) : "•••••";
}

// ── Derived values ───────────────────────────────────────────────────────────

/** Projected profitability as a percentage of contract value. */
export function profitability(job: Job): number {
  return job.contract === 0 ? 0 : (job.profit / job.contract) * 100;
}

export type ProfitBucket = "profit" | "loss" | "breakeven";

/** Classify a job into a profitability bucket. */
export function profitBucket(job: Job): ProfitBucket {
  const pct = profitability(job);
  if (pct < 0) return "loss";
  if (pct < 3) return "breakeven";
  return "profit";
}

/** Distinct project managers, sorted. */
export function projectManagers(jobs: Job[] = JOBS): string[] {
  return [...new Set(jobs.map((j) => j.pm))].sort();
}

/** Distinct contract years, most recent first. */
export function contractYears(jobs: Job[] = JOBS): string[] {
  return [...new Set(jobs.map((j) => j.year))].sort().reverse();
}

// ── Filtering & sorting ──────────────────────────────────────────────────────

type JobFilters = Pick<
  DashboardState,
  "filter" | "pmFilter" | "typeFilter" | "yearFilter" | "profitFilter" | "listSearch"
>;

export function filterJobs(jobs: Job[], f: JobFilters): Job[] {
  const search = f.listSearch.trim().toLowerCase();
  return jobs.filter((job) => {
    if (f.filter !== "all" && job.status !== f.filter) return false;
    if (f.pmFilter !== "all" && job.pm !== f.pmFilter) return false;
    if (f.typeFilter !== "all" && job.type !== f.typeFilter) return false;
    if (f.yearFilter !== "all" && job.year !== f.yearFilter) return false;
    if (f.profitFilter !== "all" && profitBucket(job) !== f.profitFilter) return false;
    if (search) {
      const haystack = `${job.name} ${job.client} ${job.pm}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

/** String columns sort ascending; numeric columns sort descending. */
const NUMERIC_SORT_KEYS = new Set([
  "contract",
  "actualCost",
  "profit",
  "profitability",
  "completion",
]);

export function sortJobs(jobs: Job[], sortKey: string): Job[] {
  const sorted = [...jobs];
  sorted.sort((a, b) => {
    if (sortKey === "profitability") return profitability(b) - profitability(a);
    if (NUMERIC_SORT_KEYS.has(sortKey)) {
      return (b[sortKey as keyof Job] as number) - (a[sortKey as keyof Job] as number);
    }
    const av = String(a[sortKey as keyof Job] ?? "");
    const bv = String(b[sortKey as keyof Job] ?? "");
    return av.localeCompare(bv);
  });
  return sorted;
}

// ── Trend aggregation ────────────────────────────────────────────────────────

export interface AggregatedPoint {
  label: string;
  revenue: number;
  profit: number;
}

/** Roll monthly trend points up to the requested granularity. */
export function aggregateTrend(
  points: TrendPoint[],
  gran: DashboardState["gran"]
): AggregatedPoint[] {
  if (gran === "month") {
    return points.map((p) => ({
      label: monthLabel(p.period),
      revenue: p.revenue,
      profit: p.profit,
    }));
  }

  const buckets = new Map<string, AggregatedPoint>();
  for (const p of points) {
    const [year, month] = p.period.split("-");
    const label =
      gran === "year"
        ? year
        : `Q${Math.floor((Number(month) - 1) / 3) + 1} '${year.slice(2)}`;
    const existing = buckets.get(label);
    if (existing) {
      existing.revenue += p.revenue;
      existing.profit += p.profit;
    } else {
      buckets.set(label, { label, revenue: p.revenue, profit: p.profit });
    }
  }
  return [...buckets.values()];
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabel(period: string): string {
  const [year, month] = period.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} '${year.slice(2)}`;
}
