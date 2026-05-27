# Requirements: ADScale v8.0 — Galeria de Revisão Aprimorada

**Defined:** 2026-05-27
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## v8.0 Requirements

### COMP — Comparação Lado a Lado

- [x] **COMP-01**: Usuário pode selecionar duas derivações para comparar lado a lado
- [x] **COMP-02**: Visualização split-pane mostra ambas as derivações simultaneamente
- [x] **COMP-03**: Usuário pode sincronizar zoom e pan entre as duas imagens
- [x] **COMP-04**: Metadados de ambas as derivações são visíveis (CTA, formato, score, status)

### FILT — Filtros Avançados na Galeria

- [x] **FILT-01**: Usuário pode filtrar derivações por status (approved, rejected, pending, failed)
- [x] **FILT-02**: Usuário pode filtrar por formato de imagem (1:1, 4:5, 9:16)
- [x] **FILT-03**: Usuário pode filtrar por texto do CTA (busca parcial)
- [x] **FILT-04**: Usuário pode filtrar por range de quality score (0-100)
- [x] **FILT-05**: Filtros são persistidos na URL para compartilhamento/bookmark

### BATCH — Batch Approve/Reject

- [x] **BATCH-01**: Usuário pode selecionar múltiplas derivações via checkboxes
- [x] **BATCH-02**: Barra de ações em lote aparece quando há seleção (approve all, reject all)
- [x] **BATCH-03**: Batch operations atualizam o status de todas as derivações selecionadas
- [x] **BATCH-04**: Usuário pode selecionar/deselecionar todas as derivações visíveis

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
| COMP-01 | Phase 29 | ✅ Complete |
| COMP-02 | Phase 29 | ✅ Complete |
| COMP-03 | Phase 29 | ✅ Complete |
| COMP-04 | Phase 29 | ✅ Complete |
| FILT-01 | Phase 30 | ✅ Complete |
| FILT-02 | Phase 30 | ✅ Complete |
| FILT-03 | Phase 30 | ✅ Complete |
| FILT-04 | Phase 30 | ✅ Complete |
| FILT-05 | Phase 30 | ✅ Complete |
| BATCH-01 | Phase 31 | ✅ Complete |
| BATCH-02 | Phase 31 | ✅ Complete |
| BATCH-03 | Phase 31 | ✅ Complete |
| BATCH-04 | Phase 31 | ✅ Complete |

**Coverage:**
- v8.0 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-27*
