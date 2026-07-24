// @ts-nocheck — ported from the monolith; tighten types incrementally.
import CodeMirror from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/material-darker.css";
import "codemirror/mode/javascript/javascript";
import "codemirror/addon/edit/closebrackets";
import "codemirror/addon/edit/matchbrackets";
import "codemirror/addon/comment/comment";
import * as acorn from "acorn";
import prettier from "prettier/standalone";
import * as prettierPluginBabel from "prettier/plugins/babel";
import * as prettierPluginEstree from "prettier/plugins/estree";
import { EXAMPLES } from "./examples";
import type { PauseController } from "./types";

export async function mountPlayground(root: ParentNode): Promise<void> {
  const must = <T extends HTMLElement = HTMLElement>(sel: string): T => {
    const el = root.querySelector(sel);
    if (!el) throw new Error(`Missing element: ${sel}`);
    return el as T;
  };


            const output = must("#output");
      const examples = must("#examples");
      const formatStatus = must("#format-status");
      const runStatus = must("#run-status");
      const fallback = must("#editor-fallback");
      const debugPanel = must("#debug-panel");
      const scopeBody = must("#scope-body");
      const evalInput = must("#eval-input");
      const evalResult = must("#eval-result");
      const runBtn = must("#run");
      const tabsEl = must("#tabs");

      let cm: CodeMirror.Editor | null = null;
      let debugLineHandle: CodeMirror.LineHandle | null = null;
      let pauseController: PauseController | null = null;
      let suppressPersist = false;
      let renamingId: string | null = null;
      let saveTimer: ReturnType<typeof setTimeout> | null = null;
      let saveInFlight: Promise<void> | null = null;

      function uid() {
        return "tab_" + Math.random().toString(36).slice(2, 10);
      }

      function defaultTab(code) {
        return { id: uid(), name: "Untitled", code: code ?? EXAMPLES.blank };
      }

      function normalizeState(parsed) {
        if (!parsed?.tabs?.length) return null;
        return {
          activeId: parsed.activeId || parsed.tabs[0].id,
          tabs: parsed.tabs.map((t) => ({
            id: t.id || uid(),
            name: t.name?.trim() ? t.name : "Untitled",
            code: typeof t.code === "string" ? t.code : EXAMPLES.blank,
          })),
        };
      }

      async function loadStateFromApi() {
        const res = await fetch("/api/state");
        if (!res.ok) throw new Error(`Load failed (${res.status})`);
        const data = await res.json();
        const normalized = normalizeState(data);
        if (!normalized) throw new Error("Invalid state from server");
        return normalized;
      }

      let state = {
        activeId: "pending",
        tabs: [defaultTab(EXAMPLES.blank)],
      };
      state.activeId = state.tabs[0].id;

      function activeTab() {
        return state.tabs.find((t) => t.id === state.activeId) || state.tabs[0];
      }

      function setDbStatus(message, kind) {
        const el = must("#db-status");
        if (!el) return;
        el.textContent = message;
        el.className = "status show" + (kind ? " " + kind : "");
        clearTimeout((setDbStatus as any)._t);
        if (kind !== "paused") {
          (setDbStatus as any)._t = setTimeout(() => el.classList.remove("show"), 2000);
        }
      }

      async function saveStateNow() {
        const payload = {
          activeId: state.activeId,
          tabs: state.tabs.map((t) => ({
            id: t.id,
            name: t.name,
            code: t.code,
          })),
        };
        const run = fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Save failed (${res.status})`);
          }
          setDbStatus("Saved to DB", "ok");
        });
        saveInFlight = run.finally(() => {
          if (saveInFlight === run) saveInFlight = null;
        });
        try {
          await run;
        } catch (err) {
          console.error(err);
          setDbStatus(err.message || "Save failed", "err");
        }
      }

      function saveState(opts: { immediate?: boolean } = {}) {
        const immediate = opts.immediate === true;
        if (saveTimer) {
          clearTimeout(saveTimer);
          saveTimer = null;
        }
        if (immediate) {
          return saveStateNow();
        }
        saveTimer = setTimeout(() => {
          saveTimer = null;
          saveStateNow();
        }, 400);
      }

      function getCode() {
        return cm ? cm.getValue() : fallback.value;
      }

      function setEditorValue(value) {
        suppressPersist = true;
        try {
          if (cm) cm.setValue(value);
          else fallback.value = value;
        } finally {
          suppressPersist = false;
        }
      }

      function setCode(value) {
        setEditorValue(value);
        const tab = activeTab();
        if (tab) tab.code = value;
        saveState();
      }

      function persist() {
        if (suppressPersist) return;
        const tab = activeTab();
        if (!tab) return;
        tab.code = getCode();
        saveState();
      }

      function renderTabs() {
        tabsEl.innerHTML = "";
        for (const tab of state.tabs) {
          const el = document.createElement("div");
          el.className = "tab" + (tab.id === state.activeId ? " active" : "");
          el.setAttribute("role", "tab");
          el.setAttribute("aria-selected", tab.id === state.activeId ? "true" : "false");
          el.dataset.id = tab.id;

          if (renamingId === tab.id) {
            const input = document.createElement("input");
            input.className = "tab-name-input";
            input.value = tab.name;
            input.setAttribute("aria-label", "Rename tab");
            input.addEventListener("click", (e) => e.stopPropagation());
            input.addEventListener("keydown", (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename(tab.id, input.value);
              } else if (e.key === "Escape") {
                e.preventDefault();
                renamingId = null;
                renderTabs();
              }
            });
            input.addEventListener("blur", () => commitRename(tab.id, input.value));
            el.appendChild(input);
            queueMicrotask(() => {
              input.focus();
              input.select();
            });
          } else {
            const name = document.createElement("span");
            name.className = "tab-name";
            name.textContent = tab.name;
            name.title = "Click to rename";
            name.addEventListener("click", (e) => {
              e.stopPropagation();
              if (tab.id !== state.activeId) {
                switchTab(tab.id);
              }
              renamingId = tab.id;
              renderTabs();
            });
            el.appendChild(name);
          }

          const close = document.createElement("button");
          close.type = "button";
          close.className = "tab-close";
          close.title = "Close tab";
          close.setAttribute("aria-label", "Close tab");
          close.textContent = "×";
          close.addEventListener("click", (e) => {
            e.stopPropagation();
            closeTab(tab.id);
          });
          el.appendChild(close);

          el.addEventListener("click", () => {
            if (tab.id !== state.activeId) switchTab(tab.id);
          });

          tabsEl.appendChild(el);
        }
      }

      function commitRename(id, value) {
        const tab = state.tabs.find((t) => t.id === id);
        if (!tab) return;
        const next = value.trim() || "Untitled";
        tab.name = next;
        renamingId = null;
        saveState({ immediate: true });
        renderTabs();
      }

      function switchTab(id) {
        if (pauseController) pauseController.stop();
        persist();
        const tab = state.tabs.find((t) => t.id === id);
        if (!tab) return;
        state.activeId = id;
        renamingId = null;
        saveState({ immediate: true });
        setEditorValue(tab.code);
        renderTabs();
        if (cm) cm.focus();
        else fallback.focus();
      }

      function addTab() {
        persist();
        const tab = defaultTab(EXAMPLES.blank);
        state.tabs.push(tab);
        state.activeId = tab.id;
        renamingId = null;
        saveState({ immediate: true });
        setEditorValue(tab.code);
        renderTabs();
        if (cm) cm.focus();
        else fallback.focus();
      }

      function closeTab(id) {
        if (state.tabs.length === 1) {
          // Reset the only tab instead of removing it
          const tab = state.tabs[0];
          tab.name = "Untitled";
          tab.code = EXAMPLES.blank;
          state.activeId = tab.id;
          saveState({ immediate: true });
          setEditorValue(tab.code);
          renderTabs();
          return;
        }
        if (pauseController && state.activeId === id) pauseController.stop();
        const idx = state.tabs.findIndex((t) => t.id === id);
        if (idx < 0) return;
        const wasActive = state.activeId === id;
        state.tabs.splice(idx, 1);
        if (wasActive) {
          const next = state.tabs[Math.max(0, idx - 1)];
          state.activeId = next.id;
          setEditorValue(next.code);
        }
        if (renamingId === id) renamingId = null;
        saveState({ immediate: true });
        renderTabs();
      }

      let saved = activeTab().code;

      /** Move the selected line(s) up (-1) or down (+1). */
      function moveLines(editor, offset) {
        if (offset !== 1 && offset !== -1) return;

        const selections = editor.listSelections();
        const collapsed =
          selections.length === 1 &&
          selections[0].anchor.line === selections[0].head.line &&
          selections[0].anchor.ch === selections[0].head.ch;
        const cursorCh = collapsed ? selections[0].head.ch : 0;

        let startLine = Infinity;
        let endLine = -Infinity;
        for (const sel of selections) {
          const from = Math.min(sel.anchor.line, sel.head.line);
          let to = Math.max(sel.anchor.line, sel.head.line);
          const endPos = sel.anchor.line > sel.head.line ? sel.anchor : sel.head;
          if (from !== to && endPos.ch === 0) to -= 1;
          startLine = Math.min(startLine, from);
          endLine = Math.max(endLine, to);
        }

        if (offset < 0 && startLine === 0) return;
        if (offset > 0 && endLine >= editor.lastLine()) return;

        editor.operation(() => {
          if (offset < 0) {
            const block = editor.getRange(
              { line: startLine, ch: 0 },
              { line: endLine, ch: editor.getLine(endLine).length }
            );
            const above = editor.getLine(startLine - 1);
            editor.replaceRange(
              block + "\n" + above,
              { line: startLine - 1, ch: 0 },
              { line: endLine, ch: editor.getLine(endLine).length }
            );
            if (collapsed) {
              const line = startLine - 1;
              editor.setCursor({
                line,
                ch: Math.min(cursorCh, editor.getLine(line).length),
              });
            } else {
              editor.setSelection(
                { line: startLine - 1, ch: 0 },
                { line: endLine - 1, ch: editor.getLine(endLine - 1).length }
              );
            }
          } else {
            const block = editor.getRange(
              { line: startLine, ch: 0 },
              { line: endLine, ch: editor.getLine(endLine).length }
            );
            const below = editor.getLine(endLine + 1);
            editor.replaceRange(
              below + "\n" + block,
              { line: startLine, ch: 0 },
              { line: endLine + 1, ch: editor.getLine(endLine + 1).length }
            );
            if (collapsed) {
              const line = startLine + 1;
              editor.setCursor({
                line,
                ch: Math.min(cursorCh, editor.getLine(line).length),
              });
            } else {
              editor.setSelection(
                { line: startLine + 1, ch: 0 },
                { line: endLine + 1, ch: editor.getLine(endLine + 1).length }
              );
            }
          }
        });
      }

      /** Duplicate the selected line(s) below the selection. */
      function duplicateLines(editor) {
        const selections = editor.listSelections();
        const collapsed =
          selections.length === 1 &&
          selections[0].anchor.line === selections[0].head.line &&
          selections[0].anchor.ch === selections[0].head.ch;
        const cursorCh = collapsed ? selections[0].head.ch : 0;

        let startLine = Infinity;
        let endLine = -Infinity;
        for (const sel of selections) {
          const from = Math.min(sel.anchor.line, sel.head.line);
          let to = Math.max(sel.anchor.line, sel.head.line);
          const endPos = sel.anchor.line > sel.head.line ? sel.anchor : sel.head;
          if (from !== to && endPos.ch === 0) to -= 1;
          startLine = Math.min(startLine, from);
          endLine = Math.max(endLine, to);
        }

        const block = editor.getRange(
          { line: startLine, ch: 0 },
          { line: endLine, ch: editor.getLine(endLine).length }
        );
        const lineCount = endLine - startLine + 1;

        editor.operation(() => {
          editor.replaceRange(
            "\n" + block,
            { line: endLine, ch: editor.getLine(endLine).length }
          );
          if (collapsed) {
            const line = startLine + lineCount;
            editor.setCursor({
              line,
              ch: Math.min(cursorCh, editor.getLine(line).length),
            });
          } else {
            editor.setSelection(
              { line: startLine + lineCount, ch: 0 },
              {
                line: endLine + lineCount,
                ch: editor.getLine(endLine + lineCount).length,
              }
            );
          }
        });
      }

      function showStatus(el, message, kind) {
        el.textContent = message;
        el.className = "status show" + (kind ? " " + kind : "");
        if (kind === "paused") return;
        clearTimeout((el as any)._t);
        (el as any)._t = setTimeout(() => el.classList.remove("show"), 1800);
      }

      function escapeHtml(s) {
        return String(s)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
      }

      function formatValue(value) {
        if (typeof value === "string") return value;
        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return String(value);
        }
      }

      function clearDebugHighlight() {
        if (cm && debugLineHandle != null) {
          cm.removeLineClass(debugLineHandle, "background", "debug-line");
          debugLineHandle = null;
        }
      }

      function hideDebugPanel() {
        debugPanel.classList.remove("open");
        clearDebugHighlight();
        runStatus.classList.remove("show", "paused");
        pauseController = null;
        evalResult.textContent = "";
        evalInput.value = "";
      }

      function addPatternNames(node, names) {
        if (!node) return;
        if (node.type === "Identifier") names.add(node.name);
        else if (node.type === "ObjectPattern") {
          for (const prop of node.properties) {
            if (prop.type === "RestElement") addPatternNames(prop.argument, names);
            else addPatternNames(prop.value || prop.key, names);
          }
        } else if (node.type === "ArrayPattern") {
          for (const el of node.elements) {
            if (el) addPatternNames(el, names);
          }
        } else if (node.type === "AssignmentPattern") {
          addPatternNames(node.left, names);
        } else if (node.type === "RestElement") {
          addPatternNames(node.argument, names);
        }
      }

      function collectBindings(ancestors, debuggerStart) {
        const names = new Set();
        for (const node of ancestors) {
          if (
            node.type === "FunctionDeclaration" ||
            node.type === "FunctionExpression" ||
            node.type === "ArrowFunctionExpression"
          ) {
            for (const p of node.params) addPatternNames(p, names);
            if (node.id) names.add(node.id.name);
          }
          if (node.type === "CatchClause" && node.param) addPatternNames(node.param, names);
          if (node.type === "Program" || node.type === "BlockStatement") {
            for (const stmt of node.body) {
              if (stmt.start >= debuggerStart) continue;
              if (stmt.type === "VariableDeclaration") {
                for (const d of stmt.declarations) addPatternNames(d.id, names);
              } else if (stmt.type === "FunctionDeclaration" && stmt.id) {
                names.add(stmt.id.name);
              } else if (stmt.type === "ClassDeclaration" && stmt.id) {
                names.add(stmt.id.name);
              }
            }
          }
          if (node.type === "ForStatement" && node.init?.type === "VariableDeclaration") {
            if (node.init.start < debuggerStart) {
              for (const d of node.init.declarations) addPatternNames(d.id, names);
            }
          }
          if (
            (node.type === "ForOfStatement" || node.type === "ForInStatement") &&
            node.left?.type === "VariableDeclaration"
          ) {
            if (node.left.start < debuggerStart) {
              for (const d of node.left.declarations) addPatternNames(d.id, names);
            }
          }
        }
        return [...names].filter((n) => !["arguments", "eval", "undefined"].includes(n));
      }

      function walk(node, ancestors, visit) {
        if (!node || typeof node.type !== "string") return;
        visit(node, ancestors);
        const next = ancestors.concat(node);
        for (const key of Object.keys(node)) {
          if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
          const value = node[key];
          if (Array.isArray(value)) {
            for (const child of value) walk(child, next, visit);
          } else if (value && typeof value.type === "string") {
            walk(value, next, visit);
          }
        }
      }

      function instrumentDebuggers(source) {
        if (false) {
          return { code: source, count: 0 };
        }

        let ast;
        try {
          ast = acorn.parse(source, {
            ecmaVersion: "latest",
            locations: true,
            allowAwaitOutsideFunction: true,
            allowReturnOutsideFunction: true,
          });
        } catch {
          return { code: source, count: 0, parseError: true };
        }

        const debuggerNodes = [];
        const functionsToAsync = new Set();

        walk(ast, [], (node, ancestors) => {
          if (node.type !== "DebuggerStatement") return;
          debuggerNodes.push({ node, ancestors });
          for (let i = ancestors.length - 1; i >= 0; i--) {
            const a = ancestors[i];
            if (
              a.type === "FunctionDeclaration" ||
              a.type === "FunctionExpression" ||
              a.type === "ArrowFunctionExpression"
            ) {
              if (!a.async) functionsToAsync.add(a);
              break;
            }
          }
        });

        if (!debuggerNodes.length) return { code: source, count: 0 };

        const edits = [];

        for (const fn of functionsToAsync) {
          if (fn.type === "ArrowFunctionExpression") {
            edits.push({ start: fn.start, end: fn.start, text: "async " });
          } else {
            // Insert async before `function`
            const slice = source.slice(fn.start, fn.start + 20);
            const idx = slice.indexOf("function");
            if (idx >= 0) {
              edits.push({ start: fn.start + idx, end: fn.start + idx, text: "async " });
            }
          }
        }

        for (const { node, ancestors } of debuggerNodes) {
          const line = node.loc?.start?.line ?? 1;
          const names = collectBindings(ancestors, node.start);
          const scopeLiteral = names.length
            ? `{ ${names.map((n) => `${JSON.stringify(n)}: ${n}`).join(", ")} }`
            : `{}`;
          const replacement =
            `await __pg.pause({ line: ${line}, scope: ${scopeLiteral}, evalInFrame: (expr) => eval(expr) })`;
          edits.push({ start: node.start, end: node.end, text: replacement });
        }

        edits.sort((a, b) => b.start - a.start);
        let code = source;
        for (const edit of edits) {
          code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
        }

        return { code, count: debuggerNodes.length };
      }

      function showPaused(info) {
        return new Promise((resolve, reject) => {
          pauseController = {
            continue: () => {
              hideDebugPanel();
              resolve();
            },
            stop: () => {
              hideDebugPanel();
              reject(new Error("Stopped at debugger"));
            },
            evalInFrame: info.evalInFrame,
          };

          must("#debug-line").textContent = String(info.line);
          scopeBody.innerHTML = "";
          const entries = Object.entries(info.scope || {});
          if (!entries.length) {
            scopeBody.innerHTML = `<tr><td colspan="2" style="color:var(--muted)">No locals in scope</td></tr>`;
          } else {
            for (const [name, value] of entries) {
              const tr = document.createElement("tr");
              tr.innerHTML = `<th>${escapeHtml(name)}</th><td>${escapeHtml(formatValue(value))}</td>`;
              scopeBody.appendChild(tr);
            }
          }

          debugPanel.classList.add("open");
          showStatus(runStatus, `Paused · line ${info.line}`, "paused");

          clearDebugHighlight();
          if (cm) {
            debugLineHandle = cm.addLineClass(info.line - 1, "background", "debug-line");
            cm.scrollIntoView({ line: info.line - 1, ch: 0 }, 80);
          }

          evalInput.focus();
        });
      }

      async function formatCode() {
        try {
          const source = getCode();
          const formatted = await prettier.format(source, {
            parser: "babel",
            plugins: [prettierPluginBabel, prettierPluginEstree],
            semi: true,
            singleQuote: false,
            trailingComma: "es5",
            printWidth: 80,
            tabWidth: 2,
            useTabs: false,
            arrowParens: "always",
            bracketSpacing: true,
          });
          if (formatted !== source) setCode(formatted);
          else persist();
          showStatus(formatStatus, "Formatted", "ok");
          return true;
        } catch (err) {
          showStatus(formatStatus, "Format failed", "err");
          console.warn("Prettier:", err);
          return false;
        }
      }

      function renderOutput(parts) {
        output.innerHTML = parts.join("\n");
      }

      async function run() {
        if (pauseController) {
          pauseController.stop();
          return;
        }

        hideDebugPanel();
        const logs = [];
        const capture = (...args) => logs.push(args.map(formatValue).join(" "));
        const fakeConsole = {
          log: capture,
          info: capture,
          warn: capture,
          error: capture,
          debug: capture,
        };

        const __pg = {
          pause: (info) => showPaused(info),
        };

        const source = getCode();
        const { code, count, parseError } = instrumentDebuggers(source);
        const started = performance.now();
        runBtn.textContent = "Stop";
        runBtn.classList.add("warn");
        runBtn.classList.remove("primary");

        try {
          const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
          const fn = new AsyncFunction(
            "console",
            "__pg",
            `"use strict";\n${code}\n//# sourceURL=playground.js`
          );
          const result = await fn(fakeConsole, __pg);
          const ms = (performance.now() - started).toFixed(1);

          const parts = [`<span class="meta">OK · ${ms}ms${count ? ` · ${count} debugger breakpoint(s)` : ""}</span>`];
          if (parseError) {
            parts.push(`<span class="meta">Note: could not parse for debugger instrumentation.</span>`);
          }
          if (logs.length) {
            parts.push("", `<span class="meta">// console</span>`);
            parts.push(...logs.map((l) => `<span class="log">${escapeHtml(l)}</span>`));
          }
          if (result !== undefined) {
            parts.push("", `<span class="meta">// return</span>`);
            parts.push(`<span class="ret">${escapeHtml(formatValue(result))}</span>`);
          }
          if (!logs.length && result === undefined) {
            parts.push("", `<span class="empty">No output. Try console.log, a trailing expression, or debugger.</span>`);
          }
          renderOutput(parts);
        } catch (err) {
          const ms = (performance.now() - started).toFixed(1);
          const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          const stopped = /Stopped at debugger/.test(message);
          const parts = [
            `<span class="meta">${stopped ? "Stopped" : "Error"} · ${ms}ms</span>`,
            "",
            `<span class="${stopped ? "meta" : "err"}">${escapeHtml(message)}</span>`,
          ];
          if (logs.length) {
            parts.push("", `<span class="meta">// console before stop</span>`);
            parts.push(...logs.map((l) => `<span class="log">${escapeHtml(l)}</span>`));
          }
          renderOutput(parts);
        } finally {
          runBtn.textContent = "Run";
          runBtn.classList.remove("warn");
          runBtn.classList.add("primary");
          hideDebugPanel();
        }
      }

      must("#debug-continue").addEventListener("click", () => {
        pauseController?.continue();
      });
      must("#debug-stop").addEventListener("click", () => {
        pauseController?.stop();
      });

      function runEval() {
        if (!pauseController?.evalInFrame) return;
        const expr = evalInput.value.trim();
        if (!expr) return;
        try {
          const value = pauseController.evalInFrame(expr);
          evalResult.innerHTML = `<span class="ret">${escapeHtml(formatValue(value))}</span>`;
        } catch (err) {
          const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          evalResult.innerHTML = `<span class="err">${escapeHtml(message)}</span>`;
        }
      }

      must("#eval-run").addEventListener("click", runEval);
      evalInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          runEval();
        }
      });

      function initEditor(savedCode) {
      if (CodeMirror) {
        const editorHost = must("#editor-host");
        const ta = document.createElement("textarea");
        ta.value = savedCode;
        editorHost.appendChild(ta);
        cm = CodeMirror.fromTextArea(ta, {
          mode: "javascript",
          theme: "material-darker",
          lineNumbers: true,
          indentUnit: 2,
          tabSize: 2,
          indentWithTabs: false,
          matchBrackets: true,
          autoCloseBrackets: true,
          extraKeys: {
            "Cmd-Enter": () => { run(); },
            "Ctrl-Enter": () => { run(); },
            "Cmd-S": () => { formatCode(); return false; },
            "Ctrl-S": () => { formatCode(); return false; },
            "Cmd-Up": (editor) => { moveLines(editor, -1); },
            "Cmd-Down": (editor) => { moveLines(editor, 1); },
            "Ctrl-Up": (editor) => { moveLines(editor, -1); },
            "Ctrl-Down": (editor) => { moveLines(editor, 1); },
            "Shift-Alt-Down": (editor) => { duplicateLines(editor); },
            "Alt-Shift-Down": (editor) => { duplicateLines(editor); },
            "Cmd-/": "toggleComment",
            "Ctrl-/": "toggleComment",
            Tab: (editor) => {
              if (editor.somethingSelected()) editor.indentSelection("add");
              else editor.replaceSelection("  ", "end");
            },
          },
        });
        // Option/Alt+Shift+Arrow is flaky via extraKeys on Mac — catch it directly.
        cm.on("keydown", (editor, e) => {
          const arrowDown = e.key === "ArrowDown" || e.code === "ArrowDown" || e.keyCode === 40;
          if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && arrowDown) {
            e.preventDefault();
            e.stopPropagation();
            duplicateLines(editor);
            return true;
          }
        });
        // Capture-phase fallback — some Mac browsers don't route Option+Shift+Arrow through CM keymaps.
        editorHost.addEventListener(
          "keydown",
          (e) => {
            const arrowDown = e.key === "ArrowDown" || e.code === "ArrowDown" || e.keyCode === 40;
            if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && arrowDown && cm) {
              e.preventDefault();
              e.stopPropagation();
              duplicateLines(cm);
            }
          },
          true
        );
        cm.on("change", persist);
        cm.focus();
      } else {
        fallback.style.display = "block";
        fallback.value = savedCode;
        fallback.addEventListener("input", persist);
        fallback.addEventListener("keydown", (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            run();
          }
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            formatCode();
          }
        });
        fallback.focus();
        showStatus(formatStatus, "Plain editor (CDN blocked?)", "err");
      }

      examples.addEventListener("change", () => {
        setCode(EXAMPLES[examples.value] || EXAMPLES.blank);
        if (cm) cm.focus();
        else fallback.focus();
      });

      must("#format").addEventListener("click", () => formatCode());
      runBtn.addEventListener("click", () => run());
      must("#new-tab").addEventListener("click", () => addTab());
      tabsEl.addEventListener("click", (e) => {
        // Empty gutter next to tabs (including the ::after flex spacer)
        if (e.target === tabsEl) addTab();
      });
      must("#clear").addEventListener("click", () => {
        if (pauseController) pauseController.stop();
        examples.value = "blank";
        setCode(EXAMPLES.blank);
        output.innerHTML = `<span class="empty">Hit Run to see console output and return values. Use <code>debugger</code> to pause.</span>`;
        if (cm) cm.focus();
        else fallback.focus();
      });
      }

      async function bootstrap() {
        try {
          setDbStatus("Loading from DB…", "paused");
          state = await loadStateFromApi();
          saved = activeTab().code;
          renderTabs();
          setDbStatus("Loaded from DB", "ok");
        } catch (err) {
          console.error(err);
          setDbStatus("DB unavailable — using blank tab", "err");
          // keep in-memory default; still try to create state on first save
          renderTabs();
        }
        initEditor(saved);
      }

      bootstrap();

}
