import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, ref } from "lit/directives/ref.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { escapeHtml, formatValue, showStatus } from "../lib/html";
import type { PauseInfo } from "../lib/run";

@customElement("pg-output-pane")
export class PgOutputPane extends LitElement {
  @property({ type: String }) outputHtml = `<span class="empty">Hit Run to see console output and return values. Use <code>debugger</code> to pause.</span>`;

  @state() private paused = false;
  @state() private pauseLine = "?";
  @state() private scopeEntries: [string, unknown][] = [];
  @state() private evalResultHtml = "";

  private runStatusRef = createRef<HTMLSpanElement>();
  private evalInputRef = createRef<HTMLInputElement>();
  private evalInFrame: ((expr: string) => unknown) | null = null;

  createRenderRoot() {
    return this;
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    );
  }

  render() {
    return html`
      <section class="pane">
        <div class="pane-label">
          Output
          <span ${ref(this.runStatusRef)} class="status"></span>
        </div>
        <div id="right-body">
          <pre id="output">${unsafeHTML(this.outputHtml)}</pre>
          <div id="debug-panel" class=${this.paused ? "open" : ""}>
            <div class="debug-title">
              Paused at line <span>${this.pauseLine}</span>
            </div>
            <div class="debug-actions">
              <button
                class="warn"
                type="button"
                @click=${() => this.emit("debug-continue")}
              >
                Continue
              </button>
              <button
                class="ghost"
                type="button"
                @click=${() => this.emit("debug-stop")}
              >
                Stop
              </button>
            </div>
            <table class="scope-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                ${!this.scopeEntries.length
                  ? html`<tr>
                      <td colspan="2" style="color:var(--muted)">
                        No locals in scope
                      </td>
                    </tr>`
                  : this.scopeEntries.map(
                      ([name, value]) => html`
                        <tr>
                          <th>${name}</th>
                          <td>${formatValue(value)}</td>
                        </tr>
                      `
                    )}
              </tbody>
            </table>
            <div class="eval-row">
              <input
                ${ref(this.evalInputRef)}
                type="text"
                placeholder="Evaluate expression…"
                spellcheck="false"
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    this.runEval();
                  }
                }}
              />
              <button class="ghost" type="button" @click=${() => this.runEval()}>
                Eval
              </button>
            </div>
            <pre id="eval-result">${unsafeHTML(this.evalResultHtml)}</pre>
          </div>
        </div>
      </section>
    `;
  }

  setOutput(parts: string[]): void {
    this.outputHtml = parts.join("\n");
  }

  setOutputHtml(html: string): void {
    this.outputHtml = html;
  }

  showPaused(info: PauseInfo): void {
    this.paused = true;
    this.pauseLine = String(info.line);
    this.scopeEntries = Object.entries(info.scope || {});
    this.evalInFrame = info.evalInFrame;
    this.evalResultHtml = "";
    showStatus(
      this.runStatusRef.value,
      `Paused · line ${info.line}`,
      "paused"
    );
    queueMicrotask(() => this.evalInputRef.value?.focus());
  }

  hideDebug(): void {
    this.paused = false;
    this.pauseLine = "?";
    this.scopeEntries = [];
    this.evalInFrame = null;
    this.evalResultHtml = "";
    const el = this.runStatusRef.value;
    if (el) el.classList.remove("show", "paused");
    if (this.evalInputRef.value) {
      (this.evalInputRef.value as HTMLInputElement).value = "";
    }
  }

  private runEval() {
    if (!this.evalInFrame) return;
    const expr = this.evalInputRef.value?.value.trim() ?? "";
    if (!expr) return;
    try {
      const value = this.evalInFrame(expr);
      this.evalResultHtml = `<span class="ret">${escapeHtml(formatValue(value))}</span>`;
    } catch (err) {
      const message =
        err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      this.evalResultHtml = `<span class="err">${escapeHtml(message)}</span>`;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pg-output-pane": PgOutputPane;
  }
}
