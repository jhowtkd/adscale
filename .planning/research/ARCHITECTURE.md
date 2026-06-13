# Architecture Research: Refinamento Visual e Consistência da Interface

**Milestone:** v12.2 Refinamento Visual e Consistência da Interface

**Escopo:** todas as superfícies autenticadas do ADScale

**Data:** 2026-06-12

**Confiança:** alta para arquitetura estática; riscos visuais ainda devem ser confirmados em navegador

**Restrição:** pesquisa somente. Nenhum código de aplicação deve ser alterado nesta etapa.

## Objetivo arquitetural

Transformar a interface autenticada em um sistema compacto, profissional e previsível, responsivo de mobile a ultrawide, sem mudar capacidades de produto. O refinamento deve começar pelos contratos compartilhados de shell, largura, gutters, overflow e camadas. Ajustes isolados por tela antes dessas fundações tenderiam a preservar as mesmas irregularidades em novas formas.

O registro é **product**: familiaridade, densidade útil, grids previsíveis, estados completos e responsividade estrutural têm prioridade sobre decoração. A cena de uso descrita em `DESIGN.md`, um profissional de mídia revisando criativos sob pressão, favorece tema claro como padrão, contraste direto, verde reservado para ação/estado e uma superfície que desaparece durante a tarefa.

## Evidência de produto e código

- `PRODUCT.md`: velocidade, clareza para especialistas, fidelidade de marca e energia criativa sem ruído.
- `DESIGN.md`: shell pretendido com top bar de 56px, conteúdo até 1400px, grids compactos e accent restrito.
- `.planning/PROJECT.md`: a v12.2 permite reorganizar hierarquia, densidade e ações, mas não adiciona produto novo.
- `app/src/app/globals.css:54-103`: tokens Tailwind/shadcn e raios já centralizados parcialmente.
- `app/src/app/globals.css:110-270`: temas claro/escuro e aliases legados coexistem.
- `app/src/app/globals.css:293-316`: scrollbar global customizada, contrariando a preferência do registro de produto por affordances nativas.
- `app/src/app/globals.css:467-496`: três utilitários de glass/backdrop permanecem globais, embora o produto peça layering tonal e não glassmorphism como padrão.
- `app/src/components/layout/AppShell.tsx:27-45`: shell fixa top bar e navegação inferior, mas não define container, gutter ou largura de conteúdo compartilhados.
- `app/src/components/layout/TopBar.tsx:93-150`: top bar fixa combina logo, quatro links, três controles globais, CTA contextual e avatar no mesmo eixo.
- `app/src/components/layout/TopBar.tsx:340-383`: painel de notificações usa posicionamento absoluto e largura fixa de 360px dentro da top bar.

## Arquitetura atual

```text
DashboardLayout
└── AppShell
    ├── TopBar (fixed, z-40, 48/56px)
    │   ├── logo + desktop navigation
    │   ├── language + feedback + theme
    │   ├── contextual CTA or notifications
    │   └── account menu
    ├── main offset wrapper (pt-12/pt-14)
    │   ├── route-owned container, padding and grid
    │   └── Footer
    ├── mobile bottom navigation (fixed, z-50)
    ├── feedback/mission providers
    └── global overlays, toasts and tours
```

O shell resolve apenas a compensação vertical das barras fixas. A geometria horizontal pertence a cada rota, criando múltiplos sistemas paralelos:

