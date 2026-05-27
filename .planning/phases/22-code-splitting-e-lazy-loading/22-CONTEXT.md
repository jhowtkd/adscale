# Phase 22: Code Splitting e Lazy Loading

## Context
Parte do milestone v6.0 (Performance & Otimização). Requisitos: PERF-01, PERF-02, PERF-03.

## Code Scout Summary

### Componentes Pesados Identificados
| Componente | Linhas | Complexidade | Uso |
|-----------|--------|-------------|-----|
| `BriefingStep.tsx` | 963 | Alta | Criação de campanha (wizard) |
| `DerivationsStep.tsx` | 573 | Média | Galeria de derivações |
| `DerivationCard.tsx` | 545 | Média | Card individual |
| `UploadStep.tsx` | 490 | Média | Upload de criativo |
| `ReviewStep.tsx` | 458 | Média | Revisão de derivações |
| `DerivationPreviewModal.tsx` | 451 | Alta | Preview (já usa dynamic!) |
| `GenerationStep.tsx` | 408 | Média | Geração |
| `CreativePlanCard.tsx` | 370 | Média | Plano criativo |
| `RestylingModal.tsx` | 349 | Média | Modal de restyling |
| `CompetitorAnalysisSection.tsx` | 791 | Alta | Análise de competidores |

### Padrões de Import Pesados
- `recharts` (usado em CreditChart)
- `framer-motion` (usado em múltiplos componentes)
- `lucide-react` (tree-shakeable, mas muitos ícones)
- `react-dropzone` (upload)
- `jszip` (export)

### Uso Atual de `next/dynamic`
Já existem 5 imports dinâmicos:
1. `DerivationComparisonModal` (DerivationsStep.tsx)
2. `QueryProvider` (com loading state)
3. `CreditHistoryTab` (settings)
4. Campaign detail page
5. Campaigns list page

## Gray Areas

### 1. Estratégia de Code Splitting
**Opção A:** Split por rotas (páginas inteiras com `next/dynamic`)
- Prós: Redução máxima do bundle inicial
- Contras: Flash de loading ao navegar entre páginas

**Opção B:** Split por componentes pesados dentro das páginas
- Prós: Melhor UX, loading progressivo
- Contras: Menor redução do bundle inicial

**Opção C:** Híbrida (rotas principais + componentes modais/pesados)
- Prós: Equilibra bundle e UX
- Contras: Mais complexo de implementar

### 2. Componentes a Serem Lazy-Loaded
Candidatos definitivos:
- `CompetitorAnalysisSection` (791 linhas, feature secundária)
- `RestylingModal` (349 linhas, modal)
- `DerivationPreviewModal` (já usa dynamic, expandir)
- `BriefingStep` (963 linhas, mas é crítico para o fluxo)

Dúvidas:
- `DerivationCard` (545 linhas) - Usado em listas, lazy loading pode causar flicker
- `CreativePlanCard` (370 linhas) - Core do plano, pode impactar UX

### 3. Loading States
**Opção A:** Skeleton screens (recomendado pelo Next.js)
**Opção B:** Spinner simples
**Opção C:** Progressive enhancement (mostrar conteúdo estático primeiro)

### 4. Bundle Size Target
- Atual: estimado ~2.9MB (sem análise formal)
- Target PERF-03: Reduzir em 30% (~2.0MB)
- Estratégia: Lazy loading deve reduzir ~15-20%, resto via tree-shaking e remoção de dead code

## Decisões Pendentes
1. Qual estratégia de code splitting? (A, B, ou C)
2. Quais componentes lazy-load agora vs. futuro?
3. Qual padrão de loading state usar?
4. Como medir/monitorar o bundle size?

## Recomendação
**Estratégia Híbrida (C)** com:
- Rotas principais lazy-loaded (campaigns, settings)
- Modais e componentes pesados lazy-loaded
- Skeleton screens para loading states
- `@next/bundle-analyzer` adicionado para monitoramento
