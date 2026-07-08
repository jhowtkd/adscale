# Plan: Ship sequence (um por um)

## Estratégia

Executar em **5 fases sequenciais**. Cada fase tem um único job, um checkpoint humano/ops, e só avança se o critério de done passar. Não misturar deploy com debt de produto.

```
F1 higiene local → F2 push/PR → F3 migrate staging → F4 smoke → F5 enfileirar debt
```

## Partes impactadas

| Área | O quê |
|------|--------|
| Git / GitHub | 20 commits unpushed + residual planning files |
| Drizzle | `0073_derivations_candidates` (journal já remediated) |
| Render / workers | env Seedream + restart no rollback |
| App UX | path Campanhas / workspace stages (já no commit `a052e333`) |
| Planning | audit dual-engine + daily beta feedback |

## Ordem de execução

1. **F1 — Higiene local** — decidir o que fazer com diffs uncommitted (phase 128 + beta daily). Commitar só se forem evidência útil; senão stash/descartar.
2. **F2 — Push / PR** — publicar os 20 commits (+ higiene se commitada). Preferir PR se quiser review; push direto em `main` só se for o fluxo habitual do repo.
3. **F3 — Migrate staging** — `db:migrate` no ambiente staging; confirmar coluna `derivations.candidates`. Só então configurar/ligar `SEEDREAM_SAMPLE_RATE` baixo (ex. `0.05`–`0.1`) ou manter `0` no primeiro deploy.
4. **F4 — Smoke** — dois smokes separados:
   - Dual-engine: rate `0` = só OpenAI; rate >0 = paralelo sem falhar job se Seedream cair.
   - Workspace UX: criar campanha → gerar 1-click → stage Preparar/Gerar/Entregar → shell limpo.
5. **F5 — Enfileirar debt** — abrir follow-ups explícitos (Task 13 winner-score primeiro; resto depois). Não implementar nesta sequência.

## Trade-offs

- **PR vs push direto:** PR dá review e CI; push direto é mais rápido se `main` já é o fluxo. Default: PR se CI existir e estiver verde localmente.
- **Sample rate no primeiro deploy:** começar em `0` (só OpenAI, zero risco de custo duplo) e subir depois do smoke. Seedream ligado cedo demais dobra custo sem winner-score.
- **Higiene phase 128:** diffs são só timestamps/evidence refresh — commitar junto evita lixo local; não bloqueia ship se forem só metadados.

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Migration não aplicada → persist de `candidates` quebra/silencia | F3 obrigatória antes de rate >0 |
| Env Seedream inválida → jobs falham | rate `0` no primeiro deploy; keys só em staging primeiro |
| Rollback “zero-downtime” overclaimed | ops: set rate `0` **e restart workers** |
| UX smoke falha em staging | reverter só o commit UX se dual-engine estiver ok; não reverter migration |
| 20 commits grandes no PR | body do PR separar dual-engine vs UX; review focado |

## Testes

- Já cobertos no código: unit tests dual-engine + workspace (no commit).
- F4 adiciona **smoke manual/ops**, não suite nova.
- Não reabrir Playwright Task 11 nesta sequência.

## Critérios de simplificação

- Se staging migrate falhar: parar. Não ligar Seedream.
- Se UX smoke falhar mas dual-engine ok: ship dual-engine; UX vira hotfix separado.
- Se não houver staging: F3/F4 viram smoke em prod com rate `0` apenas — documentar risco.

## Relação com planos existentes

- Dual-engine debt → Tasks 13–16 do plan `docs/superpowers/plans/2026-07-08-dual-engine-image-generation.md` (fora desta sequência).
- UI simplification maior → `docs/superpowers/plans/2026-07-02-ui-simplification.md` (fora).
- GSD next milestone → só depois de F5.
