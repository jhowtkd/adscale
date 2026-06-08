# Requirements: ADScale v11.11 Aprendizado → Ação

**Defined:** 2026-06-08  
**Milestone:** v11.11 Aprendizado → Ação  
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## Scope

v11.11 converte dados reais do beta (SESS-03) em melhorias acionáveis: tuning de readiness, redução de stall pós-preview e analytics/melhorias de share link self-serve.

**Prerequisite:** v11.10 Phase 89 (SESS-03) — pode ser concluída dentro deste milestone se ainda pendente.

**In scope:** Instrumentação share/readiness, painéis owner (stall, timing, dimensões), nudge pós-preview, tuning de threshold com evidência, fechamento Q2/Q3/Q9.

**Out of scope:** Novos modelos de IA, novos estágios de cockpit, billing real, export Meta/TikTok, LGPD, email/push de stall.

## Requirements

### Share Link Analytics (SHARE)

- [ ] **SHARE-01**: Owner vê evento `share_link_opened` quando destinatário abre link público válido (server-side, sem auth).
- [ ] **SHARE-02**: Owner vê contagem de aberturas de share link por campanha no dashboard.
- [ ] **SHARE-03**: Owner vê taxa de abertura de share link correlacionada com `assistance_level` da sessão operador (F-13, Q7).

### Post-Preview Stall (STALL)

- [ ] **STALL-01**: Owner vê mediana de tempo entre preview completo e início de batch por sessão (F-07, Q10).
- [ ] **STALL-02**: Owner vê taxa de stall pós-preview (>15 min sem batch) e classificação stall→proceed vs stall→abandon.
- [ ] **STALL-03**: Operador vê indicador "Continue → batch" no card da campanha quando preview aprovado e batch pendente (D-2).

### Readiness Tuning (READY)

- [ ] **READY-08**: Evento de override inclui `blockingDimensions[]` com ids das dimensões abaixo do threshold.
- [ ] **READY-09**: Owner vê breakdown de overrides por dimensão de readiness no dashboard.
- [ ] **READY-10**: Thresholds de blocking/ready ajustados com evidência documentada de ≥3 sessões reais e override rate por dimensão (D-1).

### Learning Closure (LEARN)

- [ ] **LEARN-04**: Learning answers Q2 (briefing skip), Q3 (readiness rerun), Q9 (stale badge) atualizados com citações de sessões reais — sem fixture UUIDs.
- [ ] **LEARN-05**: Operador completa ≥3 sessões beta reais documentadas (SESS-03 carryover se pendente).
- [ ] **LEARN-06**: Evento `approval_package_refreshed` emitido ao atualizar pacote stale (se ainda ausente — fecha Q9).

### Owner Dashboard (DASH)

- [ ] **DASH-07**: Owner vê mediana draft→share time geral e por `assistance_level` (D-4).
- [ ] **DASH-08**: Owner vê painel dedicado de post-preview stall com campanhas ativas em stall.

### Verification (QA)

- [ ] **QA-05**: Testes cobrem novos event keys, aggregators e nudge de campanha.
- [ ] **QA-06**: `npm test`, `npm run lint` e `npm run build` passam em `app/` após todas as mudanças.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| _(filled by roadmapper)_ | | |

## Future Requirements

- Email/push nudge para stall pós-preview (infra Resend product flows)
- Tuning automatizado de readiness (ML) quando N > 50 sessões
- Client approval/rejection na share page
- Indexação avançada de analytics para escala além do beta

## Out of Scope

| Feature | Reason |
|---------|--------|
| Novos modelos de IA | Confunde aprendizado de analytics |
| Novos estágios de cockpit | Congela comparação de sessões |
| Billing/subscription real | Milestone separado |
| Export Meta/TikTok | Stubbed intencionalmente |
| LGPD compliance | Milestone dedicado |
| Auth em share page | Mata self-serve do cliente |

---
*Requirements defined: 2026-06-08 — milestone v11.11*