| Superfície | Container atual | Gutters atuais | Estrutura principal | Evidência |
|---|---|---|---|---|
| Dashboard | `max-w-[1600px]` repetido por seção | `px-4 sm:px-6 lg:px-8` | header, progressão, grid, analytics | `app/src/app/(dashboard)/page.tsx:88-261` |
| Campanhas | `max-w-7xl` | nenhum no container da rota | header, toolbar, lista/grid/kanban | `app/src/app/(dashboard)/campaigns/page.tsx:104-229` |
| Workspace | `max-w-[1100px]` | nenhum no container da rota | header, card, sidebar + feed | `app/src/app/(dashboard)/campaigns/[id]/page.tsx:396-474` |
| Configurações | `max-w-6xl` | nenhum no container da rota | nove tabs horizontais + conteúdo | `app/src/app/(dashboard)/settings/page.tsx:94-153` |
| Feedback | `max-w-6xl px-4` | fixo em 16px | rail de 320px + detalhe | `app/src/app/(dashboard)/feedback/page.tsx:182-185` |
| Biblioteca | sem max-width | nenhum | header, dropzone, busca, grid 2/4/6 | `app/src/app/(dashboard)/library/page.tsx:126-211` |
| Templates | sem max-width | nenhum | header e grid 1/2/3 | `app/src/app/(dashboard)/templates/page.tsx:46-101` |
| Restyling | `max-w-3xl` | nenhum | formulário em duas colunas | `app/src/app/(dashboard)/restyling/page.tsx:122-190` |
| Quick restyling | `max-w-2xl` | nenhum | formulário em duas colunas | `app/src/app/(dashboard)/quick-tools/restyling/page.tsx:145-289` |

Essa variação não é apenas estética. Rotas sem gutter próprio podem encostar nas bordas da viewport, enquanto o dashboard possui até 32px por lado. Ao navegar, títulos, ações e superfícies mudam de eixo sem intenção de produto.

## Causas de sobreposição, corte e irregularidade

### 1. Ausência de contrato único de página

`AppShell` não possui um `main` semântico nem um primitive como `PageContainer`. Cada rota decide largura, padding e espaçamento. Isso explica alinhamentos inconsistentes e torna qualquer correção responsiva local.

**Risco:** alto em mobile e ultrawide.

**Fronteira a consolidar:** `AppShell` + novos primitives de layout, sem acoplar conteúdo de feature ao shell.

### 2. Top bar congestionada entre 768px e aproximadamente 1100px

A navegação completa aparece em `md`, enquanto logo e quatro ações à direita continuam visíveis. O bloco esquerdo usa `overflow-hidden`, portanto o mecanismo de sobrevivência é cortar conteúdo, não reorganizá-lo (`TopBar.tsx:103-134`). A top bar também muda conteúdo entre dashboard e demais rotas, aumentando variação horizontal (`TopBar.tsx:138-194`).

**Causa provável de clipping:** soma de logo, quatro links, gaps, controles globais e avatar maior que a largura intermediária disponível.

**Estratégia:** definir modos estruturais de navegação, não apenas esconder texto. Mobile compacto, tablet com navegação recolhida, desktop completo e ultrawide sem expansão desnecessária.

### 3. Camadas fixas e sticky usam offsets independentes

- Top bar: `fixed`, `z-40`, altura 48/56px (`TopBar.tsx:93-100`).
- Bottom nav: `fixed`, `z-50`, altura derivada do conteúdo + safe area (`AppShell.tsx:43-72`).
- Workspace action bar: `sticky top-14 z-10` em todos os breakpoints (`WorkspaceActionBar.tsx:38-66`).
- Toasts: `fixed top-4 right-4 z-[200]` (`ToastStack.tsx:152`).
- Onboarding: `fixed inset-0 z-[100]` e tooltip absoluto de 320px (`OnboardingTour.tsx:128-183`).
- Dialogs/sheets: `fixed z-50` (`ui/dialog.tsx:35-47`, `ui/sheet.tsx:35-47`).

O action bar usa `top-14` mesmo quando a top bar mobile tem 48px e pode se ocultar por scroll. Isso cria gap de 8px, mudança brusca quando o header some e potencial disputa com overlays. A bottom nav possui compensação no shell, mas componentes locais com rodapés ou CTAs não conhecem sua altura.

**Estratégia:** tokens de geometria e camada (`--app-header-height`, `--app-bottom-nav-height`, `--z-header`, `--z-sticky`, `--z-overlay`, `--z-toast`) consumidos por shell e superfícies sticky.

### 4. Overflow é tratado depois da composição

Há três estratégias incompatíveis:

- cortar: `overflow-hidden` na top bar e nos pills de filtro (`TopBar.tsx:103`, `CampaignsFilterToolbar.tsx:180-207`);
- rolar: tabelas, kanban e painéis usam `overflow-x-auto` local (`CampaignsListView.tsx:44-47`, `KanbanBoard.tsx:66-77`, `HypothesesPanel.tsx:78-79`);
- substituir layout: lista desktop vira cards mobile em `md` (`CampaignsListView.tsx:44-120`).

