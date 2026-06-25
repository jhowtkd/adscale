# Milestones: ADScale

## v13.3 Tracao Multi-Cliente (Shipped with tech debt: 2026-06-25)

**Phases completed:** 5 phases (168→172), 16 plans
**Requirements:** 23/23 complete
**Audit:** `tech_debt` — automated verification green; operational evidence `insufficient_sample`

**Key accomplishments:**

- Generic human-quality evaluation → decision/calibration bridge for any `clientProfileId` with cross-profile isolation tests (Phase 168)
- Source-labeled corpus promotion with `fixtureOnly` claim gates and dual technical/operational release evidence (Phase 169)
- "Curator > operator" narrative rollout with automated forbidden-pattern copy guard across authenticated surfaces (Phase 170)
- Profile and workspace settings persisted via backend APIs; Zustand mock slices removed; honest tab gating (Phase 171)
- `FactualAlertsPanel` with safe evidence links mounted in corpus Learning and brand Propostas tabs (Phase 172)
- v13.3 release gate orchestrator (`run-v13-3-release-gate.mjs`) with `172-EVIDENCE.json`: `technicalRegression: pass`, `operationalEvidence: insufficient_sample`

**Known tech debt (accepted):**

- No production multi-brand `real_customer` corpus at scale; `activeBrandSample.fixtureOnly: true`
- Owner smoke checklist (`172-RELEASE-CHECKLIST.md`) not completed with live workspace data
- Manual UAT deferred: settings hard-refresh/logout, narrative tone walk, integrations badge visual spot-check

Archive: [v13.3-ROADMAP.md](milestones/v13.3-ROADMAP.md) · [v13.3-REQUIREMENTS.md](milestones/v13.3-REQUIREMENTS.md) · [v13.3-MILESTONE-AUDIT.md](milestones/v13.3-MILESTONE-AUDIT.md)

---

## v13.2 Calibração Multi-Marca (Shipped: 2026-06-24)

**Phases completed:** 11 phases, 27 plans, 37 tasks

**Key accomplishments:**

- Status:
- Status:
- Status:
- Status:
- Status:
- Status:
- Status:
- Status:
- Status:
- Status:
- Dedicated `client_profile_olhar_config` table with workspace-scoped repository, Cenbrap seed script, and golden parity between DB-shaped config and `CENBRAP_VOICE` prompt output
- Generation resolves brand voice by `clientProfileId` with DB `review_status` gate; string-matching `resolveClientVoice` deprecated and removed from the prompt path
- Owner-only GET API and read-only admin UI for per-brand Olhar voice configuration at `/admin/quality/brands/[clientProfileId]`
- Cooldown and approved-rule gates on corpus learning proposals with complete evidenceRefs (artifactIds + fixtureOnly)
- Fixture-only accept gate with corpus_quality caveat plus owner factual_issue alert API using shared slice bucketing
- End-to-end corpus learning loop proven in vertical slice test with LEARN-01..06 signed off via automated tests and operator-approved staging smoke
- Unified calibration loader wires brand-taste rules through selectApplicableRules gate, enforces Olhar → brand-taste → corpus_quality prompt order, and logs both rule ID arrays on derivation finalize.
- enforceCorpusQualityRuleCap deprecates oldest approved corpus_quality rules in DB on overflow, wired on proposal accept and derivation loader.
- Mock-based two-profile test suite proves brand-taste and corpus_quality rule IDs never leak across clientProfileIds in loader output, derivation prompts, or generation log provenance.
- Owner-only GET APIs for cross-workspace brand list, per-brand taste profile (buildBrandTasteProfile), and calibration rules grouped by approved/candidate status
- Tabbed OwnerCalibrationPanel with honest fixture-only status copy, taste profile pattern groups, and read-only rules tables on the brand calibration route
- Per-brand learning proposals with clientProfileId API filter, fixture-only accept acknowledgment, and Propostas tab in OwnerCalibrationPanel
- Per-brand evidence report builder with brand-scoped claims matrix and owner-only GET .../evidence API
- BrandEvidencePanel with PT-BR claims matrix, fixture caveat banner, and Evidência tab wired on OwnerCalibrationPanel
- Cross-client global proposals now persist fixtureOnly, supportingClientRuleIds, primaryFailureReason, and promotionSource on evidenceRefs without changing detection thresholds
- Rejected global calibration adjustments with reason audit trail, PATCH reject API, and acknowledgeFixtureOnly gate for fixture-only cross-client accepts
- Calibration tab accept/reject for cross-client global proposals with fixture acknowledgment, plus GLOBAL-05 proof that accepted global rubric adjustments do not leak corpus_quality rules across clientProfile prompts

