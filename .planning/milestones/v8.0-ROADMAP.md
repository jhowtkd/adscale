# Roadmap: ADScale v8.0 — Galeria de Revisão Aprimorada

## Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 29 | Comparação Lado a Lado | Permitir comparar duas derivações simultaneamente | COMP-01..04 | 4 |
| 30 | Filtros Avançados na Galeria | Filtrar derivações por múltiplos critérios | FILT-01..05 | 5 |
| 31 | Batch Approve/Reject | Aprovar/rejeitar múltiplas derivações em lote | BATCH-01..04 | 4 |

**13 requirements** | **3 phases** | All covered ✓

---

## Phase 29: Comparação Lado a Lado

**Goal:** Permitir que usuários comparem duas derivações lado a lado com zoom sincronizado.

**Requirements:** COMP-01, COMP-02, COMP-03, COMP-04

**Success Criteria:**
1. Usuário pode clicar em "Compare" em uma derivação e selecionar uma segunda para comparar
2. Visualização split-pane renderiza ambas as imagens sem distorção
3. Zoom in/out em uma imagem sincroniza com a outra (quando sincronização está ativa)
4. Metadados (CTA, formato, score, status) são visíveis para ambas as derivações
5. Usuário pode sair do modo de comparação e voltar para a galeria

**Depends on:** Phase 28 ( Analytics no Dashboard — concluído)

---

## Phase 30: Filtros Avançados na Galeria

**Goal:** Permitir filtragem de derivações por status, formato, CTA, score e persistir filtros na URL.

**Requirements:** FILT-01, FILT-02, FILT-03, FILT-04, FILT-05

**Success Criteria:**
1. Dropdown/filter chips permitem selecionar múltiplos status simultaneamente
2. Filtro de formato mostra opções 1:1, 4:5, 9:16
3. Busca por CTA funciona com texto parcial (case-insensitive)
4. Slider range permite filtrar por quality score mínimo/máximo
5. Filtros aplicados são refletidos na URL (query params) para bookmarking
6. Contador mostra quantas derivações correspondem aos filtros ativos
7. Botão "Limpar filtros" restaura visualização completa

**Depends on:** Phase 29

---

## Phase 31: Batch Approve/Reject

**Goal:** Permitir seleção múltipla de derivações e ações em lote (approve/reject).

**Requirements:** BATCH-01, BATCH-02, BATCH-03, BATCH-04

**Success Criteria:**
1. Checkboxes aparecem em cada card de derivação no hover ou quando modo de seleção está ativo
2. Barra de ações flutuante aparece no topo quando há itens selecionados
3. "Approve All" e "Reject All" atualizam o status de todas as derivações selecionadas
4. Checkbox no header seleciona/deseleciona todas as derivações visíveis (considerando filtros)
5. Contador na barra mostra "X selecionados"
6. Após ação em lote, seleção é limpa e galeria atualiza

**Depends on:** Phase 30

---

## Archive Notes

- Previous roadmap: `.planning/milestones/v7.0-ROADMAP.md`
- v7.0 ended at Phase 28
- v8.0 starts at Phase 29

---
*Roadmap created: 2026-05-27*
