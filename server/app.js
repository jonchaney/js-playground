const express = require("express");
const fs = require("fs");
const path = require("path");
const { SERVE_STATIC } = require("./config");
const healthRoutes = require("./routes/health");
const stateRoutes = require("./routes/state");

function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.use("/api", healthRoutes);
  app.use("/api", stateRoutes);

  // dist/ lives at the repo root (one level up from server/)
  const distDir = path.join(__dirname, "..", "dist");
  if (SERVE_STATIC && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  return app;
}

module.exports = { createApp };