---

## v13.1 Global Owner Quality Corpus (Gaps found: 2026-06-20)

**Phases completed:** 5 phases (157→161), 10 plans — **documentation reconciled; closure blocked**
**Requirements:** 28/29 complete; CAPTURE-04 partial (promote API only, no candidate list UI)

**Scope:** (same as shipped intent — global owner corpus, capture, queue, evaluation, evidence)

**Key accomplishments:** (unchanged — infrastructure largely in place)

**Open gaps:**

- Build was red (`outputKey` null) — fixed pending verify
- CAPTURE-04: candidate list/UI missing
- Work uncommitted in git

Archive: [ROADMAP.md](ROADMAP.md) · [REQUIREMENTS.md](REQUIREMENTS.md) · [v13.1-MILESTONE-AUDIT.md](milestones/v13.1-MILESTONE-AUDIT.md)

---

## v12.9 Fechamento Humano do Olhar Cenbrap (Shipped with tech debt: 2026-06-20)

**Phases completed:** 2 of 4 phases (147→148 complete; 149→150 deferred), 4 plans
**Requirements:** 8/16 complete; 8/16 deferred as accepted tech debt

**Scope:**

- Validar o workflow de decisao operatoria sem fabricar julgamento humano
- Expandir a amostra Cenbrap para 5 rows revisaveis
- Rerodar calibracao/evidencia mantendo `agreementRate=null` enquanto decisoes humanas faltam
- Separar row sufficiency de human-decision sufficiency
- Registrar source composition e claims proibidos enquanto a prova e fixture-only

**Key accomplishments:**

- Phase 147 confirmou o recorder/dry-run e o rerun de calibracao com `human_needed` honesto.
- Phase 148 expandiu o corpus para 5 rows revisaveis e publicou `148-SAMPLE-GATE.md`.
- Evidence manteve `humanDecisionCount=0`, `additionalNeeded=5` e `agreementRate=null`.
- `148-DECISIONS.template.json` ficou pronto para as 5 decisoes do Jhonatan.

**Known tech debt (accepted carry-forward):**

- `145-DECISIONS.json` ainda ausente; as 5 decisoes humanas nao foram fornecidas.
- Source composition continua 5 `synthetic_fixture`, 0 `operator_imported`, 0 `real_customer`.
- Phase 149 customer-real corpus replacement foi deferida.
- Phase 150 agreement calibration/final claims gate foi deferida porque nao ha comparable rows.
- Nenhum claim externo de acordo, melhoria de qualidade ou prova customer-real esta autorizado.

**Next direction:** v13.0 transforma julgamento humano em calibracao reutilizavel: decisoes viram sinais, perfis de gosto de marca, regras aprovaveis e fila de incerteza.

Archive: [v12.9-ROADMAP.md](milestones/v12.9-ROADMAP.md) · [v12.9-REQUIREMENTS.md](milestones/v12.9-REQUIREMENTS.md) · [v12.9-MILESTONE-AUDIT.md](milestones/v12.9-MILESTONE-AUDIT.md) · Plan: [human-judgment-calibration-loop-plan.md](human-judgment-calibration-loop-plan.md)

---

## v12.8 Operacao Real do Olhar Cenbrap (Shipped with tech debt: 2026-06-19)

**Phases completed:** 4 phases (143→146), 8 plans
**Requirements:** 16/16 complete at implementation/operational-infrastructure level

**Scope:**

- Calibracao Cenbrap live contra ambiente configurado
- Seeding/import seguro com corpus `synthetic_fixture` revisavel
- Contact sheet com linhas `review_ready`, dual verdicts e elegibilidade de pacote
- Captura de decisoes do Jhonatan e buckets de mismatch acionaveis
- Refresh de evidencia live e claims gate honesto (`human_needed`)
- Fechamento parcial da divida v12.7 com carry-forward explicito

**Key accomplishments:**

- Provou runner live e resolveu blocker `insufficient_campaigns` com corpus seedado (Phase 144).
- Criou tooling de decisao operatoria e metricas comparaveis sem fabricar acordo (Phase 145).
- Gerou `142-EVIDENCE.json` a partir de calibracao live — nao mais template-only (Phase 146).
- Publicou `146-CLAIMS-GATE.md` separando factual/export safety de art-direction agreement.

**Known tech debt (accepted carry-forward):**

- `humanDecisionCount=0` — Jhonatan ainda nao preencheu decisoes nas 2 linhas `review_ready`.
- Sample guidance `0/5` — `agreementRate` e claims de qualidade corretamente withheld.
- Corpus `synthetic_fixture` — calibracao operacional, nao prova customer-real.
- Phase 141 override UX ainda `human_needed` em campanha real.