Rolagem horizontal é correta para tabelas e kanban, mas pills ativos não podem desaparecer por corte. Toolbars devem reflow, colapsar filtros secundários ou possuir uma faixa rolável explícita com affordance.

### 5. Breakpoints semânticos não são compartilhados

O código usa `sm`, `md`, `lg` e `xl` conforme conveniência local:

- navegação desktop começa em `md` (`TopBar.tsx:123-129`);
- bottom nav termina em `md` (`AppShell.tsx:43-45`);
- tabela de campanhas começa em `md` (`CampaignsListView.tsx:44-120`);
- workspace troca detalhes/sidebar em `lg` (`campaigns/[id]/page.tsx:798-831`);
- dashboard troca header e analytics em `lg` (`page.tsx:102`, `page.tsx:239`);
- grids variam entre `lg` e `xl` para três colunas.

Não existe um mapa que diga qual mudança corresponde a navegação, leitura, edição, tabela ou gallery density. O mesmo breakpoint representa decisões diferentes e produz zonas intermediárias frágeis.

### 6. Larguras fixas competem dentro de containers estreitos

- `PilotSidebar` declara 280px internamente (`PilotSidebar.tsx:89-98`), mas o pai reserva `lg:w-64`, 256px (`campaigns/[id]/page.tsx:818-831`). O filho é 24px maior que a coluna, uma causa direta de overflow horizontal ou invasão do conteúdo.
- Filtros usam 280px + 140px + 150px + 140px + toggle e gaps (`CampaignsFilterToolbar.tsx:56-177`). O reflow só acontece em `lg`, portanto larguras próximas ao desktop podem ficar congestionadas.
- Kanban possui cinco colunas de 260px, intencionalmente roláveis (`KanbanColumn.tsx:25`, `KanbanBoard.tsx:67`). O scroll deve permanecer contido à região do board, nunca à página.
- Derivation grid usa `minmax(280px, 1fr)` (`DerivationGrid.tsx:94-98`). Em uma área de conteúdo reduzida pelo sidebar, padding e gutters, a transição entre uma e duas colunas pode ocorrer tarde e produzir cards excessivamente largos ou overflow se ancestrais não tiverem `min-width: 0`.
- Plans possui tabela mínima de 760px (`PlansTab.tsx:116-117`) e hypotheses 480px (`HypothesesPanel.tsx:78-79`), exigindo wrappers de scroll e bordas que comuniquem continuidade.

### 7. Navegação secundária não possui comportamento mobile

Configurações renderiza nove tabs em uma única linha sem wrap ou overflow (`settings/page.tsx:106-134`). Em mobile, o conteúdo excede a viewport. Esse é um candidato forte para clipping observado.

**Estratégia:** tabs roláveis somente quando poucas e próximas; para nove áreas, usar seletor compacto ou navegação lateral/combobox responsivo, preservando URLs por `?tab=`.

### 8. Hierarquia visual varia por rota

Dashboard usa título 30/36px, peso black, ícone e background decorativo (`page.tsx:90-127`). Campanhas usa `CampaignsHeader`; Settings usa 24px; Library/Templates usam 20px; formulários usam 28px. Botões primários alternam `accent-blue`, `accent-green`, `text-white` e `text-[var(--deep-bg)]`, embora aliases azuis apontem para verde (`globals.css:142-150`).

**Efeito:** o app parece composto por produtos diferentes e aliases mascaram dívida semântica.

**Estratégia:** primitive único de `PageHeader` com variantes de densidade e slots para ações, não uma aparência única forçada.

### 9. Cards e glass são usados como estrutura padrão

Dashboard, progressão, atividade, crédito, workspace e cards de campanha usam `glass-card`; o workspace envolve várias superfícies já cardificadas dentro de outro `glass-card` (`campaigns/[id]/page.tsx:756-963`). Isso aproxima nested cards e aumenta ruído de borda, blur e padding.

**Estratégia:** reservar cards para unidades selecionáveis ou agrupamentos independentes. Usar sections, dividers, toolbars e tonal layers para a estrutura contínua do workspace.

### 10. Duplicação de superfícies equivalentes

