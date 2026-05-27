# Phase 23: TanStack Query Otimização

## Context
Parte do milestone v6.0 (Performance & Otimização). Requisitos: PERF-04, PERF-05, PERF-06.

## Code Scout Summary

### QueryClient Configuration (QueryProvider.tsx)
Já configurado com boas práticas:
- staleTime: 30s (global)
- gcTime: 5min
- refetchOnWindowFocus: false ✅ PERF-05 já atendido

### Hooks Identificados (33 arquivos)
| Hook | Tipo | staleTime Atual | Uso |
|------|------|----------------|-----|
| useDashboardStats | Query | 10s | Dashboard |
| useCampaigns (list) | Query | Default (30s) | Listagem |
| useCampaign (detail) | Query | Default (30s) | Detalhe |
| useDerivations | Query | Default (30s) | Galeria |
| usePlan | Query | Default (30s) | Plano criativo |
| useClientProfiles | Query | Default (30s) | Perfil cliente |
| useBrandKit | Query | Default (30s) | Brand kit |
| useWorkspaceTeam | Query | Default (30s) | Time |
| useWorkspaceAssets | Query | Default (30s) | Biblioteca |
| useNotifications | Query | Default (30s) | Notificações |
| useBilling | Query | Default (30s) | Faturamento |
| usePreflight | Query | Default (30s) | Preflight |
| useOnboarding | Query | Default (30s) | Onboarding |

### Problemas Identificados
1. **staleTime inconsistente**: Alguns hooks definem staleTime, outros usam o default global
2. **Queries estáticas sem staleTime adequado**: Dados que mudam raramente (brand kit, perfil, time) ainda usam 30s
3. **Sem prefetch**: Navegação entre páginas não pré-carrega dados
4. **useDashboardStats tem refetchInterval de 30s**: Pode ser desnecessário com staleTime adequado

## Decisões

### staleTime por Categoria
**Dados quase estáticos** (mudam raramente, staleTime: 5min):
- BrandKit, ClientProfiles, WorkspaceTeam, WorkspaceAssets
- Onboarding status, User locale/settings

**Dados de média frequência** (staleTime: 1min):
- Campaign list, Campaign detail
- Templates, Billing status

**Dados dinâmicos** (staleTime: 10-30s):
- Dashboard stats, Derivations, Notifications
- Preflight scores, Plan status

**Dados de análise** (staleTime: 24h):
- AI visual analysis results (PERF-07, será feito na Phase 24)

### Prefetch Strategy
- **Dashboard → Campaigns**: Prefetch campaign list ao hover no menu
- **Campaigns → Campaign Detail**: Prefetch campaign detail ao hover na linha/card
- **Campaign Detail → Derivations**: Derivations já são carregadas juntas
- **Settings**: Prefetch tabs comuns (profile, billing) ao abrir settings

## Implementation Plan

### Step 1: Criar utilitários de configuração
- Criar `lib/query-config.ts` com presets de staleTime por categoria
- Exportar configurações reutilizáveis

### Step 2: Atualizar hooks com staleTime apropriado
Revisar e ajustar staleTime em ~20 hooks baseado na categoria.

### Step 3: Implementar prefetch
- Criar hook `usePrefetchCampaigns()` para prefetch da lista
- Criar hook `usePrefetchCampaign()` para prefetch do detalhe
- Integrar prefetch em links de navegação

### Step 4: Remover refetchInterval desnecessário
- Remover refetchInterval de 30s do useDashboardStats (staleTime já controla isso)

### Step 5: Verificar e testar
- Rodar testes
- Verificar se não há regressões

## Files to Modify
1. `app/src/lib/query-config.ts` (novo)
2. `app/src/lib/hooks/use-dashboard-stats.ts`
3. `app/src/lib/hooks/use-campaigns.ts`
4. `app/src/lib/hooks/use-derivations.ts`
5. `app/src/lib/hooks/use-brand-kit.ts`
6. `app/src/lib/hooks/use-client-profiles.ts`
7. `app/src/lib/hooks/use-workspace-team.ts`
8. `app/src/lib/hooks/use-workspace-assets.ts`
9. `app/src/lib/hooks/use-notifications.ts`
10. `app/src/lib/hooks/use-billing.ts`
11. `app/src/lib/hooks/use-preflight.ts`
12. `app/src/lib/hooks/use-onboarding.ts`
13. `app/src/lib/hooks/use-templates.ts`
14. `app/src/lib/hooks/use-plan.ts`
15. `app/src/lib/hooks/use-campaign-workspace.ts`
16. `app/src/components/layout/Sidebar.tsx` (adicionar prefetch)
17. `app/src/components/campaigns/CampaignTableRow.tsx` (adicionar prefetch)
18. `app/src/components/campaigns/CampaignCard.tsx` (adicionar prefetch)

## Test Plan
- Verificar se todas as queries ainda funcionam
- Confirmar que navegação entre páginas usa cache
- Garantir que dados atualizam quando necessário

## Risk Mitigation
- staleTime muito alto pode mostrar dados desatualizados
- Mitigação: Invalidar cache explicitamente em mutations
- Verificar se todas as mutations invalidam corretamente
