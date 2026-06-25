# ADScale

## What This Is

ADScale is a SaaS webapp for creative derivation: marketing teams upload a base creative, fill a campaign brief, receive an AI-generated creative plan, and generate image derivations that maintain visual consistency — then review and export for Meta/TikTok/Google Ads.

## Core Value

Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Current State

v13.5 Assistente Conversacional de Ações shipped 2026-06-25 (`passed_with_tech_debt`). ADScale now has a chat-first operating surface where the assistant asks only for the minimum information needed for the next useful action, while preserving credit control, action confirmation, auditability, and multi-client isolation.

**Latest milestone:** v13.5 Assistente Conversacional de Ações (phases 177-183) — **archived** 2026-06-25 (`passed_with_tech_debt`).

**Next:** `$gsd-new-milestone` for v13.6.

## Shipped Milestone: v13.5 Assistente Conversacional de Ações

**Goal:** Permitir que usuários operem ADScale por chat, com contratos mínimos por ação, preservando controle, créditos e isolamento multi-cliente.

**Target features:**
- Multi-`clientProfile` real dentro de um workspace, com marca, memória, referências, voz, corpus e regras escopados por cliente.
- `/assistant` como seção primária em três áreas: árvore cliente/campanha/thread, chat e painel contextual de prontidão/ações/review.
- Registry de action contracts para ações rápidas e campanha completa, sem obrigar briefing completo quando a intenção pedir só uma ação pontual.
- `AssistantModelClient` com MiniMax M3 como primeiro adapter, streaming de texto, contexto allowlistado e policy de tools deny-by-default.
- Happy path de ideia solta a pacote final: cliente, campanha draft, ação/briefing, preview, batch, review e delivery package.

**Guiding principle:** O assistente não força formulário; ele pede o mínimo necessário para a próxima ação útil.

### v13.4 Fechamento de Evidência Operacional — SHIPPED WITH TECH DEBT (2026-06-25)

**Goal:** Close v13.3 operational tech debt — `real_customer` corpus per `clientProfileId`, owner smoke with live data, claim unlock only when sufficiency passes.

**Delivered:**
- `seed-live-real-customer-corpus.ts` — idempotent generic `real_customer` promotion path with Cenbrap excluded via `live-corpus-target.ts`
- `refresh-v13-3-operational-evidence.ts` — patches `172-EVIDENCE.json` from corpus manifest + smoke manifest when present
- `175-SMOKE-MANIFEST.json` and automated factual-alert panel tests; structured operational record path
- Release gate (`run-v13-3-release-gate.mjs`) auto-refreshes evidence when `173-CORPUS-MANIFEST.json` exists; claim unlock policy without manual override

**Tech debt accepted:** Live `--confirm` seed not executed (requires `db:migrate` + owner workspace `DATABASE_URL`); no `173-CORPUS-MANIFEST.json`; `172-EVIDENCE.json` still `insufficient_sample` / `fixtureOnly: true`; owner smoke checklist live browser pass and settings hard-refresh UAT pending.

**Current status:** Infrastructure verified by unit tests and audit (`passed_with_tech_debt`). Customer-real claims remain blocked until live operational evidence is recorded.

### v13.3 Tracao Multi-Cliente — SHIPPED WITH TECH DEBT (2026-06-25)

**Goal:** Transformar a infraestrutura multi-marca em fluxo cliente-agnostico: decisoes humanas, corpus real, claims gate, narrativa e settings persistentes devem funcionar para qualquer cliente/marca.

**Delivered:**
- Generic human-quality evaluation → decision/calibration bridge for any `clientProfileId` with cross-profile isolation tests
- Source-labeled corpus promotion/import with `fixtureOnly` claim gates and dual technical/operational release evidence
- "Curator > operator" narrative rollout with automated copy guard across authenticated workflow surfaces
- Profile and workspace settings persisted via backend APIs with deterministic save/error/loading UX
- `FactualAlertsPanel` mounted in corpus Learning and brand Propostas tabs; v13.3 release gate orchestrator and `172-EVIDENCE.json`

**Tech debt accepted:** `operationalEvidence: insufficient_sample` (`activeBrandSample.fixtureOnly: true`); owner smoke checklist not completed with live workspace data; manual UAT deferred for settings hard-refresh/logout, narrative tone walk, and live multi-brand corpus at scale.

**Current status:** 23/23 requirements satisfied with automated verification. Customer-real, agreement-rate and quality-improvement claims remain blocked until sample/source sufficiency is real per brand.

### v13.2 Calibracao Multi-Marca — SHIPPED (2026-06-24)

**Goal:** Generalizar calibracao de gosto de marca para qualquer clientProfile, substituindo hardcode Cenbrap por configuracao por marca e fechando o caminho corpus → perfil → regras aprovadas → prompt.

**Target features delivered:**
- Configuracao de voz/constituicao Olhar por `clientProfile` em vez de deteccao hardcoded Cenbrap
- Perfil de gosto e regras aprovadas inspecionaveis por marca no painel owner-only
- Avaliacoes do corpus global alimentam propostas e regras para marcas
- Aceite owner de propostas cliente (`corpus_quality`) com aplicacao no prompt-builder
- Claims gate preserva honestidade de amostra e source composition por marca
- Promocao cross-client sem vazamento de regras entre prompts de marcas diferentes

**Current status:** Phases 162-167 complete. Infrastructure shipped; v13.3 carries forward the product proof gap by making decision intake and real corpus explicitly client-agnostic.

### v13.1 Global Owner Quality Corpus — SHIPPED WITH TECH DEBT (2026-06-20)

**Goal:** Dar ao dono do projeto um painel global e privado com criativos gerados por todos os usuarios, para avaliar qualidade humana e alimentar o loop de melhoria sem quebrar isolamento de workspace.

**Target features:**
- Owner-only global corpus queue across all workspaces
- Automatic/global candidate capture for generated creatives with privacy-safe metadata
- Signed preview handling that works across workspaces without exposing storage keys or prompts
- Human evaluation flow that resolves workspace context server-side from the corpus item
- Aggregated quality/calibration dashboards that support global and filtered views
- Feedback-generation handoff from human evaluations into calibration, quality-improvement and learning loops
- Release gate that separates technical green from sufficient global human evidence

