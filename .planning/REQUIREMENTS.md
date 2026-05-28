# Requirements: ADScale v9.0 — Galeria de Revisão v2

**Defined:** 2026-05-27
**Core Value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.

## v9.0 Requirements

### ANOT — Anotações Visuais

- [ ] **ANOT-01**: Usuário pode desenhar livremente em cima da imagem da derivação (freehand drawing)
- [ ] **ANOT-02**: Usuário pode adicionar textos em posições específicas da imagem
- [ ] **ANOT-03**: Usuário pode adicionar formas geométricas (círculo, retângulo, seta) na imagem
- [ ] **ANOT-04**: Anotações são salvas por derivação e persistem entre sessões
- [ ] **ANOT-05**: Usuário pode apagar anotações individuais ou limpar todas

### MULTI — Comparação 3+ Derivações

- [ ] **MULTI-01**: Usuário pode selecionar 3, 4 ou mais derivações para comparar simultaneamente
- [ ] **MULTI-02**: Visualização em grid adaptativo (2x2, 3x3, etc.) baseado na quantidade selecionada
- [ ] **MULTI-03**: Cada célula do grid tem zoom/pan independente
- [ ] **MULTI-04**: Usuário pode remover uma derivação do grid de comparação
- [ ] **MULTI-05**: Metadados visíveis em cada célula do grid

### SLIDER — Slider Antes/Depois

- [ ] **SLIDER-01**: Usuário pode comparar duas derivações com slider de divisão arrastável
- [ ] **SLIDER-02**: Slider vertical ou horizontal com handle visível
- [ ] **SLIDER-03**: Ambos os lados do slider mantêm aspect ratio e posição sincronizada
- [ ] **SLIDER-04**: Usuário pode alternar entre modo slider e modo split-pane

## Out of Scope

| Feature | Reason |
|---------|--------|
| Camadas de anotação (layers) | Complexidade de UI alta, anotações simples são suficientes |
| Comparação com a imagem base original | Requer tracking do asset original, fora do escopo |
| Colaboração em anotações (múltiplos usuários) | Requer sistema de colaboração, milestone separado |
| Exportação de imagens com anotações | Feature separada, requer render server-side |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ANOT-01 | Phase 32 | Pending |
| ANOT-02 | Phase 32 | Pending |
| ANOT-03 | Phase 32 | Pending |
| ANOT-04 | Phase 32 | Pending |
| ANOT-05 | Phase 32 | Pending |
| MULTI-01 | Phase 33 | Pending |
| MULTI-02 | Phase 33 | Pending |
| MULTI-03 | Phase 33 | Pending |
| MULTI-04 | Phase 33 | Pending |
| MULTI-05 | Phase 33 | Pending |
| SLIDER-01 | Phase 34 | Pending |
| SLIDER-02 | Phase 34 | Pending |
| SLIDER-03 | Phase 34 | Pending |
| SLIDER-04 | Phase 34 | Pending |

**Coverage:**
- v9.0 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-27*
