export type Tab = {
  id: string;
  name: string;
  code: string;
};

export type ClosedTab = Tab & {
  closedAt: number;
};

export type AppState = {
  activeId: string;
  tabs: Tab[];
  closedTabs: ClosedTab[];
};

export type PauseController = {
  continue: () => void;
  stop: () => void;
  evalInFrame: (expr: string) => unknown;
};