**Why now:** v12.5/v12.6 created the human-quality corpus and v13.0 created reusable brand-taste calibration, but the operating surface still depends on workspace-scoped queues and manual selection. A global owner corpus is the natural control plane for turning real generated outputs into reusable product learning.

**Current status:** Phases 157-161 complete. Infrastructure shipped; operational evidence and customer-real claims remain blocked by design.

### v13.0 Brand Taste Calibration Loop — SHIPPED WITH TECH DEBT (2026-06-20)

**Goal:** Fazer o sistema aprender o criterio de direcao de arte a partir de decisoes humanas esparsas, para que Jhonatan calibre o olhar em vez de operar a esteira.

**Target features:**
- Modelo canonico de eventos de calibracao humana
- Perfil de gosto por marca com nivel de evidencia e source composition
- Extracao de regras candidatas a partir de mismatches sistema-humano
- Aprovacao/depreciacao de regras antes de afetarem advisor ou prompt-builder
- Aplicacao de taste rules no advisor, preflight e geracao
- Fila de incerteza para pedir humano apenas quando a decisao ensina algo
- Release gate que mede acordo, reducao de incerteza e claims permitidos/proibidos

**Why now:** v12.9 provou que o gate e honesto, mas tambem mostrou o limite do modelo: se toda marca depender de revisao manual recorrente, ADScale vira servico. O proximo passo e transformar julgamento humano em calibracao reutilizavel.

**Current status:** Phases 151-156 complete. Infrastructure for calibration signals, brand taste profiles, rules, application, uncertainty routing and claims gate shipped. Tech debt remains: 5 Jhonatan decisions pending, fixture-only corpus, agreement/customer-real claims blocked.

### v12.9 Fechamento Humano do Olhar Cenbrap — SHIPPED WITH TECH DEBT (2026-06-20)

**Goal:** Capturar julgamento humano real para o Olhar Cenbrap, atingir amostra minima e separar fixture operacional de prova customer-real antes de qualquer claim de acordo ou qualidade.

**Target features:**
- Decisoes do Jhonatan para linhas `review_ready` (`entra`, `quase`, `nao_entra`)
- Persistencia idempotente via `output_decision_events`
- Rerun de calibracao e evidencia apos decisoes
- Expansao para 5 decisoes humanas ou blocker operacional exato
- Inspecao/import seguro de rows customer-real Cenbrap quando disponiveis
- Audit final de agreement, mismatch, claims permitidos/proibidos e carry-forward

**Why now:** v12.8 fechou a infraestrutura e o claims gate, mas a evidencia segue `human_needed`: `humanDecisionCount=0`, `missingHumanDecisionCount=2`, sample guidance `0/5`, `agreementRate=null` e corpus `synthetic_fixture`.

**Current status:** Phases 147-148 complete; Phases 149-150 deferred as accepted tech debt. Five reviewable Cenbrap rows exist, but Jhonatan decisions are still absent, sample remains `0/5`, all rows are `synthetic_fixture`, and agreement/quality/customer-real claims stay blocked.

### v12.8 Operacao Real do Olhar Cenbrap — SHIPPED WITH TECH DEBT (2026-06-19)

**Goal:** Sair da evidencia template do v12.7 e operar a calibracao real do Olhar Cenbrap com campanhas reais, decisoes humanas e claims bloqueados por sample guidance quando necessario.

**Target features:**
- Calibracao Cenbrap live contra `DATABASE_URL` configurado
- Seeding/import seguro quando o corpus Cenbrap conectado esta vazio
- Contact sheet com linhas reais, dual verdicts e elegibilidade de pacote
- Captura de decisoes do Jhonatan (`entra`, `quase`, `nao_entra`) e motivos de mismatch
- Refresh de evidencia e audit que separa factual/export safety de art-direction agreement
- Fechamento ou carry-forward explicito da divida v12.7

**Why now:** v12.7 fechou como `tech_debt`; Phase 143 provou o runner live, mas a base conectada voltou `mode=live` com `evaluatedCampaignCount=0`, `humanDecisionCount=0` e `agreementRate` corretamente withheld.

**Current status:** Phases 143–146 complete. Live evidence `human_needed` (`decisionCount=0`, `additionalNeeded=5`). Claims gate audit published; v12.7 template-only evidence debt closed. Jhonatan decisions, sample sufficiency (0/5), and `synthetic_fixture` corpus caveat remain carry-forward blockers.

### v12.7 Olhar ADScale: Direcao de Arte Antes de Compliance — SHIPPED WITH TECH DEBT (2026-06-19)

**Goal:** Separar julgamento de direcao de arte de compliance de exportacao, para que o ADScale julgue figura, gestalt, voz e convite antes de permitir aprovacao ou pacote de entrega.

**Target features:**
- Constituicao `Olhar ADScale` e primeira voz editorial Cenbrap
- Contratos separados para `olharVerdict` e `exportStatus`
- Validador deterministico de exportacao para marca, CTA, claims, formato, texto obrigatorio e resolucao
- Reescrita de preflight, QA, score e prompt-builder para direcao de arte, nao checklist de UX
- Review UI com veredito editorial, decisao humana estruturada e override auditavel
- Calibracao em campanhas reais Cenbrap com contact sheets e evidencia honesta

**Why now:** audits de campanhas reais expuseram outputs invalidos, aprovacao de peca `approved + invalid`, estetica de template/interface e prompts que tratam CTA como widget clicavel. v12.3 preservou factualidade mas manteve QA-19 como gap visual; v12.5/v12.6 criaram infraestrutura de corpus, mas ainda nao trocaram a regua criativa.

**Delivered:** Phases 138-142 complete; milestone audit status `tech_debt` — implementation shipped, live Cenbrap calibration evidence awaits operator data and Jhonatan decisions.

### v12.6 Operacao Live do Corpus de Qualidade — SHIPPED WITH TECH DEBT (2026-06-18)

**Goal:** Fazer o corpus live rodar em operacao real, com amostragem, avaliacao humana, tendencias e release gate que so permita claims quando houver evidencia suficiente.

