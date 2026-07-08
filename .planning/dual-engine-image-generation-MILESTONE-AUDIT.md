---
milestone: dual-engine-image-generation
audited: 2026-07-08T15:15:00-03:00
status: tech_debt
branch: main
head: aefa55de
remediation:
  - "2026-07-08: registered 0073_derivations_candidates in drizzle/meta/_journal.json (idx 72)"
scores:
  requirements: 2/4 goals fully met; G1/G2 partial; G3 migration path fixed
  non_goals: 6/6 honored
  integration: 15/16
  flows: 4/5
gaps:
  requirements:
    - id: "G1"
      status: "partial"
      phase: "image-generation orchestrator"
      claimed_by_plans: ["docs/superpowers/plans/2026-07-08-dual-engine-image-generation.md"]
      completed_by_plans: ["MVP OpenAI-first documented in app/AGENTS.md"]
      verification_status: "gaps_found"
      evidence: "Spec requires creative-score per candidate + highest score wins; code uses winnerIndex=0 (OpenAI-first). Documented as follow-up, but ship summary claimed all 4 goals met."
    - id: "G3-migration"
      status: "satisfied"
      phase: "drizzle 0073"
      claimed_by_plans: ["Task 7 migration"]
      completed_by_plans: ["91b7bfe4 feat(dual-engine): add candidates jsonb column", "journal remediation 2026-07-08"]
      verification_status: "passed"
      evidence: "0073 SQL + schema + journal entry idx 72 tag 0073_derivations_candidates. Still verify with db:migrate on staging before prod."
    - id: "G4-rollback"
      status: "partial"
      phase: "env sample rate"
      claimed_by_plans: ["spec Rollout & Rollback", "ship summary zero-downtime"]
      completed_by_plans: ["composite shouldRunSeedream", "AGENTS.md restart note"]
      verification_status: "partial"
      evidence: "env.SEEDREAM_SAMPLE_RATE is parsed once at module load (env.ts safeParse). Changing the env var without restarting workers does not take effect. AGENTS.md correctly requires worker restart; ship claim of zero-downtime per-request read is overstated."
  integration:
    - "creative-work calls generateAndStoreImage but does not persist candidates"
  flows:
    - "Score-based winner E2E: not implemented (OpenAI always wins)"
tech_debt:
  - phase: winner-selection
    items:
      - "Wire per-candidate creative-score.ts (follow-up Task 13)"
  - phase: telemetry
    items:
      - "campaignId/workspaceId empty placeholders; jobType hard-coded derivation"
      - "costCredits undefined per provider"
  - phase: providers
    items:
      - "Per-provider retry policies rely on SDK defaults"
  - phase: persistence-scope
    items:
      - "candidates column only on derivations; creative-work discards candidates meta"
  - phase: e2e
    items:
      - "Plan Task 11 Playwright both-providers-fail path not implemented; no e2e-closed commit found"
  - phase: docs
    items:
      - "Spec vs AGENTS rollback wording diverge (zero-downtime vs restart workers)"
nyquist:
  overall: n/a
  note: "Not a GSD numbered-phase milestone; no *-VALIDATION.md for this ship"
---

# Dual-Engine Image Generation — Milestone Audit

**Verdict:** `tech_debt` — P0 migration journal gap **remediated**; remaining issues are accepted/deferred debt + claim hygiene.

**Scope note:** GSD `STATE.md` still points at **v13.9 Copiloto Criativo Iterativo** (phases 203–207). The work audited here is the **dual-engine image generation** ship on `main` (18 commits from `2f60c21f`…`aefa55de`), matching the branch-complete summary provided for audit — not v13.9 archive closure.

## Executive Verdict

Provider extraction, composite parallel execution, sample-rate gating, R2 per-candidate isolation, derivation code persistence, and telemetry emission are largely wired and unit-covered.

**Remediation (2026-07-08):** `0073_derivations_candidates` registered in `app/drizzle/meta/_journal.json` (`idx: 72`). Deploy migrate will now apply the additive `derivations.candidates` column. Still run `db:migrate` on staging before production.

Remaining non-blockers:

1. **Claim accuracy — G1 is not met as specified.** Scoring does not choose the winner; OpenAI always wins when both succeed. Accept as **explicit tech debt** (follow-up Task 13), not as “all 4 goals met.”
2. **Zero-downtime rollback** claim is overstated: `env` is boot-parsed; AGENTS.md’s “restart the worker pool” is the accurate ops path.

## Requirements Coverage (3-source)

