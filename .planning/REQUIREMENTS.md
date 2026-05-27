# Requirements: ADScale v8.0 — Galeria de Revisão Aprimorada

**Defined:** 2026-05-27
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## v8.0 Requirements

### COMP — Comparação Lado a Lado

- [ ] **COMP-01**: Usuário pode selecionar duas derivações para comparar lado a lado
- [ ] **COMP-02**: Visualização split-pane mostra ambas as derivações simultaneamente
- [ ] **COMP-03**: Usuário pode sincronizar zoom e pan entre as duas imagens
- [ ] **COMP-04**: Metadados de ambas as derivações são visíveis (CTA, formato, score, status)

### FILT — Filtros Avançados na Galeria

- [ ] **FILT-01**: Usuário pode filtrar derivações por status (approved, rejected, pending, failed)
- [ ] **FILT-02**: Usuário pode filtrar por formato de imagem (1:1, 4:5, 9:16)
- [ ] **FILT-03**: Usuário pode filtrar por texto do CTA (busca parcial)
- [ ] **FILT-04**: Usuário pode filtrar por range de quality score (0-100)
- [ ] **FILT-05**: Filtros são persistidos na URL para compartilhamento/bookmark

### BATCH — Batch Approve/Reject

- [ ] **BATCH-01**: Usuário pode selecionar múltiplas derivações via checkboxes
- [ ] **BATCH-02**: Barra de ações em lote aparece quando há seleção (approve all, reject all)
- [ ] **BATCH-03**: Batch operations atualizam o status de todas as derivações selecionadas
- [ ] **BATCH-04**: Usuário pode selecionar/deselecionar todas as derivações visíveis

## Out of Scope

| Feature | Reason |
|---------|--------|
| Comparação de mais de 2 derivações | Complexidade de UI alta, 2 é o caso de uso principal |
| Filtros por cor/dominância visual | Requer análise de imagem adicional, fora do escopo |
| Batch regenerate | Requer fila de jobs complexa, fora deste milestone |
| Gallery view modes (lista vs grid) | Já existe grid view, não é prioridade |
| Exportação direta da galeria | Feature separada, requer design de UX |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COMP-01 | Phase 29 | Pending |
| COMP-02 | Phase 29 | Pending |
| COMP-03 | Phase 29 | Pending |
| COMP-04 | Phase 29 | Pending |
| FILT-01 | Phase 30 | Pending |
| FILT-02 | Phase 30 | Pending |
| FILT-03 | Phase 30 | Pending |
| FILT-04 | Phase 30 | Pending |
| FILT-05 | Phase 30 | Pending |
| BATCH-01 | Phase 31 | Pending |
| BATCH-02 | Phase 31 | Pending |
| BATCH-03 | Phase 31 | Pending |
| BATCH-04 | Phase 31 | Pending |

**Coverage:**
- v8.0 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-27*