**Target features:**
- Playbook operacional para selecionar, avaliar e revisar outputs reais sem vazar prompts, URLs assinadas ou payloads sensiveis
- Fila e UX de avaliacao mais eficiente para transformar campanhas reais em corpus versionado
- Politica de amostragem minima e suficiencia estatistica para bloquear conclusoes falsas
- Tendencias de qualidade, factualidade e learning impact no owner dashboard
- Release gate live que reroda 130/131/132/133 aggregate e separa green tecnico de evidencia operacional

**Why now:** v12.5 provou o loop tecnico e fechou com `accepted_gap`, mas o corpus live ainda estava vazio. O produto precisa de uma rotina confiavel para transformar outputs reais em evidencia, antes de escalar recomendacoes ou claims de melhoria.

**Delivered:**
- Batch corpus selection and queue progress for real generated outputs, including campaign-dimensional progress.
- Fast human-quality review loop with safe evaluation payloads and bounded artifact exposure.
- Canonical sampling thresholds and `sampleGuidance` for calibration, impact, quality-improvement and trend gates.
- Owner-facing quality trend reporting with filters, alerts and drilldown links to bounded evidence.
- Operational release gate that separates technical regression pass from operational `insufficient_sample`.

**Tech debt carried forward:** live corpus has `evaluatedItemCount=0`; trend gate is still 3/5 global and 1/2 buckets; `qualityImprovementClaimed` remains withheld; Nyquist metadata is partial for Phases 135-137.

### v12.5 Validacao Real de Qualidade e Calibracao do Loop Criativo — SHIPPED WITH TECH DEBT (2026-06-17)

**Goal:** Provar e melhorar a qualidade percebida dos outputs com corpus real avaliado por humanos, mantendo fidelidade factual e o learning loop seguro.

**Target features:**
- Corpus live versionado de outputs reais com julgamento humano estruturado
- Calibracao de score automatico contra nota visual humana
- Medicao de impacto dos learnings de v12.4 em outputs comparaveis
- Melhorias focadas nos defeitos visuais provados pelo corpus
- Release gate realista com metricas separadas de qualidade, factualidade e learning impact

**Why now:** v12.4 fechou o loop tecnico de aprendizado, mas aceitou que o uplift era fixture-based. O produto precisa provar qualidade percebida em outputs reais e reduzir o gap visual herdado de v12.3 (`70.17 < 75`) sem perder fidelidade factual.

### v12.4 Aprendizado de Qualidade dos Outputs — SHIPPED (2026-06-17)

**Goal:** Transformar aprovação, rejeição, regeneração e referências salvas em aprendizados canônicos que melhorem a próxima geração sem degradar com o tempo.

**Target features:**
- Captura normalizada de sinais humanos sobre outputs
- Camada canônica de output learnings com confiança, contradição e supersession
- Projeção para retrieval sem tornar memória vetorial fonte de verdade
- Recomendação/prefill antes da próxima geração com explicação e limites claros
- Eval orientado a melhoria de qualidade sem regredir fidelidade factual

**Why now:** v12.3 fechou o eixo de integridade factual, mas terminou com gap aceito de qualidade visual média (`70.17 < 75`). O próximo passo é aprender com decisões humanas reais sobre quais outputs prestam e usar isso antes de gastar novos créditos.

### v12.3 Integridade Criativa — SHIPPED WITH ACCEPTED GAP (2026-06-16)

**Goal:** Impedir que o pipeline criativo aprove peças factualmente incorretas, visualmente genéricas ou hierarquicamente congestionadas — garantindo que regras críticas cheguem ao prompt, ao gate e aos testes.

**Target features:**
- Linha de base reproduzível com fixtures do corpus auditado (Cantona, overload, template genérico)
- Contrato criativo canônico: ideia dominante, três zonas, preservação factual sem igual destaque
- Separação factual vs linguagem visual (especialmente restyling)
- Regras por modo (`art_variation`, `restyling`, `format_adaptation`)
- Quality gate endurecido com hard failures observáveis e score com tetos
- Suíte de regressão que detecta regras declaradas mas não aplicadas
- Validação visual controlada com metas mensuráveis (≥75 média, ≥95 fidelidade)

**Audit baseline:** corpus `app/exports/render-creatives/` — 34 peças, média 58,5/100; falhas críticas de entidades inventadas e adaptações que viram outra campanha.

**Delivered:**
- Corpus fixtures and canonical campaign registry for the audited creative failures
- Canonical creative contract, factual/visual separation, and per-mode prompt rules
- Observable rubric, hard-failure gate, score ceilings, and restyling retry from factual source
- Regression suite covering prompts, gate matrix, mode/format behavior, and thumbnail legibility
- Controlled before/after visual evidence proving factual fidelity while documenting the accepted mean-quality gap

**Accepted gap:** QA-19 mean quality remains below target (`70.17 <75`); no further API regeneration in v12.3.

### v12.2 Refinamento Visual e Consistência da Interface — SHIPPED (2026-06-14)

Phases 109–114 complete; 33/33 requirements; release gate in `playwright.release.config.ts` + `run-release-gate.mjs`. Archive: `.planning/milestones/v12.2-*`.

**Delivered:**
- Visual foundation contracts, primitives, ownership validator, and paired browser baseline
- Token-backed app shell, `PageFrame`, i18n navigation, and shell geometry proof
- Shared `PageHeader` / `Panel` / `ResponsiveTabs` on campaigns, settings, dashboard, and secondary routes
- Workspace stage orientation, sticky action bar, and overlay layering
- Playwright release gate (54 layout + 8 a11y checks)

### v12.1 Memória Criativa e Aprendizado de Performance — SHIPPED (2026-06-12)

Phases 103–108 complete; 31/31 requirements; prod migrate 0036–0040 applied on Render (`journal after=41`). Archive: `.planning/milestones/v12.1-*`.

**Delivered:**
- Manual + CSV performance import with locale/currency normalization and dedup
- Creative hypotheses, variant comparison, and honest evidence states
- Client performance learnings (Postgres canonical + Mem0 projection)
- Next-experiment recommendation with editable Strategy Recipe prefill
- Product-pure UAT (`re-uat-v12.1-product.mjs`) + PATCH `clientProfileId` fix

### v12.0 Monetização Real — SHIPPED (2026-06-11)

