# Roadmap: ADScale v9.0 — Galeria de Revisão v2

## Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 32 | Anotações Visuais | Permitir desenhar e adicionar notas em derivações | ANOT-01..05 | 5 |
| 33 | Comparação 3+ Derivações | Comparar múltiplas derivações em grid adaptativo | MULTI-01..05 | 5 |
| 34 | Slider Antes/Depois | Comparar duas derivações com slider de divisão | SLIDER-01..04 | 4 |

**14 requirements** | **3 phases** | All covered ✓

---

## Phase 32: Anotações Visuais

**Goal:** Permitir que usuários desenhem, adicionem textos e formas em cima das imagens de derivação.

**Requirements:** ANOT-01, ANOT-02, ANOT-03, ANOT-04, ANOT-05

**Success Criteria:**
1. Usuário pode desenhar livremente na imagem com mouse/touch
2. Usuário pode adicionar textos em posições específicas
3. Usuário pode adicionar formas (círculo, retângulo, seta)
4. Anotações persistem no banco de dados por derivação
5. Usuário pode apagar anotações individuais ou limpar todas
6. Toolbar de ferramentas de anotação visível no modo de edição

**Depends on:** Phase 31 (Batch Approve/Reject — concluído)

---

## Phase 33: Comparação 3+ Derivações

**Goal:** Permitir comparação de 3, 4 ou mais derivações simultaneamente em grid adaptativo.

**Requirements:** MULTI-01, MULTI-02, MULTI-03, MULTI-04, MULTI-05

**Success Criteria:**
1. Usuário pode selecionar mais de 2 derivações para comparar
2. Grid adaptativo: 2 colunas (3-4 itens), 3 colunas (5-9 itens), etc.
3. Cada célula tem zoom/pan independente
4. Usuário pode remover uma derivação do grid
5. Metadados visíveis em cada célula
6. Botão "Adicionar mais" para incluir derivações ao grid existente

**Depends on:** Phase 32

---

## Phase 34: Slider Antes/Depois

**Goal:** Permitir comparação de duas derivações com slider de divisão arrastável.

**Requirements:** SLIDER-01, SLIDER-02, SLIDER-03, SLIDER-04

**Success Criteria:**
1. Slider vertical ou horizontal divide a imagem em duas partes
2. Handle arrastável move a divisão
3. Ambos os lados mantêm aspect ratio e posição sincronizada
4. Toggle para alternar entre modo slider e modo split-pane
5. Zoom sincronizado em ambos os lados

**Depends on:** Phase 33

---

## Archive Notes

- Previous roadmap: `.planning/milestones/v8.0-ROADMAP.md`
- v8.0 ended at Phase 31
- v9.0 starts at Phase 32

---
*Roadmap created: 2026-05-27*
