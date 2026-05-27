# Phase 22: Code Splitting e Lazy Loading

## Overview

**Goal:** Implementar code splitting com `next/dynamic` e lazy loading para reduzir o bundle inicial em pelo menos 30%.

**Requirements:** PERF-01, PERF-02, PERF-03

**Success Criteria:**
1. Páginas de campanha e dashboard usam dynamic imports ✓
2. Componentes pesados (CreativePlanCard, DerivationGallery) carregam sob demanda ✓
3. Bundle inicial reduzido de 2.9MB para < 2.0MB ✓
4. Lighthouse Performance score aumenta para > 70 ✓
5. Nenhuma regressão funcional — todas as features continuam funcionando ✓

## Decisions Locked

### Estratégia: Híbrida (C)
- **Rotas principais** lazy-loaded via `next/dynamic` (páginas de settings, campaign detail)
- **Componentes modais e seções secundárias** lazy-loaded (RestylingModal, CompetitorAnalysisSection)
- **Core components mantidos síncronos** (BriefingStep, DerivationCard, CreativePlanCard)
- **Motivo:** Equilibra redução de bundle com UX fluida

### Loading States
- **Skeleton screens** para páginas e componentes grandes (padrão Next.js)
- **Spinners** para componentes menores e modais
- **Motivo:** Melhor UX, usuário vê estrutura imediatamente

### Monitoramento
- **@next/bundle-analyzer** adicionado como dev dependency
- **Script de análise** para CI (análise de chunks sem dependências extras)
- **Motivo:** Visibilidade contínua do bundle size

## Implementation Plan

### Step 1: Instalar @next/bundle-analyzer
```bash
cd app && npm install -D @next/bundle-analyzer
```

### Step 2: Configurar Bundle Analyzer
- Criar `next.config.bundle-analyzer.js` para análise condicional
- Adicionar script `analyze` ao package.json
- Criar `scripts/analyze-bundle.mjs` para CI

### Step 3: Implementar Lazy Loading — Páginas

#### 3.1 Campaign Detail Page (`app/(dashboard)/campaigns/[id]/page.tsx`)
- Verificar uso atual de dynamic
- Refatorar para lazy loading completo com skeleton
- Componentes a lazy-load:
  - CampaignWorkspaceHeader
  - BriefingStep
  - UploadStep
  - PlanStep
  - GenerationStep
  - DerivationsStep
  - ReviewStep

#### 3.2 Campaigns List Page (`app/(dashboard)/campaigns/page.tsx`)
- Lazy load CampaignsGridView e CampaignsListView
- Lazy load CampaignsFilterToolbar
- Manter CampaignsHeader síncrono (acima do fold)

#### 3.3 Dashboard Page (`app/(dashboard)/page.tsx`)
- Lazy load componentes pesados:
  - CreditChart (recharts)
  - ActivityFeed
  - OnboardingTour
- Manter KPI cards e QuickActions síncronos

#### 3.4 Settings Page
- Lazy load tabs individuais:
  - BrandKitTab
  - CreditHistoryTab (já usa dynamic, expandir)
  - BillingTab
  - TeamTab

### Step 4: Implementar Lazy Loading — Componentes

#### 4.1 Modais
- **RestylingModal** (`app/src/components/workspace/RestylingModal.tsx`)
  - 349 linhas, feature secundária
  - Usar dynamic com skeleton
  
- **DerivationPreviewModal** (`app/src/components/workspace/DerivationPreviewModal.tsx`)
  - 451 linhas, já usa dynamic (expandir padrão)
  - Melhorar loading state

- **AutoBriefingModal** (`app/src/components/workspace/AutoBriefingModal.tsx`)
  - 340 linhas, feature secundária
  - Lazy load

#### 4.2 Seções Secundárias
- **CompetitorAnalysisSection** (`app/src/components/campaigns/CompetitorAnalysisSection.tsx`)
  - 791 linhas, feature avançada
  - Lazy load em página de campanha

- **PersonaSimulationModal** (`app/src/components/workspace/PersonaSimulationModal.tsx`)
  - Feature secundária, lazy load

### Step 5: Criar Skeleton Components

#### 5.1 Skeleton Components a Criar
- `CampaignDetailSkeleton` — estrutura da página de campanha
- `DashboardSkeleton` — estrutura do dashboard
- `SettingsSkeleton` — estrutura da página de settings
- `ModalSkeleton` — estrutura genérica para modais
- `CardGridSkeleton` — grid de cards com skeleton

