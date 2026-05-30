# Design: Revisão do Fluxo de Criação de Anúncio

**Data:** 2026-05-30
**Escopo:** Substituir o wizard de 5 passos atual por um fluxo simplificado: criação mínima de campanha → piloto criativo → ações principais (derivar / estilizar).

---

## 1. Visão Geral

O fluxo atual exige que o usuário preencha um briefing completo antes de fazer qualquer coisa. O novo fluxo inverte isso: a pessoa cria a campanha com apenas nome e marca, faz upload do criativo piloto, e a IA sugere o preenchimento do briefing com base na análise da imagem. Só depois disso, o usuário escolhe o que fazer com o criativo.

### Estados da máquina de estado

```
CAMPANHA CRIADA (nome + marca)
        │
        ▼
   ┌─────────────┐
   │   PILOTO    │  Upload de imagem + análise IA +
   │  CRIATIVO   │  sugestões de briefing editáveis
   └─────────────┘
        │
   [confirmar piloto]
        │
        ▼
   ┌─────────────┐
   │   AÇÕES     │  Dois botões principais:
   │  PRINCIPAIS │  Derivar criativo | Workflow de estilização
   └─────────────┘
        │
   ┌────┴────┐
   ▼         ▼
[derivando] [estilizando]
   │         │
   ▼         ▼
[grid de    [grid de
derivações]  derivações]
```

---

## 2. Criação de Campanha (Modal)

**Arquivo:** `app/src/components/campaigns/NewCampaignModal.tsx`

**Campos obrigatórios:**
- Nome da campanha (texto livre)
- Marca / Cliente (texto livre — substitui o campo `client` atual)

**Removido do modal:**
- Client profile selection
- Template selection
- Creative upload
- Todos os campos de briefing

**Após salvar:** redireciona para `/campaigns/[id]` no estado `"piloto"`.

---

## 3. Tela do Piloto Criativo (Estado `"piloto"`)

**Rota:** `/campaigns/[id]`
**Container:** `glass-card rounded-xl p-6 md:p-8`
**Layout:** Duas colunas (360px fixo + flexível)

### 3.1 Painel Esquerdo — Upload e Análise

**Componente:** `PilotUploadPanel`

**Micro-estados:**
1. `"empty"` — zona dashed convidativa
2. `"uploading"` — progresso com porcentagem
3. `"analyzing"` — spinner + lista de steps sendo completados
4. `"reviewing"` — insights visíveis + campos editáveis
5. `"locked"` — upload concluído, aguardando confirmação

**Steps de análise (Space Mono, uppercase, tracking wide):**
- Análise técnica
- Extração de elementos visuais
- Geração de sugestões de briefing

**Reutiliza:**
- `use-preflight.ts` para análise técnica
- `server/ai/campaign-deduction.ts` para extração de campos

### 3.2 Painel Direito — Briefing Sugerido

**Componente:** `PilotBriefingForm`

**Campos exibidos (todos editáveis, com hints da IA):**
- Objetivo da campanha
- Público-alvo
- Tom de voz (select)
- Plataformas
- CTA Principal
- Restrições / Notas

**Hints:** campos sugeridos pela IA exibem hint âmbar (`#c7920a`): "💡 Sugerido pela análise do criativo"

**Ações:**
- "Pular sugestões" (limpa hints, mantém campos vazios)
- "Confirmar e ir para ações →" (salva briefing, transita para `"acoes"`)

---

## 4. Tela de Ações Principais (Estado `"acoes"`)

**Layout:** Duas colunas (280px sidebar + área principal)

### 4.1 Sidebar Esquerda

**Componente:** `PilotSidebar`

- **Preview do piloto:** thumbnail + tag "Piloto" + nome da campanha
- **Resumo do briefing:** lista compacta com objetivo, público, tom, plataformas, CTA

### 4.2 Área Principal

**Cabeçalho:**
- Título: "O que você quer fazer com este criativo?"
- Subtítulo descrevendo as opções

**Cards de ação (grid 2-col):**

| Card | Ícone | Descrição | Meta tags |
|------|-------|-----------|-----------|
| Derivar criativo | 🎨 | Variações artísticas, tamanhos, lote | Variações, Tamanhos, Lote |
| Workflow de estilização | ✨ | Novo estilo com referências | Referências, Estilos, Reinterpretar |

**Hover:** borda verde com glow sutil, `translateY(-1px)`

**Grid de derivações:**
- Cards com aspect-ratio 4:5
- Badge de status (Aprovada, etc.)
- Card "+ Nova" (dashed, abre modal de derivar)

---

## 5. Sub-fluxo: Derivar Criativo

**Trigger:** clique no card "Derivar criativo" ou no "+ Nova"
**UI:** Modal central (`max-w-[600px]`)

**Opções (grid 2x2):**

1. **Criar novas variações** — mapeia para modo `art_variation`; abre painel de configuração avançada (quantidade, criatividade, CTAs) antes de gerar
2. **Gerar novas variações** — mapeia para modo `art_variation`; usa as configurações padrão da campanha e dispara a geração imediatamente
3. **Variar tamanhos** — mapeia para modo `format_adaptation`; permite escolher um formato alvo específico (ex: 4:5 ou 9:16)
4. **Criar derivações de tamanhos** — mapeia para modo `format_adaptation`; gera em lote para todos os formatos selecionados de uma vez

