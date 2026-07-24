import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, ref } from "lit/directives/ref.js";
import type { Tab } from "../types";

@customElement("pg-tab-bar")
export class PgTabBar extends LitElement {
  @property({ type: Array }) tabs: Tab[] = [];
  @property({ type: String }) activeId = "";

  @state() private renamingId: string | null = null;
  private renameIgnoreBlur = false;
  private dragTabId: string | null = null;
  private renameInputRef = createRef<HTMLInputElement>();

  createRenderRoot() {
    return this;
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    );
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("renamingId") && this.renamingId) {
      queueMicrotask(() => {
        const input = this.renameInputRef.value;
        if (input) {
          input.focus();
          input.select();
        }
      });
    }
  }

  render() {
    return html`
      <div id="tab-bar">
        <div
          id="tabs"
          role="tablist"
          aria-label="Code tabs"
          title="Click empty space to new tab"
          @click=${(e: Event) => {
            if (e.target === e.currentTarget) this.emit("new-tab");
          }}
        >
          ${this.tabs.map((tab) => this.renderTab(tab))}
        </div>
        <button
          type="button"
          id="new-tab"
          title="New tab"
          @click=${() => this.emit("new-tab")}
        >
          +
        </button>
      </div>
    `;
  }

  private renderTab(tab: Tab) {
    const active = tab.id === this.activeId;
    const renaming = this.renamingId === tab.id;

    return html`
      <div
        class="tab ${active ? "active" : ""}"
        role="tab"
        aria-selected=${active ? "true" : "false"}
        data-id=${tab.id}
        draggable=${!renaming}
        @click=${() => {
          if (tab.id !== this.activeId) this.emit("switch-tab", { id: tab.id });
        }}
        @dragstart=${(e: DragEvent) => this.onDragStart(e, tab)}
        @dragend=${(e: DragEvent) => this.onDragEnd(e)}
        @dragover=${(e: DragEvent) => this.onDragOver(e, tab)}
        @dragleave=${(e: DragEvent) => {
          (e.currentTarget as HTMLElement).classList.remove(
            "drag-before",
            "drag-after"
          );
        }}
        @drop=${(e: DragEvent) => this.onDrop(e, tab)}
      >
        ${renaming
          ? html`
              <input
                ${ref(this.renameInputRef)}
                class="tab-name-input"
                .value=${tab.name}
                aria-label="Rename tab"
                @click=${(e: Event) => e.stopPropagation()}
                @keydown=${(e: KeyboardEvent) => this.onRenameKey(e, tab)}
                @blur=${(e: Event) => this.onRenameBlur(e, tab)}
              />
            `
          : html`
              <span
                class="tab-name"
                title="Double-click to rename · drag to reorder"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  if (tab.id !== this.activeId) {
                    this.emit("switch-tab", { id: tab.id });
                  }
                }}
                @dblclick=${(e: Event) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (tab.id !== this.activeId) {
                    this.emit("switch-tab", { id: tab.id });
                  }
                  this.renamingId = tab.id;
                }}
                >${tab.name}</span
              >
            `}
        <button
          type="button"
          class="tab-close"
          title="Close tab"
          aria-label="Close tab"
          @mousedown=${(e: Event) => e.stopPropagation()}
          @click=${(e: Event) => {
            e.stopPropagation();
            this.emit("close-tab", { id: tab.id });
          }}
        >
          ×
        </button>
      </div>
    `;
  }

  private onRenameKey(e: KeyboardEvent, tab: Tab) {
    const input = e.target as HTMLInputElement;
    if (e.key === "Enter") {
      e.preventDefault();
      this.commitRename(tab.id, input.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.renameIgnoreBlur = true;
      this.renamingId = null;
    }
  }

  private onRenameBlur(e: Event, tab: Tab) {
    if (this.renameIgnoreBlur) {
      this.renameIgnoreBlur = false;
      return;
    }
    this.commitRename(tab.id, (e.target as HTMLInputElement).value);
  }

  private commitRename(id: string, value: string) {
    this.renamingId = null;
    this.emit("rename-tab", { id, name: value });
  }

  private onDragStart(e: DragEvent, tab: Tab) {
    if (this.renamingId === tab.id) {
      e.preventDefault();
      return;
    }
    this.dragTabId = tab.id;
    (e.currentTarget as HTMLElement).classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tab.id);
    }
  }

  private onDragEnd(e: DragEvent) {
    this.dragTabId = null;
    (e.currentTarget as HTMLElement).classList.remove("dragging");
    this.querySelectorAll(".tab.drag-before, .tab.drag-after").forEach((node) =>
      node.classList.remove("drag-before", "drag-after")
    );
  }

  private onDragOver(e: DragEvent, tab: Tab) {
    if (!this.dragTabId || this.dragTabId === tab.id) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const after = e.clientX > rect.left + rect.width / 2;
    el.classList.toggle("drag-after", after);
    el.classList.toggle("drag-before", !after);
    this.querySelectorAll(".tab").forEach((node) => {
      if (node !== el) node.classList.remove("drag-before", "drag-after");
    });
  }

  private onDrop(e: DragEvent, tab: Tab) {
    e.preventDefault();
    const fromId =
      this.dragTabId || e.dataTransfer?.getData("text/plain") || "";
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const placeAfter = e.clientX > rect.left + rect.width / 2;
    el.classList.remove("drag-before", "drag-after");
    this.emit("reorder-tabs", { fromId, toId: tab.id, placeAfter });
  }

  clearRenaming() {
    this.renamingId = null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pg-tab-bar": PgTabBar;
  }
}