Existem duas rotas de restyling com containers e formulários distintos (`/restyling` e `/quick-tools/restyling`), além de modais/sheets para estilização dentro do workspace. Campanhas também possui card visual de dashboard, card de grid, card de lista, row de tabela e card de kanban. Essa multiplicação aumenta divergência de padding, tipografia, estados e responsividade.

**Estratégia:** consolidar primitives e shells primeiro; só fundir componentes de feature quando comportamento e informação forem realmente equivalentes.

## Contrato responsivo recomendado

### Viewport e gutters

| Faixa | Papel estrutural | Gutter | Comportamento esperado |
|---|---|---:|---|
| `< 480px` | mobile estreito | 12–16px + safe areas | uma coluna, ações principais full-width quando necessário, bottom nav |
| `480–767px` | mobile largo | 16px | toolbars em linhas, galleries 1–2 colunas conforme conteúdo |
| `768–1023px` | tablet | 20–24px | navegação global recolhida; tabelas escolhem cards ou scroll intencional |
| `1024–1279px` | notebook compacto | 24px | duas regiões somente quando cada uma mantém largura mínima real |
| `1280–1599px` | desktop | 24–32px | navegação completa, grids densos, workspace com rail |
| `>= 1600px` | ultrawide | 32px | conteúdo permanece limitado; espaço extra não alonga formulários nem texto |

Os valores devem virar primitives/tokens, não cópias de classes. Breakpoints Tailwind podem continuar, mas devem representar decisões documentadas.

### Primitives propostos

| Primitive | Responsabilidade | Não deve conhecer |
|---|---|---|
| `AppFrame` / `AppShell` | header, bottom nav, main, footer, safe areas e layer tokens | conteúdo de campanhas ou dashboard |
| `PageContainer` | max-width, gutters e variantes `wide`, `standard`, `narrow`, `full-bleed` | títulos, loading ou feature state |
| `PageHeader` | título, descrição, metadata e slot de ações com reflow | lógica de criação/upload |
| `PageSection` | ritmo vertical, divider e heading opcional | aparência de card por padrão |
| `Toolbar` | primary action, busca, filtros, view switch, wrap/collapse | query state específico |
| `ResponsiveTabs` | tabs desktop e seletor/scroll mobile com foco correto | conteúdo de cada tab |
| `ScrollableRegion` | scroll horizontal contido, edge affordance e focus | schema da tabela/kanban |
| `SplitPane` | rail + conteúdo com min/max e colapso estrutural | briefing ou derivations |
| `StickyActionRegion` | offset pelo header, safe area e camada coerente | ações Derivar/Estilizar específicas |
| `Surface` | tonal layer, border e radius por papel | nesting arbitrário |

Esses primitives devem ser pequenos e composicionais. Não criar um mega-componente configurável que esconda o DOM ou force todas as páginas ao mesmo desenho.

## Fronteiras de componentes a modificar ou consolidar

### Fundação compartilhada

1. `app/src/app/globals.css`
   - Introduzir tokens de geometria, densidade, largura e z-index.
   - Normalizar aliases de cor e deprecar nomes `accent-blue/mint/teal/purple` no produto.
   - Reduzir dependência de `glass-card`; manter compatibilidade temporária durante migração.
   - Remover scrollbar customizada global ou restringi-la a regiões onde há ganho funcional comprovado.

2. `app/src/components/layout/AppShell.tsx`
   - Tornar `main` a boundary semântica.
   - Centralizar offsets de header/bottom nav e safe areas.
   - Não impor uma única largura a todas as rotas; fornecer container primitives.

3. `app/src/components/layout/TopBar.tsx`
   - Separar logo, navegação principal, utilidades e contexto de página em subcomponentes.
   - Definir modo tablet em vez de depender de clipping.
   - Portar notificações para primitive de popover/dialog com collision handling.

4. `app/src/components/ui/*`
   - Padronizar estados e densidades de button, input, select, dialog, sheet, table, tabs e toolbar.
   - Garantir que overlays tenham `max-height`, body rolável e footer visível com teclado virtual/safe area.

### Navegação e listagem

