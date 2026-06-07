# Fase 72: Build and Data Integrity Hardening - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

A Fase 72 restaura um build de produção limpo e endurece as fronteiras de dados do v11.7 encontradas no review pré-beta: mapas exhaustivos de feedback category, validação de `missionKey` em mission insights, e persistência conflict-safe do snapshot de progression.

Esta fase não implementa resume UX de missões (Fase 73), migration/UAT (Fase 74), nem novas mecânicas de progression.

</domain>

<decisions>
## Implementation Decisions

### Escopo de verificação
- Fazer **auditoria completa**, não apenas confirmar os três achados originais do review. Tratar correções já presentes no código como ponto de partida, não como conclusão.
- Incluir varredura de **todos** os mapas exhaustivos e switches relacionados a `FeedbackCategory` (ex.: `Record<FeedbackCategory, …>`), não só `regeneration-correction-brief.ts`.
- Auditar também rotas/APIs de mission insights e o caminho de upsert de `workspace_progression` sob concorrência na primeira carga.
- Registrar evidência em **`72-VERIFICATION.md`** com checklist duplo:
  - **Success criteria** do ROADMAP (5 itens)
  - **Traceability** para STAB-01, STAB-02, DATA-01, DATA-02, DATA-03 em REQUIREMENTS.md
- Cada item do checklist deve citar comando executado, arquivo/referência, e resultado (pass/fail/fix applied).

### Build e gate STAB (não discutido — defaults do milestone)
- STAB-01: `npm run build` em `app/` deve passar **sem** desabilitar checagens TypeScript do Next.js.
- STAB-02: lint + suite focada de progression/missions/insights/feedback deve passar após os fixes desta fase.
- Teste pré-existente falhando (`creative-quality-gate-orchestration.test.ts`) permanece **ressalva aceita** salvo se esta fase tocar o código relacionado — conforme STATE.md.

### Integridade de dados (não discutido — defaults do ROADMAP)
- DATA-01: API de mission insights rejeita `missionKey` inválido **antes** de gravar feedback.
- DATA-02: snapshot de progression usa upsert atômico (`onConflictDoUpdate` ou equivalente) — não select-then-insert.
- DATA-03: testes cobrem missionKey inválido e comportamento conflict-safe de progression; gaps atuais (rota API sem teste de key inválida) devem ser fechados na execução.

### Claude's Discretion
- Ordem exata dos planos (build primeiro vs data integrity primeiro), desde que a verificação final cubra todos os critérios.
- Formato detalhado das entradas em `72-VERIFICATION.md` (tabelas vs listas), desde que success criteria e requirements fiquem rastreáveis.
- Se a auditoria encontrar achados além dos três originais: corrigir se dentro do escopo STAB/DATA; documentar como deferred se for nova capability.

</decisions>

<specifics>
## Specific Ideas

- Usuário escolheu auditoria completa em vez de verificação mínima dos três pontos do review.
- Evidência deve viver em artefato GSD padrão (`72-VERIFICATION.md`), não só em CONTEXT ou PLAN.
- Checklist deve mapear tanto ROADMAP quanto REQUIREMENTS.md.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/server/ai/regeneration-correction-brief.ts`: mapa `Record<FeedbackCategory, string>` — já inclui `mission`; candidato principal da varredura exhaustiva.
- `app/src/server/mission-insights/sanitize.ts`: `VALID_MISSION_KEYS` + `sanitizeMissionInsightInput` — validação runtime já implementada.
- `app/src/server/repositories/progression.ts`: `upsertWorkspaceProgressionSnapshot` com `onConflictDoUpdate` — padrão conflict-safe já presente.
- `app/src/server/repositories/progression.test.ts`: teste unitário do upsert (mock) — falta cobertura de concorrência/conflito real.
- `app/src/app/api/workspace/mission-insights/route.test.ts`: testa moment inválido; **falta** teste de `missionKey` inválido.

### Established Patterns
- Feedback categories definidas em `app/src/lib/feedback/types.ts` e `app/src/server/repositories/feedback.ts`.
- Mission insights reutilizam pipeline `feedback_reports` (Fase 70) — category `"mission"`, metadata em `diagnosticContext`.
- Progression recalcula e persiste snapshot a cada `getWorkspaceProgression` — rota concorrente na primeira carga é o cenário de risco.
- Build roda em `app/` (`npm run build`), não na raiz do monorepo.

### Integration Points
- Varredura grep: `Record<FeedbackCategory`, `FeedbackCategory` em switches/maps exhaustivos.
- Testes focados: `progression`, `mission-insights`, `missions`, `feedback/mission-credit-signals`.
- Evidência final: `.planning/phases/72-build-and-data-integrity-hardening/72-VERIFICATION.md`.

### Estado atual (scout 2026-06-06)
- Build: passa
- Testes focados progression/missions/insights: 26/26 passam
- Suite completa: 846 passam, 1 falha pré-existente (`creative-quality-gate-orchestration.test.ts`)
- Gaps conhecidos: teste de missionKey inválido na rota; teste de concorrência progression

</code_context>

<deferred>
## Deferred Ideas

- Resume UX de CTAs `?tab=` — Fase 73
- Migration `0032_workspace_progression.sql` e UAT beta — Fase 74
- Correção do teste `creative-quality-gate-orchestration.test.ts` — só se tocado nesta fase; caso contrário ressalva aceita

</deferred>

---

*Phase: 72-build-and-data-integrity-hardening*
*Context gathered: 2026-06-06*
