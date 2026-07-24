import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { mountPlayground } from "./playground";

const SHELL = `
<header>
  <h1>JS Playground</h1>
  <select id="examples" aria-label="Examples">
    <option value="blank">Blank</option>
    <option value="debug">Debugger</option>
    <option value="fib">Fibonacci</option>
    <option value="async">Async / await</option>
    <option value="map">Filter + map</option>
  </select>
  <span class="spacer"></span>
  <span class="hints">
    <span>Format <kbd>⌘</kbd><kbd>S</kbd></span>
    <span>Move line <kbd>⌘</kbd><kbd>↑</kbd><kbd>↓</kbd></span>
    <span>Duplicate <kbd>⌥</kbd><kbd>⇧</kbd><kbd>↓</kbd></span>
    <span>Run <kbd>⌘</kbd><kbd>Enter</kbd></span>
  </span>
  <button class="ghost" id="format" type="button">Format</button>
  <button class="ghost" id="clear" type="button">Clear</button>
  <button class="primary" id="run" type="button">Run</button>
</header>

<div id="tab-bar">
  <div id="tabs" role="tablist" aria-label="Code tabs" title="Click empty space to new tab"></div>
  <button type="button" id="new-tab" title="New tab">+</button>
</div>

<main>
  <section class="pane">
    <div class="pane-label">
      Editor · JavaScript
      <span id="db-status" class="status"></span>
      <span id="format-status" class="status"></span>
    </div>
    <div id="editor-host">
      <textarea id="editor-fallback" spellcheck="false"></textarea>
    </div>
  </section>
  <section class="pane">
    <div class="pane-label">
      Output
      <span id="run-status" class="status"></span>
    </div>
    <div id="right-body">
      <pre id="output"><span class="empty">Hit Run to see console output and return values. Use <code>debugger</code> to pause.</span></pre>
      <div id="debug-panel">
        <div class="debug-title">
          Paused at line <span id="debug-line">?</span>
        </div>
        <div class="debug-actions">
          <button class="warn" id="debug-continue" type="button">Continue</button>
          <button class="ghost" id="debug-stop" type="button">Stop</button>
        </div>
        <table class="scope-table">
          <thead><tr><th>Name</th><th>Value</th></tr></thead>
          <tbody id="scope-body"></tbody>
        </table>
        <div class="eval-row">
          <input id="eval-input" type="text" placeholder="Evaluate expression…" spellcheck="false" />
          <button class="ghost" id="eval-run" type="button">Eval</button>
        </div>
        <pre id="eval-result"></pre>
      </div>
    </div>
  </section>
</main>
`;

@customElement("js-playground")
export class JsPlayground extends LitElement {
  private mounted = false;

  /** Light DOM so CodeMirror + global CSS work without shadow piercing. */
  createRenderRoot() {
    return this;
  }

  render() {
    return html`${unsafeHTML(SHELL)}`;
  }

  protected firstUpdated(): void {
    if (this.mounted) return;
    this.mounted = true;
    void mountPlayground(this);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "js-playground": JsPlayground;
  }
}
