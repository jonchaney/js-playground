import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { createRef, ref } from "lit/directives/ref.js";
import { EXAMPLES } from "./examples";
import type { PgEditorPane } from "./components/editor-pane";
import type { PgHeader } from "./components/header-bar";
import type { PgOutputPane } from "./components/output-pane";
import type { PgTabBar } from "./components/tab-bar";
import "./components/header-bar";
import "./components/tab-bar";
import "./components/editor-pane";
import "./components/output-pane";
import { RunSession, type PauseInfo } from "./lib/run";
import {
  buildSavePayload,
  loadStateFromApi,
  Persistence,
  type StatusKind,
} from "./state/api";
import {
  archiveClosedTab,
  defaultTab,
  EXAMPLE_TAB_NAMES,
  readLocalClosedTabs,
  uid,
} from "./state/tabs";
import type { ClosedTab, Tab } from "./types";

@customElement("js-playground")
export class JsPlayground extends LitElement {
  @state() private tabs: Tab[] = [];
  @state() private activeId = "";
  @state() private closedTabs: ClosedTab[] = [];
  @state() private running = false;
  @state() private workspaceEmpty = true;

  private headerRef = createRef<PgHeader>();
  private tabBarRef = createRef<PgTabBar>();
  private editorRef = createRef<PgEditorPane>();
  private outputRef = createRef<PgOutputPane>();

  private persistence: Persistence | null = null;
  private runSession = new RunSession();
  private bootstrapped = false;

  /** Light DOM so CodeMirror + global CSS work without shadow piercing. */
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <pg-header
        ${ref(this.headerRef)}
        .closedTabs=${this.closedTabs}
        .running=${this.running}
        @example-change=${this.onExampleChange}
        @format=${() => void this.editorRef.value?.formatCode()}
        @clear=${this.onClear}
        @run=${() => void this.onRun()}
        @reopen-closed=${this.onReopenClosed}
      ></pg-header>

      <pg-tab-bar
        ${ref(this.tabBarRef)}
        .tabs=${this.tabs}
        .activeId=${this.activeId}
        @new-tab=${this.onAddTab}
        @switch-tab=${(e: CustomEvent<{ id: string }>) =>
          this.onSwitchTab(e.detail.id)}
        @close-tab=${(e: CustomEvent<{ id: string }>) =>
          this.onCloseTab(e.detail.id)}
        @rename-tab=${(e: CustomEvent<{ id: string; name: string }>) =>
          this.onRenameTab(e.detail.id, e.detail.name)}
        @reorder-tabs=${(
          e: CustomEvent<{ fromId: string; toId: string; placeAfter: boolean }>
        ) =>
          this.onReorderTabs(
            e.detail.fromId,
            e.detail.toId,
            e.detail.placeAfter
          )}
      ></pg-tab-bar>