| ID | Spec / plan | Implementation | Ship summary claim | Final |
|----|-------------|----------------|--------------------|-------|
| **G1** Parallel engines; score picks best | Spec §Goals + architecture steps 5–6 | Parallel **yes**; score pick **no** (`winnerIndex = 0`) | “all 4 goals met” | **partial / unsatisfied vs claim** |
| **G2** Better reproduction w/o style/cost regression | Spec | Engines wired; Seedream cannot win → benefit unrealized; cost can double when rate>0 | met | **partial** |
| **G3** API/contracts intact; reversible | Spec + plan | Call sites additive; journal **fixed** 2026-07-08 | met | **satisfied** (verify migrate on staging) |
| **G4** Ship behind `SEEDREAM_SAMPLE_RATE` | Spec | Wired + unit-tested; rollback needs restart | zero-downtime claimed | **partial** |
| **NG1–NG6** | Spec non-goals | Honored (OpenAI floor, no UI, no new rubric, global rate, 2 providers, no fidelity knobs) | honored | **satisfied** |

Open questions from spec:

| # | Question | Resolution |
|---|----------|------------|
| 1 | `candidates` on all output tables vs derivations first | **Resolved:** derivations only (plan Task 7); creative-work deferred |
| 2 | Exact `SEEDREAM_MODEL_NAME` | **Deferred to env** (correct) |
| 3 | Base64 vs R2 URL for Seedream refs | **Implemented in provider** (with fallback path per design) |

## Phase / Task Coverage

| Plan task | Status | Evidence |
|-----------|--------|----------|
| 1 Env vars | done | `env.ts`, `.env.example`, tests |
| 2 Interface | done | `providers/image-provider.ts` |
| 3 OpenAI provider | done | `openai-image-provider.ts` + tests |
| 4 Seedream provider | done | `seedream-image-provider.ts` + tests |
| 5 Composite | done | `composite-image-provider.ts` + failure matrix tests |
| 6 Refactor `generateAndStoreImage` | done | OpenAI-first winner documented |
| 7 Migration + schema | **done** | SQL + schema + journal idx 72 |
| 8 Persist on derivation | code done | `jobs/derivation.ts` writes `candidates` |
| 9 Telemetry | done w/ debt | placeholders for campaign/workspace |
| 10 Docs | done | `.env.example`, `AGENTS.md` |
| 11 E2E both-fail | **missing** | No Playwright commit; plan still open |
| 12 Final integration | claimed | Full suite not re-run in this audit; focused vitest path-alias failures when run outside project config |

Ship summary claimed “1 e2e-closed decision” commit — **not found** in `git log` for this range.

## Integration ([checker](e53be1f7-97c7-4ca5-8034-04b83e770d0e))

**Score:** 15/16 wiring checks · 4/5 flows

| Check | Result |
|-------|--------|
| Composite `allSettled`; one fail ≠ job fail | pass |
| Sample rate 0 → OpenAI only | pass |
| R2 per-candidate upload isolation | pass |
| Telemetry `image.generation.candidates` | pass (IDs empty) |
| Derivation persist `candidates` (code) | pass |
| Journal registers 0073 | **pass** (remediated 2026-07-08) |
| Creative-work persists candidates | fail (accepted defer) |
| Brand-training image gen | n/a (not a consumer) |

## Production Safety Claims vs Evidence

| Claim | Evidence | Audit |
|-------|----------|-------|
| `SEEDREAM_SAMPLE_RATE=0` zero-downtime rollback, read per-request | `env` module-level `safeParse`; composite reads `env.SEEDREAM_SAMPLE_RATE`; AGENTS says restart workers | **Overclaimed** — restart required |
| Both providers parallel; one failure does not fail job | `Promise.allSettled` in composite | **Pass** |
| Per-candidate R2 failures isolated | `Promise.allSettled` uploads; final-review fix `7c5cee06` | **Pass** |
| MVP winner always OpenAI on tie | `winnerIndex = 0`; AGENTS + commit `aefa55de` | **Pass** (as debt, not as G1) |

## Tech Debt (documented / acceptable if owner accepts)

1. Per-candidate `creative-score` winner selection (Task 13)
2. Thread `campaignId` / `workspaceId` / `jobType` into telemetry (Task 14)
3. Populate `costCredits` (Task 15)
4. Per-provider retry policies (Task 16)
5. Creative-work (and other tables) candidates persistence
6. Playwright Task 11 both-providers-fail path
7. Align rollback docs (spec “no redeploy” vs AGENTS “restart workers” vs boot-parsed env)

## Before Ship (remaining)

1. ~~Register `0073` in journal~~ **done** — still **verify** `npm run db:migrate` on staging so `derivations.candidates` exists.
2. **Correct the ship narrative:** accept G1 as deferred tech debt (Task 13) — do not claim score-based winner.
3. **Optional:** align rollback docs with boot-parsed env (restart workers), or re-read `process.env` per job for true hot rollback.

## Claim Boundary

This ship may claim: dual-provider generation behind a sample-rate knob, failure isolation, additive return shape, derivation-path code to persist candidates **once migration is applied**, and OpenAI-first MVP selection.

It may **not** claim: score-based winner selection, zero-downtime env rollback without restart, production-applied `candidates` column (until journal fixed), Playwright both-fail coverage, or that Seedream can improve live win rate today.
