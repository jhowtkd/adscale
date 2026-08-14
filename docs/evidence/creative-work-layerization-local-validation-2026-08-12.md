# Validação local da separação da Peça em camadas — 2026-08-14

## Tested revision

```text
commit: 6444a87955e3392ec9581ff1cb8bd228a775b8be
subject: docs: record isolated waiter validation
committed_at: 2026-08-14T07:13:53-03:00
```

The commands below ran against that revision on `feat/227-seedream-layerize`.
This is the final timestamped validation refresh atop `3a1e3def`,
`13b994d8`, `e0e889ab`, `35fde18c`, and `7fea3cdb`; the evidence-file commit
itself is subsequent to these command runs. It includes the real-PostgreSQL
selection-lock regression, per-race waiter PID isolation, and the
artifact-version replay assertion fix. No real `FAL_KEY` was supplied in any
command environment; tests may use synthetic in-process values for
disabled/enabled branch coverage. Existing `.planning/**` WIP was preserved
outside this closeout and remains unstaged. The reconciled migration order is
`0083_brand_font_assets`, `0084_brand_knowledge`,
`0085_creative_work_layerization`.

## Command results

### PostgreSQL setup

```text
$ npm run test:db:setup
Container adscale-test-postgres is already running.
Waiting for Postgres to be ready...
Postgres is ready.
Running drizzle-kit migrate...
No config path provided, using default 'drizzle.config.ts'
Reading config file '/Users/jhonatan/Repos/ADScale_2-worktrees/seedream-layerize/app/drizzle.config.ts'
Using 'pg' driver for database querying
[✓] migrations applied successfully!✅ Test database setup complete.
   URL: postgres://test:test@localhost:5433/adscale_test
elapsed (capture): 4.17s
exit: 0
```

### Focused Layerize suite

```text
$ DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  NODE_ENV=test npm test -- --run \
  src/server/application/request-creative-work-layerization.test.ts \
  src/server/application/recover-expired-creative-work-layerizations.test.ts \
  src/server/application/select-creative-work-output.test.ts \
  src/server/repositories/creative-work.test.ts \
  src/server/repositories/creative-work-layerization.test.ts \
  src/server/jobs/creative-work-layerization.test.ts \
  src/server/layerize \
  'src/app/api/creative-work/[id]/route.test.ts' \
  tests/integration/creative-work-layerization-journey.test.ts \
  tests/integration/creative-work-layerization-selection-lock.test.ts \
  src/components/creative-work/CreativeResultCard.test.tsx
Test Files  13 passed (13)
Tests       188 passed (188)
Start at  07:28:56
Duration  3.25s (transform 2.69s, setup 1.43s, import 8.52s, tests 1.61s, environment 1.22s)
elapsed (capture): 4.31s
exit: 0
```

The command contains 11 path arguments; Vitest expands the
`src/server/layerize` directory into the two additional files reported above.

### Real-PostgreSQL selection-lock race

```text
$ DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  NODE_ENV=test npm test -- --run \
  tests/integration/creative-work-layerization-selection-lock.test.ts
Test Files  1 passed (1)
Tests       1 passed (1)
Start at  07:29:03
Duration  1.05s (transform 159ms, setup 49ms, import 506ms, tests 316ms, environment 0ms)
elapsed (capture): 1.84s
exit: 0
```

This is a real PostgreSQL concurrency check, not a promise-only race: one
transaction holds the selected output with `FOR UPDATE`; both public
selection/claim queries are observed waiting in `pg_stat_activity`/`pg_locks`,
and only PIDs not present in the pre-race relevant-waiter baseline are accepted.
Twelve repeated races assert exactly one winner after the lock is released.
It does not make a fal HTTP request or perform a paid operation.

### Artifact-version replay regression

```text
$ DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  NODE_ENV=test npm test -- --run \
  src/server/repositories/artifact-version.test.ts
Test Files  1 passed (1)
Tests       17 passed (17)
Start at  07:29:10
Duration  1.02s (transform 144ms, setup 45ms, import 481ms, tests 336ms, environment 0ms)
elapsed (capture): 1.76s
exit: 0
```

The run emitted one existing `pg@9.0` deprecation warning about calling
`client.query()` while a client was already executing a query; it did not
fail the test.

