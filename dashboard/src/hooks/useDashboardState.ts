// useDashboardState.ts
import { useMemo, useReducer } from "react";
import {
  dashboardReducer,
  mergeDashboardState,
  type DashboardState,
} from "./dashboardState";

export function useDashboardState(initial?: Partial<DashboardState>) {
  const [state, dispatch] = useReducer(
    dashboardReducer,
    initial,
    mergeDashboardState
  );

  const actions = useMemo(
    () => ({
      setView: (view: DashboardState["view"]) =>
        dispatch({ type: "SET_VIEW", payload: view }),

      setFilter: (filter: DashboardState["filter"]) =>
        dispatch({ type: "SET_FILTER", payload: filter }),

      setPmFilter: (pmFilter: string) =>
        dispatch({ type: "SET_PM_FILTER", payload: pmFilter }),

      setTypeFilter: (typeFilter: DashboardState["typeFilter"]) =>
        dispatch({ type: "SET_TYPE_FILTER", payload: typeFilter }),

      setYearFilter: (year: string) =>
        dispatch({ type: "SET_YEAR_FILTER", payload: year }),

      setGran: (gran: DashboardState["gran"]) =>
        dispatch({ type: "SET_GRAN", payload: gran }),

      setDrillJob: (job: string | null) =>
        dispatch({ type: "SET_DRILL_JOB", payload: job }),

      togglePanel: (key: keyof DashboardState["open"]) =>
        dispatch({ type: "TOGGLE_PANEL", payload: key }),

      setSearch: (search: string) =>
        dispatch({ type: "SET_SEARCH", payload: search }),

      setSortKey: (sortKey: string) =>
        dispatch({ type: "SET_SORT_KEY", payload: sortKey }),

      toggleShowNumbers: () =>
        dispatch({ type: "TOGGLE_SHOW_NUMBERS" }),

      setTab: (tab: DashboardState["tab"]) =>
        dispatch({ type: "SET_TAB", payload: tab }),

      setListSearch: (search: string) =>
        dispatch({ type: "SET_LIST_SEARCH", payload: search }),

      setProfitFilter: (profitFilter: DashboardState["profitFilter"]) =>
        dispatch({ type: "SET_PROFIT_FILTER", payload: profitFilter }),

      setListSort: (sort: string) =>
        dispatch({ type: "SET_LIST_SORT", payload: sort }),

      setCapRole: (role: DashboardState["capRole"]) =>
        dispatch({ type: "SET_CAP_ROLE", payload: role }),

      toggleCapExpanded: (name: string) =>
        dispatch({ type: "TOGGLE_CAP_EXPANDED", payload: name }),

      resetFilters: () =>
        dispatch({ type: "RESET_FILTERS" }),

      resetUI: () =>
        dispatch({ type: "RESET_UI" }),

      loadPreset: (preset: Partial<DashboardState>) =>
        dispatch({ type: "LOAD_PRESET", payload: preset }),
    }),
    []
  );

  return { state, dispatch, actions };
}

export type UseDashboardState = ReturnType<typeof useDashboardState>;
export type DashboardActions = UseDashboardState["actions"];
