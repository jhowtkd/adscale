# Validação local da separação da Peça em camadas — 2026-08-13

## Tested revision

```text
commit: 2ff93012ea6857cc068c37e5a55e844bf74d52a4
subject: fix: close layerization review findings
committed_at: 2026-08-13T08:53:46-03:00
```

The commands below ran against that commit on `feat/227-seedream-layerize`.
Untracked `.planning/seedream-layerize-*.md` files were left unstaged. No real
`FAL_KEY`, fal request, paid generation, deploy, production authentication, or
partner approval occurred.

This supersedes the 2026-08-12 note that referenced `22452093` (not an ancestor
of this PR) and a `convergence:gate` failure caused by Brand Fonts on the mixed
branch.

## Command results

### PostgreSQL setup

```text
$ npm run test:db:setup
Container adscale-test-postgres is already running.
Postgres is ready.
[✓] migrations applied successfully!
✅ Test database setup complete.
URL: postgres://test:test@localhost:5433/adscale_test
exit: 0
```

### TypeScript and Layerize tests

```text
$ npm run typecheck
> tsc --noEmit
exit: 0

$ DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  NODE_ENV=test npm test -- --run \
  src/server/application/request-creative-work-layerization.test.ts \
  src/server/application/recover-expired-creative-work-layerizations.test.ts \
  src/server/repositories/creative-work-layerization.test.ts \
  src/server/jobs/creative-work-layerization.test.ts \
  src/server/layerize \
  'src/app/api/creative-work/[id]/route.test.ts' \
  tests/integration/creative-work-layerization-journey.test.ts \
  src/components/creative-work/CreativeResultCard.test.tsx
Test Files  9 passed (9)
Tests       101 passed (101)
exit: 0
```

### Real-Postgres journey tracer

```text
$ DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  NODE_ENV=test npm test -- --run tests/integration/creative-work-layerization-journey.test.ts
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    242ms
exit: 0
```

The tracer uses a real Better Auth session cookie, workspace authorization,
Postgres, application services, and repositories. These seams stay intercepted:

- `inngest.send` does not travel through `/api/inngest` or Inngest Cloud
- continuation calls exported `layerizationJobHandler` in-process
- `objectStorage` methods are delegated to `InMemoryObjectStorage`, not R2
- fal HTTP is a fake server

It does not prove Inngest registration, R2, deployment, or paid generation.

### Full automated suite

```text
$ DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
  NODE_ENV=test npm test
Test Files  1 failed | 667 passed (668)
Tests       1 failed | 4844 passed | 1 skipped (4846)
Duration    104.48s
exit: 1
```

The single failure is pre-existing on `origin/main` and outside this diff:
`artifact-version.test.ts` expects `"Operation ID reused for a different command"`
while the implementation throws `"Operation ID belongs to a different promotion command"`.

### Lint and production build

```text
$ npm run lint
✖ 113 problems (0 errors, 113 warnings)
exit: 0

$ npm run build
✓ Compiled successfully in 29.6s
Finished TypeScript in 22.9s
✓ Generating static pages using 9 workers (94/94)
[prepare-standalone] copied static: 538 files
[prepare-standalone] copied public: 19 files
exit: 0
```

The lint warnings predate this layerization diff. The build used dummy CI
secrets; `FAL_KEY` was not set.

### Convergence

```text
$ npm run convergence:gate
PRIMARY-DESTINATIONS: no expansion detected vs base "origin/main".
FROZEN-MODULES: reviewed 6 commit(s) in d7e1971784..HEAD; no freeze violations.
PLANNING-CONSISTENCY: ok
SURFACE-INVENTORY: ok
NO-PARALLEL-PREVIEW: ok
CONVERGENCE-GATE: all gates passed.
exit: 0
```

The previous Brand Fonts anti-expansion failure is absent from this branch.
`FAL_KEY` remains unset. `#235` stays `ready-for-human`.