      <main>
        <pg-editor-pane
          ${ref(this.editorRef)}
          .empty=${this.workspaceEmpty}
          @code-change=${this.onCodeChange}
          @run=${() => void this.onRun()}
          @delete-tab=${this.onDeleteTab}
        ></pg-editor-pane>
        <pg-output-pane ${ref(this.outputRef)}></pg-output-pane>
      </main>
    `;
  }

  protected firstUpdated(): void {
    if (this.bootstrapped) return;
    this.bootstrapped = true;

    this.persistence = new Persistence(
      () => buildSavePayload(this.activeId, this.tabs, this.closedTabs),
      (message, kind) => this.setDbStatus(message, kind),
      () => this.persistEditorToActive()
    );

    window.addEventListener("beforeunload", () =>
      this.persistence?.flushOnUnload()
    );
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.persistence?.flushOnUnload();
      }
    });

    void this.bootstrap();
  }

  private activeTab(): Tab | null {
    if (!this.tabs.length) return null;
    return this.tabs.find((t) => t.id === this.activeId) || this.tabs[0];
  }

  private setDbStatus(message: string, kind: StatusKind): void {
    this.editorRef.value?.setDbStatusMessage(message, kind);
  }

  private save(opts: { immediate?: boolean } = {}): void {
    this.persistence?.save(opts);
  }

  private persistEditorToActive(): void {
    const tab = this.activeTab();
    const editor = this.editorRef.value;
    if (!tab || !editor) return;
    tab.code = editor.getCode();
  }

  private setWorkspaceEmpty(): void {
    this.activeId = "";
    this.workspaceEmpty = true;
    this.tabBarRef.value?.clearRenaming();
    this.editorRef.value?.setCode("", { silent: true });
    this.outputRef.value?.setOutputHtml(
      `<span class="empty">No open tabs. Click <strong>+</strong> or the tab bar to create one.</span>`
    );
  }

  private setWorkspaceActive(): void {
    this.workspaceEmpty = false;
  }

  private cancelActiveRun(): void {
    this.runSession.cancel();
  }

  private async bootstrap(): Promise<void> {
    // Wait a tick so child firstUpdated (editor init) can run.
    await this.updateComplete;
    await Promise.resolve();

    try {
      this.setDbStatus("Loading from DB…", "paused");
      const loaded = await loadStateFromApi();
      this.tabs = loaded.tabs;
      this.activeId = loaded.activeId;
      this.closedTabs = loaded.closedTabs || [];
      this.setDbStatus("Loaded from DB", "ok");
      if (loaded.migratedClosed) this.save({ immediate: true });
    } catch (err) {
      console.error(err);
      this.setDbStatus("DB unavailable", "err");
      this.closedTabs = readLocalClosedTabs();
      if (!this.tabs.length) {
        const tab = defaultTab();
        this.tabs = [tab];
        this.activeId = tab.id;
      }
    }

    const active = this.activeTab();
    if (!this.tabs.length) {
      this.setWorkspaceEmpty();
    } else {
      this.setWorkspaceActive();
      this.editorRef.value?.setCode(active?.code ?? "", { silent: true });
      this.editorRef.value?.focusEditor();
    }
  }

  private onCodeChange = (e: CustomEvent<{ code: string }>) => {
    const tab = this.activeTab();
    if (!tab) return;
    tab.code = e.detail.code;
    this.save();
  };

  private onSwitchTab = (id: string) => {
    this.cancelActiveRun();
    this.persistEditorToActive();
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    this.activeId = id;
    this.tabBarRef.value?.clearRenaming();
    this.editorRef.value?.setCode(tab.code, { silent: true });
    this.save({ immediate: true });
    this.editorRef.value?.focusEditor();
  };

  private onAddTab = () => {
    this.persistEditorToActive();
    const tab = defaultTab(EXAMPLES.blank);
    this.tabs = [...this.tabs, tab];
    this.activeId = tab.id;
    this.tabBarRef.value?.clearRenaming();
    this.setWorkspaceActive();
    this.editorRef.value?.setCode(tab.code, { silent: true });
    this.save({ immediate: true });
    this.editorRef.value?.focusEditor();
  };

  private onCloseTab = (id: string) => {
    this.persistEditorToActive();
    if (this.activeId === id) this.cancelActiveRun();

    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const removed = this.tabs[idx];
    const snapshot = {
      id: removed.id,
      name: removed.name,
      code:
        removed.id === this.activeId
          ? (this.editorRef.value?.getCode() ?? removed.code)
          : removed.code,
    };
    const nextTabs = this.tabs.slice();
    nextTabs.splice(idx, 1);
    this.tabs = nextTabs;
    this.closedTabs = archiveClosedTab(this.closedTabs, snapshot);
    if (snapshot.name && !this.isPristine(snapshot)) {
      this.headerRef.value?.setClosedPlaceholder(
        `Reopen “${snapshot.name}”…`
      );
      this.setDbStatus(`Closed — reopen “${snapshot.name}”`, "ok");
    }

    if (!this.tabs.length) {
      this.setWorkspaceEmpty();
    } else if (this.activeId === id) {
      const next = this.tabs[Math.max(0, idx - 1)];
      this.activeId = next.id;
      this.setWorkspaceActive();
      this.editorRef.value?.setCode(next.code, { silent: true });
    }
    this.save({ immediate: true });
  };

  private isPristine(tab: Pick<Tab, "name" | "code">): boolean {
    const name = (tab.name || "").trim() || "Untitled";
    if (name !== "Untitled") return false;
    return String(tab.code ?? "") === EXAMPLES.blank;
  }

  private onRenameTab = (id: string, value: string) => {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    if (id === this.activeId) this.persistEditorToActive();
    const next = value.trim() || "Untitled";
    tab.name = next;
    this.tabs = [...this.tabs];
    this.save({ immediate: true });
    if (next !== "Untitled") {
      this.setDbStatus(`Saved “${next}” to DB`, "ok");
    }
  };

  private onReorderTabs = (
    fromId: string,
    toId: string,
    placeAfter: boolean
  ) => {
    if (!fromId || !toId || fromId === toId) return;
    const next = this.tabs.slice();
    const from = next.findIndex((t) => t.id === fromId);
    let to = next.findIndex((t) => t.id === toId);
    if (from < 0 || to < 0) return;
    const [item] = next.splice(from, 1);
    if (from < to) to -= 1;
    const insertAt = placeAfter ? to + 1 : to;
    next.splice(insertAt, 0, item);
    this.tabs = next;
    this.save({ immediate: true });
  };

  private onDeleteTab = () => {
    this.cancelActiveRun();
    const tab = this.activeTab();
    if (!tab) return;
    const label = tab.name || "Untitled";
    const id = tab.id;
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const nextTabs = this.tabs.slice();
    nextTabs.splice(idx, 1);
    this.tabs = nextTabs;

    if (!this.tabs.length) {
      this.setWorkspaceEmpty();
    } else {
      const next = this.tabs[Math.max(0, idx - 1)];
      this.activeId = next.id;
      this.setWorkspaceActive();
      this.editorRef.value?.setCode(next.code, { silent: true });
      this.editorRef.value?.focusEditor();
    }
    this.save({ immediate: true });
    this.setDbStatus(`Deleted “${label}” from DB`, "ok");
  };

  private onReopenClosed = (e: CustomEvent<{ id: string }>) => {
    const idx = this.closedTabs.findIndex((t) => t.id === e.detail.id);
    if (idx < 0) return;
    const nextClosed = this.closedTabs.slice();
    const [item] = nextClosed.splice(idx, 1);
    this.closedTabs = nextClosed;
    this.persistEditorToActive();
    const tab: Tab = {
      id: uid(),
      name: item.name || "Untitled",
      code: item.code,
    };
    this.tabs = [...this.tabs, tab];
    this.activeId = tab.id;
    this.setWorkspaceActive();
    this.editorRef.value?.setCode(tab.code, { silent: true });
    this.save({ immediate: true });
    this.editorRef.value?.focusEditor();
  };

  private onExampleChange = (e: CustomEvent<{ key: string }>) => {
    const key = e.detail.key;
    if (!this.activeTab()) this.onAddTab();
    const code = EXAMPLES[key] || EXAMPLES.blank;
    this.editorRef.value?.setCode(code);
    const tab = this.activeTab();
    const name = EXAMPLE_TAB_NAMES[key];
    if (tab && name) {
      tab.name = name;
      this.tabs = [...this.tabs];
      this.save({ immediate: true });
    }
    this.editorRef.value?.focusEditor();
  };

  private onClear = () => {
    if (!this.activeTab()) return;
    this.cancelActiveRun();
    this.headerRef.value?.resetExampleBlank();
    this.editorRef.value?.setCode(EXAMPLES.blank);
    this.outputRef.value?.hideDebug();
    this.outputRef.value?.setOutputHtml(
      `<span class="empty">Hit Run to see console output and return values. Use <code>debugger</code> to pause. Functions from other tabs are available by name (or via <code>tabs["Tab Name"]</code>).</span>`
    );
    this.editorRef.value?.focusEditor();
  };

  private onPause = (info: PauseInfo) => {
    this.outputRef.value?.showPaused(info);
    this.editorRef.value?.highlightLine(info.line);
  };

  private hideDebugUi() {
    this.outputRef.value?.hideDebug();
    this.editorRef.value?.clearDebugHighlight();
  }

  private async onRun(): Promise<void> {
    if (!this.activeTab()) {
      this.outputRef.value?.setOutputHtml(
        `<span class="empty">No open tabs. Click <strong>+</strong> to create one.</span>`
      );
      return;
    }

    if (this.runSession.active) {
      this.runSession.cancel();
      return;
    }

    this.hideDebugUi();
    this.running = true;
    this.persistEditorToActive();
    const active = this.activeTab();
    const source = this.editorRef.value?.getCode() ?? "";
    const libs = this.tabs
      .filter((t) => t.id !== active?.id)
      .map((t) => ({ name: t.name, code: t.code }));

    try {
      const result = await this.runSession.run(source, this.onPause, libs);
      if (result.parts.length) {
        this.outputRef.value?.setOutput(result.parts);
      }
    } finally {
      this.running = false;
      this.hideDebugUi();
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener("debug-continue", this.onDebugContinue);
    this.addEventListener("debug-stop", this.onDebugStop);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("debug-continue", this.onDebugContinue);
    this.removeEventListener("debug-stop", this.onDebugStop);
  }

  private onDebugContinue = () => {
    this.hideDebugUi();
    this.runSession.pauseController?.continue();
  };

  private onDebugStop = () => {
    this.hideDebugUi();
    this.runSession.pauseController?.stop();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    "js-playground": JsPlayground;
  }
}
