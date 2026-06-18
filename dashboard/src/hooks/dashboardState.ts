// dashboardState.ts
//
// State model and reducer powering the Knowify construction-profitability
// dashboard. The companion `useDashboardState` hook wires this reducer into
// React and exposes typed action creators.
//
// The state is split into two conceptual groups:
//   • Filters  — what slice of the data the user is looking at
//   • UI        — how that slice is presented (view, panels, sorting, …)
// Keeping the split explicit lets `RESET_FILTERS` and `RESET_UI` reset one
// group without disturbing the other.

// ── Literal unions ───────────────────────────────────────────────────────────

/** Top-level area of the dashboard the user is in. */
export type DashboardView = "overview" | "jobs" | "capacity" | "trends";

/** Sub-tab inside the jobs/overview area. */
export type DashboardTab = "projects" | "charts" | "trending" | "changes";

/** Project status filter. */
export type StatusFilter = "all" | "active" | "completed" | "at-risk";

/** Contract / job type filter. */
export type TypeFilter = "all" | "fixed" | "tm" | "service";

/** Profitability bucket filter. */
export type ProfitFilter = "all" | "profit" | "loss" | "breakeven";

/** Time granularity for trend charts. */
export type Granularity = "month" | "quarter" | "year";

/** Role lens used by the capacity view. */
export type CapRole = "all" | "pm" | "foreman";

/** Collapsible side panels and their open/closed state. */
export interface PanelState {
  filters: boolean;
  legend: boolean;
  settings: boolean;
  export: boolean;
}

// ── State shape ──────────────────────────────────────────────────────────────

export interface DashboardState {
  // Filters
  filter: StatusFilter;
  pmFilter: string; // "all" or a project-manager name
  typeFilter: TypeFilter;
  yearFilter: string; // "all" or a four-digit year
  profitFilter: ProfitFilter;
  search: string;
  listSearch: string;
  drillJob: string | null; // job currently drilled into, or null

