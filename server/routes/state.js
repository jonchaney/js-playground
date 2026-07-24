const { Router } = require("express");
const db = require("../db");
const { parseStateBody } = require("../validate");

const router = Router();

router.get("/state", async (_req, res) => {
  try {
    const state = await db.getState();
    if (!state) {
      return res.status(404).json({ error: "No state found" });
    }
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.put("/state", async (req, res) => {
  try {
    const parsed = parseStateBody(req.body);
    if (!parsed.ok) {
      return res.status(parsed.status).json({ error: parsed.error });
    }

    const { activeId, tabs, closedTabs } = parsed;
    await db.saveState({ activeId, tabs, closedTabs });

    res.json({
      ok: true,
      activeId,
      tabs,
      closedTabs,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

module.exports = router;
