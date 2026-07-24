const { CLOSED_TABS_LIMIT } = require("./config");

/**
 * Validate and normalize a PUT /api/state body.
 * @returns {{ ok: true, activeId: string, tabs: object[], closedTabs: object[] }
 *         | { ok: false, status: number, error: string }}
 */
function parseStateBody(body) {
  const { activeId, tabs, closedTabs } = body || {};

  if (!Array.isArray(tabs)) {
    return {
      ok: false,
      status: 400,
      error: "Body must include a tabs array",
    };
  }

  const cleaned = tabs.map((t) => ({
    id: String(t.id || ""),
    name: String(t.name || "Untitled").trim() || "Untitled",
    code: typeof t.code === "string" ? t.code : "",
  }));

  if (cleaned.some((t) => !t.id)) {
    return { ok: false, status: 400, error: "Each tab needs an id" };
  }

  if (cleaned.length > 0 && !activeId) {
    return {
      ok: false,
      status: 400,
      error: "Body must include activeId when tabs is non-empty",
    };
  }

  const cleanedClosed = (Array.isArray(closedTabs) ? closedTabs : [])
    .slice(0, CLOSED_TABS_LIMIT)
    .map((t) => ({
      id: String(t.id || ""),
      name: String(t.name || "Untitled").trim() || "Untitled",
      code: typeof t.code === "string" ? t.code : "",
      closedAt: Number(t.closedAt) || Date.now(),
    }))
    .filter((t) => t.id);

  const nextActiveId =
    cleaned.length === 0
      ? ""
      : cleaned.some((t) => t.id === String(activeId))
        ? String(activeId)
        : cleaned[0].id;

  return {
    ok: true,
    activeId: nextActiveId,
    tabs: cleaned,
    closedTabs: cleanedClosed,
  };
}

module.exports = { parseStateBody };
