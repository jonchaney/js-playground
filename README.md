# JS Playground (Lit + Vite + TypeScript + Postgres)

## Local dev (instant HMR)

Start Postgres (Docker), then the API + Vite client:

```bash
docker compose up db -d
npm install
npm run dev
```

- App (HMR): **http://localhost:5173**
- API: **http://localhost:3847** (proxied via Vite)

Edit files under `src/` — the browser updates immediately.

## Production / Docker (full stack)

```bash
docker compose up --build -d
```

Open **http://localhost:3847**

Tabs are stored in Postgres (`playground` database).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Express API + Vite HMR |
| `npm run build` | Build client to `dist/` |
| `npm start` | Serve API + `dist/` |

## Stop

```bash
docker compose down
```

Data stays in the `playground_pgdata` volume. To wipe it:

```bash
docker compose down -v
```

## DB access (optional)

Postgres is published on host port **5433**:

```bash
docker compose exec db psql -U playground -d playground
```
