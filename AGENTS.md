# AGENTS.md

The runnable application lives in **`app/`** (a Next.js 16 App Router project). All commands below are run from `app/` unless noted. See `README.md` and `app/README.md` for full product/setup docs.

## Cursor Cloud specific instructions

### Services / layout
- Single product: **ADScale** Next.js app in `app/`. `npm run dev` starts **two** processes via `scripts/dev-with-inngest.mjs`: Next.js (`http://localhost:3000`) and the Inngest dev server (`http://localhost:8288`).
- Data layer is **PostgreSQL** using a non-default schema `adscale_app`. Drizzle migrations live in `app/drizzle/`.

### PostgreSQL (must be running before migrate / dev / tests)
- Postgres 16 is installed system-wide but is **not auto-started on boot**. Start it with: `sudo pg_ctlcluster 16 main start` (verify with `pg_lsclusters`).
- Local role/db used by `.env.local`: user `adscale` / password `adscale` / db `adscale` (superuser). The data dir persists in the VM snapshot, so the role/db and applied migrations usually already exist — just start the server.

### Environment file
- `app/.env.local` is git-ignored and holds local dev config. It uses a real local Postgres `DATABASE_URL` plus **valid-format placeholder** credentials for OpenAI / Stripe / R2 / Resend (these external APIs are NOT live). Env is validated at module load (`src/server/validation/env.ts`); missing/badly-formatted vars throw at access time outside `NODE_ENV=test`. If `.env.local` is missing, recreate it from `app/.env.example` keeping the same placeholder formats (e.g. `BETTER_AUTH_SECRET` ≥32 chars, keys prefixed `sk-`/`re_`/`whsec_`/`price_`).

### Migrations gotcha
- Use `npm run db:migrate` (custom `scripts/migrate-with-retry.mjs`). It requires the `public.__drizzle_migrations` table to already exist. On a **fresh** database, run `npx drizzle-kit migrate` once first (it bootstraps that table + the schema), then `npm run db:migrate` applies all journal entries. `DATABASE_URL` must be exported in the shell for these scripts (they read `process.env` directly, not `.env.local`).

### Run / test / lint / build (from `app/`)
- Dev: `npm run dev`
- Lint: `npm run lint` (passes with warnings only)
- Tests: `DATABASE_URL=... NODE_ENV=test npm test -- --run` (needs Postgres running). ~1532 tests pass. Four test files fail independent of environment: `scripts/check-plan-scope.test.mjs`, `scripts/check-visual-contract.test.mjs`, `scripts/snapshot-visual-dirty-state.test.mjs` (import `node:test`, which the vitest bundler can't load) and `tests/unit/ai/creative-corpus.test.ts` (imports a generated `exports/render-creatives/manifest.json` that is not committed).
- Build: `npm run build` — `next build` page-data collection does **not** read `.env.local`; export the env vars into the shell first, e.g. `set -a && . ./.env.local && set +a && npm run build`.
