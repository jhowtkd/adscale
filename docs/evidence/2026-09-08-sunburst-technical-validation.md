# Sunburst — evidência técnica local (motor)

Data: 2026-09-09. Branch: `cursor/sunburst-engine-db42`. Worktree: `.worktrees/sunburst-engine`.

Esta evidência cobre apenas a preparação técnica local. Não é prova de ganho visual, custo real, habilitação da conta OpenAI nem comportamento em produção. Nenhuma geração paga foi executada. Transporte de imagem nos testes foi mockado.

## Configuração congelada inativa

- `OPENAI_IMAGE_MODEL` permanece `gpt-image-2-2026-04-21` em `render.yaml` (web e worker).
- `OPENAI_IMAGE_SUNBURST_PERCENT` = `"0"` nos dois serviços.
- `OPENAI_IMAGE_SUNBURST_QUALITY` = `max` (candidato inativo, não conclusão visual).
- Callers sem `renderPolicy` no snapshot continuam no modelo legado.
- Somente trabalhos com política explícita no snapshot enviam Sunburst, e só depois de o percentual deixar de ser 0.

## Comandos e resultados

Worktree: `/Users/jhonatan/Repos/ADScale_2/.worktrees/sunburst-engine`. Comandos a partir de `app/`, exceto `git diff --check` e `graphify update .` na raiz do worktree.

| Comando | Resultado |
|---|---|
| `git diff --check` | limpo (`DIFF_CHECK_OK`) |
| `npm run typecheck` | exit 0 |
| `npm test --` (11 arquivos listados abaixo) | 11 files, **303 passed** |
| `graphify update .` | AST-only; `graphify-out/` permanece ignorado (`/.git/info/exclude`) |

Arquivos de teste reexecutados em 2026-09-09:

```
src/server/ai/image-render-policy.test.ts
src/server/ai/image-call-observation.test.ts
src/server/ai/providers/openai-image-provider.test.ts
src/server/generation/pipeline/execute.test.ts
src/server/application/prepare-creative-work.test.ts
src/server/application/prepare-carousel-work.test.ts
src/server/jobs/creative-work.test.ts
src/server/jobs/creative-work-carousel.test.ts
src/server/creative-work/prompt.test.ts
src/server/creative-work/reference-plan.test.ts
src/server/validation/env.test.ts
```

Saída Vitest: `Test Files  11 passed (11) / Tests  303 passed (303) / Duration  1.28s`.

Os mocks de OpenAI/`generateAndStoreImage`/`executeCanonicalGeneration` não disparam a API. Não há evidência de `usage` real nem de qualidade de imagem.

## O que o código faz (sem ativar)

- Política validada (`gpt-image-2` legado, snapshot Image 2, snapshot Sunburst; `xhigh`/`max` só no Sunburst).
- Coorte estável por workspace; percentual 0 = sempre legado.
- Observador registra `image_api_call` antes de decode/upload; `usage` ausente é `null`; logs isolados do resultado cobrado.
- `GenerationRequest.renderPolicy` atravessa o executor canônico antes de `toProviderMode`.
- Prepare congela a política no snapshot; jobs só resolvem o snapshot.
- Evidência de correção une `observations` por `callId`.

## Handoff

Plano visual: invariantes de revisão e testes de referência já no mesmo branch. Protocolo de comparação e lotes pagos continuam pendentes de corpus/orçamento aprovados. Publicação exige evidência visual e autorização explícita. Rollout interno previsto 10% → 50% → 100% de workspaces; rollback para 0 afeta trabalhos novos. Trabalhos Sunburst já congelados não devem ter a política reescrita em silêncio.

## Pendência de merge

Novos arquivos em `app/src/server/ai/` disparam o gate anti-expansion (`check-primary-destinations.mjs`), que lê o snapshot da **base**, não deste PR. Antes do merge em `main` é necessária uma exceção aprovada atualizando `docs/decisions/allowed-primary-destinations.json` na base.
