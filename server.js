const express = require("express");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 3847);
const SERVE_STATIC = process.env.SERVE_STATIC !== "0";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://playground:playground@localhost:5433/playground";

const BLANK = `function foo {

}

console.log(foo())
`;

const pool = new Pool({ connectionString: DATABASE_URL });

async function waitForDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      console.log(`Waiting for database… (${i + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("Database not reachable");
}

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS playground_state (
      id TEXT PRIMARY KEY DEFAULT 'default',
      active_id TEXT NOT NULL,
      tabs JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const { rows } = await pool.query(
    "SELECT id FROM playground_state WHERE id = $1",
    ["default"]
  );
  if (!rows.length) {
    const tab = {
      id: "tab_initial",
      name: "Untitled",
      code: BLANK,
    };
    await pool.query(
      `INSERT INTO playground_state (id, active_id, tabs)
       VALUES ('default', $1, $2::jsonb)`,
      [tab.id, JSON.stringify([tab])]
    );
  }
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: String(err.message || err) });
  }
});

app.get("/api/state", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT active_id, tabs FROM playground_state WHERE id = $1",
      ["default"]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "No state found" });
    }
    res.json({
      activeId: rows[0].active_id,
      tabs: rows[0].tabs,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.put("/api/state", async (req, res) => {
  try {
    const { activeId, tabs } = req.body || {};
    if (!activeId || !Array.isArray(tabs) || tabs.length === 0) {
      return res.status(400).json({
        error: "Body must include activeId and a non-empty tabs array",
      });
    }

    const cleaned = tabs.map((t) => ({
      id: String(t.id || ""),
      name: String(t.name || "Untitled").trim() || "Untitled",
      code: typeof t.code === "string" ? t.code : "",
    }));

    if (cleaned.some((t) => !t.id)) {
      return res.status(400).json({ error: "Each tab needs an id" });
    }

    await pool.query(
      `INSERT INTO playground_state (id, active_id, tabs, updated_at)
       VALUES ('default', $1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE
       SET active_id = EXCLUDED.active_id,
           tabs = EXCLUDED.tabs,
           updated_at = NOW()`,
      [String(activeId), JSON.stringify(cleaned)]
    );

    res.json({ ok: true, activeId: String(activeId), tabs: cleaned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

const distDir = path.join(__dirname, "dist");
if (SERVE_STATIC && fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

async function main() {
  await waitForDb();
  await migrate();
  app.listen(PORT, "0.0.0.0", () => {
    const mode = SERVE_STATIC ? "API + static" : "API only (Vite HMR)";
    console.log(`JS Playground (${mode}) on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