**v12.7 debt closed by v12.8:**

- Evidencia template-only → `142-EVIDENCE.json` live
- `evaluatedCampaignCount=0` → 2 campanhas, 2 derivacoes
- Sem path de decisao operatoria → Phase 145 tooling completo

Archive: [v12.8-ROADMAP.md](milestones/v12.8-ROADMAP.md) · [v12.8-REQUIREMENTS.md](milestones/v12.8-REQUIREMENTS.md) · [v12.8-MILESTONE-AUDIT.md](milestones/v12.8-MILESTONE-AUDIT.md) · Claims gate: [146-CLAIMS-GATE.md](phases/146-evidence-refresh-and-claims-gate/146-CLAIMS-GATE.md)

---

## v12.7 Olhar ADScale: Direcao de Arte Antes de Compliance (Shipped with tech debt: 2026-06-19)

**Phases completed:** 5 phases (138→142), 11 plans
**Requirements:** 24/24 complete at implementation level

**Scope:**

- Constituicao `Olhar ADScale` e primeira voz editorial Cenbrap
- Contratos separados de `olharVerdict` e `exportStatus`
- Validador deterministico de exportacao e bloqueio de `approved + invalid`
- Preflight, QA, score e prompt-builder reescritos como direcao de arte
- Review UI Olhar-first com decisoes humanas estruturadas e override auditavel
- Infraestrutura de calibracao Cenbrap e release evidence com template honesto

**Key accomplishments:**

- Separou julgamento criativo de compliance/exportacao em contratos persistidos.
- Rebaixou score numerico para detalhe e promoveu veredito/direction note como sinal primario.
- Criou UX de review com `Entra`, `Quase - regenerar assim`, `Nao entra` e override com motivo tipado.
- Criou pipeline de calibracao/evidence Cenbrap com checker que preserva `insufficient_sample`.

**Known tech debt (partially resolved in v12.8):**

- Template-only evidence and empty corpus — **closed in v12.8** via live calibration and `142-EVIDENCE.json`.
- Decision capture path — **closed in v12.8** (Phase 145 tooling); operator decisions still pending (`humanDecisionCount=0`).
- Agreement/quality claims — **still withheld** until 5 operator decisions and cleared sample guidance.
- Phase 141 override UX — **carried forward**; human confirmation on real campaign still pending.

Archive: [v12.7-ROADMAP.md](milestones/v12.7-ROADMAP.md) · [v12.7-REQUIREMENTS.md](milestones/v12.7-REQUIREMENTS.md) · [v12.7-MILESTONE-AUDIT.md](milestones/v12.7-MILESTONE-AUDIT.md)

---

## v12.6 Operacao Live do Corpus de Qualidade (Shipped with tech debt: 2026-06-18)

**Phases completed:** 4 phases (134→137), 14 plans
**Requirements:** 16/16 complete

**Scope:**

- Rotina operacional para selecionar e avaliar outputs reais no corpus live
- Review queue com progresso por workspace, campanha, modo, formato, cohort e reviewer status
- Regras canonicas de amostragem e `insufficient_sample` para impedir claims prematuros
- Dashboard de tendencias live com filtros, alertas e drilldown para evidencia
- Release gate dual que separa regressao tecnica verde de suficiencia operacional

**Key accomplishments:**

- Criou batch selection e queue progress para transformar campanhas reais em corpus humano auditavel.
- Melhorou o painel de avaliacao para fluxo rapido de reviewer, com payload seguro e sem persistir URLs/prompt bruto.
- Centralizou thresholds de amostra e guidance para calibracao, learning impact, quality improvement e trend gates.
- Adicionou trend dashboard/API/evidence CLI para qualidade humana, factualidade e coverage por fatias.
- Fechou o milestone com `operational-quality-release-gate -- --run-regression` passando tecnicamente e reportando operacional `insufficient_sample` honestamente.

**Known tech debt:**

- Corpus live operacional ainda esta sem amostra suficiente: `evaluatedItemCount=0` na evidencia canonica.
- Trend gate permanece insuficiente: 3/5 itens globais e 1/2 buckets populados.
- `qualityImprovementClaimed` fica withheld ate haver sample sufficiency e factual pass 1.0.
- Nyquist metadata ainda esta parcial nas fases 135, 136 e 137.

Archive: [v12.6-ROADMAP.md](milestones/v12.6-ROADMAP.md) · [v12.6-REQUIREMENTS.md](milestones/v12.6-REQUIREMENTS.md) · [v12.6-MILESTONE-AUDIT.md](milestones/v12.6-MILESTONE-AUDIT.md)

