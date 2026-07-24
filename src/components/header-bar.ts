import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { EXAMPLES } from "../examples";
import { EXAMPLE_LABELS, filterClosedTabs, previewCode } from "../state/tabs";
import type { ClosedTab } from "../types";

@customElement("pg-header")
export class PgHeader extends LitElement {
  @property({ type: Array }) closedTabs: ClosedTab[] = [];
  @property({ type: Boolean }) running = false;
  @property({ type: String }) closedPlaceholder = "Reopen closed tab…";
  @property({ type: String }) exampleKey = "blank";

  @state() private closedQuery = "";
  @state() private closedOpen = false;
  @state() private closedActiveIndex = 0;

  createRenderRoot() {
    return this;
  }

  private closedMatches() {
    return filterClosedTabs(this.closedTabs, this.closedQuery);
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    );
  }

  render() {
    const matches = this.closedMatches();
    return html`
      <header>
        <h1>JS Playground</h1>
        <select
          aria-label="Examples"
          .value=${this.exampleKey}
          @change=${(e: Event) => {
            const key = (e.target as HTMLSelectElement).value;
            this.exampleKey = key;
            this.emit("example-change", { key });
          }}
        >
          ${Object.keys(EXAMPLES).map(
            (key) => html`
              <option value=${key}>${EXAMPLE_LABELS[key] || key}</option>
            `
          )}
        </select>
        <div class="closed-search-wrap">
          <input
            type="search"
            placeholder=${this.closedPlaceholder}
            autocomplete="off"
            spellcheck="false"
            aria-label="Search closed tabs"
            aria-autocomplete="list"
            .value=${this.closedQuery}
            @focus=${() => {
              this.closedOpen = true;
              this.closedActiveIndex = 0;
            }}
            @input=${(e: Event) => {
              this.closedQuery = (e.target as HTMLInputElement).value;
              this.closedOpen = true;
              this.closedActiveIndex = 0;
            }}
            @keydown=${(e: KeyboardEvent) => this.onClosedKeydown(e)}
            @blur=${() => {
              setTimeout(() => {
                this.closedOpen = false;
              }, 120);
            }}
          />
          ${this.closedOpen
            ? html`
                <ul id="closed-results" role="listbox">
                  ${!matches.length
                    ? html`<li class="closed-empty">
                        ${this.closedTabs.length
                          ? "No matching closed tabs"
                          : "No closed tabs yet"}
                      </li>`
                    : matches.map(
                        (tab, i) => html`
                          <li
                            role="option"
                            aria-selected=${i === this.closedActiveIndex
                              ? "true"
                              : "false"}
                            @mousedown=${(e: Event) => {
                              e.preventDefault();
                              this.pickClosed(tab.id);
                            }}
                          >
                            <span class="closed-name">${tab.name}</span>
                            <span class="closed-preview"
                              >${previewCode(tab.code) || "(empty)"}</span
                            >
                          </li>
                        `
                      )}
                </ul>
              `
            : null}
        </div>
        <span class="spacer"></span>
        <span class="hints">
          <span>Format <kbd>⌘</kbd><kbd>S</kbd></span>
          <span>Move line <kbd>⌘</kbd><kbd>↑</kbd><kbd>↓</kbd></span>
          <span>Duplicate <kbd>⌥</kbd><kbd>⇧</kbd><kbd>↓</kbd></span>
          <span>Run <kbd>⌘</kbd><kbd>Enter</kbd></span>
        </span>
        <button class="ghost" type="button" @click=${() => this.emit("format")}>
          Format
        </button>
        <button class="ghost" type="button" @click=${() => this.emit("clear")}>
          Clear
        </button>
        <button
          class=${this.running ? "warn" : "primary"}
          type="button"
          @click=${() => this.emit("run")}
        >
          ${this.running ? "Stop" : "Run"}
        </button>
      </header>
    `;
  }

  private onClosedKeydown(e: KeyboardEvent) {
    const matches = this.closedMatches();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!matches.length) return;
      this.closedActiveIndex = (this.closedActiveIndex + 1) % matches.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!matches.length) return;
      this.closedActiveIndex =
        (this.closedActiveIndex - 1 + matches.length) % matches.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!matches.length) return;
      const pick =
        matches[Math.min(this.closedActiveIndex, matches.length - 1)];
      this.pickClosed(pick.id);
    } else if (e.key === "Escape") {
      this.closedOpen = false;
      (e.target as HTMLInputElement).blur();
    }
  }

  private pickClosed(id: string) {
    this.emit("reopen-closed", { id });
    this.closedQuery = "";
    this.closedOpen = false;
    this.closedPlaceholder = "Reopen closed tab…";
  }

  resetExampleBlank() {
    this.exampleKey = "blank";
  }

  setClosedPlaceholder(text: string) {
    this.closedPlaceholder = text;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pg-header": PgHeader;
  }
}
