import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { createRef, ref } from "lit/directives/ref.js";
import CodeMirror from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/material-darker.css";
import "codemirror/mode/javascript/javascript";
import "codemirror/addon/edit/closebrackets";
import "codemirror/addon/edit/matchbrackets";
import "codemirror/addon/comment/comment";
import { duplicateLines, moveLines } from "../lib/editor-keys";
import { formatSource } from "../lib/format";
import { showStatus } from "../lib/html";

@customElement("pg-editor-pane")
export class PgEditorPane extends LitElement {
  @property({ type: Boolean }) empty = false;
  @property({ type: String }) dbStatus = "";
  @property({ type: String }) dbStatusKind = "";

  private hostRef = createRef<HTMLDivElement>();
  private fallbackRef = createRef<HTMLTextAreaElement>();
  private formatStatusRef = createRef<HTMLSpanElement>();
  private dbStatusRef = createRef<HTMLSpanElement>();

  private cm: CodeMirror.Editor | null = null;
  private debugLineHandle: CodeMirror.LineHandle | null = null;
  private suppressPersist = false;
  private editorReady = false;

  createRenderRoot() {
    return this;
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true })
    );
  }

  firstUpdated() {
    this.initEditor("");
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("dbStatus") || changed.has("dbStatusKind")) {
      const el = this.dbStatusRef.value;
      if (el && this.dbStatus) {
        showStatus(el, this.dbStatus, this.dbStatusKind || undefined);
      }
    }
    if (this.cm) {
      this.cm.setOption("readOnly", this.empty ? "nocursor" : false);
    }
  }

  render() {
    return html`
      <section class="pane">
        <div class="pane-label">
          Editor · JavaScript
          <span ${ref(this.dbStatusRef)} class="status"></span>
          <span ${ref(this.formatStatusRef)} class="status"></span>
        </div>
        <div id="editor-host" ${ref(this.hostRef)}>
          <textarea
            id="editor-fallback"
            ${ref(this.fallbackRef)}
            spellcheck="false"
          ></textarea>
          <button
            type="button"
            class="danger"
            id="delete-tab"
            title="Delete this tab from the database"
            ?disabled=${this.empty}
            @click=${() => this.emit("delete-tab")}
          >
            Delete
          </button>
        </div>
      </section>
    `;
  }

  private initEditor(savedCode: string) {
    if (this.editorReady) return;
    this.editorReady = true;
    const editorHost = this.hostRef.value;
    const fallback = this.fallbackRef.value;
    if (!editorHost || !fallback) return;

    if (CodeMirror) {
      const ta = document.createElement("textarea");
      ta.value = savedCode;
      editorHost.insertBefore(ta, fallback);
      this.cm = CodeMirror.fromTextArea(ta, {
        mode: "javascript",
        theme: "material-darker",
        lineNumbers: true,
        indentUnit: 2,
        tabSize: 2,
        indentWithTabs: false,
        matchBrackets: true,
        autoCloseBrackets: true,
        extraKeys: {
          "Cmd-Enter": () => {
            this.emit("run");
          },
          "Ctrl-Enter": () => {
            this.emit("run");
          },
          "Cmd-S": () => {
            void this.formatCode();
            return false as unknown as void;
          },
          "Ctrl-S": () => {
            void this.formatCode();
            return false as unknown as void;
          },
          "Cmd-Up": (editor) => {
            moveLines(editor, -1);
          },
          "Cmd-Down": (editor) => {
            moveLines(editor, 1);
          },
          "Ctrl-Up": (editor) => {
            moveLines(editor, -1);
          },
          "Ctrl-Down": (editor) => {
            moveLines(editor, 1);
          },
          "Shift-Alt-Down": (editor) => {
            duplicateLines(editor);
          },
          "Alt-Shift-Down": (editor) => {
            duplicateLines(editor);
          },
          "Cmd-/": "toggleComment",
          "Ctrl-/": "toggleComment",
          Tab: (editor) => {
            if (editor.somethingSelected()) editor.indentSelection("add");
            else editor.replaceSelection("  ", "end");
          },
        },
      });

      this.cm.on("keydown", (editor, e) => {
        const arrowDown =
          e.key === "ArrowDown" || e.code === "ArrowDown" || e.keyCode === 40;
        if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && arrowDown) {
          e.preventDefault();
          e.stopPropagation();
          duplicateLines(editor);
          return true;
        }
      });

      editorHost.addEventListener(
        "keydown",
        (e) => {
          const arrowDown =
            e.key === "ArrowDown" || e.code === "ArrowDown" || e.keyCode === 40;
          if (
            e.altKey &&
            e.shiftKey &&
            !e.metaKey &&
            !e.ctrlKey &&
            arrowDown &&
            this.cm
          ) {
            e.preventDefault();
            e.stopPropagation();
            duplicateLines(this.cm);
          }
        },
        true
      );

      this.cm.on("change", () => {
        if (this.suppressPersist) return;
        this.emit("code-change", { code: this.getCode() });
      });

      const syncEditorSize = () => {
        if (!this.cm) return;
        this.cm.setSize("100%", "100%");
        this.cm.refresh();
      };
      syncEditorSize();
      requestAnimationFrame(syncEditorSize);
      window.addEventListener("resize", syncEditorSize);
      if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(syncEditorSize).observe(editorHost);
      }
      this.cm.focus();
    } else {
      fallback.style.display = "block";
      (fallback as HTMLTextAreaElement).value = savedCode;
      fallback.addEventListener("input", () => {
        if (this.suppressPersist) return;
        this.emit("code-change", { code: this.getCode() });
      });
      fallback.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          this.emit("run");
        }
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          void this.formatCode();
        }
      });
      fallback.focus();
      showStatus(this.formatStatusRef.value, "Plain editor (CDN blocked?)", "err");
    }
  }

  getCode(): string {
    const fallback = this.fallbackRef.value;
    return this.cm ? this.cm.getValue() : fallback?.value ?? "";
  }

  setCode(value: string, opts: { silent?: boolean } = {}): void {
    this.suppressPersist = true;
    try {
      if (this.cm) this.cm.setValue(value);
      else if (this.fallbackRef.value) {
        (this.fallbackRef.value as HTMLTextAreaElement).value = value;
      }
    } finally {
      this.suppressPersist = false;
    }
    if (!opts.silent) {
      this.emit("code-change", { code: value });
    }
  }

  focusEditor(): void {
    if (this.cm) this.cm.focus();
    else this.fallbackRef.value?.focus();
  }

  clearDebugHighlight(): void {
    if (this.cm && this.debugLineHandle != null) {
      this.cm.removeLineClass(this.debugLineHandle, "background", "debug-line");
      this.debugLineHandle = null;
    }
  }

  highlightLine(line: number): void {
    this.clearDebugHighlight();
    if (!this.cm) return;
    this.debugLineHandle = this.cm.addLineClass(
      line - 1,
      "background",
      "debug-line"
    );
    this.cm.scrollIntoView({ line: line - 1, ch: 0 }, 80);
  }

  async formatCode(): Promise<boolean> {
    if (this.empty) return false;
    try {
      const source = this.getCode();
      const fallback = this.fallbackRef.value;
      const cursorOffset = this.cm
        ? this.cm.indexFromPos(this.cm.getCursor())
        : fallback?.selectionStart ?? source.length;
      const scrollInfo = this.cm ? this.cm.getScrollInfo() : null;

      const { formatted, cursorOffset: nextOffset } = await formatSource(
        source,
        cursorOffset
      );

      if (formatted !== source) {
        this.setCode(formatted);
        if (this.cm) {
          this.cm.setCursor(this.cm.posFromIndex(nextOffset));
          if (scrollInfo) this.cm.scrollTo(scrollInfo.left, scrollInfo.top);
          this.cm.focus();
        } else if (fallback) {
          const pos = Math.min(nextOffset, fallback.value.length);
          fallback.setSelectionRange(pos, pos);
          fallback.focus();
        }
      } else {
        this.emit("code-change", { code: source });
      }
      showStatus(this.formatStatusRef.value, "Formatted", "ok");
      return true;
    } catch (err) {
      showStatus(this.formatStatusRef.value, "Format failed", "err");
      console.warn("Prettier:", err);
      return false;
    }
  }

  setDbStatusMessage(message: string, kind: string): void {
    this.dbStatus = message;
    this.dbStatusKind = kind;
    showStatus(this.dbStatusRef.value, message, kind || undefined);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pg-editor-pane": PgEditorPane;
  }
}