---

## v12.5 Validacao Real de Qualidade e Calibracao do Loop Criativo (Shipped with tech debt: 2026-06-17)

**Phases completed:** 5 phases (129→133), 19 plans
**Requirements:** 19/19 complete

**Scope:**

- Corpus live versionado de outputs reais com julgamento humano estruturado
- Calibracao de score automatico contra nota visual humana
- Medicao de impacto dos learnings de v12.4 em outputs comparaveis
- Melhorias focadas nos defeitos visuais provados pelo corpus
- Release gate realista com metricas separadas de qualidade, factualidade e learning impact

**Key accomplishments:**

- Criou o fluxo interno de selecao, congelamento e avaliacao de outputs reais para corpus humano.
- Implementou comparacao score automatico vs julgamento humano, divergencias agrupadas e propostas versionadas de ajuste.
- Adicionou medicao de impacto do output-learning aplicado, com estados honestos de amostra insuficiente.
- Aplicou melhoria focada em falha visual aceita e manteve regressao v12.3/v12.4 verde.
- Fechou o milestone com `real-quality-release-gate --run-regression` passando.

**Known tech debt:**

- Corpus live ainda estava vazio no refresh com `DATABASE_URL`: `evaluatedItemCount=0`.
- QA-24 fechou por Path B `accepted_gap` (`currentValue 72`, `gapToTarget 3`, menor que o gap anterior `4.83`), nao por cruzar a meta humana `75`.
- Proxima operacao deve popular/evaluar corpus real e rerodar 130/131/132/133 aggregate antes de claims de tendencia.

Archive: [v12.5-ROADMAP.md](milestones/v12.5-ROADMAP.md) · [v12.5-REQUIREMENTS.md](milestones/v12.5-REQUIREMENTS.md) · [v12.5-MILESTONE-AUDIT.md](milestones/v12.5-MILESTONE-AUDIT.md)

---

## v12.4 Aprendizado de Qualidade dos Outputs (Shipped: 2026-06-17)

**Phases completed:** 5 phases (124→128), 15 plans
**Requirements:** 21/21 complete

**Scope:**

- Captura canônica de decisões humanas sobre outputs em `output_decision_events`
- Agregação em learnings canônicos versionados com confiança, contradição e supersession
- Projeção Mem0 apenas como camada de retrieval, mantendo Postgres como fonte de verdade
- Recommendation/prefill antes da próxima geração com escopo limitado e explicável
- Safety guards que preservam as proteções factuais da v12.3
- Release gate com métricas separadas de qualidade e fidelidade factual

**Key accomplishments:**

- Criou o loop completo de evidência: review/regenerate/save-reference/delivery selection → evento canônico → learning aprovado.
- Implementou `client_output_learnings` com confiança, evidências de suporte/contradição e supersession.
- Adicionou `/api/campaigns/[id]/output-recommendation` e UI de recomendação antes do gasto de créditos.
- Garantiu que Mem0 relevance nunca autoriza mudança de geração sem learning aprovado em Postgres.
- Fechou o release gate com `qualityImprovementPathRate=1.0` e `safetyGuardPassRate=1.0`.

**Known accepted gaps:**

- Human-judged quality uplift ainda não foi re-medido em corpus live; o gate usa pipeline determinístico com fixtures.
- Gap visual herdado de v12.3 permanece aceito: `meanQualityScore 70.17 < 75`.

Archive: [v12.4-ROADMAP.md](milestones/v12.4-ROADMAP.md) · [v12.4-REQUIREMENTS.md](milestones/v12.4-REQUIREMENTS.md) · [v12.4-MILESTONE-AUDIT.md](milestones/v12.4-MILESTONE-AUDIT.md)

---

## v12.3 Integridade Criativa (Shipped with accepted gap: 2026-06-16)

**Phases completed:** 9 phases (115→123), 31 plans
**Requirements:** 38/39 complete; QA-19 accepted as known visual-quality gap

**Scope:**

- Corpus fixtures from audited creative exports (58.5/100 baseline)
- Canonical creative contract with hierarchy and anti-hallucination injection
- Factual vs visual separation for restyling
- Per-mode prompt rules (art_variation, restyling, format_adaptation)
- Observable rubric replacing "polished" as pass criterion
- Quality gate hardening with new hard failures
- Score ceilings and factual-parent retry
- Regression test suite proving rules reach prompts and gate
- Visual validation gate (factual fidelity passed; mean quality below target accepted for closure)

**Audit baseline:** `app/exports/render-creatives/` — Cantona/Manchester United hallucinations, visual overload, generic templates pass current gate

**Key accomplishments:**