- Consolidar `CampaignsHeader`, headers de Library/Templates/Settings e headers dos formulários sobre `PageHeader`.
- Manter representações específicas de campanha, mas extrair uma linguagem comum de metadata, status e action menu para `VisualCampaignCard`, `CampaignCard`, `CampaignListCard`, `CampaignTableRow` e `KanbanCard`.
- Transformar `CampaignsFilterToolbar` em composição do primitive `Toolbar`; filtros ativos devem reflow/scroll, nunca usar corte silencioso.
- Manter `KanbanBoard` horizontal, mas dentro de `ScrollableRegion` com altura e scroll próprios quando necessário.

### Workspace

- `CampaignWorkspaceCard` é uma fronteira grande demais e mistura layout, seções de performance, entrega, geração e derivations (`campaigns/[id]/page.tsx:708-965`). Dividir em shell de workspace e sections independentes.
- Corrigir o contrato de largura entre `PilotSidebar` e seu pai antes de qualquer polish.
- Substituir o `details` mobile por uma versão responsiva do mesmo rail, sem duplicar duas instâncias de `PilotSidebar` no DOM (`campaigns/[id]/page.tsx:798-831`).
- Fazer `WorkspaceActionBar` consumir offsets do shell e mudar para layout de ação compacto/full-width conforme viewport.
- Tratar performance, hipóteses, memória, aprovação e derivações como sections contínuas. Cards internos só onde existe unidade funcional independente.
- `DerivationGrid` deve receber mínimos de coluna via token/container query, não inline style rígido.

### Configurações e formulários

- `SettingsPage` precisa de `ResponsiveTabs` antes de refinar tabs individuais.
- Forms de Profile/Workspace/BrandKit/Team/Integrations já usam máximos entre 560 e 720px; preservar legibilidade, alinhar headings/actions e remover wrappers redundantes.
- Plans, Billing e Credit History devem usar o mesmo contrato de tabela responsiva.
- Avaliar `/restyling`, `/quick-tools/restyling` e `EstilizarModal` como uma família de UI. Compartilhar field groups, uploads e action footer, mantendo entry points quando os fluxos forem diferentes.

## Estratégia de migração ordenada

### 1. Inventário visual e baseline

- Capturar todas as rotas autenticadas em 390, 768, 1024, 1280, 1440, 1920 e uma largura ultrawide.
- Registrar overflow horizontal do documento, elementos cortados, sticky collisions, foco, zoom 200%, textos PT-BR/EN e estados loading/empty/error.
- Transformar problemas reproduzidos em uma matriz rota × viewport × estado.

**Saída:** baseline verificável. Nenhuma alteração visual ampla ainda.

### 2. Tokens e contratos de geometria

- Definir alturas, gutters, content widths, density steps e layer scale em `globals.css`.
- Estabelecer política de surface, border, radius e accent.
- Preservar aliases durante uma janela de migração para evitar refactor big bang.

**Dependência:** nenhuma.

**Desbloqueia:** todas as etapas seguintes.

### 3. Shell e navegação global

- Refatorar `AppShell` e `TopBar` para modos mobile/tablet/desktop.
- Unificar compensações fixed/sticky e safe areas.
- Validar bottom nav, notificações, dropdowns, toasts, onboarding e teclado virtual.

**Gate:** nenhuma rota pode gerar scroll horizontal apenas por causa do shell.

### 4. Primitives de página e interação

- Implementar `PageContainer`, `PageHeader`, `PageSection`, `Toolbar`, `ResponsiveTabs`, `ScrollableRegion`, `SplitPane` e `StickyActionRegion`.
- Consolidar estados dos componentes UI base.
- Criar testes de composição e histórias/fixtures visuais onde a infraestrutura permitir.

**Gate:** primitives funcionam isoladamente em todas as faixas alvo.

### 5. Superfícies de navegação simples

- Migrar Templates, Library e Campaigns.
- Resolver headers, grids, toolbar, filtros, lista/tabela e kanban.
- Essas rotas cobrem a maior variedade de containers e overflow com menor complexidade de estado que o workspace.

**Gate:** alinhamento comum entre rotas, ações acessíveis e nenhuma perda funcional.

### 6. Configurações e superfícies densas

- Migrar Settings, tabs e todos os painéis.
- Padronizar formulários, tabelas, pricing e billing.
- Testar strings longas em PT-BR/EN, zoom e navegação por teclado.