Phases 97–102 complete; 19/19 requirements; LIVE-02 evidenced in `101-WEBHOOK-EVIDENCE.md`. Archive: `.planning/milestones/v12.0-*`.

**Delivered:**
- Go-live Stripe (prod deploy, webhook, operator checkout smoke)
- Subscription lifecycle: trial 14d, idempotent `invoice.paid` grants, past_due policy + portal recovery
- In-product conversion (402 payloads, preview/batch gates)
- Billing UI (status, history, PT-BR/EN)
- Full billing regression gate (1061 tests)

### v11.11 Aprendizado → Ação — COMPLETE (2026-06-11)

Phases 90–96 complete; all 10 learning questions answered with SESS-03 sessions; `ctaProminence` warning-only per READY-10.

### v11.10 Fechamento Entrega e Analytics — COMPLETE (2026-06-11)

Phases 85–89 complete; SESS-03 evidence in `89-SESS-03-EVIDENCE.md`.

### v11.9 UX de Entrega e Créditos — SHIPPED 2026-06-07

Delivered: credit estimate transparency, enriched credit events, delivery/stale package UX, owner surprise ranking + session timeline, full regression green.

## Requirements

### Validated

- ✓ **AUTH-01**: User can sign up with email and password via Better Auth — v1.0
- ✓ **AUTH-02**: First signup automatically creates an initial workspace — v1.0
- ✓ **AUTH-03**: User session persists across browser refresh — v1.0
- ✓ **AUTH-04**: Dashboard, campaigns and settings require active session — v1.0
- ✓ **WORK-01**: Workspace membership controls access to all data — v1.0
- ✓ **WORK-02**: No workspace ID can access data from another workspace — v1.0
- ✓ **CAMP-01**: User can create a campaign with structured brief — v1.0
- ✓ **CAMP-02**: User can list, view, update and delete campaigns — v1.0
- ✓ **CAMP-03**: Campaign status lifecycle — v1.0
- ✓ **UPLOAD-01**: User can request a presigned URL and upload directly to R2 — v1.0
- ✓ **UPLOAD-02**: After upload, API confirms and saves asset metadata — v1.0
- ✓ **UPLOAD-03**: Asset is linked to a campaign and workspace — v1.0
- ✓ **PLAN-01**: API builds prompt and calls OpenAI text model — v1.0
- ✓ **PLAN-02**: OpenAI returns structured JSON validated by Zod — v1.0
- ✓ **PLAN-03**: User can view and approve/reject the generated plan — v1.0
- ✓ **DERIV-01**: On plan approval, API creates derivations and emits Inngest events — v1.0
- ✓ **DERIV-02**: Inngest handler downloads input, calls OpenAI image model, stores output — v1.0
- ✓ **DERIV-03**: Derivation status lifecycle — v1.0
- ✓ **DERIV-04**: UI polls via TanStack Query until final status — v1.0
- ✓ **DERIV-05**: Failed derivations show clear error and allow retry — v1.0
- ✓ **REVIEW-01**: User can approve or reject individual derivations — v1.0
- ✓ **REVIEW-02**: User can regenerate a derivation with feedback linked to previous — v1.0
- ✓ **REVIEW-03**: Derivations display in a gallery with preview and compare view — v1.0
- ✓ **EXPORT-01**: User can export individual derivation via signed URL — v1.0
- ✓ **EXPORT-02**: User can export all approved derivations as ZIP — v1.0
- ✓ **EXPORT-03**: Format conversion uses sharp when needed — v1.0
- ✓ **DASH-01**: Dashboard shows real campaign and usage metrics — v1.0
- ✓ **DASH-02**: Loading/error/empty states replace simulated delays — v1.0
- ✓ **SEC-01**: All API routes validate workspace membership — v1.0
- ✓ **SEC-02**: Environment variables validated with Zod at startup — v1.0
- ✓ **SEC-03**: API keys and secrets are server-side only — v1.0
- ✓ **TEST-01**: Unit tests for env validation, schemas, repositories, prompt parser, R2 keys — v1.0
- ✓ **TEST-02**: Integration tests for signup→workspace, CRUD, upload, plan, job, review/export — v1.0
- ✓ **TEST-03**: npm test, lint, build pass — v1.0
- ✓ **I18N-01**: User can switch between PT-BR and EN via language switcher — v2.0
- ✓ **I18N-02**: All UI labels, buttons, navigation translated — v2.0
- ✓ **I18N-03**: Form validation errors localized — v2.0
- ✓ **I18N-04**: API error responses include localized messages — v2.0
- ✓ **I18N-05**: Toast notifications and empty states use translated copy — v2.0
- ✓ **I18N-06**: Date, number, currency formatting use PT-BR locale — v2.0
- ✓ **LANG-01**: User language preference stored in database — v2.0
- ✓ **LANG-02**: Cookie stores active language for SSR/initial render — v2.0
- ✓ **LANG-03**: Browser language detection sets default on first visit — v2.0
- ✓ **LANG-04**: Language preference persists across logout/login — v2.0
- ✓ **LANG-05**: Unauthenticated visitors see PT-BR by default — v2.0
- ✓ **AI-PT-01**: Creative plan generation outputs in PT-BR when selected — v2.0
- ✓ **AI-PT-02**: Derivation generation prompt uses PT-BR when selected — v2.0
- ✓ **AI-PT-03**: Regeneration feedback preserves language for revised outputs — v2.0
- ✓ **AI-PT-04**: Campaign brief field labels adapt to active language — v2.0
- ✓ **AI-PT-05**: Plan preview and derivation cards display AI-generated text in produced language — v2.0
- ✓ **TECH-01**: i18n library integrated (next-intl) — v2.0
- ✓ **TECH-02**: Translation keys organized by feature/domain — v2.0
- ✓ **TECH-03**: SSR renders correct lang attribute without hydration mismatch — v2.0
- ✓ **TECH-04**: Language context available in API routes — v2.0
- ✓ **TECH-05**: Prompt builder accepts language parameter — v2.0
- ✓ **BRIEF-01**: User can create campaign with only name, client, and client profile — v5.0
- ✓ **BRIEF-02**: Creation form is a single page (no multi-step wizard) — v5.0
- ✓ **BRIEF-03**: Required fields are campaign name, client, and client profile — v5.0
- ✓ **BRIEF-04**: Key creative upload is optional at creation time — v5.0
- ✓ **AI-01**: Key creative upload triggers automatic visual analysis via AI — v5.0
- ✓ **AI-02**: AI deduces campaign fields from image (product, objective, target audience, tone, offer, platforms) — v5.0
- ✓ **AI-03**: Deduced fields are presented in an editable form — v5.0
- ✓ **AI-04**: User can edit any auto-filled field before saving — v5.0
- ✓ **AI-05**: If analysis fails, form loads empty without blocking the flow — v5.0
- ✓ **AI-06**: Analysis is non-blocking; upload completes independently of analysis — v5.0
- ✓ **AI-07**: Analysis result is stored in the asset metadata — v5.0
- ✓ **GEN-01**: Creativity profile (conservative, balanced, bold) configurable in generation mode — v5.0
- ✓ **GEN-02**: Per-piece CTA configurable in generation mode with AI suggestions — v5.0
- ✓ **GEN-03**: Output format (1:1, 4:5, 9:16) configurable in generation mode — v5.0
- ✓ **GEN-04**: Derivation mode (art variation, format adaptation, restyling) in generation mode — v5.0
- ✓ **GEN-05**: AI suggestions for creativity profile based on analyzed piece — v5.0
- ✓ **GEN-06**: AI suggestions for CTAs based on campaign context — v5.0
- ✓ **CLEAN-01**: Briefing Doctor is removed from the creation flow — v5.0
- ✓ **CLEAN-02**: Briefing Doctor routes, hooks, and components are removed — v5.0
- ✓ **CLEAN-03**: Briefing Doctor translations are removed from i18n files — v5.0
- ✓ **CLEAN-04**: Briefing Doctor references are removed from documentation — v5.0
- ✓ **PERF-01**: Code splitting com `next/dynamic` para páginas pesadas — v6.0
- ✓ **PERF-02**: Lazy loading para componentes de campanha e galeria — v6.0
- ✓ **PERF-03**: Reduzir bundle size inicial em pelo menos 30% — v6.0
- ✓ **PERF-04**: Otimizar TanStack Query com staleTime apropriado — v6.0
- ✓ **PERF-05**: Desabilitar refetchOnWindowFocus para queries estáticas — v6.0
- ✓ **PERF-06**: Implementar prefetch de dados na navegação — v6.0
- ✓ **PERF-07**: Cachear resultados de análise visual da IA por 24h — v6.0
- ✓ **PERF-08**: Reduzir tamanho de imagens antes do upload — v6.0
- ✓ **PERF-09**: Otimizar carregamento de imagens com placeholders — v6.0
- ✓ **PERF-10**: Remover dead code e dependências não utilizadas — v6.0
- ✓ **PERF-11**: Implementar virtualização para listas grandes — v6.0
- ✓ **PERF-12**: Melhorar First Contentful Paint para < 1.5s — v6.0
- ✓ **DRV-01**: Manual art variation opens config step before generation — v11.0
- ✓ **DRV-02**: User sets creativity level and CTAs in manual art flow — v11.0
- ✓ **DRV-03**: Auto art variation pre-fills AI-suggested CTAs and creativity — v11.0
- ✓ **DRV-04**: User can edit AI suggestions before confirming auto art flow — v11.0
- ✓ **DRV-05**: Single format adaptation lets user pick one format — v11.0
- ✓ **DRV-06**: Batch format adaptation lets user pick multiple formats — v11.0
- ✓ **DRV-07**: Derivar options no longer skip to hardcoded generation — v11.0
- ✓ **DRV-08**: Modal copy matches behavior in PT-BR and EN — v11.0
- ✓ **DRV-09**: Tests cover all four Derivar entry paths — v11.0
- ✓ **DRV-10**: Estilizar workflow unaffected — v11.0

