const { PORT, SERVE_STATIC } = require("./config");
const { waitForDb, migrate } = require("./db");
const { createApp } = require("./app");

async function main() {
  await waitForDb();
  await migrate();

  const app = createApp();
  app.listen(PORT, "0.0.0.0", () => {
    const mode = SERVE_STATIC ? "API + static" : "API only (Vite HMR)";
    console.log(`JS Playground (${mode}) on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
