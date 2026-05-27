# Requirements: ADScale v7.0 — Experiência do Usuário

**Defined:** 2026-05-27
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## v7.0 Requirements

### ONB — Onboarding Aprimorado

- [x] **ONB-01**: Novo usuário vê um onboarding step-by-step no primeiro login (welcome tour)
- [x] **ONB-02**: Onboarding pode ser reiniciado a qualquer momento nas settings
- [x] **ONB-03**: Tooltips contextuais explicam features principais (campanha, upload, geração, review)
- [x] **ONB-04**: Progresso do onboarding é salvo no banco de dados (per-user)
- [x] **ONB-05**: Onboarding é skipável e não bloqueia o uso do app

### TPL — Templates de Campanha

- [ ] **TPL-01**: Usuário pode salvar uma campanha existente como template
- [ ] **TPL-02**: Usuário pode criar nova campanha a partir de template existente
- [ ] **TPL-03**: Templates preservam campos do brief (objetivo, público-alvo, tom, etc)
- [ ] **TPL-04**: Templates são listados em galeria/modal ao iniciar criação de campanha
- [ ] **TPL-05**: Templates são salvos por workspace (isolamento de dados)
- [ ] **TPL-06**: Usuário pode renomear e deletar templates

### ANL — Analytics

- [ ] **ANL-01**: Dashboard mostra métricas de uso (campanhas criadas, derivations geradas, aprovadas)
- [ ] **ANL-02**: Dashboard mostra taxa de aprovação de derivations (% aprovadas vs rejeitadas)
- [ ] **ANL-03**: Dashboard mostra tempo médio de geração de derivations
- [ ] **ANL-04**: Dashboard mostra créditos usados por período (semana/mês)
- [ ] **ANL-05**: API de analytics com agregações por workspace e período

## Out of Scope

| Feature | Reason |
|---------|--------|
| Analytics em tempo real | Agregações diárias/semanais são suficientes |
| Templates compartilhados entre workspaces | Isolamento de dados é prioridade |
| Gamificação do onboarding | Fora do escopo deste milestone |
| Tour interativo com hotspots | Tooltips são suficientes por ora |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ONB-01 | Phase 26 | ✅ Complete |
| ONB-02 | Phase 26 | ✅ Complete |
| ONB-03 | Phase 26 | ✅ Complete |
| ONB-04 | Phase 26 | ✅ Complete |
| ONB-05 | Phase 26 | ✅ Complete |
| TPL-01 | Phase 27 | Pending |
| TPL-02 | Phase 27 | Pending |
| TPL-03 | Phase 27 | Pending |
| TPL-04 | Phase 27 | Pending |
| TPL-05 | Phase 27 | Pending |
| TPL-06 | Phase 27 | Pending |
| ANL-01 | Phase 28 | Pending |
| ANL-02 | Phase 28 | Pending |
| ANL-03 | Phase 28 | Pending |
| ANL-04 | Phase 28 | Pending |
| ANL-05 | Phase 28 | Pending |

**Coverage:**
- v7.0 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-27*