### Validated (v11.4)

- ✓ **FBK-01–04**: In-app feedback submission (global + contextual) with success/error toasts — v11.4
- ✓ **CTX-01–05**: Diagnostic context, breadcrumbs, completeness indicator — v11.4
- ✓ **OBS-01–03**: Sentry trace correlation and ID-only server logs — v11.4
- ✓ **TRI-01–04**: Owner triage list, detail, status, private notes — v11.4
- ✓ **SEC-01–04**: Workspace isolation, entity validation, sanitization, no replay by default — v11.4
- ✓ **QA-01–03**: Automated tests + privacy handoff doc — v11.4

### Validated (v11.5)

- ✓ **AIC-01–05**: Explicit creative contract per derivation, prompt preservation rules, and prompt provenance JSONB — v11.5
- ✓ **AIQ-01–05**: Shared quality taxonomy, fail-safe score/QA normalization, hard-failure gate, localized blocking vs polish copy — v11.5
- ✓ **AIR-01–05**: Bounded regeneration correction briefs, pre-confirm primary reason UI, child brief persistence, contract inheritance — v11.5
- ✓ **FIX-01–05**: Synthetic quality fixtures, prompt/gate/brief regression tests, manual loop handoff, documented model limitations — v11.5

### Validated (v11.6)

- ✓ **READY-01–05**: Creative Readiness Score, dimensions, blocking issues, rerun, and existing preflight/QA integration — v11.6
- ✓ **GUIDE-01–05**: Guided briefing questions, accept/edit/skip suggestions, draft persistence, and PT-BR/EN copy — v11.6
- ✓ **RECIPE-01–05**: Strategy recipes, concrete generation settings, tradeoff copy, readiness-aware ranking, and overrides — v11.6
- ✓ **PREVIEW-01–04**: Preview-first derivation, quality gate reuse, approve/revise path, and visible batch credit impact — v11.6
- ✓ **DELIVER-01–04**: Client approval package, selected formats, creative notes, share links, signed assets, and refresh flow — v11.6
- ✓ **CQA-01/CQA-02/CQA-03**: Automated cockpit coverage, production browser smoke, and beta handoff documentation — v11.6

### Validated (v11.6.1)

- ✓ **SHIP-01–05**: Production cockpit smoke, deploy/migration evidence, post-review fixes, audit caveats register, and v11.6 GSD archive — v11.6.1
- ✓ **BETA-01–03**: Beta runbook, feedback stage mapping, and learning questions — v11.6.1