- Corpus-backed fixture matrix for hallucination, overload, generic-template, format-drift, and restyling-contamination failures
- Canonical creative contract, factual/visual separation, and mode-specific prompt rules injected into real derivation prompts
- Expanded hard-failure taxonomy, score ceilings, and restyling retry from factual source
- Regression suite for prompt injection, gate matrix, mode/format behavior, and thumbnail legibility
- Controlled before/after visual validation evidence: factual fidelity `1.000` (6/6), mean quality `70.17` against target `75`

**Known accepted gap:** QA-19 mean quality remains below threshold (`70.17 < 75`); no further API regeneration in this milestone. QA-21 release gate remains blocked only because it includes QA-19.

Archive: [v12.3-ROADMAP.md](milestones/v12.3-ROADMAP.md) · [v12.3-REQUIREMENTS.md](milestones/v12.3-REQUIREMENTS.md) · [v12.3-MILESTONE-AUDIT.md](milestones/v12.3-MILESTONE-AUDIT.md)

---

## v12.2 Refinamento Visual e Consistência da Interface (Shipped: 2026-06-14)

**Phases completed:** 6 phases (109→114), 11 plans  
**Requirements:** 33/33 complete

**Scope:**

- Visual foundation contracts, tokens, primitives, ownership inventory, and paired browser baseline
- Responsive app shell with `PageFrame`, i18n TopBar, single-main landmark, and shell geometry e2e
- Shared page primitives on campaigns, settings, dashboard, and secondary routes
- Campaign workspace stage strip, sticky action bar, unified panels, and overlay layering
- Playwright release gate: 54 layout checks + 8 axe audits; `npm test` / lint / build green

**Key accomplishments:**

- Canonical geometry/density/layer tokens with before/after visual evidence matrix
- Operational surfaces migrated to shared page hierarchy without changing business flows
- Workspace oriented by mission stage with predictable sticky chrome
- Milestone-wide responsive matrix at 390–1920px with `run-release-gate.mjs`

**Deferred:** `DEFECT-CONTRAST` — documented in axe gate, non-blocking

Archive: [v12.2-ROADMAP.md](milestones/v12.2-ROADMAP.md) · [v12.2-REQUIREMENTS.md](milestones/v12.2-REQUIREMENTS.md) · [v12.2-MILESTONE-AUDIT.md](milestones/v12.2-MILESTONE-AUDIT.md)

---

## v12.0 Monetização Real (Shipped: 2026-06-11)

**Phases completed:** 6 phases (97→102)
**Requirements:** 19 requirements

**Scope:**

- Subscription status contract and idempotent invoice-paid credit grants
- Explicit past-due spend policy and Customer Portal recovery
- Structured 402 conversion payloads and trial/upgrade CTAs
- Billing account UI for paid, trial, beta, past-due, canceled, and no-access states
- Production Stripe go-live checklist, deploy, and LIVE-02 webhook smoke (operator checkout + idempotent redelivery)
- Full billing regression and release gate

Archive: [v12.0-ROADMAP.md](milestones/v12.0-ROADMAP.md) · [v12.0-REQUIREMENTS.md](milestones/v12.0-REQUIREMENTS.md) · [v12.0-MILESTONE-AUDIT.md](milestones/v12.0-MILESTONE-AUDIT.md)

---

## v11.11 Aprendizado → Ação (Shipped: 2026-06-11)

**Phases completed:** 7 phases (90→96)

---

## v11.10 Fechamento Entrega e Analytics (Shipped: 2026-06-11)

**Phases planned:** 5 phases (85→89)  
**Requirements:** 14 requirements

**Scope:**

- Cockpit instrumentation: recipe_tradeoff_viewed, recipe_selected, briefing step abandon, preview funnel false-abandon fix
- Readiness false-positive override workflow with auditable server-side event
- Owner dashboard polish: uncapped session timeline, credit consumption funnel, real session filter
- F-14 regression test fix and full CI green gate
- SESS-03 — ≥3 real operator sessions with learning answers updated from real data

---

## v11.9 UX de Entrega e Créditos (Shipped: 2026-06-07)

**Phases completed:** 5 phases (80→84)  
**Requirements:** 13/13 complete

**Key accomplishments:**

- Preview gate credit formula (`N × 5 = total`), balance display, and insufficient-credit block before batch
- `operation_key` + `creditDelta` on `credit_spend` / `credit_blocked` analytics events
- Approval package stale callout, refresh toast, and share-page recipient self-serve guide
- Owner dashboard: credit surprise ranking by operation, session stage timeline with gaps, CSV sections
- Full regression suite green (1000 tests)

