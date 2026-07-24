export type Tab = {
  id: string;
  name: string;
  code: string;
};

export type AppState = {
  activeId: string;
  tabs: Tab[];
};

export type PauseController = {
  continue: () => void;
  stop: () => void;
  evalInFrame: (expr: string) => unknown;
};
