# Roadmap: ADScale v6.0 — Performance & Otimização

## Milestone Overview

**Version:** v6.0  
**Name:** Performance & Otimização  
**Goal:** Reduzir tempo de carregamento inicial em 50%+ e eliminar re-fetches desnecessários para melhorar a experiência do usuário.  
**Phases:** 4 (22 → 25)  
**Requirements:** 12  
**Previous milestone:** v5.0 ended at phases 18–21  

---

## Phase 22: Code Splitting e Lazy Loading ⏳ In Progress

**Goal:** Implementar code splitting com next/dynamic e lazy loading para reduzir o bundle inicial em pelo menos 30%.

**Requirements:**
- PERF-01: Implementar code splitting com `next/dynamic` para páginas pesadas
- PERF-02: Implementar lazy loading para componentes de campanha e galeria
- PERF-03: Reduzir bundle size inicial em pelo menos 30%

**Decisions Locked:**
- Estratégia: Híbrida (rotas principais + componentes modais/pesados)
- Loading states: Skeleton screens (páginas/componentes grandes), spinners (modais menores)
- NÃO lazy load: BriefingStep, DerivationCard, CreativePlanCard (core UX)
- Monitoramento: @next/bundle-analyzer + script CI
- Target bundle: < 2.0MB (redução de 30%)

**Success Criteria:**
1. Páginas de campanha e dashboard usam dynamic imports
2. Componentes pesados (CreativePlanCard, DerivationGallery) carregam sob demanda
3. Bundle inicial reduzido de 2.9MB para < 2.0MB
4. Lighthouse Performance score aumenta para > 70
5. Nenhuma regressão funcional — todas as features continuam funcionando

---

## Phase 23: TanStack Query Otimização

**Goal:** Otimizar queries para eliminar re-fetches desnecessários e melhorar a responsividade da UI.

**Requirements:**
- PERF-04: Otimizar TanStack Query com staleTime apropriado para cada recurso
- PERF-05: Desabilitar refetchOnWindowFocus para queries que não mudam frequentemente
- PERF-06: Implementar prefetch de dados na navegação entre páginas

**Success Criteria:**
1. Todas as queries têm staleTime configurado (não mais default 0)
2. refetchOnWindowFocus desabilitado para queries estáticas
3. Navegação entre páginas já visitadas não dispara novos requests
4. Dashboard e listas de campanhas não recarregam ao trocar de aba
5. Dados pré-carregados quando usuário passa o mouse em links

---

## Phase 24: Cache de Análise e Otimização de Imagens

**Goal:** Cachear resultados de análise visual da IA e otimizar carregamento de imagens.

**Requirements:**
- PERF-07: Cachear resultados de análise visual da IA por 24h
- PERF-08: Reduzir tamanho de imagens antes do upload para análise
- PERF-09: Otimizar carregamento de imagens com next/image e placeholders

**Success Criteria:**
1. Mesma imagem não é re-analisada dentro de 24h
2. Imagens são redimensionadas para ~512px antes da análise da IA
3. Todas as imagens usam next/image com lazy loading
4. Placeholders visuais enquanto imagens carregam
5. Tempo de análise de imagem < 3s (cache hit)

---

## Phase 25: Bundle Optimization e Virtualização

**Goal:** Remover dead code, otimizar imports e implementar virtualização para listas grandes.

**Requirements:**
- PERF-10: Remover dead code e dependências não utilizadas
- PERF-11: Implementar virtualização para listas grandes (campanhas, derivations)
- PERF-12: Melhorar First Contentful Paint para < 1.5s

**Success Criteria:**
1. Dead code eliminado (imports não utilizados, funções mortas)
2. Dependências não utilizadas removidas do package.json
3. Listas com >20 itens usam virtualização (react-window ou similar)
4. FCP < 1.5s em conexão 4G simulada
5. Lighthouse Performance score > 80

---

## Requirement Coverage

| REQ-ID | Phase | Mapped | Status |
|--------|-------|--------|--------|
| PERF-01 | 22 | ✓ | Planned |
| PERF-02 | 22 | ✓ | Planned |
| PERF-03 | 22 | ✓ | Planned |
| PERF-04 | 23 | ✓ | Planned |
| PERF-05 | 23 | ✓ | Planned |
| PERF-06 | 23 | ✓ | Planned |
| PERF-07 | 24 | ✓ | Planned |
| PERF-08 | 24 | ✓ | Planned |
| PERF-09 | 24 | ✓ | Planned |
| PERF-10 | 25 | ✓ | Planned |
| PERF-11 | 25 | ✓ | Planned |
| PERF-12 | 25 | ✓ | Planned |

**Coverage:** 12/12 requirements mapped across 4 phases ✓

---

## Phase Status

| Phase | Status | Tests |
|-------|--------|-------|
| Phase 22 — Code Splitting e Lazy Loading | 🔄 Planned | — |
| Phase 23 — TanStack Query Otimização | 🔄 Planned | — |
| Phase 24 — Cache de Análise e Otimização de Imagens | 🔄 Planned | — |
| Phase 25 — Bundle Optimization e Virtualização | 🔄 Planned | — |

**Plans:**
0/0 plans complete

---

## Test Plan

- Lighthouse CI para medir Performance score antes/depois
- Bundle analyzer para comparar tamanho do bundle
- Testes de navegação para verificar ausência de re-fetches
- Testes de carregamento de imagem com throttling 4G
- Testes de cache de análise de imagem

---

*Last updated: 2026-05-27 after v6.0 roadmap creation*
