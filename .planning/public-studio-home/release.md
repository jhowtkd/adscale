# Public Studio Home — release record (S9, em andamento)

## Rehearsed rollback reference

- Unified commit: `0a60036b` (`test: prove guest-home recovery, partial batch and flag transitions`)
  + docs `c50b260d`. Branch `feat/public-studio-home`.
- Eligible rollback target: any build ≥ `0a60036b` on this branch (unified, snapshot-compatible).
  Pre-migration commits that require the old upstream are NOT eligible after retirement.
- Rollback rehearsal: `HOME=false/IMPORT=true` on the production build — fallback served,
  pending draft completed (S8 flags phase `rollback`, evidence in `qa-evidence.md`).

## Activation state

- `render.yaml`: all three `PUBLIC_STUDIO_*` flags `"false"` (safe default, committed).
- Activation A: pending human approval + deploy (#447).
- Activation B: pending B gates (native R2/Inngest attach validation, physical Safari/iOS,
  V05 owner approvals, V03 manual review).

## Old-service retirement

- Blueprint inventory: no separate marketing service in `render.yaml` (only `adscale-app`,
  `adscale-image-worker`, `adscale-postgres`).
- Code/config grep: zero remote-marketing hosts; `MARKETING_UPSTREAM_URL` absent everywhere.
- E2E: public journey asserts 100% same-origin traffic.
- Dashboard resource identification + deactivation: human step (see runbook §6). Not started.

## Human gates requested (#447)

1. Approve + deploy activation A (merge PR, flip flags, verify).
2. B gates: owner asset approvals, manual screen-reader review, mail-infra scenarios (A03–A06),
   S09 blocked-upgrade proof, production attach validation.
3. Execute old-service deactivation + post-verification.
