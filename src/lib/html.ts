export function escapeHtml(s: unknown): string {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function showStatus(
  el: HTMLElement | null | undefined,
  message: string,
  kind?: string
): void {
  if (!el) return;
  el.textContent = message;
  el.className = "status show" + (kind ? " " + kind : "");
  if (kind === "paused") return;
  const anyEl = el as HTMLElement & { _t?: ReturnType<typeof setTimeout> };
  clearTimeout(anyEl._t);
  anyEl._t = setTimeout(() => el.classList.remove("show"), 1800);
}