**Archive:** [v11.9-ROADMAP.md](milestones/v11.9-ROADMAP.md) · [v11.9-REQUIREMENTS.md](milestones/v11.9-REQUIREMENTS.md) · [v11.9-MILESTONE-AUDIT.md](milestones/v11.9-MILESTONE-AUDIT.md) · [v11.9-phases/](milestones/v11.9-phases/)

---

## v11.8 Loop de Aprendizado Beta (Shipped: 2026-06-07)

**Phases completed:** 5 phases (75→79), 16 plans  
**Requirements:** 26/26 complete after SESS-03 closure on 2026-06-11

**Key accomplishments:**

- First-party beta analytics layer (`beta_analytics_events`, `beta_sessions`) with PII-safe ingest API
- Cockpit and mission instrumentation (server + client) with session grouping via `useRecordBetaEvent`
- Operator beta session APIs and `BetaSessionsPanel` on `/feedback` with runbook-stage notes
- Owner funnel analytics, credit surprise signals, readiness overrides, and CSV export
- Five evidence-driven friction fixes (F-01..F-05) with regression tests and v11.9 backlog

### Closed Follow-Ups

- **SESS-03:** ≥3 real operator sessions completed and cited in Phases 89, 93, and 94 on 2026-06-11
- **Migration:** Apply `0033_beta_analytics.sql` on staging/prod (`cd app && npm run db:migrate`)
- **Live DB smoke:** Confirm events land in `beta_analytics_events` with real `session_id` (Phase 76 human gate)
- **Learning docs:** Real-session answers completed in Phase 94; fixture UUIDs removed from canonical answers

**Archive:** [v11.8-ROADMAP.md](milestones/v11.8-ROADMAP.md) · [v11.8-REQUIREMENTS.md](milestones/v11.8-REQUIREMENTS.md) · [v11.8-MILESTONE-AUDIT.md](milestones/v11.8-MILESTONE-AUDIT.md) · [v11.8-phases/](milestones/v11.8-phases/)

---

## v11.7 Ads Scientist Progression (Shipped: 2026-06-06)

**Phases completed:** 4 phases (68→71), 8 plans  
**Requirements:** 24/24 complete

**Key accomplishments:**

- Ads Scientist status ladder (Jovem Aprendiz → Cientista de Ads) from real workspace actions
- 11-step guided mission path with deep-link CTAs and learning copy
- Mission-linked insight capture with owner triage and sanitization
- Credit cost and balance on generation missions; gated upgrade prompts after value moments
- Owner healthy-vs-frustration credit signals on feedback triage
- 32-test QA matrix + UAT evidence for progression to Analista Criativo

**Archive:** Phases 68-71 in `.planning/phases/` · Verification: `71-VERIFICATION.md` · UAT: `71-UAT-EVIDENCE.md`

---

## v11.6.1 Ship Readiness and Beta Activation (Shipped: 2026-06-06)

**Phases completed:** 2 phases (66→67), 3 plans
**Requirements:** 8/8 complete

**Key accomplishments:**

- Production/staging cockpit smoke evidence and release readiness checks
- Deploy, health, environment, and migration readiness evidence
- Post-review fixes for recipe selection, preflight rerun billing, and approval-package refresh
- v11.6 milestone archive with audit caveats resolved or carried forward
- Beta operator runbook, feedback-stage mapping, and v11.7 learning questions

**Runbook:** [67-BETA-RUNBOOK.md](phases/67-milestone-archive-and-beta-runbook/67-BETA-RUNBOOK.md) · [67-LEARNING-QUESTIONS.md](phases/67-milestone-archive-and-beta-runbook/67-LEARNING-QUESTIONS.md)

---

## v11.6 Creative Strategy Cockpit (Shipped: 2026-06-06)

**Phases completed:** 5 phases (61→65), 10 plans
**Requirements:** 26/26 complete

**Key accomplishments:**

- Creative Readiness Score with six dimensions, blocking issues above suggestions, and rerun after brief/asset changes
- Guided briefing one question at a time with accept/edit/skip and draft persistence into the campaign form
- Strategy recipes (Safe Iteration, Performance Push, Visual Differentiation) with readiness-aware ranking and tradeoff copy
- Preview gate before batch generation with visible credit impact and shared quality gate
- Client approval package with share links, signed assets, stale detection, and refresh after rejection/regeneration
- 69-test cockpit matrix, milestone audit, beta handoff, and production browser smoke (CQA-02)

**Archive:** [v11.6-ROADMAP.md](milestones/v11.6-ROADMAP.md) · [v11.6-REQUIREMENTS.md](milestones/v11.6-REQUIREMENTS.md) · [v11.6-MILESTONE-AUDIT.md](milestones/v11.6-MILESTONE-AUDIT.md) · [v11.6-phases/](milestones/v11.6-phases/)