### Validated (v11.7)

- ✓ **PROG-01–05**: User can see and progress through an Ads Scientist status ladder tied to meaningful product actions — v11.7
- ✓ **MISS-01–06**: User can complete guided missions that teach and exercise the app's core creative workflow — v11.7
- ✓ **INS-01–05**: Product owner can capture structured insight from mission moments, rejections, skips, and credit friction — v11.7
- ✓ **CRED-01–04**: Credit usage is connected to mission value, remaining allowance, and upgrade moments without dark patterns — v11.7
- ✓ **QA-01–04**: Progression, insight capture, and credit prompts are verified with tests and a beta UAT checklist — v11.7

### Validated (v11.7.1)

- ✓ **STAB-01–04**: Production build, lint, focused tests, and migration checks are green for the v11.7 progression stack — v11.7.1
- ✓ **DATA-01–03**: Mission insight and progression persistence reject invalid data and survive concurrent access — v11.7.1
- ✓ **UX-01–02**: Progression and mission CTAs resume users into the intended workflow surface — v11.7.1
- ✓ **UAT-01–03**: Beta operator can apply the migration, execute the v11.7 UAT path, and ship with documented evidence — v11.7.1

### Validated (v11.8)

- ✓ **INST-01–06**: First-party beta analytics ingest with PII-safe allowlist and workspace-scoped events — v11.8
- ✓ **INST-02–04**: Server and client instrumentation with beta session grouping — v11.8
- ✓ **SESS-01–05**: Operator session APIs, runbook-stage notes, artifact export, and real-session UAT evidence — v11.8/v11.10/v11.11 (closed 2026-06-11)
- ✓ **DASH-01–05**: Owner funnel analytics, credit/readiness signals, and CSV export on `/feedback` — v11.8
- ✓ **LEARN-01–03**: Learning answers and v11.9 direction gate (fixture-backed until real sessions) — v11.8
- ✓ **FIX-01–05**: Ranked friction backlog, five surgical fixes, and v11.9 deferral doc — v11.8
- ✓ **QA-01–03**: Instrumentation integration tests, owner 403 guards, test/lint/build green — v11.8

### Validated (v13.3)

- ✓ **DECISION-01..05**: Client-agnostic human decision intake with per-brand evidence isolation — v13.3
- ✓ **SOURCE-01..05**: Source-labeled corpus promotion, composition surfaces, and claim gates — v13.3
- ✓ **BRAND-01..04**: Curator > operator narrative rollout with copy guard — v13.3
- ✓ **TRUST-01..05**: Persistent profile/workspace settings with honest tab gating — v13.3
- ✓ **ALERT-01..04**: Factual issue alerts UI and v13.3 release gate — v13.3

### Validated (v13.4)

- ✓ **LIVE-03**: Corpus surfaces distinguish `synthetic_fixture`, `operator_imported`, and `real_customer`; Cenbrap excluded from live target — v13.4
- ✓ **SAMPLE-01..03**: Sufficiency logic and claim withholding implemented and unit-tested — v13.4
- ✓ **SMOKE-03**: Structured operational evidence record path (refresh + smoke manifest) — v13.4
- ✓ **EVIDENCE-03**: Claim unlock requires technical + operational pass; no manual override — v13.4

### Validated (v13.5)

- ✓ **CLIENT-01..03**: Multi-`clientProfile` per workspace with scoped brand kit, memory, references, voice, corpus, and calibration — v13.5
- ✓ **CHAT-01..04**: `/assistant` primary surface with tree/chat/context, create flows, and campaign drawer thread continuity — v13.5
- ✓ **ACT-01..05**: Action contracts, intent classification, quick actions without full brief, and complete-campaign minimum brief — v13.5
- ✓ **AI-01..05**: `AssistantModelClient`, MiniMax M3 streaming, allowlisted context, deny-by-default tool policy, no reasoning persistence — v13.5
- ✓ **EXEC-01..03**: Confirmed action cards, Inngest job status in thread with `jobRef` on action-card payload, review reuses workspace components — v13.5
- ~ **EXEC-04**: Happy path E2E shell + authenticated Playwright; full live lifecycle pending owner smoke — v13.5 (partial)

### Active

- [ ] Run live corpus seed (`npm run seed:live-real-customer-corpus -- --confirm`) on owner workspace after `db:migrate`
- [ ] Refresh evidence and release gate after `173-CORPUS-MANIFEST.json` exists
- [ ] Complete owner smoke checklist with live workspace data (`172-RELEASE-CHECKLIST.md`)
- [ ] Apply assistant migrations `0056`/`0057` on staging/production
- [ ] Owner smoke: `start_complete_campaign` full lifecycle (EXEC-04)
- [ ] Define next milestone scope via `$gsd-new-milestone`

### Validated (v10.0)

- ✓ **ANIM-01**: Hover/focus states com transições suaves em todos elementos interativos — v10.0
- ✓ **ANIM-02**: Modais/diálogos com animações de enter/exit — v10.0
- ✓ **ANIM-03**: Stagger animations em listas e galerias — v10.0
- ✓ **ANIM-04**: Skeleton loading com shimmer effect — v10.0
- ✓ **ANIM-05**: Toast notifications com animações suaves — v10.0
- ✓ **RESP-01**: Sidebar colapsa em drawer em mobile — v10.0
- ✓ **RESP-02**: Grids adaptativos conforme breakpoint — v10.0
- ✓ **RESP-03**: Formulários empilhados em mobile — v10.0
- ✓ **RESP-04**: TopBar com scroll behavior (hide/show) — v10.0
- ✓ **RESP-05**: Touch gestures otimizados para galeria — v10.0
- ✓ **COMP-01**: Cards com hover lift e shadow — v10.0
- ✓ **COMP-02**: Botões com active scale e estados refinados — v10.0
- ✓ **COMP-03**: Inputs com focus glow transition — v10.0
- ✓ **COMP-04**: Badges com status transition suave — v10.0
- ✓ **A11Y-01**: Empty states com ilustrações e copy contextual — v10.0
- ✓ **A11Y-02**: Error states com feedback visual — v10.0
- ✓ **A11Y-03**: Focus states visíveis em todos interativos — v10.0
- ✓ **A11Y-04**: Reduced motion support (prefers-reduced-motion) — v10.0
- ✓ **A11Y-05**: Scroll suave entre seções — v10.0