#### 5.2 Reutilizar shadcn/ui Skeleton
- Usar componente `skeleton.tsx` existente
- Compor skeletons específicos a partir do base

### Step 6: Refatorar Imports Existentes

#### 6.1 Otimizar Imports de Bibliotecas Grandes
- **recharts**: Importar apenas componentes usados (CreditChart)
- **framer-motion**: Verificar tree-shaking
- **lucide-react**: Já tree-shakeable, mas evitar importar ícones não usados
- **react-dropzone**: Lazy load em UploadStep
- **jszip**: Lazy load em funções de export

### Step 7: Implementar Script de Análise CI

#### 7.1 Script: `scripts/analyze-bundle.mjs`
- Analisar `.next/static/chunks/` após build
- Calcular bundle size total e por chunk
- Falhar se bundle > 2.0MB
- Exportar relatório JSON

### Step 8: Medir e Validar

#### 8.1 Métricas Antes
- Rodar `npm run analyze` para baseline
- Documentar bundle size atual
- Rodar Lighthouse para baseline

#### 8.2 Métricas Depois
- Rodar `npm run analyze` novamente
- Verificar redução de 30%
- Rodar Lighthouse novamente
- Verificar score > 70

## Files to Modify

### New Files
1. `app/next.config.bundle-analyzer.js` — Config do analyzer
2. `app/scripts/analyze-bundle.mjs` — Script de análise CI
3. `app/src/components/loading/CampaignDetailSkeleton.tsx`
4. `app/src/components/loading/DashboardSkeleton.tsx`
5. `app/src/components/loading/SettingsSkeleton.tsx`
6. `app/src/components/loading/ModalSkeleton.tsx`
7. `app/src/components/loading/CardGridSkeleton.tsx`

### Modified Files
1. `app/package.json` — Adicionar scripts e dependência
2. `app/next.config.ts` — Condicional bundle analyzer
3. `app/src/app/(dashboard)/campaigns/[id]/page.tsx` — Dynamic imports
4. `app/src/app/(dashboard)/campaigns/page.tsx` — Dynamic imports
5. `app/src/app/(dashboard)/page.tsx` — Dynamic imports
6. `app/src/app/(dashboard)/settings/page.tsx` — Dynamic imports
7. `app/src/components/workspace/DerivationsStep.tsx` — Expandir dynamic
8. `app/src/components/workspace/GenerationStep.tsx` — Lazy load modais
9. `app/src/components/campaigns/NewCampaignModal.tsx` — Lazy load seções

## Test Plan

### Unit Tests
- Skeleton components renderizam corretamente
- Dynamic imports resolvem sem erro
- Componentes lazy-loaded montam corretamente

### Integration Tests
- Navegação entre páginas funciona
- Modais abrem corretamente
- Exportação/download continua funcionando
- Nenhum erro de hidratação

### Performance Tests
- Bundle size < 2.0MB
- Lighthouse Performance > 70
- FCP < 1.5s (se possível medir)

### Regression Tests
- Todas as 448 tests existentes passam
- Build passa sem erro
- Lint passa

## Risk Mitigation

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Flash de loading | Médio | Skeleton screens, lazy load apenas componentes não críticos |
| Erros de hidratação | Alto | Testar SSR, usar `ssr: false` onde necessário |
| Regressão funcional | Alto | Testes existentes + testes manuais de navegação |
| Bundle não reduzir 30% | Médio | Medir baseline, iterar, remover dead code se necessário |
| Break de dynamic import | Alto | Type checking, testes de importação |

## Rollback Plan

Se regressão crítica:
1. Reverter para imports síncronos (git revert)
2. Manter skeleton components (são inertes)
3. Revisar quais componentes causam problema
4. Reaplicar lazy loading gradualmente

## Definition of Done

- [ ] @next/bundle-analyzer instalado e configurado
- [ ] Script de análise de bundle funcional
- [ ] Campaign detail page usa dynamic imports
- [ ] Dashboard page usa dynamic imports
- [ ] Settings page usa dynamic imports
- [ ] RestylingModal lazy-loaded
- [ ] CompetitorAnalysisSection lazy-loaded
- [ ] Skeleton components criados e usados
- [ ] Bundle size reduzido em 30% (< 2.0MB)
- [ ] Lighthouse Performance > 70
- [ ] Todas as 448 tests passam
- [ ] Build passa sem erro
- [ ] Nenhuma regressão funcional identificada