**Release ref:** `ba535de` on Render (includes approval-package regen refresh fixes)

---

## v11.5 Qualidade IA Orientada por Feedback (Shipped: 2026-06-05)

**Phases completed:** 4 phases (57→60), 12 plans, 34 tasks
**Requirements:** 20/20 complete

**Key accomplishments:**

- Durable JSONB contract/provenance on derivations with workspace-scoped repository persistence and derivation-job wiring before prompt build
- Compact prompt regression tests with shared CreativeContract fixtures and section snapshots for art variation, format adaptation, and restyling hard rules
- Shared quality taxonomy with fail-safe score/QA normalization — no silent 70 defaults on malformed model JSON.
- Inherited CTA and score-issue promotion close gate gaps; review UI shows localized blocking titles with model notes as detail.
- Single server module merges gate, score, QA, and feedback-category inputs into bounded correction briefs with contract-safe preservation tails.
- Regenerate API builds merged correction briefs, persists structured brief JSON on children, and keeps parent creative contracts through the derivation job.
- Users see a read-only summary of blocking and advisory issues before editing regeneration feedback, with EN/PT-BR labels.
- Route and unit tests cover explicit feedback merge, quality-field brief reconstruction, feedback category context, and child brief persistence.
- Six-fixture synthetic catalog covering wrong CTA, crop, style contamination, format layout, preservation loss, and legibility failures
- Fixture-linked prompt regression with mode invariants and compact section snapshots for art variation, format adaptation, and restyling
- Parameterized fixture pipeline tests wiring QA normalization, hard-failure gate, verdict derivation, and regeneration brief assembly
- Manual quality loop handoff, residual model limitations, and nyquist-compliant validation contract with green test/lint/build gate

**Archive:** [v11.5-ROADMAP.md](milestones/v11.5-ROADMAP.md) · [v11.5-REQUIREMENTS.md](milestones/v11.5-REQUIREMENTS.md) · [v11.5-MILESTONE-AUDIT.md](milestones/v11.5-MILESTONE-AUDIT.md) · [v11.5-phases/](milestones/v11.5-phases/)

**Release refs:** tag `v11.5.1` (includes migration journal fix `0027_fine_morlun`); tag `v11.5` is milestone-only and omits that fix.

**Known gaps (accepted tech debt):** Render/production must deploy `main` @ `v11.5.1` or later (`preDeployCommand` runs `db:migrate`); optional manual quality loop spot-check per 60-HANDOFF; phases 58–59 lack formal Nyquist VALIDATION.md. Audit status `tech_debt` (not `passed`) — cleared completion with accepted debt.

---

## v11.4 Beta Feedback Capture (Shipped: 2026-06-05)

**Phases completed:** 4 phases (53→56), 4 plans
**Requirements:** 23/23 complete

**Key accomplishments:**

- Durable `feedback_reports` model with workspace-scoped create API and diagnostic sanitization
- In-app feedback from shell, campaign header, and derivation review with auto context capture
- Platform owner triage at `/feedback` with filters, completeness chips, signed assets, and private notes
- Privacy handoff documenting captured vs excluded fields and end-to-end analysis workflow

**Archive:** [v11.4-ROADMAP.md](milestones/v11.4-ROADMAP.md) · [v11.4-REQUIREMENTS.md](milestones/v11.4-REQUIREMENTS.md)

**Known gaps:** No formal milestone audit; QA-02 browser/mobile smoke left as manual ops follow-up.

---

## v11.3 Site de Apresentação Separado (Shipped: 2026-06-03)

**Phases completed:** 3 phases (50→52), 3 plans
**Requirements:** 14/14 complete

**Key accomplishments:**

- Public presentation surface moved into `jhowtkd/site-adscale.git`
- Marketing/app boundary documented so ADScale_2 stays focused on auth, legal, dashboard and product routes
- Presentation copy, CTAs, pricing/beta language and legal links aligned with current app behavior
- Target site build and deploy handoff documented with responsive smoke checks and residual risks

---

## v11.2 Beta Access and Credit Entitlements (Shipped: 2026-06-03)

**Phases completed:** 1 phase (49), 1 plan
**Requirements:** 5/5 complete

**Key accomplishments:**

- Workspace beta entitlements separate from Stripe subscriptions
- Beta testers receive 10 generated ads through 50 internal credits
- Spend gates allow active paid subscription or active beta entitlement with credits
- Billing/settings UI distinguishes beta access from paid access
- Beta codes configured through `BETA_ACCESS_CODES`