### Out of Scope

- Direct Meta/TikTok/Google Ads API integration — manual/CSV ingestion validates the learning model before OAuth and API maintenance costs
- Automatic budget optimization and campaign publishing — ADScale recommends creative experiments but does not operate media spend
- Multi-touch attribution — this milestone uses user-provided campaign and creative metrics, not cross-channel attribution
- Slack integration — out of MVP
- API key management UI — out of MVP
- OAuth login (Google/GitHub) — email/password sufficient for v1
- Real-time notifications — polling sufficient for MVP
- Admin panel — single workspace model for MVP
- LGPD compliance — separate milestone
- Multi-format cross-combination (CTA × format) — out of v3.0 scope
- Format adaptation beyond 1:1, 4:5, 9:16 — future milestone
- AI-generated copy suggestions for CTAs — requires content model fine-tuning
- Bulk CTA import from spreadsheet/CSV — future UX improvement
- Briefing Doctor — removed in v5.0; replaced by AI visual analysis of key creative
- Multi-step campaign brief form — replaced by simplified single-page flow in v5.0

## Context

Current state: v13.4 shipped 2026-06-25 with accepted tech debt. Operational evidence infrastructure (seed script, refresh path, smoke manifest, release-gate auto-refresh) is complete. `operationalEvidence` remains honestly `insufficient_sample` until live owner corpus seed and smoke execute on migrated DB. Customer-real claims stay blocked by design.

v12.7 treated ADScale as a tool that scales creative criterion, not just variation volume. v12.8 now tests that criterion operationally: real campaigns, contact sheets, human decisions and honest evidence refresh.

v12.6 remains relevant infrastructure: the live corpus, sampling honesty and release-gate separation must be reused so v13.1 does not claim quality movement from a green script or a tiny sample.

Marketing remains in `jhowtkd/site-adscale.git`; product feedback and owner triage live in ADScale_2 at `/feedback` for platform owners.

Migration `app/drizzle/0027_fine_morlun.sql` (Drizzle journal idx 27) must be applied in deployed environments via `npm run db:migrate` before relying on `creative_contract`, `prompt_provenance`, and `regeneration_correction_brief` columns in production.

Prior milestones delivered the strategy cockpit (v11.6), beta feedback capture (v11.4), presentation site separation (v11.3), beta entitlements (v11.2), generation quality gates (v11.1), coherent derivation flows (v11.0), and the full MVP through v10 UI polish.

Current verification baseline: v13.0 release gate is technically complete but evidence-limited. Agreement, quality and customer-real claims remain withheld until operator decisions and global corpus evaluations meet sample guidance. Corpus source composition must stay explicit: fixture rows validate operation, not customer-real proof.

Key stack decisions:
- Next.js App Router, React, TypeScript, Tailwind, shadcn/ui
- TanStack Query for server state; Zustand only for local UI state (sidebar, title, toasts)
- Neon PostgreSQL with Drizzle ORM
- Better Auth with open signup
- Cloudflare R2 for assets and generated images
- Inngest for durable generation jobs
- OpenAI for plan generation (`gpt-5-mini`) and image derivation (`gpt-image-2-2026-04-21`)
- Deploy on Render

## Constraints

- **Tech stack**: Stack chosen in `plan.md` is locked. No migration debates.
- **Image model**: `OPENAI_IMAGE_MODEL=gpt-image-2-2026-04-21`. No silent fallback. If API rejects, show clear config error.
- **Security**: Do not hardcode API keys. Do not commit `.env`. Validate input, file type, size and workspace access at boundaries.
- **Learning integrity**: Recommendations must expose evidence, sample size, and confidence; sparse or incomparable data cannot be presented as certainty.
- **Import-first scope**: Validate the performance-learning model with manual entry and CSV before direct media-platform APIs.
- **Language model behavior**: Plan and derivation prompts include the target language instruction. No silent fallback to English.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Better Auth + open signup | Fastest path to auth without OAuth complexity | ✓ Good |
| Zustand → UI-only | Prevents stale business data in client stores | ✓ Good |
| Inngest for derivation jobs | Durable, retryable, observable without managing workers | ✓ Good |
| R2 for all file storage | S3-compatible, cost-effective, presigned URLs keep load off Vercel | ✓ Good |
| OpenAI image model configurable | Future-proof if model name changes | ✓ Good |
| JSONB contract/provenance on derivations | Inspectable generation contract without public debug UI | ✓ Good — v11.5 |
| Shared quality taxonomy module | Score, QA, and gate must agree on failure categories | ✓ Good — v11.5 |
| Feedback as categorized context only | Raw beta text cannot override hard contract fields | ✓ Good — v11.5 |
| Synthetic fixtures over customer assets | Privacy-safe repeatable regression for known failure modes | ✓ Good — v11.5 |
| Preview before batch | Users should validate strategy cheaply before spending credits on a full batch | ✓ Good — v11.6 |
| Strategy cockpit over isolated tools | Existing AI modules should be orchestrated into one decision path before adding new surface area | ✓ Good — v11.6 |
| Operator smoke before beta ship | Automated tests passed, but deployed browser evidence is still the release gate | ✓ Good — v11.6.1 |
| Progression as activation, not decoration | Beta users should learn by completing real creative tasks that generate insight and consume credits transparently | ✓ Good — v11.7 |
| Stabilization before beta expansion | Activation mechanics should not enter beta while build, persistence, and UAT gates are still uncertain | ✓ Good — v11.7.1 |
| Learn before build | Instrument and run operator beta sessions before adding speculative cockpit or progression features | ✓ Good — v11.8 |
| First-party beta analytics | Operator-scale learning without third-party SDK; PII allowlist at ingest | ✓ Good — v11.8 |
| Evidence-capped friction fixes | Max 5 surgical UX fixes per milestone with session citations | ✓ Good — v11.8 |
| Manual/CSV performance ingestion before platform APIs | Validate data model and recommendation value before OAuth, rate-limit, and provider-maintenance complexity | — Pending — v12.1 |
| Explainable recommendations over opaque ranking | Users need evidence, sample size, and confidence to trust the next creative experiment | — Pending — v12.1 |
| Olhar before export compliance | A creative can be exportable and still weak, or strong and still blocked by factual/export issues; the product must show both truths separately | ✓ Good — v12.7 |
| Client voice as prompt overlay | Cenbrap validates the structure before multi-client voice management is productized | ✓ Good — v12.7 |
| Live operator calibration before claims | Agreement/quality claims require reviewable rows, Jhonatan decisions and sufficient sample — infrastructure complete, operator gate open | ✓ Good — v12.8 shipped with tech_debt |
| Corpus before judgment | Jhonatan decision capture unblocked with `review_ready` rows | ✓ Good — v12.8 |
| Judgment before evidence claims | Phase 146 refreshed evidence and claims gate; agreement blocked while decisions missing | ✓ Good — v12.8 |
| Human authority before calibration learning | Jhonatan decisions are the calibration authority; system verdicts are evidence under test | — Pending — v12.9 |
| Source labels before customer claims | Fixture rows can validate operation but cannot support customer-real claims | — Pending — v12.9 |
| Human judgment as calibration, not throughput | Decisions should create reusable taste rules and reduce future uncertainty | ✓ Good — v13.0 infrastructure shipped |
| Global owner corpus before global claims | Owner can review all generated creatives, but product claims require sample and source sufficiency | — Pending — v13.1 |
| Client-agnostic traction before calibration depth | A test client fixture cannot become the product proof; generic decision/source flows and product trust come before deeper owner-only calibration panels | ✓ Good — v13.3 shipped with operational evidence debt |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-25 — after v13.4 Fechamento de Evidência Operacional milestone completion*

