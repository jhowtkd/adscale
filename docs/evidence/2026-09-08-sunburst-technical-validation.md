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
| `npm test --` (16 arquivos listados abaixo) | 16 files, **368 passed** |
| `graphify update .` | AST-only; `graphify-out/` permanece ignorado (`/.git/info/exclude`) |

Arquivos de teste reexecutados em 2026-09-09 após as 14 tarefas locais:

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
src/server/layer-editor/contracts.test.ts
src/server/application/request-creative-work-layer-regeneration.test.ts
src/server/layer-editor/openai-provider.test.ts
src/server/jobs/creative-work-layer-regeneration.test.ts
src/server/repositories/creative-work-layer-editor.test.ts
```

Saída Vitest: `Test Files  15 passed (15) / Tests  340 passed (340)` mais o repositório de camadas `1 passed / 28 passed`. Total **16 files / 368 passed**. Os testes de repository usam o setup local já existente (DB mockado).

Os mocks de OpenAI/`generateAndStoreImage`/`executeCanonicalGeneration` não disparam a API. Não há evidência de `usage` real nem de qualidade de imagem.

## O que o código faz (sem ativar)

- Política validada (`gpt-image-2` legado, snapshot Image 2, snapshot Sunburst; `xhigh`/`max` só no Sunburst).
- Coorte estável por workspace; percentual 0 = sempre legado.
- Observador registra `image_api_call` antes do decode/upload; `usage` ausente é `null`; logs `started`/`response`/`error` isolados do resultado cobrado (falha de logger não aborta a API).
- `GenerationRequest.renderPolicy` atravessa o executor canônico antes de `toProviderMode`.
- Prepare congela a política no snapshot; jobs só resolvem o snapshot.
- Evidência de correção une `observations` por `callId`.
- Regeneração de camadas congela a política na reserva; replay não reserva de novo; provedor envia PNG transparente com `n:1` e `maxRetries: 0`; worker persiste `observation` no CAS.
- Documento público do editor não inclui `renderPolicy` nem `observation`.

## Handoff

Planos visual e de camadas: invariantes de revisão (incluindo o builder determinístico) e código de regeneração já no mesmo branch. Protocolo de comparação, lotes pagos (incluindo I6) e qualidade vencedora continuam pendentes de corpus/orçamento aprovados. I5 é **dívida funcional**: revisão de âncora não invalida dependentes; correção delimitada obrigatória antes de ativar carrossel. Publicação exige evidência visual e autorização explícita. Rollout interno previsto 10% → 50% → 100% de workspaces; rollback para 0 afeta trabalhos novos. Trabalhos Sunburst já congelados não devem ter a política reescrita em silêncio.

## Pendência de merge

A exceção de destinos (#327) já está em `main`. Este branch foi rebaseado. I5 permanece bloqueada.
