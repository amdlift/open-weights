# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

The host has no Node on PATH. Everything runs inside the dev container defined in
`compose.dev.yaml` (node:24, uid 1000:100, bind-mounts the repo at `/app`):

```
docker compose -f compose.dev.yaml up                                      # vite dev on :5173
docker compose -f compose.dev.yaml run --rm app npm test                    # vitest, single run
docker compose -f compose.dev.yaml run --rm app npm run check               # svelte-check + tsc
docker compose -f compose.dev.yaml run --rm app npx vitest run src/lib/units.test.ts
docker compose -f compose.dev.yaml run --rm app npx vitest run -t 'renames' # single test by name
docker compose -f compose.dev.yaml run --rm app npx drizzle-kit generate    # after editing schema.ts
```

CI (`.github/workflows/release.yml`) gates on `npm run check` and `npm test`, then
buildx-publishes `linux/amd64,linux/arm64` on `v*` tags. There is no lint step and no
formatter config — match surrounding style (tabs, single quotes).

## Architecture

SvelteKit 2 (Svelte 5 runes only — no `export let` anywhere) on `adapter-node`, one
SQLite file via `better-sqlite3` + Drizzle, Tailwind v4. No external services; the whole
app is one process sharing one synchronous DB connection.

**Request lifecycle.** `src/hooks.server.ts` is the single gate: CSRF check → session
resolution → redirect policy (`/setup` when the instance has no users, `/login`,
`/onboarding` until the account is ready) → theme class stamped into `app.html`. Because
of that gate, `locals.user!` is safe inside the `(app)` route group and nowhere else.

**Layering.** Routes parse and validate; `src/lib/server/*.ts` (one module per feature)
owns all SQL. Every service function takes `userId` first and `db: Db = getDb()` last —
the default lets routes call it plainly while tests inject an in-memory database.

**Database bootstrap.** `getDb()` in `src/lib/server/db/index.ts` opens the connection,
runs migrations, and seeds built-in exercises on *first access* — not in the entrypoint —
so `docker compose pull && up` is the entire upgrade path and `vite dev` behaves the same.
The handle is cached on `globalThis` so HMR does not leak connections.

**Schema changes.** Edit `src/lib/server/db/schema.ts`, run `drizzle-kit generate`, commit
the generated SQL in `drizzle/`. Never hand-edit an existing migration — it has already
run on someone's data.

## Invariants

These are load-bearing decisions with comments explaining why at each site. Breaking one
silently corrupts user data or breaks self-hosted deployments.

- **Metric storage only.** kg, cm, metres, seconds in the database. `$lib/units.ts` is the
  only place conversion happens, and `$lib/server/form-values.ts` is the only way a
  submitted measurement enters a service call. Never pass an already-converted value in.
- **Blank is not zero.** Form readers return `undefined` for "field absent, leave the
  column alone" and `null` for "submitted empty, clear it". A set with no weight is not a
  set lifted with an empty bar.
- **Calendar days, not instants.** Workouts and measurements key on a `YYYY-MM-DD` string
  in the *user's* timezone (`$lib/dates.ts`). `parseIsoDate` returns UTC midnight and its
  result must only ever be formatted with `timeZone: 'UTC'`.
- **Analytics are derived on read.** 1RM estimates, PRs and volume are recomputed every
  request (`stats.ts`, `one-rm.ts`) so a formula change in Settings is retroactive. Do not
  cache or persist an aggregate.
- **Ownership is re-checked per mutation.** Route params are attacker-controlled, so every
  service mutation resolves the target row back to `userId` (`ownsWorkout`,
  `workoutIdForSet`, …) rather than trusting the URL.
- **CSRF is custom, on purpose.** Kit's check is disabled in `svelte.config.js`
  (`trustedOrigins: ['*']`) and replaced by `src/lib/server/csrf.ts`, which compares
  `Origin` against the `Host` the browser actually connected to. This is what makes plain
  http on a LAN work with zero configuration. Do not re-enable Kit's check or remove the
  hook without restoring the other half.
- **Cookie `Secure` comes from explicit signals only** (`X-Forwarded-Proto` or a
  configured `ORIGIN`), never from `event.url` — adapter-node defaults that to `https` and
  the cookie would be discarded on an http deployment.
- **Exercise slugs are permanent.** Built-ins are upserted on `slug` on every boot, so
  reusing or repurposing a slug rewrites someone's history. Add new entries to
  `SEED_EXERCISES` in `seed-exercises.ts`; dropped built-ins are archived, never deleted.
- **Exercise filtering is client-side.** `listExercises` ships the whole library with the
  page and `ExercisePicker.svelte` filters it in the browser, so search stays instant on a
  bad gym connection.
- **The service worker never caches pages or API responses** — only hashed build output.
  Per-user pages plus a shared phone is a real leak.

## Styling and charts

`src/app.css` defines `--ow-*` tokens for light and dark, bridged into Tailwind utilities
via `@theme inline` (so `bg-surface`, `text-muted`, `border-border-base` are the tokens).
Dark mode is a `.dark` class on `<html>`, stamped server-side from the user's saved theme.
Shared component classes are `@utility ow-card` / `ow-input` / `ow-btn-*`.

Charts are hand-built SVG on `d3-scale`. **Read `src/lib/components/charts/README.md`
before touching `--ow-series-*` or chart marks** — the palette was validated for CVD and
contrast against both surfaces, series colour follows the entity rather than list
position, and a seventh hue is not allowed.

## Configuration

Nothing is required to run. `DATABASE_PATH`, `PORT`/`HOST`, `TZ`, `DISABLE_SIGNUP`,
`BODY_SIZE_LIMIT`, and the reverse-proxy-only `TRUSTED_ORIGINS`/`ORIGIN` are documented in
`.env.example` and the README. When a config-dependent path fails, it must fail with a
page naming what did not match (see `csrfErrorResponse`, `docker/entrypoint.sh`) — never a
bare 403 or a button that silently does nothing.

## Tests

`vitest`, node environment, `*.test.ts` beside the module. Server tests run against a real
in-memory SQLite database with the real migrations applied (`src/lib/server/test-helpers.ts`)
so foreign keys, partial indexes and cascades are exercised rather than mocked. `makeUser`
inserts directly to skip ~50ms of Argon2 hashing. There are no component or E2E tests.
