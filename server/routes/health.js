const { Router } = require("express");
const db = require("../db");

const router = Router();

router.get("/health", async (_req, res) => {
  try {
    await db.ping();
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: String(err.message || err) });
  }
});

module.exports = router;
