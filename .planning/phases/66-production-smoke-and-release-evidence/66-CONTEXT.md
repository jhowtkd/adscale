# Phase 66 Context: Production Smoke and Release Evidence

**Milestone:** v11.6.1 Ship Readiness and Beta Activation  
**Requirements:** SHIP-01, SHIP-02, SHIP-03  
**Depends on:** v11.6 implementation through `ec2f1a4` on `origin/main`

## Goal

Prove the deployed Creative Strategy Cockpit path is beta-shippable and capture release evidence (git ref, health, migrations, automated tests).

## Scope

| ID | Owner | Automatable |
|----|-------|-------------|
| SHIP-01 | Operator | Browser smoke checklist only |
| SHIP-02 | Operator + agent | Health/env/migration checklist; agent records local verification |
| SHIP-03 | Agent | Post-review fixes + focused tests + lint/build |

## Decisions

- Reuse `65-SMOKE-EVIDENCE.md` checklist; phase 66 refreshes metadata and attaches release evidence.
- Recipe selection lint refactor (derived state + session key) is part of SHIP-03 — must land before deploy sign-off.
- Production URL `https://adscale.jhonatansoares.com` — DNS unreachable from CI/agent sandbox; operator verifies SHIP-02 live.
- Exclude untracked `.planning/phases/62-production-deploy-and-smoke-verification/` from commits.

## Success

1. Cockpit test matrix (69 tests) passes including review-fix hooks.
2. Lint 0 errors, build passes on release candidate.
3. `66-RELEASE-EVIDENCE.md` records git SHA, test output, migration checklist.
4. Operator completes browser smoke in `65-SMOKE-EVIDENCE.md` (SHIP-01 gate).