## Milestone History

### v3.0 Modos de Derivação Fiel ✅
- Art variation, format adaptation, restyling
- Creativity templates with operational rules
- Literal CTA enforcement
- Phases 10–15 archived

### v4.0 Monetização & Compliance ✅
- Stripe subscriptions with 14-day trial
- Plan cards, upgrade flow, credit alerts
- LGPD: privacy page, terms, cookie banner, data export, account deletion
- Phases 16–17 archived

### v5.0 Simplificação do Fluxo de Criação de Campanha ✅
- Single-page campaign creation form (name, client, profile)
- AI visual analysis of key creative with deduced fields
- Editable auto-filled campaign information
- Generation mode with creativity profile and CTA suggestions
- Briefing Doctor completely removed
- Phases 18–21 archived

## Milestone History (Continued)

### v6.0 Performance & Otimização ✅
- Code splitting e lazy loading (next/dynamic, 15+ componentes)
- TanStack Query optimization (staleTime presets, prefetch on hover)
- AI visual analysis caching (24h cache check)
- Image optimization (resize >5MB to 1024px, OptimizedImage component)
- Bundle cleanup (7 unused dependencies removed)
- VirtualList for large lists (>20 items)
- Resource hints for R2 CDN (preconnect/dns-prefetch)
- Phases 22–25 archived

### v7.0 Experiência do Usuário ✅
- Onboarding aprimorado com tour de 5 passos e tooltips contextuais
- Templates de campanha reutilizáveis (salvar, usar, renomear, deletar)
- Analytics no dashboard com 6 KPIs e seletor de período
- Phases 26–28 archived

### v8.0 Galeria de Revisão Aprimorada ✅
- Comparação lado a lado com zoom sincronizado e pan
- Filtros avançados: status, formato, CTA, quality score range
- Persistência de filtros na URL
- Batch approve/reject com master checkbox
- Phases 29–31 archived

### v9.0 Galeria de Revisão v2 ✅
- Anotações visuais (freehand, text, shapes) em canvas
- Toolbar de anotações com cores, espessura e tamanho de fonte
- Persistência de anotações no localStorage
- Comparação de 3+ derivações em grid adaptativo
- Zoom/pan independente em cada célula
- Slider antes/depois com divisão arrastável
- Toggle entre grid view e slider view
- Phases 32–34 archived

### v10.0 Refinamento de Interface ✅
- Animation Foundation: variants, easings, transitions, hooks (useReducedMotion, useMediaQuery)
- Reusable animation components: FadeIn, StaggerContainer, ShimmerSkeleton
- Core Component Polish: Card hover lift, Button active scale, Input focus glow, Badge transitions
- Layout Responsive: Mobile sidebar drawer, TopBar scroll behavior, responsive grids, form stacking
- Feature Components: Stagger animations in lists/galleries, enhanced modal animations
- States & Accessibility: Enhanced empty states, shake animation, reduced motion support
- Phases 35–39 archived

### v11.0 Fluxos de Derivação Coerentes ✅
- `useDerivationFlow` routing — no silent auto-generate from Derivar chooser
- Art variation config modals with creativity profile + CTAs (manual and AI-assisted prefill)
- Format adaptation single/batch pickers with API validation for 1–3 target formats
- PT-BR/EN copy aligned to behavior; comprehensive test coverage for all four paths
- Phases 40–43 archived

### v11.1 Qualidade de Geração e Contratos Criativos ✅
- Native format adaptation, creative contract, restyling source control, hard quality gates, and workspace error/review feedback
- Phases 44–48 archived

### v11.2 Beta Access and Credit Entitlements ✅
- Beta access without fake Stripe subscriptions
- 10-ad beta allowance through server spend gates
- Billing/status UI distinguishes beta and paid access
- Phase 49 archived

### v11.3 Site de Apresentação Separado ✅
- Public presentation site in `jhowtkd/site-adscale.git`
- Marketing/app boundary documented; legal pages remain in app
- Phases 50–52 archived

### v11.4 Beta Feedback Capture ✅
- `feedback_reports` model with sanitized diagnostics and workspace-safe APIs
- In-app feedback modal with global and contextual triggers
- Owner triage at `/feedback` with signed asset links
- Phases 53–56 archived

### v11.5 Qualidade IA Orientada por Feedback ✅
- Durable creative contract and prompt provenance on derivations
- Shared taxonomy with fail-safe score/QA normalization and hard-failure gate
- Feedback-informed regeneration with pre-confirm primary reason and child brief persistence
- Six-fixture synthetic catalog with 28 automated pipeline regression tests
- Phases 57–60 archived