  // UI
  view: DashboardView;
  tab: DashboardTab;
  gran: Granularity;
  sortKey: string;
  listSort: string;
  showNumbers: boolean;
  capRole: CapRole;
  capExpanded: string[]; // names of expanded capacity rows
  open: PanelState;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

/** Default values for the filter group only. */
export const DEFAULT_FILTERS = {
  filter: "all",
  pmFilter: "all",
  typeFilter: "all",
  yearFilter: "all",
  profitFilter: "all",
  search: "",
  listSearch: "",
  drillJob: null,
} satisfies Pick<
  DashboardState,
  | "filter"
  | "pmFilter"
  | "typeFilter"
  | "yearFilter"
  | "profitFilter"
  | "search"
  | "listSearch"
  | "drillJob"
>;

/** Default values for the UI group only. */
export const DEFAULT_UI = {
  view: "overview",
  tab: "projects",
  gran: "month",
  sortKey: "profitAmount",
  listSort: "jobName",
  showNumbers: true,
  capRole: "all",
  capExpanded: [],
  open: { filters: true, legend: false, settings: false, export: false },
} satisfies Pick<
  DashboardState,
  | "view"
  | "tab"
  | "gran"
  | "sortKey"
  | "listSort"
  | "showNumbers"
  | "capRole"
  | "capExpanded"
  | "open"
>;

/** Full default state. */
export const DEFAULT_DASHBOARD_STATE: DashboardState = {
  ...DEFAULT_FILTERS,
  ...DEFAULT_UI,
};

// ── Initialiser / merge helper ───────────────────────────────────────────────

/**
 * Build a complete `DashboardState` from an optional partial. Nested objects
 * (`open`) and arrays (`capExpanded`) are merged/cloned so callers can pass a
 * shallow partial without losing defaults or sharing mutable references.
 *
 * Used as the lazy-init argument to `useReducer`.
 */
export function mergeDashboardState(
  initial?: Partial<DashboardState>
): DashboardState {
  if (!initial) {
    return {
      ...DEFAULT_DASHBOARD_STATE,
      capExpanded: [...DEFAULT_DASHBOARD_STATE.capExpanded],
      open: { ...DEFAULT_DASHBOARD_STATE.open },
    };
  }

  return {
    ...DEFAULT_DASHBOARD_STATE,
    ...initial,
    capExpanded: initial.capExpanded
      ? [...initial.capExpanded]
      : [...DEFAULT_DASHBOARD_STATE.capExpanded],
    open: { ...DEFAULT_DASHBOARD_STATE.open, ...initial.open },
  };
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type DashboardAction =
  | { type: "SET_VIEW"; payload: DashboardState["view"] }
  | { type: "SET_FILTER"; payload: DashboardState["filter"] }
  | { type: "SET_PM_FILTER"; payload: string }
  | { type: "SET_TYPE_FILTER"; payload: DashboardState["typeFilter"] }
  | { type: "SET_YEAR_FILTER"; payload: string }
  | { type: "SET_GRAN"; payload: DashboardState["gran"] }
  | { type: "SET_DRILL_JOB"; payload: string | null }
  | { type: "TOGGLE_PANEL"; payload: keyof DashboardState["open"] }
  | {
      type: "SET_PANEL";
      payload: { key: keyof DashboardState["open"]; value: boolean };
    }
  | { type: "SET_SEARCH"; payload: string }
  | { type: "SET_SORT_KEY"; payload: string }
  | { type: "TOGGLE_SHOW_NUMBERS" }
  | { type: "SET_TAB"; payload: DashboardState["tab"] }
  | { type: "SET_LIST_SEARCH"; payload: string }
  | { type: "SET_PROFIT_FILTER"; payload: DashboardState["profitFilter"] }
  | { type: "SET_LIST_SORT"; payload: string }
  | { type: "SET_CAP_ROLE"; payload: DashboardState["capRole"] }
  | { type: "TOGGLE_CAP_EXPANDED"; payload: string }
  | { type: "RESET_FILTERS" }
  | { type: "RESET_UI" }
  | { type: "LOAD_PRESET"; payload: Partial<DashboardState> };

// ── Reducer ──────────────────────────────────────────────────────────────────

export function dashboardReducer(
  state: DashboardState,
  action: DashboardAction
): DashboardState {
  switch (action.type) {
    case "SET_VIEW":
      return state.view === action.payload
        ? state
        : { ...state, view: action.payload };

    case "SET_FILTER":
      return { ...state, filter: action.payload };

    case "SET_PM_FILTER":
      return { ...state, pmFilter: action.payload };

    case "SET_TYPE_FILTER":
      return { ...state, typeFilter: action.payload };

    case "SET_YEAR_FILTER":
      return { ...state, yearFilter: action.payload };

    case "SET_GRAN":
      return { ...state, gran: action.payload };

    case "SET_DRILL_JOB":
      return { ...state, drillJob: action.payload };

    case "TOGGLE_PANEL":
      return {
        ...state,
        open: { ...state.open, [action.payload]: !state.open[action.payload] },
      };

    case "SET_PANEL":
      return {
        ...state,
        open: { ...state.open, [action.payload.key]: action.payload.value },
      };

    case "SET_SEARCH":
      return { ...state, search: action.payload };

    case "SET_SORT_KEY":
      return { ...state, sortKey: action.payload };

    case "TOGGLE_SHOW_NUMBERS":
      return { ...state, showNumbers: !state.showNumbers };

    case "SET_TAB":
      return { ...state, tab: action.payload };

    case "SET_LIST_SEARCH":
      return { ...state, listSearch: action.payload };

    case "SET_PROFIT_FILTER":
      return { ...state, profitFilter: action.payload };

    case "SET_LIST_SORT":
      return { ...state, listSort: action.payload };

    case "SET_CAP_ROLE":
      return { ...state, capRole: action.payload };

    case "TOGGLE_CAP_EXPANDED": {
      const isExpanded = state.capExpanded.includes(action.payload);
      return {
        ...state,
        capExpanded: isExpanded
          ? state.capExpanded.filter((name) => name !== action.payload)
          : [...state.capExpanded, action.payload],
      };
    }

    case "RESET_FILTERS":
      return {
        ...state,
        ...DEFAULT_FILTERS,
      };

    case "RESET_UI":
      return {
        ...state,
        ...DEFAULT_UI,
        capExpanded: [...DEFAULT_UI.capExpanded],
        open: { ...DEFAULT_UI.open },
      };

    case "LOAD_PRESET":
      return mergeDashboardState({ ...state, ...action.payload });

    default: {
      // Exhaustiveness guard: every action variant is handled above.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