**Gate:** nove áreas navegáveis em mobile sem clipping e tabelas contidas.

### 7. Workspace de campanha

- Introduzir shell/sections do workspace.
- Corrigir rail, sticky action bar, grids de derivação e painéis de performance.
- Revisar sheets, dialogs e fluxos de review/export com bottom nav e teclado virtual.

Esta etapa vem depois das fundações porque é a superfície de maior blast radius e já combina quase todos os padrões problemáticos.

**Gate:** fluxo piloto → briefing → gerar → revisar → compartilhar/exportar íntegro em todas as larguras.

### 8. Dashboard, feedback e progressão

- Migrar dashboard para o mesmo sistema, removendo full-bleed decorativo sem função e excesso de cards onde apropriado.
- Ajustar feedback owner rail/detail e painéis analytics.
- Revalidar onboarding tour contra posições e containers finais.

### 9. Consolidação e remoção de legado

- Remover aliases e utilitários não usados somente após todas as superfícies migrarem.
- Consolidar duplicações comprovadas de restyling e campaign representation.
- Buscar classes arbitrárias de largura/offset e exigir justificativa para exceções restantes.

### 10. Regressão final

- Browser matrix completa, temas claro/escuro, PT-BR/EN, estados de dados e permissões.
- `npm test`, lint e build.
- Verificação de overflow do documento, ordem de foco, contraste, reduced motion e touch targets.

## Matriz mínima de validação

| Área | Mobile | Tablet | Notebook | Desktop | Ultrawide |
|---|---|---|---|---|---|
| Shell/top bar/bottom nav | sem clipping; safe area | modo tablet real | ações cabem | nav completa | conteúdo não se dispersa |
| Dashboard | uma coluna coerente | grid 2 colunas | analytics sem compressão | densidade compacta | max-width estável |
| Campaigns | filtros acessíveis | tabela/cards definidos | toolbar sem colisão | grid/list/board | board contido |
| Workspace | rail colapsado | sections legíveis | split apenas se couber | split estável | conteúdo não estica |
| Settings | navegação compacta | tabs/rail coerentes | forms limitados | tabelas densas | forms permanecem estreitos |
| Library/Templates | actions reflow | grid proporcional | grid denso | grid denso | tamanho de card limitado |
| Overlays | viewport + teclado | collision handling | footer visível | foco contido | largura limitada |

## Regras de implementação para as fases seguintes

1. Corrigir overflow na fronteira que o causa; não esconder com `overflow-x-hidden` no `body`.
2. Todo flex/grid com filhos truncáveis deve declarar `min-w-0` na boundary correta.
3. Largura fixa só é aceita para rail, coluna ou overlay quando o pai reserva exatamente o mesmo contrato.
4. Sticky/fixed deve consumir tokens do shell e declarar comportamento quando o header some.
5. Scroll horizontal deve ser local, navegável por teclado e visualmente indicado.
6. Mobile é recomposição de hierarquia, não apenas stack de tudo que existe no desktop.
7. Ultrawide aumenta respiro externo, não line length, form width ou número ilimitado de colunas.
8. Primary action por região; ações secundárias entram em menu ou disclosure quando competem.
9. Evitar nested cards. Preferir sections, dividers e tonal layers.
10. Não alterar comportamento de produto durante a migração visual sem requisito e teste explícitos.

## Fora de escopo

- Novas features, integrações ou mudanças de modelo de dados.
- Redesign das superfícies públicas e autenticação, exceto primitives compartilhados que precisem permanecer compatíveis.
- Troca de framework, Tailwind, shadcn/base-ui, Next.js ou gerenciamento de estado.
- Reescrita simultânea de todas as rotas.
- Mudanças de copy ou fluxo que alterem contratos funcionais sem aprovação específica.

## Resultado recomendado

A milestone deve ser estruturada por dependência, não por rota aleatória: **baseline → tokens → shell → primitives → listagens/configurações → workspace → dashboard/feedback → remoção de legado → regressão**. Essa ordem elimina as causas sistêmicas antes de polir superfícies e reduz o risco de corrigir a mesma sobreposição várias vezes.

---
*Architecture research for v12.2 Refinamento Visual e Consistência da Interface.*
