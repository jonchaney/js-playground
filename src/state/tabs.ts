import { EXAMPLES } from "../examples";
import type { AppState, ClosedTab, Tab } from "../types";

export const CLOSED_LIMIT = 50;
const CLOSED_KEY = "playground-closed-tabs";

export const EXAMPLE_LABELS: Record<string, string> = {
  blank: "Blank",
  debug: "Debugger",
  fib: "Fibonacci",
  async: "Async / await",
  map: "Filter + map",
  anagram: "Valid Anagram",
};

export const EXAMPLE_TAB_NAMES: Record<string, string> = {
  anagram: "Valid Anagram",
  debug: "Debugger",
  fib: "Fibonacci",
  async: "Async / await",
  map: "Filter + map",
  blank: "Untitled",
};

export function uid(): string {
  return "tab_" + Math.random().toString(36).slice(2, 10);
}

export function defaultTab(code?: string): Tab {
  return { id: uid(), name: "Untitled", code: code ?? EXAMPLES.blank };
}

export function isPristineUntitled(tab: Tab | null | undefined): boolean {
  if (!tab) return true;
  const name = (tab.name || "").trim() || "Untitled";
  if (name !== "Untitled") return false;
  return String(tab.code ?? "") === EXAMPLES.blank;
}

export function normalizeClosedTabs(raw: unknown): ClosedTab[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (t): t is ClosedTab =>
        !!t &&
        typeof t.id === "string" &&
        typeof t.name === "string" &&
        typeof t.code === "string"
    )
    .map((t) => ({
      id: t.id,
      name: t.name?.trim() ? t.name : "Untitled",
      code: t.code,
      closedAt: Number(t.closedAt) || Date.now(),
    }))
    .slice(0, CLOSED_LIMIT);
}

export function readLocalClosedTabs(): ClosedTab[] {
  try {
    const raw = localStorage.getItem(CLOSED_KEY);
    if (!raw) return [];
    return normalizeClosedTabs(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function clearLocalClosedTabs(): void {
  try {
    localStorage.removeItem(CLOSED_KEY);
  } catch {
    /* ignore */
  }
}

export function normalizeState(parsed: Partial<AppState> | null | undefined): AppState {
  const closed = normalizeClosedTabs(parsed?.closedTabs);
  if (!parsed?.tabs?.length) {
    return { activeId: "", tabs: [], closedTabs: closed };
  }
  return {
    activeId: parsed.activeId || parsed.tabs[0].id,
    tabs: parsed.tabs.map((t) => ({
      id: t.id || uid(),
      name: t.name?.trim() ? t.name : "Untitled",
      code: typeof t.code === "string" ? t.code : EXAMPLES.blank,
    })),
    closedTabs: closed,
  };
}

export function previewCode(code: string): string {
  return String(code || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function filterClosedTabs(
  closedTabs: ClosedTab[],
  query: string
): ClosedTab[] {
  const q = query.trim().toLowerCase();
  if (!q) return closedTabs.slice(0, 12);
  return closedTabs
    .filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)
    )
    .slice(0, 12);
}

export function archiveClosedTab(
  closedTabs: ClosedTab[],
  tab: Pick<Tab, "name" | "code"> | null | undefined
): ClosedTab[] {
  if (!tab || isPristineUntitled(tab as Tab)) return closedTabs;
  const code = typeof tab.code === "string" ? tab.code : "";
  const name = (tab.name || "Untitled").trim() || "Untitled";
  const entry: ClosedTab = {
    id: uid(),
    name,
    code,
    closedAt: Date.now(),
  };
  return [
    entry,
    ...closedTabs.filter((t) => !(t.name === entry.name && t.code === entry.code)),
  ].slice(0, CLOSED_LIMIT);
}
