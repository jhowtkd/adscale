# Validação local da separação do Trabalho em camadas — 2026-08-12

## Tested revision

```text
commit: 2245209312760e9177e4544e7e15054261979b00
subject: fix: close layerization recovery findings
committed_at: 2026-08-12T19:22:02-03:00
```

The commands below ran against that commit with unrelated, pre-existing local
changes left unstaged. No real `FAL_KEY`, fal request, paid generation, deploy,
push, production authentication, or partner approval occurred.

## Command results

### PostgreSQL setup

```text
$ npm run test:db:setup
Starting adscale-test-postgres container...
Postgres is ready.
[✓] migrations applied successfully!
✅ Test database setup complete.
URL: postgres://test:test@localhost:5433/adscale_test
exit: 0
```

### TypeScript and focused unit/API tests

```text
$ npm run typecheck
> tsc --noEmit
exit: 0

$ npm test -- --run src/server/application/recover-expired-creative-work-layerizations.test.ts src/server/repositories/creative-work-layerization.test.ts src/server/jobs/creative-work-layerization.test.ts 'src/app/api/creative-work/[id]/route.test.ts'
Test Files  4 passed (4)
Tests       73 passed (73)
exit: 0
```

### Real-Postgres journey tracer

```text
$ DATABASE_URL=postgres://test:test@localhost:5433/adscale_test TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- --run tests/integration/creative-work-layerization-journey.test.ts
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    975ms
exit: 0
```

The tracer keeps the HTTP adapter, application services, repositories,
Postgres state transitions, job handler wiring, callback/polling race,
terminal claim, dispatch-lease release/retry, stale `finalizing` recovery,
private PSD readback, and on-demand ZIP behavior in the exercised path. The
auth session, fal HTTP, Inngest event transport, and object storage are boundary
fakes; the job handler runs in-process.

### Full automated suite

```text
$ npm test
Test Files  673 passed | 2 skipped (675)
Tests       4865 passed | 13 skipped (4878)
Duration    60.33s
exit: 0
```

The suite emitted existing localstorage/fontconfig warnings; no test failed.

### Lint and production build

```text
$ npm run lint
✖ 112 problems (0 errors, 112 warnings)
exit: 0

$ npm run build
✓ Compiled successfully in 13.2s
Finished TypeScript in 13.9s
✓ Generating static pages using 9 workers (94/94)
[prepare-standalone] copied static: 540 files
[prepare-standalone] copied public: 19 files
exit: 0
```

The lint warnings and build-time single-instance rate-limiter warnings predate
this layerization diff; neither command reported an error.

### Convergence and graph

```text
$ npm run convergence:gate
PRIMARY-DESTINATIONS: new API route file(s) (incl. nested): client-profiles/[id]/brand-fonts/route.ts.
CONVERGENCE-GATE: failed at "anti-expansion gate".
exit: 1

$ graphify update .
[graphify watch] Rebuilt: 25784 nodes, 44108 edges, 1992 communities
Code graph updated.
exit: 0
```

The convergence failure is outside commit `22452093`: the reported brand-font
route was already present at its parent revision. No layerization route or file
was named by the gate.