### Journey tracer boundaries

The Layerize journey exercises a real local Better Auth session cookie,
workspace authorization, PostgreSQL, application services, and repositories.
These four seams remain intentionally intercepted:

- `inngest.send` does not travel through `/api/inngest` or Inngest Cloud.
- The continuation calls the exported `layerizationJobHandler` in-process.
- `objectStorage` delegates to `InMemoryObjectStorage`, not an external storage service.
- fal HTTP is a fake server.

The journey therefore does not prove Inngest registration, external storage,
deployment, or paid provider behavior.

### Full automated suite

```text
$ DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  NODE_ENV=test npm test
Test Files  689 passed (689)
Tests       4952 passed | 1 skipped (4953)
Start at  07:33:53
Duration  92.92s (transform 27.16s, setup 45.72s, import 272.65s, tests 97.24s, environment 244.40s)
elapsed (capture): 93.90s
exit: 0
```

The full suite is green and includes the corrected artifact-version test.

### Typecheck and lint

```text
$ npm run typecheck
> tsc --noEmit
elapsed (capture): 7.72s
exit: 0

$ npm run lint
✖ 111 problems (0 errors, 111 warnings)
  0 errors and 2 warnings potentially fixable with the `--fix` option.
elapsed (capture): 30.39s
exit: 0
```

### Build

The requested bare invocation was also recorded with `FAL_KEY` unset and the
required local environment absent:

```text
$ npm run build
✓ Compiled successfully in 22.8s
  Finished TypeScript in 22.9s
Error: Env validation failed for DATABASE_URL: Required
Error: Failed to collect page data for /api/admin/quality/brands/[clientProfileId]/evidence
elapsed (capture): 49.38s
exit: 1
```

The same local build was then run with a local test `DATABASE_URL`, local
`BETTER_AUTH_URL`/`APP_URL`, a 32+ character dummy `BETTER_AUTH_SECRET`, the
remaining required schema values as local placeholders, and `FAL_KEY` still
unset:

```text
$ [required local dummy environment; FAL_KEY unset] npm run build
✓ Compiled successfully in 18.2s
✓ Finished TypeScript in 22.9s
✓ Generating static pages using 9 workers (94/94) in 574ms
[prepare-standalone] copied static: 545 files
[prepare-standalone] copied public: 19 files
elapsed (capture): 52.57s
exit: 0
```

This is local compilation evidence only; it is not deployment or production
acceptance.

### Convergence

```text
$ npm run convergence:gate
PRIMARY-DESTINATIONS: no expansion detected vs base "origin/main". 12 dashboard group(s); 15 dashboard page(s); 25 api tree(s); 170 api route(s); 106 ai module(s).
FROZEN-MODULES: reviewed 22 commit(s) in 676d029afb..HEAD; no freeze violations.
PLANNING-CONSISTENCY: ok (22 complete, 0 open, 0 accepted_debt)
SURFACE-INVENTORY: ok (1 blockers 1:1, 1 blocker decisions, 6 curated)
NO-PARALLEL-PREVIEW: ok (no /v6 route tree or route literals)
CONVERGENCE-GATE: all gates passed.
elapsed (capture): 1.93s
exit: 0
```

### Repository integrity and Graphify

```text
$ git diff --check origin/main...HEAD
elapsed (capture): 0s
exit: 0

$ graphify update .
[graphify watch] No code-graph topology changes detected; outputs left untouched.
Code graph updated.
elapsed (capture): 35.44s
exit: 0

$ git status --short graphify-out
[no output]
exit: 0
```

Graphify reported warnings for 102 source files producing zero nodes and 89
SQL files without the optional `tree_sitter_sql` dependency, but it detected no
topology change and produced no worktree diff.

## Negative claims and human gate

No real `FAL_KEY`, fal request, paid generation, deploy, production
authentication/browser smoke, partner approval, or push occurred. No merge of
PR #249 into `main` occurred; this statement is limited to `main` and does not
describe the branch's local commit history.
`#235` remains `ready-for-human`; no paid pilot or partner approval is implied.

Local automated checks do not establish CI status, remote mergeability,
deployment, external/R2 storage behavior, provider economics, PSD application
compatibility, or paid acceptance. The local journey's intercepted seams and
the absence of a real provider request remain explicit above.
