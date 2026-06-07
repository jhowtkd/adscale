# Requirements: ADScale v11.10 Fechamento Entrega e Analytics

**Defined:** 2026-06-07  
**Milestone:** v11.10 Fechamento Entrega e Analytics  
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

v11.10 fecha o cluster entrega/créditos/analytics adiado do v11.8 (F-06, F-08, F-09, F-11, F-12, F-14), polish do dashboard owner e o gate humano SESS-03. Constrói sobre v11.9 (créditos, entrega, analytics owner) e v11.8 (beta analytics foundation).

**In scope:** Novos event keys cockpit, override de readiness, funil de receita/crédito, timeline sem cap, filtro de sessão, regressão F-14, ≥3 sessões reais de operador com learning answers atualizados.

**Out of scope:** Novos modelos de IA, SDK de analytics terceiro, tuning de threshold de readiness, billing real, integração Meta/TikTok.

## Requirements

### Instrumentação Cockpit (COCK)

- [ ] **COCK-01**: Owner vê evento `recipe_tradeoff_viewed` quando operador abre o painel de receita (F-08).
- [ ] **COCK-02**: Owner vê evento `recipe_selected` com `recipeId` quando operador escolhe uma receita (F-09).
- [ ] **COCK-03**: Owner vê funil de seleção de receita agregado por `recipeId` no dashboard.
- [ ] **COCK-04**: Funil de preview não marca abandono falso ao revisar receita; `cockpit_stage_completed` reflete aprovação real (F-06).
- [ ] **COCK-05**: Owner vê abandono do guided briefing quebrado por etapa (`stepId`) no analytics (F-12).

### Readiness (READY)

- [ ] **READY-06**: Operador pode declarar override de falso positivo de readiness e continuar o fluxo com evento auditável (F-11).
- [ ] **READY-07**: Owner vê sinais de override sem duplicar contagem entre nota de operador e evento.

### Analytics Owner (DASH)

- [ ] **DASH-04**: Timeline de estágios de sessão sem cap artificial de 24 linhas (com janela de data padrão).
- [ ] **DASH-05**: Owner vê funil de consumo de créditos por etapa (crédito → preview → aprovação).
- [ ] **DASH-06**: Filtro de sessão no dashboard populado com sessões reais da API.

### Sessões Operador (SESS)

- [ ] **SESS-03**: Operador completa ≥3 sessões beta reais documentadas com IDs e artefatos.
- [ ] **SESS-05**: Learning answers (Q4–Q6, Q1 readiness) atualizados com evidência de sessões reais, não fixture.

### Verificação (QA)

- [ ] **QA-03**: Teste `creative-quality-gate-orchestration` alinhado ao formato atual (F-14).
- [ ] **QA-04**: `npm test`, `npm run lint` e `npm run build` passam em `app/` após todas as mudanças.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COCK-01 | Phase 85 | Pending |
| COCK-02 | Phase 85 | Pending |
| COCK-03 | Phase 85 | Pending |
| COCK-04 | Phase 85 | Pending |
| COCK-05 | Phase 85 | Pending |
| READY-06 | Phase 86 | Pending |
| READY-07 | Phase 86 | Pending |
| DASH-04 | Phase 87 | Pending |
| DASH-05 | Phase 87 | Pending |
| DASH-06 | Phase 87 | Pending |
| QA-03 | Phase 88 | Pending |
| QA-04 | Phase 88 | Pending |
| SESS-03 | Phase 89 | Pending |
| SESS-05 | Phase 89 | Pending |

**Coverage:** 14/14 v1 requirements — all mapped to phases 85–89

## Future Requirements

- Readiness threshold tuning (após dados de override de SESS-03)
- `recipe_selected` correlação com satisfação de batch (pós-beta)
- Indexação avançada de analytics para escala além do beta

## Out of Scope

| Feature | Reason |
|---------|--------|
| Novos modelos de IA | Confunde aprendizado de analytics |
| Mixpanel/PostHog/Amplitude | First-party events suficientes |
| Tuning de algoritmo de readiness | Precisa dados de override primeiro |
| Billing/subscription real | Milestone separado |
| Export Meta/TikTok | Stubbed intencionalmente |
| Novos estágios de cockpit | Congela shape até pós-SESS-03 |

---
*Requirements defined: 2026-06-07 — milestone v11.10*
