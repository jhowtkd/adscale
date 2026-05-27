# Roadmap: ADScale v7.0 — Experiência do Usuário

## Milestone Overview

**Version:** v7.0  
**Name:** Experiência do Usuário  
**Goal:** Melhorar a experiência do usuário com onboarding guiado, templates de campanha reutilizáveis e analytics no dashboard.  
**Phases:** 3 (26 → 28)  
**Requirements:** 16  
**Previous milestone:** v6.0 ended at phases 22–25  

---

## Phase 26: Onboarding Aprimorado

**Goal:** Implementar fluxo de onboarding step-by-step com tooltips contextuais e progresso persistente.

**Requirements:**
- ONB-01: Welcome tour no primeiro login
- ONB-02: Onboarding reiniciável nas settings
- ONB-03: Tooltips contextuais nas features principais
- ONB-04: Progresso salvo no banco de dados
- ONB-05: Onboarding skipável

**Decisions Locked:**
- Biblioteca: driver.js ou react-joyride para tour
- Tooltips: componente próprio com Popover do Radix
- Persistência: coluna `onboardingCompleted` na tabela `users`
- Skip: botão visível em todos os steps

**Success Criteria:**
1. Novo usuário vê tour automático no primeiro acesso
2. Tooltips aparecem em hover/focus nas features principais
3. Progresso persiste após logout/login
4. Usuário pode reiniciar tour nas settings
5. Usuário pode pular tour a qualquer momento

---

## Phase 27: Templates de Campanha

**Goal:** Permitir salvar campanhas como templates e criar novas campanhas a partir de templates existentes.

**Requirements:**
- TPL-01: Salvar campanha como template
- TPL-02: Criar campanha a partir de template
- TPL-03: Templates preservam campos do brief
- TPL-04: Galeria/modal de templates na criação
- TPL-05: Isolamento por workspace
- TPL-06: Renomear e deletar templates

**Decisions Locked:**
- Schema: tabela `campaign_templates` com FK para workspace
- Campos preservados: brief completo (objetivo, público, tom, oferta, plataformas)
- NÃO preservar: nome da campanha, imagens, derivations
- UI: modal de seleção ao clicar "Nova Campanha" com opção "Usar Template"

**Success Criteria:**
1. Usuário pode salvar qualquer campanha como template
2. Template aparece na galeria ao criar nova campanha
3. Campos do brief são pré-preenchidos ao usar template
4. Templates são isolados por workspace
5. Usuário pode gerenciar templates (renomear, deletar)

---

## Phase 28: Analytics no Dashboard

**Goal:** Adicionar métricas de uso, taxa de aprovação e consumo de créditos ao dashboard.

**Requirements:**
- ANL-01: Métricas de uso (campanhas, derivations, aprovações)
- ANL-02: Taxa de aprovação de derivations
- ANL-03: Tempo médio de geração
- ANL-04: Créditos usados por período
- ANL-05: API de analytics com agregações

**Decisions Locked:**
- Dados: agregar de tabelas existentes (campaigns, derivations, billing)
- Períodos: semana e mês (dropdown no dashboard)
- Visualização: cards com KPIs + gráfico de linha para tendências
- Performance: usar views materializadas ou cachear agregações

**Success Criteria:**
1. Dashboard mostra KPIs atualizados em tempo real
2. Gráficos mostram tendências por período selecionado
3. Taxa de aprovação é calculada corretamente
4. API retorna agregações por workspace e período
5. Dados carregam em < 2s

---

## Requirement Coverage

| REQ-ID | Phase | Mapped | Status |
|--------|-------|--------|--------|
| ONB-01 | 26 | ✓ | Planned |
| ONB-02 | 26 | ✓ | Planned |
| ONB-03 | 26 | ✓ | Planned |
| ONB-04 | 26 | ✓ | Planned |
| ONB-05 | 26 | ✓ | Planned |
| TPL-01 | 27 | ✓ | Planned |
| TPL-02 | 27 | ✓ | Planned |
| TPL-03 | 27 | ✓ | Planned |
| TPL-04 | 27 | ✓ | Planned |
| TPL-05 | 27 | ✓ | Planned |
| TPL-06 | 27 | ✓ | Planned |
| ANL-01 | 28 | ✓ | Planned |
| ANL-02 | 28 | ✓ | Planned |
| ANL-03 | 28 | ✓ | Planned |
| ANL-04 | 28 | ✓ | Planned |
| ANL-05 | 28 | ✓ | Planned |

**Coverage:** 16/16 requirements mapped across 3 phases ✓

---

## Phase Status

| Phase | Status | Tests |
|-------|--------|-------|
| Phase 26 — Onboarding Aprimorado | 🔄 Planned | — |
| Phase 27 — Templates de Campanha | 🔄 Planned | — |
| Phase 28 — Analytics no Dashboard | 🔄 Planned | — |

**Plans:**
0/3 plans complete

---

## Test Plan

- Testes de onboarding: verificar tour automático, skip, reinício
- Testes de templates: CRUD de templates, criação a partir de template
- Testes de analytics: verificar agregações corretas, filtros de período
- Testes de integração: templates isolados por workspace

---

*Created: 2026-05-27 for v7.0 milestone*
