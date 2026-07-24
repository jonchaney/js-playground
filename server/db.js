const { Pool } = require("pg");
const { BLANK, DATABASE_URL, STATE_ID } = require("./config");

const pool = new Pool({ connectionString: DATABASE_URL });

async function waitForDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch {
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

  await pool.query(`
    ALTER TABLE playground_state
    ADD COLUMN IF NOT EXISTS closed_tabs JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  const { rows } = await pool.query(
    "SELECT id FROM playground_state WHERE id = $1",
    [STATE_ID]
  );
  if (!rows.length) {
    const tab = {
      id: "tab_initial",
      name: "Untitled",
      code: BLANK,
    };
    await pool.query(
      `INSERT INTO playground_state (id, active_id, tabs, closed_tabs)
       VALUES ($1, $2, $3::jsonb, '[]'::jsonb)`,
      [STATE_ID, tab.id, JSON.stringify([tab])]
    );
  }
}

async function ping() {
  await pool.query("SELECT 1");
}

async function getState() {
  const { rows } = await pool.query(
    "SELECT active_id, tabs, closed_tabs FROM playground_state WHERE id = $1",
    [STATE_ID]
  );
  if (!rows.length) return null;
  return {
    activeId: rows[0].active_id,
    tabs: rows[0].tabs,
    closedTabs: rows[0].closed_tabs || [],
  };
}

async function saveState({ activeId, tabs, closedTabs }) {
  await pool.query(
    `INSERT INTO playground_state (id, active_id, tabs, closed_tabs, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE
     SET active_id = EXCLUDED.active_id,
         tabs = EXCLUDED.tabs,
         closed_tabs = EXCLUDED.closed_tabs,
         updated_at = NOW()`,
    [STATE_ID, activeId, JSON.stringify(tabs), JSON.stringify(closedTabs)]
  );
}

module.exports = {
  pool,
  waitForDb,
  migrate,
  ping,
  getState,
  saveState,
};
