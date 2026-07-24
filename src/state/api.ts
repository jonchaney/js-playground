import type { AppState, ClosedTab, Tab } from "../types";
import {
  clearLocalClosedTabs,
  CLOSED_LIMIT,
  normalizeState,
  readLocalClosedTabs,
} from "./tabs";

export type SavePayload = {
  activeId: string;
  tabs: Tab[];
  closedTabs: ClosedTab[];
};

export function buildSavePayload(
  activeId: string,
  tabs: Tab[],
  closedTabs: ClosedTab[]
): SavePayload {
  const tabsToSave = tabs.map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
  }));
  const activeSaved =
    tabsToSave.find((t) => t.id === activeId) || tabsToSave[0];
  return {
    activeId: activeSaved ? activeSaved.id : "",
    tabs: tabsToSave,
    closedTabs: closedTabs.map((t) => ({
      id: t.id,
      name: t.name,
      code: t.code,
      closedAt: t.closedAt,
    })),
  };
}

export async function putState(
  payload: SavePayload,
  opts: { keepalive?: boolean } = {}
): Promise<void> {
  const res = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: opts.keepalive === true,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error || `Save failed (${res.status})`
    );
  }
}

export type LoadedState = AppState & { migratedClosed: boolean };

export async function loadStateFromApi(): Promise<LoadedState> {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`Load failed (${res.status})`);
  const data = await res.json();
  const normalized = normalizeState(data);

  const localClosed = readLocalClosedTabs();
  let migratedClosed = false;
  if (localClosed.length) {
    const seen = new Set(
      normalized.closedTabs.map((t) => `${t.name}\0${t.code}`)
    );
    for (const t of localClosed) {
      const key = `${t.name}\0${t.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.closedTabs.push(t);
    }
    normalized.closedTabs = normalized.closedTabs.slice(0, CLOSED_LIMIT);
    clearLocalClosedTabs();
    migratedClosed = true;
  }

  return { ...normalized, migratedClosed };
}

export type StatusKind = "ok" | "err" | "paused" | "";

export class Persistence {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveInFlight: Promise<void> | null = null;
  private savePending = false;

  constructor(
    private getPayload: () => SavePayload,
    private onStatus: (message: string, kind: StatusKind) => void,
    private beforeFlush?: () => void
  ) {}

  save(opts: { immediate?: boolean } = {}): Promise<void> | void {
    const immediate = opts.immediate === true;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (immediate) return this.saveNow();
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveNow();
    }, 400);
  }

  async saveNow(): Promise<void> {
    this.savePending = true;
    if (this.saveInFlight) return this.saveInFlight;

    this.saveInFlight = (async () => {
      while (this.savePending) {
        this.savePending = false;
        try {
          await putState(this.getPayload());
          this.onStatus("Saved to DB", "ok");
        } catch (err) {
          console.error(err);
          const message =
            err instanceof Error ? err.message : "Save failed";
          this.onStatus(message, "err");
        }
      }
    })().finally(() => {
      this.saveInFlight = null;
    });

    return this.saveInFlight;
  }

  flushOnUnload(): void {
    this.beforeFlush?.();
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      void putState(this.getPayload(), { keepalive: true });
    } catch {
      /* ignore */
    }
  }
}
