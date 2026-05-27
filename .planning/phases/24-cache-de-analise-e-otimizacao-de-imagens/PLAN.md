# Phase 24: Cache de Análise e Otimização de Imagens

## Context
Parte do milestone v6.0 (Performance & Otimização). Requisitos: PERF-07, PERF-08, PERF-09.

## Code Scout Summary

### Análise Visual Atual
- **Rota**: `/api/campaigns/[id]/analyze` (POST)
- **Função**: `analyzeCampaignCreative(imageUrl)` em `server/ai/campaign-deduction.ts`
- **Modelo**: gpt-5-mini (já suporta image input)
- **Armazenamento**: Resultado armazenado em `campaignAssets.metadata.analysisResult`
- **Timestamp**: `campaignAssets.analyzedAt` já existe
- **Status**: `campaignAssets.analysisStatus` (pending | analyzing | completed | failed)

### Upload de Imagens
- **Componente**: `CreativeUploadWithAnalysis` e `UploadStep`
- **Biblioteca**: `react-dropzone`
- **Processamento**: Upload direto para R2 via presigned URL
- **Não há**: Redimensionamento antes do upload

### Carregamento de Imagens
- **Uso**: `<img>` tags tradicionais em vários lugares
- **Não há**: `next/image` com lazy loading
- **Não há**: Placeholders ou skeletons para imagens

## Implementation Plan

### Step 1: Cache de Análise Visual (PERF-07)

#### 1.1 Modificar rota de análise para verificar cache
- Verificar se `asset.analyzedAt` existe e é < 24h
- Verificar se `asset.analysisStatus === "completed"`
- Se sim, retornar `metadata.analysisResult` diretamente
- Se não, chamar AI e armazenar resultado

#### 1.2 Adicionar campo `analysisCacheExpiry`
- Opcional: adicionar campo explícito de expiração no metadata
- Ou calcular dinamicamente: `analyzedAt + 24h`

### Step 2: Redimensionamento de Imagens (PERF-08)

#### 2.1 Criar função de redimensionamento
- Usar Canvas API no cliente para redimensionar antes do upload
- Target: ~1024px no lado maior (adequado para análise visual)
- Manter proporção
- Qualidade: 0.85 para JPEG

#### 2.2 Integrar no upload
- Antes de enviar para R2, redimensionar imagens > 1024px
- Manter formato original (JPEG, PNG)
- Preservar metadata básica (se possível)

### Step 3: Otimização de Carregamento (PERF-09)

#### 3.1 Substituir `<img>` por `next/image`
- Identificar todos os lugares que usam `<img>`
- Substituir por `<Image>` do next/image
- Adicionar `loading="lazy"` onde apropriado
- Adicionar `placeholder="blur"` onde possível

#### 3.2 Adicionar skeletons para imagens
- Criar `ImageSkeleton` component
- Usar em galerias e previews durante carregamento

## Files to Modify

### PERF-07
1. `app/src/app/api/campaigns/[id]/analyze/route.ts` — Adicionar cache check

### PERF-08
1. `app/src/lib/image-utils.ts` (novo) — Funções de redimensionamento
2. `app/src/components/campaigns/CreativeUploadWithAnalysis.tsx` — Integrar redimensionamento
3. `app/src/components/workspace/UploadStep.tsx` — Integrar redimensionamento

### PERF-09
1. `app/src/components/ui/ImageWithSkeleton.tsx` (novo) — Componente otimizado
2. `app/src/components/workspace/DerivationCard.tsx` — Usar next/image
3. `app/src/components/workspace/DerivationsStep.tsx` — Usar next/image
4. `app/src/components/campaigns/CampaignListCard.tsx` — Usar next/image

## Test Plan
- Verificar cache hit não chama AI
- Verificar cache miss chama AI normalmente
- Verificar imagens grandes são redimensionadas
- Verificar next/image carrega corretamente

## Risk Mitigation
- Cache pode retornar dados desatualizados se campanha mudar
- Mitigação: Invalidar cache quando novo upload é feito
- Redimensionamento pode perder qualidade
- Mitigação: Manter 1024px (suficiente para análise)
