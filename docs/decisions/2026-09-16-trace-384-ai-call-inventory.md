# Inventário de call points de IA — Peça única (`single`)

**Data:** 2026-09-16
**Ticket:** [jhowtkd/adscale#384](https://github.com/jhowtkd/adscale/issues/384) · **Spec:** [#382](https://github.com/jhowtkd/adscale/issues/382) · **ADR:** [0017](../adr/0017-diagnostico-peca-unica-contrato-rastreabilidade.md)
**Base de execução:** `92bc0ed22280058dfd7c38956535a24ac11f3439` · **SDK:** `openai@6.34.0` (único provedor de modelo no recorte)
**Fonte canônica em máquina:** `app/src/server/diagnostics/ai-call-inventory.json` (validada por `contract.test.ts`)

Método: varredura de `getOpenAI()`, `new OpenAI`, `chat.completions` / `responses.create` / `images.*` / `audio.*` / `api.openai.com` em `app/src`, com rastreamento de chamadores até o caminho do protocolo `single` (`resolveCreativeWorkProtocol` → `execution: "direct"`).

## Acessor compartilhado

`getOpenAI()` em `app/src/server/ai/utils.ts` — cliente memoizado por processo (timeout 60s). Todos os pontos covered de texto/visão passam por ele. Exceções diretas: provider de imagem (cliente de módulo) e provider do layer-editor (cliente próprio, 180s, `maxRetries: 0`).

## Covered (11) — instrumentar via `observeModelCall`

| ID | Arquivo → símbolo | Método SDK | Tipo | Etapa(s) | Caminho |
|----|-------------------|-----------|------|----------|---------|
| CP-01 | `server/creative-work/copy.ts` → `generateSocialPostCopy` (`requestCopy`) | `chat.completions.create` | texto | `copy`, `copy_rewrite` | `prepare-creative-work` + `POST /api/creative-work/[id]/copy` |
| CP-02 | `server/creative-work/briefing-review.ts` → `reviewInferredBriefingOnce` | `chat.completions.create` | texto | `briefing` | `prepare-creative-work` (checagem do briefing) |
| CP-03 | `server/creative-work/art-direction.ts` → `createSinglePieceArtDirection` | `chat.completions.create` | texto | `art_direction` | `jobs/creative-work.ts` (exclusivo deste job) |
| CP-04 | `server/ai/image-analysis.ts` → `analyzeImageContent` | `responses.create` | visão | `source_analysis` | `analyze-creative-work-source` (fontes de conteúdo) |
| CP-05 | `server/ai/image-analysis.ts` → `analyzeImageStyle` | `responses.create` | visão | `source_analysis` | `analyze-creative-work-source` (demais fontes) |
| CP-06 | `server/ai/providers/openai-image-provider.ts` → `OpenAIImageProvider.generate` | `images.generate` / `images.edit` | imagem | `image` | `executeCanonicalGeneration` (`direct`) ← `jobs/creative-work.ts` |
| CP-07 | `server/ai/creative-qa.ts` → `analyzeCreativeWorkQa` | `responses.create` | visão | `quality` | `runCreativeWorkQualityAssessment` ← `jobs/creative-work.ts` |
| CP-08 | `server/ai/creative-qa.ts` → `analyzePersonFidelity` | `responses.create` | visão | `quality` | idem, somente com person slots |
| CP-09 | `server/ai/creative-qa.ts` → `analyzeArtComparison` | `responses.create` | visão | `revision` | `compareArtCandidates` ← `refine-creative-work` (1 chamada por revisão) |
| CP-10 | `server/layer-editor/openai-provider.ts` → `OpenAILayerRegenerationProvider` | `images.edit` | imagem | `revision` | `runCreativeWorkLayerRegeneration` (Inngest `creative-work.layer-regenerate[.v2]`) |
| CP-11 | `server/application/suggest-creative-directions.ts` → `suggestCreativeDirections` | `chat.completions.create` | texto | `briefing` | `POST /api/creative-work/[id]/suggest` |

Notas: CP-01/CP-02/CP-11 são entradas compartilhadas sem gate de protocolo na rota — envolver somente quando o Trabalho for `single` (CP-02 também é alcançável via `calibrate-brand-training`). CP-07: crítica de arte opcional viaja na MESMA resposta, nunca segunda chamada. CP-06: caminho de erro sem classe/status/motivo normalizado (correção no escopo de #385).

## Unused-by-scope (21) — nunca envolver nesta trilha

| ID | Arquivo → símbolo | Motivo |
|----|-------------------|--------|
| U-01 | `ai/copy-generator.ts` → `generateCopyVariants` | derivations `copy-variants` (a rota creative-work usa CP-01) |
| U-02 | `ai/creative-score.ts` → `analyzeDerivationCreative` | `scoreCompletedDerivation` (derivação; Peça única usa CP-07/CP-08) |
| U-03 | `ai/creative-route-planner.ts` → `planCreativeRoutes` | ramo tournament do `execute`; `single` resolve `direct` e desvia |
| U-04 | `ai/creative-candidate-selector.ts` → `selectCreativeCandidate` | idem |
| U-05 | `ai/preflight-analysis.ts` → `analyzePreflight` | preflight/readiness de campaign + derivation |
| U-06 | `ai/creative-diagnosis.ts` → `analyzeCreativeDiagnosis` | diagnosis de campaign + derivation |
| U-07 | `ai/campaign-deduction.ts` → `analyzeCampaignCreative` | rota `campaigns/[id]/analyze` |
| U-08 | `ai/competitor-analyzer.ts` → `analyzeCompetitorCreative` + `generateDifferentiationStrategy` | rotas de competitors de campaign |
| U-09 | `ai/smart-resize.ts` → `analyzeSmartResize` | rota `smart-resize-preview` de campaign |
| U-10 | `ai/brand-kit-extractor.ts` → `extractBrandKitFromImage` | rotas de brand-kit do workspace |
| U-11 | `ai/voices/voice-extractor.ts` → `extractVoiceFromBrandInputs` | rota de voice do client-profile |
| U-12 | `application/synthesize-brand-repertoire.ts` → `synthesizeBrandRepertoire` | rota de brand-knowledge |
| U-13 | `application/synthesize-studio-entry-request.ts` | assistência pré-Trabalho (sem `workItemId`; cai para template) |
| U-14 | `dictation/service.ts` → transcrição + limpeza | Ditado: modalidade de entrada pré-jornada, sem `workItemId`; não é etapa do spec |
| U-15 | `assistant/model/openai-client.ts` + `openai-adapter.ts` | assistente (cliente próprio, streaming) |
| U-16 | handlers de `assistant/action-execution` + proposals | assistente/campaign |
| U-17 | rotas `campaigns/[id]/plan` e `suggest-ctas` | adapter de campaign |
| U-18 | `jobs/workspace-asset.ts` + `jobs/brand-training.ts` | jobs de brand-training/asset (instanciações diretas) |
| U-19 | `creative-work/carousel-*` + `jobs/creative-work-carousel.ts` | protocolo Carrossel — expansão posterior sob o mesmo contrato |
| U-20 | `ai/landing-page.ts` + `ai/persona-simulator.ts` | módulos congelados (FROZEN.md) |
| U-21 | `ai/creative-qa.ts` → `analyzeCreativeQa` | QA legado de derivation (rota `derivations/[id]/qa` + quality-gate) |

## HTTP direto e falsos positivos

- **Nenhuma invocação de modelo por HTTP cru.** `ai/safe-fetch.ts` só baixa bytes de resultado de allowlist (`files.openai.com`, `api.openai.com`) para os providers de imagem — nunca invoca modelo.
- `inspectExactCompositionAsset` (`creative-qa.ts`, usado por `jobs/creative-work.ts:871`) é lógica pura em sharp — não é call point.
- `E2EControlledImageProvider` é seam determinístico de teste, sem chamadas ao provedor.
- `olhar/*`, `guided-briefing`, `prompt-builder` (ai) não invocam modelo diretamente ou servem a escopos fora do recorte.

## Coverage-pending-blocking-acceptance (0)

Vazio. Todo ponto no caminho `single` é envolvível pelo `observeModelCall` congelado; a lista `pendingAcceptanceBlockers` do JSON é assertada vazia em `contract.test.ts` — qualquer entrada futura nessa classe bloqueia o aceite até ser resolvida.
