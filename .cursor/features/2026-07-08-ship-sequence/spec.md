# Spec: Ship sequence pós dual-engine + workspace UX

## Contexto

Em `main` (20 commits à frente de `origin/main`) há dois ships locais:

1. **Dual-engine image generation** (OpenAI + Seedream) — auditado como `tech_debt` em `.planning/dual-engine-image-generation-MILESTONE-AUDIT.md`
2. **Workspace UX simplification** (`a052e333`) — Campanhas com menos ações e stages Preparar→Gerar→Entregar

GSD `STATE.md` ainda aponta v13.9 Phase 207 completa; este trabalho é paralelo ao roadmap GSD numerado.

## Objetivo

Levar o trabalho local a produção de forma segura, um passo verificável por vez, sem misturar ship ops com product debt.

## Fora de escopo (por enquanto)

- Task 13+ do dual-engine (score-based winner, telemetry IDs, creative-work candidates, Playwright both-fail)
- Plano completo `docs/superpowers/plans/2026-07-02-ui-simplification.md` (ActionCard / chat permanente / collapse 5→2)
- Novo milestone GSD (`/gsd-new-milestone`) — só depois do ship estável

## Critério de sucesso

- Commits locais em `origin/main` (via PR ou push acordado)
- Migration `0073` aplicada em staging (e depois prod no deploy)
- Smoke dual-engine + smoke UX workspace passando
- Artefatos locais de planning commitados ou descartados de propósito
- Debt dual-engine documentado e enfileirado, não misturado no ship
