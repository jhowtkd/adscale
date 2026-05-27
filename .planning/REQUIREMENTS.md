# Requirements: ADScale v6.0 — Performance & Otimização

**Defined:** 2026-05-27
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## v6.0 Requirements

### PERF — Performance e Otimização

- [x] **PERF-01**: Implementar code splitting com `next/dynamic` para páginas pesadas
- [x] **PERF-02**: Implementar lazy loading para componentes de campanha e galeria
- [x] **PERF-03**: Reduzir bundle size inicial em pelo menos 30%
- [ ] **PERF-04**: Otimizar TanStack Query com staleTime apropriado para cada recurso
- [ ] **PERF-05**: Desabilitar refetchOnWindowFocus para queries que não mudam frequentemente
- [ ] **PERF-06**: Implementar prefetch de dados na navegação entre páginas
- [ ] **PERF-07**: Cachear resultados de análise visual da IA por 24h
- [ ] **PERF-08**: Reduzir tamanho de imagens antes do upload para análise
- [ ] **PERF-09**: Otimizar carregamento de imagens com next/image e placeholders
- [ ] **PERF-10**: Remover dead code e dependências não utilizadas
- [ ] **PERF-11**: Implementar virtualização para listas grandes (campanhas, derivations)
- [ ] **PERF-12**: Melhorar First Contentful Paint para < 1.5s

## Out of Scope

| Feature | Reason |
|---------|--------|
| CDN global | Custoso, infraestrutura fora do escopo atual |
| Service Workers | Complexidade alta, retorno médio |
| Server Components (migração completa) | Breaking change, milestone separado |
| Database query optimization | Não identificado como gargalo |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PERF-01 | Phase 22 | ✅ Complete |
| PERF-02 | Phase 22 | ✅ Complete |
| PERF-03 | Phase 22 | ✅ Complete |
| PERF-04 | Phase 23 | Pending |
| PERF-05 | Phase 23 | Pending |
| PERF-06 | Phase 23 | Pending |
| PERF-07 | Phase 24 | Pending |
| PERF-08 | Phase 24 | Pending |
| PERF-09 | Phase 24 | Pending |
| PERF-10 | Phase 25 | Pending |
| PERF-11 | Phase 25 | Pending |
| PERF-12 | Phase 25 | Pending |

**Coverage:**
- v6.0 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-27*
*Last updated: 2026-05-27 after initial definition*
