# Phase 29: Comparação Lado a Lado - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Permitir que usuários comparem duas derivações lado a lado em um modal, com zoom sincronizado e metadados visíveis.

**Scope:**
- Adicionar botão "Compare" em cada DerivationCard
- Selecionar primeira derivação → ativar modo de seleção → selecionar segunda → abrir comparação
- Modal split-pane com zoom sincronizado por padrão (toggle para desabilitar)
- Metadados: CTA, formato, score, status, plataforma

**Out of scope:**
- Comparação de mais de 2 derivações (deferred — próxima fase)
- Comparação inline na galeria (deferred)
- Anotações/desenho na imagem (deferred)
</domain>

<decisions>
## Implementation Decisions

### Trigger/UX Flow
- **Botão "Compare"** em cada DerivationCard (ícone de comparação/balança)
- Clicar no primeiro ativa modo de seleção visual (highlight/border nos cards)
- Clicar no segundo abre o modal de comparação
- Modo de seleção pode ser cancelado com ESC ou clicando fora
- Cards em modo de seleção mostram checkbox ou indicador visual

### Zoom/Pan Behavior
- **Zoom sincronizado por padrão** — scroll wheel ou pinch zoom em uma imagem aplica na outra
- Toggle para desabilitar sincronização (botão "🔗/🔗 desativado")
- Zoom via mouse wheel (desktop) / pinch (mobile)
- Pan via click-and-drag quando zoomed in
- Reset zoom button para voltar ao fit

### Layout
- **Manter modal existente** (`DerivationComparisonModal`)
- Grid 2 colunas (responsive: stack em mobile)
- Imagens mantêm aspect ratio nativo, fit-to-container com `object-contain`
- Metadata em accordion ou abaixo de cada imagem
- Footer com actions: Aprovar A, Aprovar B, Rejeitar ambas, Fechar

### Metadata Display
- Manter existente: plataforma, formato, CTA, quality score, QA status
- Adicionar: status (approved/rejected/pending), data de criação
- Mostrar em cards compactos abaixo de cada imagem

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DerivationComparisonModal.tsx` — Já existe! Componente básico de comparação com 2 colunas
  - Mostra imagem, metadados (platform, format, CTA, score, QA)
  - Tem footer com approve/reject actions
  - **Reutilizar e estender** com zoom/pan functionality
- `DerivationCard.tsx` — Card individual com todas as ações existentes
  - Adicionar prop `onCompare?: () => void` e botão de comparação
- `DerivationsStep.tsx` — Container da galeria
  - Já gerencia estado de seleção (`selectedIds`)
  - Já importa `DerivationComparisonModal`
  - Adicionar estado para modo de comparação (`comparisonMode`, `firstSelection`)

### Established Patterns
- Modal system: `Dialog` + `DialogContent` do shadcn/ui
- State management: React `useState` no componente pai (DerivationsStep)
- Callback pattern: Props `onAction` passadas de pai para filho
- Tailwind CSS com CSS variables para theming
- PT-BR/EN translations via `next-intl`

### Integration Points
- `DerivationsStep` gerencia estado de comparação e passa para `DerivationCard`
- `DerivationComparisonModal` recebe 2 derivações via props
- Hook `useDerivations` fornece dados (já existente)

</code_context>

<specifics>
## Specific Ideas

- Zoom sync toggle: ícone de corrente/link (🔗) quando ativo, corrente quebrada quando inativo
- Zoom levels: fit-to-container (padrão) → 1x → 2x → 3x → fit
- Pan: só habilitado quando zoom > fit
- Seleção visual: border verde (`--accent-mint`) no primeiro card selecionado
- Animação suave ao abrir modal (Framer Motion já usado no projeto)
- Keyboard shortcuts: ESC fecha modal, +/- zoom, 0 reset zoom

</specifics>

<deferred>
## Deferred Ideas

- Comparação de 3+ derivações (galeria múltipla)
- Comparação inline na galeria (sem modal)
- Anotações ou desenho sobre as imagens
- Slider de comparação estilo "antes/depois"
</deferred>

---

*Phase: 29-comparacao-lado-a-lado*
*Context gathered: 2026-05-27*
