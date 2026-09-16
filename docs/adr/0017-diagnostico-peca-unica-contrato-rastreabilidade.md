# 0017 — Diagnóstico de Peça única: contrato de rastreabilidade congelado

**Data:** 2026-09-16
**Status:** Aceita
**Decisor:** Jhonatan Soares (founder)
**Spec:** [jhowtkd/adscale#382](https://github.com/jhowtkd/adscale/issues/382) — Rastreabilidade de Peça única
**Ticket:** [jhowtkd/adscale#384](https://github.com/jhowtkd/adscale/issues/384) — Traceability: decision, contracts, inventory, baseline

## Contexto

O spec #382 exige uma projeção de diagnóstico no console interno (`/feedback`, aba **Diagnóstico**) para Trabalhos do Protocolo Peça única (`single`), do pedido à exportação. Seis PRs encadeados implementam a instrumentação; antes de qualquer um deles, o contrato precisa estar congelado para que contexto assíncrono, journal, observabilidade de IA, API e console construam em paralelo sem divergir.

Base do plano: `dfea5690a535b1db3ade83b85c26e21e5558f127` (merge PR #364, 2026-09-16 08:17).
Base de execução: `92bc0ed22280058dfd7c38956535a24ac11f3439` (origin/main, merge PR #381, 2026-09-16 14:00).

Diff `dfea569..92bc0ed2` (13 arquivos, +451/−35): regeneração do `surface-inventory.raw.json`, vocabulário no CONTEXT.md (Seleção por agente, Anúncios veiculados, Conexão Meta, Conta de anúncios, Ditado, Anúncio veiculado), testes/UI de Biblioteca/Composer/Dashboard, teste de `piece-favorites` e 4 docs de decisão/spec. **Nenhum drift na área de observabilidade**: logger, Sentry (app/worker), middleware Inngest, clientes Inngest, observador de imagem, entrada canônica de geração e guard de Dono da plataforma estão idênticos entre as duas bases. O vocabulário novo foi absorvido no inventário: Ditado classifica-se como `unused-by-scope` (modalidade de entrada pré-Trabalho, sem `workItemId`) e a distinção Aprovação humana × Seleção por agente fica registrada como requisito de linha do tempo (histórias 23/31 do spec).

## Decisão

1. **Contrato congelado em código** (`app/src/server/diagnostics/contract.ts`, `schemaVersion: 1`): 13 `DiagnosticStage`, `DiagnosticContext`, envelope de evento do journal, 16 nomes de evento, status, disponibilidade de conteúdo, modos (`metadata_only` | `redacted`, sem `raw`), flags desligadas por padrão, orçamento de exportação e assinaturas congeladas das funções novas (`withDiagnosticContext`, `observeModelCall`, `redactTelemetry` como assinatura apenas — comportamento owned by #385 — e demais). Qualquer mudança aqui é quebra de contrato: exige novo ADR + bump de versão.
2. **Inventário de call points de IA** ([inventário](./2026-09-16-trace-384-ai-call-inventory.md), canônico em máquina em `app/src/server/diagnostics/ai-call-inventory.json`): 11 pontos `covered` no caminho `single` (via acessor compartilhado `getOpenAI()`, provider de imagem e provider do layer-editor), 21 `unused-by-scope` (derivation/campaign/assistant/brand-training/carousel/frozen/pré-Trabalho) e **zero** `coverage-pending-blocking-acceptance`. Nenhuma invocação direta de modelo por HTTP cru.
3. **SDKs resolvidos do lockfile** ([registro](./2026-09-16-trace-384-sdk-versions.md)): `@sentry/nextjs` 10.53.1, `inngest` 4.4.0, `openai` 6.34.0, `@opentelemetry/api` transitivo (1.9.0 topo, 1.9.1 aninhado sob `@sentry/*`); Langfuse ausente (adição cabe ao PR de observabilidade de IA, com provider isolado). Sem providers globais concorrentes: nenhum código registra provider OTel; os dois clientes Inngest registram só `SentryMiddleware`; Sentry mantém seu tracing.
4. **Rotas propostas classificadas** ([registro](./2026-09-16-trace-384-routes-and-destinations.md)): três endpoints somente-leitura aninhados ao ramo `feedback` existente + aba no `/feedback` existente — módulo de apoio interno, **não** destino primário; freeze mantido, gate não relaxado (procedimento de exceção em dois PRs quando a implementação chegar). Destinos/projetos/ambientes e presença de variáveis servidor registrados sem copiar valores.
5. **Gate de homologação registrado como BLOCKED** ([registro](./2026-09-16-trace-384-staging-gate.md), check real em `app/scripts/check-diagnostics-staging-gate.mjs`): sem acesso a staging neste ambiente; nenhum rollout autorizado; testes locais seguem verdes.

Retenção (índice 30d, rastros 7d, auditoria 90d) permanece **proposta pendente de aprovação do responsável** — não congelada.

## Consequências

- O que fica mais fácil: PRs 2–6 constroem em paralelo contra tipos e nomes estáveis; o gate de convergência segue verde (nenhum arquivo novo sob `src/server/ai/`, `src/app/api/` ou páginas).
- O que fica mais difícil: qualquer ajuste de vocabulário vira processo formal (ADR + versão), mesmo que pequeno.
- O que destrava: #385 (logger/redação/captura) implementa contra assinaturas congeladas; journal e propagação de contexto saem do papel.

## Alternativas consideradas

- **Instrumentar primeiro, congelar depois:** rejeitado — o spec exige contrato antes da instrumentação para evitar divergência entre os seis PRs.
- **Congelar em doc, sem módulo TS:** rejeitado — tipos compilados + testes (`contract.test.ts`) fazem o contrato valer em CI, não só no papel.
- **Incluir `raw` como modo de conteúdo ou reter prompts no índice:** rejeitado pelo spec — índice sem prompts/respostas/imagens/stack traces; captura real bloqueada até exclusão demonstrada.