**Após seleção:**
- Modal fecha
- Estado vai para `"gerando"`
- Inngest job `derivation.generate` é disparado
- Grid de derivações atualiza em tempo real

---

## 6. Sub-fluxo: Workflow de Estilização

**Trigger:** clique no card "Workflow de estilização"
**UI:** Modal central (`max-w-[600px]`)

**Campos:**
- **Referências de estilo** — upload zone para imagens de referência
- **Estilo desejado** — select com opções predefinidas
- **Intensidade da reinterpretação** — select (Suave / Média / Forte)

**Mapeamento:**
- Modo `restyling` do sistema atual
- As imagens de referência são armazenadas como `style_reference` em `campaign_assets`
- Intensidade mapeia para `styleIntensity` (soft / medium / strong)

---

## 7. Arquitetura de Estado

**Hook:** `use-campaign-workspace.ts` (refatorado)

```ts
type WorkspaceState = 
  | "piloto"           // upload + briefing
  | "acoes"            // botões principais + grid
  | "derivando"        // configuração de derivação
  | "estilizando"      // configuração de estilização
  | "gerando";         // estado de carregamento

interface WorkspaceData {
  campaign: Campaign;
  pilotAsset?: CampaignAsset;
  derivations: Derivation[];
  state: WorkspaceState;
}
```

**Persistência:**
- O estado `generationMode`, `creativeLevel`, `targetFormats`, etc. ainda são salvos no registro da campanha
- A transição `"piloto"` → `"acoes"` persiste o briefing completo
- Derivações são entidades independentes (tabela `derivations`)

---

## 8. Mudanças em Componentes Existentes

### 8.1 Novos componentes

| Componente | Path | Responsabilidade |
|------------|------|------------------|
| `PilotUploadPanel` | `components/workspace/PilotUploadPanel.tsx` | Upload + análise em progresso |
| `PilotBriefingForm` | `components/workspace/PilotBriefingForm.tsx` | Formulário de briefing sugerido |
| `PilotSidebar` | `components/workspace/PilotSidebar.tsx` | Preview + resumo do briefing |
| `ActionCards` | `components/workspace/ActionCards.tsx` | Cards Derivar + Estilizar |
| `DerivationGrid` | `components/workspace/DerivationGrid.tsx` | Grid de derivações com status |
| `DerivarModal` | `components/workspace/DerivarModal.tsx` | Modal com 4 opções de derivação |
| `EstilizarModal` | `components/workspace/EstilizarModal.tsx` | Modal de workflow de estilização |

### 8.2 Componentes removidos / deprecados

- `BriefingStep.tsx` — funcionalidade absorvida pelo `PilotBriefingForm`
- `StepIndicator.tsx` — wizard não existe mais
- `WizardNavigationFooter.tsx` — não há navegação de passos

### 8.3 Componentes reutilizados

- `PreflightScoreCard` — dentro do `PilotUploadPanel`
- `DerivationCard` — dentro do `DerivationGrid`
- `BulkActionsBar` — mantido para ações em lote no grid

---

## 9. Mudanças em APIs

### 9.1 Nova API

```
POST /api/campaigns/[id]/pilot
```
- Body: `{ assetId: string, briefing: CampaignBriefing }`
- Salva o asset como piloto e preenche o briefing da campanha
- Retorna: campanha atualizada

### 9.2 APIs existentes reutilizadas

- `POST /api/campaigns/[id]/analyze` — análise do criativo (já existe)
- `POST /api/campaigns/[id]/auto-briefing` — sugestões de briefing (já existe)
- `POST /api/derivations` — cria derivação (já existe)
- Inngest job `derivation.generate` — geração async (já existe)

---

## 10. Data Model — Sem mudanças estruturais

As tabelas existentes são suficientes:

- `campaigns` — já tem todos os campos de briefing
- `campaign_assets` — `role: 'base'` para o piloto, `role: 'style_reference'` para referências
- `derivations` — já existe com `generationMode`, `format`, `variantIndex`
- `creative_plans` — ainda é gerado automaticamente antes das derivações (em background). O usuário não vê mais o `PlanStep` como passo separado; o plano é gerado silenciosamente ao confirmar o piloto ou ao iniciar a primeira derivação.

---

## 11. Animações e Transições

- Transição entre `"piloto"` e `"acoes"`: fade-in (250ms, ease-out-expo)
- Hover nos cards: `translateY(-1px)` + shadow glow verde
- Modal: backdrop blur + scale-in suave
- Steps de análise: staggered fade-in

---

## 12. Acessibilidade

- Focus rings em `ring-accent-green`
- Labels associadas aos inputs
- Estados de loading anunciados via `aria-live`
- Modal com `aria-modal` e trap de foco

---

## Anexos

Mockups salvos em:
- `mockup-v3-piloto.png` — Tela do piloto criativo
- `mockup-v3-acoes.png` — Tela de ações principais
- `mockup-v3-derivar.png` — Modal derivação
- `mockup-v3-estilizar.png` — Modal estilização
