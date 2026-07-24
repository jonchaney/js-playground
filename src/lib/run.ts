import { escapeHtml, formatValue } from "./html";
import { instrumentDebuggers } from "./instrument";
import type { PauseController } from "../types";

export type PauseInfo = {
  line: number;
  scope: Record<string, unknown>;
  evalInFrame: (expr: string) => unknown;
};

export type RunResult = {
  parts: string[];
  stopped: boolean;
};

export function buildOutputParts(opts: {
  ok: boolean;
  stopped?: boolean;
  ms: string;
  count: number;
  parseError?: boolean;
  logs: string[];
  result?: unknown;
  errorMessage?: string;
}): string[] {
  const { ok, stopped, ms, count, parseError, logs, result, errorMessage } =
    opts;

  if (!ok) {
    const parts = [
      `<span class="meta">${stopped ? "Stopped" : "Error"} · ${ms}ms</span>`,
      "",
      `<span class="${stopped ? "meta" : "err"}">${escapeHtml(errorMessage || "")}</span>`,
    ];
    if (logs.length) {
      parts.push("", `<span class="meta">// console before stop</span>`);
      parts.push(
        ...logs.map((l) => `<span class="log">${escapeHtml(l)}</span>`)
      );
    }
    return parts;
  }

  const parts = [
    `<span class="meta">OK · ${ms}ms${count ? ` · ${count} debugger breakpoint(s)` : ""}</span>`,
  ];
  if (parseError) {
    parts.push(
      `<span class="meta">Note: could not parse for debugger instrumentation.</span>`
    );
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
    parts.push(
      "",
      `<span class="empty">No output. Try console.log, a trailing expression, or debugger.</span>`
    );
  }
  return parts;
}

/** Show pause UI; continue/stop resolve via the session's pauseController. */
export type OnPause = (info: PauseInfo) => void;

export class RunSession {
  active = false;
  pauseController: PauseController | null = null;

  private cancelled = false;
  private cancelReject: ((err: Error) => void) | null = null;

  cancel(): void {
    if (!this.active) return;
    if (this.pauseController) {
      this.pauseController.stop();
    } else if (this.cancelReject) {
      this.cancelled = true;
      this.cancelReject(new Error("Stopped at debugger"));
    }
  }

  async run(source: string, onPause: OnPause): Promise<RunResult> {
    if (this.active) {
      this.cancel();
      return { parts: [], stopped: true };
    }

    this.active = true;
    this.cancelled = false;
    this.pauseController = null;

    const cancelPromise = new Promise<never>((_, reject) => {
      this.cancelReject = reject;
    });

    const logs: string[] = [];
    const capture = (...args: unknown[]) =>
      logs.push(args.map(formatValue).join(" "));
    const fakeConsole = {
      log: capture,
      info: capture,
      warn: capture,
      error: capture,
      debug: capture,
    };

    const __pg = {
      pause: (info: PauseInfo) => {
        if (this.cancelled) {
          return Promise.reject(new Error("Stopped at debugger"));
        }
        return new Promise<void>((resolve, reject) => {
          this.pauseController = {
            continue: () => {
              this.pauseController = null;
              resolve();
            },
            stop: () => {
              this.pauseController = null;
              reject(new Error("Stopped at debugger"));
            },
            evalInFrame: info.evalInFrame,
          };
          onPause(info);
        });
      },
    };

    const { code, count, parseError } = instrumentDebuggers(source);
    const started = performance.now();

    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {})
        .constructor as new (
        ...args: string[]
      ) => (...args: unknown[]) => Promise<unknown>;
      const fn = new AsyncFunction(
        "console",
        "__pg",
        `"use strict";\n${code}\n//# sourceURL=playground.js`
      );
      const runPromise = fn(fakeConsole, __pg);
      runPromise.catch(() => {});
      const result = await Promise.race([runPromise, cancelPromise]);
      const ms = (performance.now() - started).toFixed(1);
      return {
        parts: buildOutputParts({
          ok: true,
          ms,
          count,
          parseError,
          logs,
          result,
        }),
        stopped: false,
      };
    } catch (err) {
      const ms = (performance.now() - started).toFixed(1);
      const message =
        err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      const stopped = /Stopped at debugger/.test(message);
      return {
        parts: buildOutputParts({
          ok: false,
          stopped,
          ms,
          count,
          logs,
          errorMessage: message,
        }),
        stopped,
      };
    } finally {
      this.active = false;
      this.cancelReject = null;
      this.cancelled = false;
      this.pauseController = null;
    }
  }
}
