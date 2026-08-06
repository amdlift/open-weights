# OpenWeights

Self-hosted weightlifting, bodyweight and cardio tracker. One container, one
SQLite file, no external services.

- Log strength work as sets, reps, weight and optional RPE; log cardio as
  distance and time; log planks and carries as time alone.
- Pick movements from ~130 built-in exercises or add your own.
- Dashboard with bodyweight and estimated-1RM trends, weekly volume by movement
  pattern, and this week's totals.
- Month calendar with a per-day synopsis, a full workout log, saved routines,
  body measurements, and an all-time records page.
- Multi-user: the first account is the admin and creates the rest.
- Metric or imperial per user — everything is stored in metric and converted for
  display, so switching units never changes a recorded number.
- Mobile-first and installable as a PWA.

## Running it

```yaml
# compose.yaml
services:
  openweights:
    image: amdlift/openweights:latest
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      # Must match the URL you actually browse to, scheme included.
      ORIGIN: http://localhost:3000
      TZ: Europe/Berlin
    volumes:
      - openweights-data:/data

volumes:
  openweights-data:
```

```
docker compose up -d
```

Open the app and the first visitor is walked through creating the admin account.
Registration closes as soon as that account exists; everyone else is added from
**Settings → Users**, where you hand out a temporary password that they must
replace at first sign-in.

Upgrading is `docker compose pull && docker compose up -d`. Migrations and new
built-in exercises are applied on start.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `ORIGIN` | — | Public origin, scheme included. **Required behind a reverse proxy** — SvelteKit rejects form posts whose `Origin` header does not match, so a wrong value looks like "nothing saves". |
| `DATABASE_PATH` | `/data/openweights.db` | SQLite file. Must be on a writable volume. |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | HTTP listener. |
| `BODY_SIZE_LIMIT` | `2M` | Maximum request body. |
| `DISABLE_SIGNUP` | `0` | Set to `1` to refuse self-registration even before an admin exists. |
| `TZ` | `UTC` | Fallback timezone for new accounts. Each user has their own in Settings. |

### Bind mounts

The image runs as uid 1000. A named volume inherits the right ownership
automatically; a bind mount does not, so either `chown 1000:1000` the host
directory or set `user:` in compose to match its owner.

### Backups

Everything lives in the SQLite file. With the container stopped, copy
`/data/openweights.db`. While it is running, use SQLite's own backup so you do
not capture a half-written WAL:

```
docker exec openweights node -e "new (require('better-sqlite3'))(process.env.DATABASE_PATH).backup('/data/backup.db')"
```

Each user can also export their own data as JSON from **Settings → Your data**.

## Development

The commands below run everything in a container, so no Node install is needed
on the host.

```
docker compose -f compose.dev.yaml up                          # vite dev on :5173
docker compose -f compose.dev.yaml run --rm app npm test       # unit tests
docker compose -f compose.dev.yaml run --rm app npm run check  # svelte-check
docker compose -f compose.dev.yaml run --rm app npx drizzle-kit generate
```

Building and publishing the image:

```
docker buildx build --platform linux/amd64,linux/arm64 -t amdlift/openweights:latest --push .
```

### Layout

| Path | What lives there |
| --- | --- |
| `src/lib/constants.ts` | Shared vocabulary — exercise kinds, muscle groups, units. Imported by both the schema and the browser, so it holds no server code. |
| `src/lib/units.ts` | The only place unit conversion is allowed to happen. |
| `src/lib/one-rm.ts` | Epley / Brzycki / Lombardi. Estimates are computed on read, never stored. |
| `src/lib/dates.ts` | Calendar-day helpers. Workouts are keyed by a local `YYYY-MM-DD`, not an instant. |
| `src/lib/server/db/` | Drizzle schema, connection, migrations, built-in exercise seed. |
| `src/lib/server/` | Auth, and one service module per feature. Every mutation re-checks ownership. |
| `src/lib/components/charts/` | Hand-built SVG charts. **Read its README before touching the palette** — the colours are validated, not chosen by eye. |
| `drizzle/` | Generated SQL migrations, applied at start-up. |

### Adding a built-in exercise

Append to `SEED_EXERCISES` in `src/lib/server/db/seed-exercises.ts`. The seeder
upserts on `slug`, so new entries appear on upgrade and renames update existing
rows. Never reuse or repurpose a slug — that silently rewrites someone's
history.

## Licence

MIT.