---

## v11.1 Qualidade de Geração e Contratos Criativos (Shipped: 2026-06-01)

**Phases completed:** 5 phases (44→48), multiple plans
**Requirements:** 26/26 complete

**Key accomplishments:**

- Native 4:5 and 9:16 format adaptation planning and verification
- Shared creative contract for generation, scoring, QA, and regeneration
- Restyling uses selected style references as visual language only
- Hard quality gates separate blocking failures from polish suggestions
- Workspace review/error feedback exposes contract and failure context

---

## v11.0 Fluxos de Derivação Coerentes (Shipped: 2026-06-01)

**Phases completed:** 4 phases (40→43), 4 plans
**Requirements:** 10/10 complete

**Key accomplishments:**

- `useDerivationFlow` state machine — Derivar chooser no longer auto-queues generation with hardcoded defaults
- Art variation config modals (manual + AI-assisted) with creativity profile and up to 3 CTAs before confirm
- `useArtVariationSuggestions` pre-fills CTAs from campaign context or analyze API on base asset
- Format adaptation pickers: single-select and batch multi-select (1:1, 4:5, 9:16) with API PATCH allowing 1–3 formats
- PT-BR/EN `workspace.derivar` copy aligned to behavior; fixed "Variir" → "Variar tamanhos"
- 12+ new tests covering all four Derivar paths; Estilizar regression guard via ActionCards

**Archive:** [v11.0-ROADMAP.md](milestones/v11.0-ROADMAP.md) · [v11.0-REQUIREMENTS.md](milestones/v11.0-REQUIREMENTS.md)

---

## v6.0 Performance & Otimização (Shipped: 2026-05-27)

**Phases completed:** 4 phases (22→25), 4 plans
**Requirements:** 12/12 complete

**Key accomplishments:**

- Code splitting e lazy loading com next/dynamic — bundle reduzido de ~2.9MB para 2.39MB
- TanStack Query otimizado com staleTime presets (STATIC/SEMI_STATIC/DYNAMIC) e prefetch on hover
- Cache de análise visual da IA por 24h (evita re-computação de análises)
- Redimensionamento automático de imagens >5MB para 1024px antes do upload
- Componente OptimizedImage com skeleton loading e lazy loading
- Remoção de 7 dependências não utilizadas (~171 packages removidos)
- VirtualList para listas grandes (>20 itens) com @tanstack/react-virtual
- Resource hints (preconnect/dns-prefetch) para R2 CDN melhorando FCP

---

## v5.0 Simplificação do Fluxo de Criação de Campanha (Shipped: 2026-05-26)

**Phases completed:** 4 phases, 4 plans
**Requirements:** 12/12 complete

**Key accomplishments:**

- Single-page campaign creation form (name, client, profile)
- AI visual analysis of key creative with deduced fields
- Editable auto-filled campaign information
- Generation mode with creativity profile and CTA suggestions
- Briefing Doctor completely removed

---

## Completed Milestones

### v2.0 — Internacionalização PT-BR

**Completed:** 2026-04-24
**Phases:** 4 (6→9)
**Requirements:** 21/21

**Delivered:**

- `next-intl` integration with PT-BR/EN language support
- Language switcher in TopBar with cookie persistence
- `user.locale` column in database with default `pt-BR`
- Middleware locale detection (cookie → browser → default)
- API route `POST /api/user/locale` for persistence
- Full UI translation: Sidebar, TopBar, AppShell, StepIndicator, BriefingStep, PlanStep, DerivationsStep, DerivationCard, StatusBadge, Auth pages
- AI prompt localization: `buildPlanPrompt` and `buildDerivationPrompt` accept locale parameter
- OpenAI outputs in Brazilian Portuguese when `locale=pt-BR`
- Inngest events carry locale through the derivation pipeline
- Build and tests clean

### v1.0 — Sair Do Mock → MVP Real

**Completed:** 2026-04-24
**Phases:** 5
**Requirements:** 32/32

**Delivered:**

- Full server layer with Drizzle ORM, Neon PostgreSQL
- Better Auth with open signup and auto-workspace creation
- Cloudflare R2 storage with presigned URLs
- Inngest durable jobs for image derivation
- Campaign CRUD with structured brief
- Presigned upload flow for PNG/JPEG/WebP (up to 20MB)
- AI creative plan generation with OpenAI (`gpt-5-mini`)
- Image derivation with OpenAI (`gpt-image-2-2026-04-21`)
- Review gallery with approve/reject/regenerate
- Export pipeline (individual + ZIP, format conversion with sharp)
- Dashboard with real metrics
- 57 unit and integration tests
- Workspace isolation on all API routes
