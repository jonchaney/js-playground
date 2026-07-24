const PORT = Number(process.env.PORT || 3847);
const SERVE_STATIC = process.env.SERVE_STATIC !== "0";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://playground:playground@localhost:5433/playground";

const BLANK = `function foo() {

}
`;

const STATE_ID = "default";
const CLOSED_TABS_LIMIT = 50;

module.exports = {
  PORT,
  SERVE_STATIC,
  DATABASE_URL,
  BLANK,
  STATE_ID,
  CLOSED_TABS_LIMIT,
};
