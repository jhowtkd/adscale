# Validação local da separação da Peça em camadas — 2026-08-13

## Tested revision

```text
commit: 35fde18c7463dd62ca315ecd3f38ca7b63ca302c
subject: chore: clean up layerize merge residue
committed_at: 2026-08-13T20:56:37-03:00
```

The commands below ran against that revision on `feat/227-seedream-layerize`.
It includes the real-PostgreSQL selection-lock regression from `7fea3cdb` and
the migration/catalog reconciliation through `0085` from the preceding
closeout commits. No real `FAL_KEY` was supplied in any command environment;
tests may use synthetic in-process values for disabled/enabled branch coverage.
Existing `.planning/**` WIP was preserved outside this closeout and remains
unstaged. The reconciled
migration order is `0083_brand_font_assets`, `0084_brand_knowledge`,
`0085_creative_work_layerization`.

## Command results

### PostgreSQL setup

```text
$ npm run test:db:setup
Container adscale-test-postgres is already running.
Postgres is ready.
[✓] migrations applied successfully!
✅ Test database setup complete.
URL: postgres://test:test@localhost:5433/adscale_test
elapsed (capture): 2s
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
Duration    1.62s
elapsed (capture): 2s
exit: 0
```

The command contains 11 path arguments; Vitest expands the `src/server/layerize`
directory into the two additional files reported above.

### Real-PostgreSQL selection-lock race

```text
$ DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  NODE_ENV=test npm test -- --run \
  tests/integration/creative-work-layerization-selection-lock.test.ts
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    684ms
elapsed (capture): 1s
exit: 0
```

This uses the real test PostgreSQL database and the public selection/claim
repository functions. It does not make a fal HTTP request or perform a paid
operation.

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
Test Files  1 failed | 688 passed (689)
Tests       1 failed | 4951 passed | 1 skipped (4953)
Duration    60.39s
elapsed (capture): 61s
exit: 1
```

The failure is in `src/server/repositories/artifact-version.test.ts`: it
expects `Operation ID reused for a different command`, while the implementation
throws `Operation ID belongs to a different promotion command`. That file is
unchanged versus `origin/main`, which has the same assertion; this explains the
scope of the failure but does not make the full suite green.

### Typecheck and lint

```text
$ npm run typecheck
> tsc --noEmit
elapsed (capture): 2s
exit: 0

$ npm run lint
✖ 111 problems (0 errors, 111 warnings)
elapsed (capture): 14s
exit: 0
```

### Build

The requested bare invocation was also recorded:

```text
$ npm run build
Error: Env validation failed for DATABASE_URL: Required
Failed to collect page data for /api/admin/quality/brands
elapsed (capture): 45s
exit: 1
```

The same local build was then run with the required non-production dummy
environment, a local test `DATABASE_URL`, and `FAL_KEY` still unset:

```text
$ [required local dummy environment; FAL_KEY unset] npm run build
✓ Compiled successfully
✓ Finished TypeScript
✓ Generating static pages using 9 workers (94/94)
[prepare-standalone] copied static: 545 files
[prepare-standalone] copied public: 19 files
elapsed (capture): 30s
exit: 0
```

This is local compilation evidence only; it is not deployment or production
acceptance.

### Convergence

```text
$ npm run convergence:gate
PRIMARY-DESTINATIONS: no expansion detected vs base "origin/main".
FROZEN-MODULES: reviewed 15 commit(s) in 676d029a..HEAD; no freeze violations.
PLANNING-CONSISTENCY: ok (22 complete, 0 open, 0 accepted_debt)
SURFACE-INVENTORY: ok
NO-PARALLEL-PREVIEW: ok (no /v6 route tree or route literals)
CONVERGENCE-GATE: all gates passed.
elapsed (capture): 1s
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
elapsed (capture): 19s
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
authentication, partner approval, push, or merge occurred. `#235` remains
`ready-for-human`. Local automated checks do not establish CI status,
mergeability, external storage behavior, provider economics, PSD application
compatibility, or paid acceptance.

The full suite remains blocked by the unrelated `artifact-version.test.ts`
assertion above; this evidence commit records that failed validation state and
does not authorize merge, deploy, or release.
