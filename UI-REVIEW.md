# UI/UX Review — ADScale

> **Auditoria retroativa de 6 pilares** conduzida em `2026-05-22`  
> **Escopo:** Frontend React/Next.js (app dir) — Dashboard, Auth, Campaigns, Layout  
> **Metodologia:** Inspeção estática de código + heurísticas de UX/UI

---

## Resumo Executivo

| Pilar | Nota | Status |
|---|---|---|
| 1. Layout & Estrutura | **3/4** | ✅ Bom |
| 2. Tipografia & Cores | **3/4** | ✅ Bom |
| 3. Componentes & Consistência | **3/4** | ✅ Bom |
| 4. Responsividade & Mobile | **3/4** | ✅ Bom |
| 5. Acessibilidade | **2/4** | ⚠️ Precisa de atenção |
| 6. Performance Visual | **3/4** | ✅ Bom |
| **Média Geral** | **2.8/4** | **B+** |

**Veredito:** A interface possui uma base visual sólida, com um design token system bem estruturado e componentização razoável. Os principais gaps estão em **acessibilidade** (foco teclado, semântica, contraste) e em **dívida técnica de inconsistências** (cores hardcoded, animações excessivas, falta de padronização em padrões de hover/estado).

---

## Pilar 1 — Layout & Estrutura (3/4)

### ✅ O que funciona
- **Sistema de tokens CSS** bem estruturado com variáveis semânticas (`--surface-base`, `--text-primary`, `--border-dim`).
- **Sidebar colapsável** com animação fluida e indicador de item ativo (`layoutId`).
- **Mobile bottom nav** bem posicionada com 4 itens (dentro do limite de 5).
- **Grid system claro** no dashboard: stats (4 colunas) → quick actions (4 col) → tabela + feed (2 col).
- **Glass backdrop** no TopBar cria hierarquia visual de camadas.
- **Z-index hierarchy** implícita: sidebar `z-50`, topbar `z-40`, notificações `z-50`.

### ⚠️ Problemas
- **Uso inconsistente de CSS inline vs Tailwind:** muitos componentes misturam `style={{ backgroundColor: iconBgColor }}` com classes Tailwind. Isso dificulta overrides e quebra a cascata de tokens.
- **Valores arbitrários excessivos:** `w-[360px]`, `w-[280px]`, `grid-cols-[1fr_100px_80px_100px_80px_48px]` espalhados pelo código. Recomenda-se extrair para um design system de grids/tamanhos.
- **Padding inconsistente:** Welcome banner usa `px-5 py-5 sm:px-6`, mas a seção de campaigns usa `px-6 py-4`. Falta um spacing scale rígido.
- **Grid da tabela de campaigns** é complexo e frágil — qualquer mudança de coluna requer ajuste em múltiplos lugares.
- **Falta skip-to-content link** para navegação por teclado.

### 🎯 Recomendações
1. Extrair todos os tamanhos fixos (px) para tokens no `@theme inline`.
2. Criar um componente `DataTable` que aceite definição de colunas via props, eliminando grid hardcoded.
3. Padronizar spacing: usar apenas valores do sistema (4, 6, 8, 12, 16, 20, 24, 32, 48).
4. Adicionar `<a href="#main" className="sr-only focus:not-sr-only">Pular para conteúdo</a>`.

---

## Pilar 2 — Tipografia & Cores (3/4)

### ✅ O que funciona
- **Paleta Mint Receipt** é coesa e tem propósito claro (fundo quente, mint como driver de ação).
- **Tokens semânticos** bem nomeados: `text-primary`, `text-secondary`, `text-muted`.
- **Status colors** mapeados para estados de campanha (`draft`, `active`, `processing`, `failed`).
- **Fonte Inter** como sans-serif principal é excelente para legibilidade em dashboards.
- **JetBrains Mono** usada propositalmente em labels e números (StatsCard), criando hierarquia tipográfica.

### ⚠️ Problemas
- **Tamanhos de texto muito pequenos:** `text-[11px]` usado em labels de seção, badges de status e timestamps. Em telas de alta densidade isso pode comprometer legibilidade.
- **Cores hardcoded fora do token system:** `StatusBadge` usa `#475569`, `#94a3b8`, `#f59e0b`, `#f43f5e` diretamente. Se o tema mudar, esses componentes quebram visualmente.
- **Legacy aliases no CSS:** `--accent-blue`, `--accent-purple`, `--accent-teal` todos apontando para `--accent-mint` indicam dívida técnica de uma migração de cores não concluída.
- **Escala tipográfica fraca:** mistura de `text-sm` (14px), `text-xs` (12px), `text-[13px]`, `text-[15px]`, `text-[22px]` sem uma escala definida (ex: 12/14/16/18/20/24/32/40).
- **Falta de headings semânticos:** as páginas usam `<h1>` e `<h2>` em alguns lugares, mas muitas seções usam `<div>` ou `<p>` com classes de tamanho, prejudicando SEO e acessibilidade.

### 🎯 Recomendações
1. Definir escala tipográfica mínima em 12px (`text-xs`). Eliminar `text-[11px]` e `text-[10px]`.
2. Mapear todas as cores de `StatusBadge` para tokens do design system (ex: `--status-draft-bg`, `--status-draft-text`).
3. Remover legacy aliases do CSS ou documentar explicitamente que são deprecated.
4. Criar componente `Heading` com níveis semânticos (`h1` a `h6`) e tamanhos predefinidos.

---

## Pilar 3 — Componentes & Consistência (3/4)

### ✅ O que funciona
- **Base shadcn/ui** bem integrada (Button, Input, Dialog, Select, Table, DropdownMenu).
- **Componentes customizados reutilizáveis:** `StatsCard`, `EmptyState`, `StatusBadge`, `LanguageSwitcher`.
- **Estados de interação consistentes:** hover com `-translate-y-px` e `shadow`, active com `scale-[0.98]`.
- **Skeleton loading states** padronizados em tabela e grid.
- **cva (class-variance-authority)** no Button permite variantes consistentes.

### ⚠️ Problemas
- **Inconsistência no padrão de hover:** `StatsCard` faz `y: -2` (Framer Motion), `QuickActionCard` faz `y: -2`, mas botões fazem `-translate-y-px`. Deveria ser unificado.
- **Cores inline dinâmicas:** `StatsCard`, `QuickActionCard` e `CampaignRow` recebem `iconBgColor` e `iconColor` como props string. Isso quebra o encapsulamento do design system.
- **Botões de ação misturam abordagens:** alguns usam `<Button variant="default">`, outros usam `<button className="bg-[var(--accent-mint)] ...">`.
- **Lucide icons com tamanhos variados:** `size={16}`, `size={18}`, `size={20}`, `size={14}` sem um sistema de tamanho de ícone (`icon-sm`, `icon-md`, `icon-lg`).
- **Framer Motion em componentes simples:** `EmptyState`, `StatsCard`, `QuickActionCard` todos têm animações. Isso cria inconsistência quando um componente de lista (ex: tabela) anima filhos com stagger e outro não.

### 🎯 Recomendações
1. Criar enum/tokens para cores de ícone (ex: `IconTone.MINT`, `IconTone.AMBER`, `IconTone.ROSE`) e mapear internamente para tokens CSS.
2. Padronizar tamanhos de ícone: `sm=16`, `md=20`, `lg=24`.
3. Extrair animações para um hook/utilitário compartilhado (`useFadeIn`, `useStagger`) para garantir consistência de easing/duração.
4. Consolidar todos os botões de CTA para usar o componente `Button` do shadcn.

---

## Pilar 4 — Responsividade & Mobile (3/4)

### ✅ O que funciona
- **Mobile-first:** classes base para mobile, `md:` e `lg:` para breakpoints maiores.
- **Bottom nav** implementada com 4 itens (≤5), com labels + ícones.
- **Sidebar oculta** em mobile (`hidden md:flex`), liberando espaço.
- **Grid adaptativo:** stats (`1 → 2 → 4`), quick actions (`1 → 2 → 4`), cards (`1 → 2 → 3`).
- **Touch targets** respeitados: botões de navegação móvel têm área de toque adequada.
- **AppShell compensa** bottom nav com `pb-20 md:pb-0`.

### ⚠️ Problemas
- **Tabela de campaigns com scroll horizontal:** `overflow-x-auto` em tabela é um anti-pattern mobile. Degrada a experiência de leitura.
- **Texto muito pequeno em mobile:** `text-[11px]` em badges e timestamps pode ser ilegível em telas pequenas.
- **Search global comportamento estranho:** ao focar o search no TopBar, redireciona para `/campaigns`. Isso pode ser desorientador.
- **Campanha Row** usa grid complexo (`grid-cols-[1fr_100px_80px_100px_80px_48px]`) que pode estourar viewport em mobile.
- **Notificações em painel flutuante:** `w-[360px]` pode estourar a tela em mobile (telas de 375px).

### 🎯 Recomendações
1. **Reimaginar a tabela mobile:** em telas < `md`, transformar cada linha em um card vertical (padrão "card list") em vez de tabela horizontal.
2. Limitar largura de painéis flutuantes a `max-w-[calc(100vw-2rem)]` ou `w-full` em mobile.
3. Aumentar fonte mínima para 12px em todos os elementos mobile.
4. Testar em 320px (iPhone SE) para garantir que não haja overflow horizontal.

---

## Pilar 5 — Acessibilidade (2/4) ⬅️ **Pior pilar**

### ✅ O que funciona
- `aria-label` em botões de ícone (notificações, limpar search, avatar).
- `aria-expanded` no painel de notificações.
- `aria-hidden="true"` em ícones decorativos.
- `focus-visible:ring` nos botões e inputs do shadcn.
- `prefers-reduced-motion` implementado no CSS global.
- Labels visíveis em formulários de login/signup (`Label` + `htmlFor`).
- Alt text presente em imagens (logo, empty state).

### ⚠️ Problemas críticos
- **Custom checkbox sem semântica ARIA:** o checkbox de seleção em massa na tabela é um `<input type="checkbox">` mas usa `appearance-none` com background-image SVG. Falta `role="checkbox"`, `aria-checked`, e o indeterminate state não é comunicado a leitores de tela.
- **Falta skip-to-content link:** usuários de teclado precisam navegar por toda a sidebar para chegar ao conteúdo.
- **Painel de notificações não é focus-trap:** ao abrir notificações, o foco não é movido para o painel e `Escape` não o fecha.
- **Toast position bottom-right:** pode cobrir botões de ação importantes. Recomenda-se `top-right` ou garantir `aria-live`.
- **Campanha Row é clicável mas usa `<div>`:** deveria ser `<button>` ou `<Link>` para ser focável e anunciável.
- **Formulários sem autocomplete:** login e signup não têm `autoComplete="email"`, `autoComplete="current-password"`, `autoComplete="new-password"`.
- **Contraste potencialmente insuficiente:** `text-[var(--text-muted)]` (#9BA8A0) sobre `var(--surface-raised)` (#FAFAF8) pode não atingir 4.5:1. Precisa ser verificado com ferramenta.
- **Sem heading hierarchy explícita:** a navegação da página não tem outline semântico claro para leitores de tela.

### 🎯 Recomendações prioritárias
1. **Adicionar skip link:** `<a href="#main" className="sr-only focus:not-sr-only">`.
2. **Refatorar checkbox custom:** usar componente nativo do shadcn ou adicionar `role="checkbox"` + `aria-checked`.
3. **Implementar focus-trap no painel de notificações:** mover foco ao abrir, fechar com Escape, retornar foco ao botão de trigger ao fechar.
4. **Adicionar `autoComplete` em todos os inputs de auth.**
5. **Verificar contraste de `#9BA8A0` sobre `#FAFAF8`:** se < 4.5:1, escurecer `text-muted` para `#7A8A80`.
6. **Tornar CampaignRow focável:** usar `<button>` ou `<Link>` com `className="text-left w-full"`.

---

## Pilar 6 — Performance Visual (3/4)

### ✅ O que funciona
- **Skeleton loading states** bem implementados para tabela e grid.
- **Animações GPU-accelerated:** usa `transform` e `opacity` exclusivamente (não anima `width`, `height`, `top`, `left`).
- **`will-change` usado seletivamente:** na sidebar (`willChange: "width"`) e utility class `will-change-transform`.
- **Glass backdrop limitado:** usado apenas no TopBar, não em todo o layout.
- **Scroll behavior smooth** mas respeita `prefers-reduced-motion`.

### ⚠️ Problemas
- **Framer Motion em excesso:** praticamente toda seção do dashboard anima. Em máquinas lentas ou com muitos itens, isso pode causar jank.
- **Múltiplas animações simultâneas:** stagger em stats cards + quick actions + campaign rows + activity feed = muitos cálculos de layout simultâneos.
- **`backdrop-filter: blur(16px)`** no TopBar pode ser custoso em mobile (GPU compositing).
- **Não há virtualização:** listas de campanhas longas renderizam todos os itens no DOM.
- **`layoutId` no sidebar:** anima o indicador ativo. É elegante, mas em sidebars com muitos itens pode causar layout thrashing.
- **Imagens sem `priority`:** o logo na sidebar e empty state não têm indicação de carregamento prioritário.

### 🎯 Recomendações
1. **Reduzir animações em listas:** remover `staggerChildren` de tabelas com >10 itens. Usar apenas fade-in simples.
2. **Virtualizar tabelas longas:** considerar `@tanstack/react-virtual` para listas >50 itens.
3. **Otimizar glass backdrop:** usar `backdrop-filter` apenas quando necessário; testar performance em Android low-end.
4. **Adicionar `priority` ao logo** e `loading="lazy"` às imagens de empty state.
5. **Audit bundle size do framer-motion:** se possível, substituir animações simples por CSS transitions (`transition-all duration-200`) em componentes que não precisam de orchestration.

---

## Melhorias de Alto Impacto (Quick Wins)

| # | Melhoria | Arquivos afetados | Esforço | Impacto |
|---|---|---|---|---|
| 1 | Adicionar skip link + autoComplete nos forms | `layout.tsx`, `login/page.tsx`, `signup/page.tsx` | 15 min | 🔒 A11Y |
| 2 | Padronizar tamanho mínimo de fonte para 12px | `globals.css`, `StatusBadge.tsx`, `TopBar.tsx` | 30 min | 📱 Mobile + A11Y |
| 3 | Mapear cores hardcoded do StatusBadge para tokens | `StatusBadge.tsx`, `globals.css` | 20 min | 🎨 Consistência |
| 4 | Extrair grid da tabela para componente configurável | `campaigns/page.tsx` | 2h | 🏗️ Manutenção |
| 5 | Implementar focus-trap no painel de notificações | `TopBar.tsx` | 1h | 🔒 A11Y |
| 6 | Reduzir stagger animations em listas grandes | `campaigns/page.tsx`, `Dashboard page.tsx` | 45 min | ⚡ Performance |
| 7 | Transformar tabela em cards em mobile | `CampaignTableRow.tsx`, `campaigns/page.tsx` | 3h | 📱 Mobile |
| 8 | Verificar e ajustar contraste WCAG AA | `globals.css` | 30 min | 🔒 A11Y |

---

## Melhorias Implementadas (2026-05-22)

As seguintes correções foram aplicadas ao codebase:

### ✅ Acessibilidade
| # | Mudança | Arquivos |
|---|---|---|
| 1 | **Skip link** adicionado no `layout.tsx` — visível apenas ao navegar por teclado | `layout.tsx` |
| 2 | **`autoComplete` nos forms de auth** — `email`, `current-password`, `new-password`, `name` | `login/page.tsx`, `signup/page.tsx`, `PasswordInput.tsx` |
| 3 | **Contraste WCAG AA do `text-muted`** — ajustado de `#9BA8A0` (2.37:1) para `#66786C` (4.50:1) | `globals.css` |
| 4 | **StatusBadge com tokens CSS** — eliminados hex hardcoded; texto agora usa `text-primary` para garantir contraste sobre fundos coloridos | `StatusBadge.tsx`, `globals.css` |

### ✅ Tipografia & Consistência
| # | Mudança | Arquivos |
|---|---|---|
| 5 | **Fonte mínima padronizada para 12px** — `text-[11px]` → `text-xs`, `text-[10px]` → `text-xs` | `AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx`, `Dashboard page.tsx`, `Campaigns page.tsx`, `CampaignCard.tsx`, `CampaignTableRow.tsx`, `Footer.tsx`, `PlansTab.tsx`, `StatusBadge.tsx` |

### ✅ Responsividade & Mobile
| # | Mudança | Arquivos |
|---|---|---|
| 6 | **Tabela mobile refatorada para cards** — `CampaignListCard` criado; list view em mobile agora exibe cards verticais sem scroll horizontal | `CampaignListCard.tsx`, `campaigns/page.tsx` |

### ✅ Acessibilidade (continuação)
| # | Mudança | Arquivos |
|---|---|---|
| 7 | **Focus-trap no painel de notificações** — `Escape` fecha, foco retorna ao botão de trigger, Tab circular dentro do painel, click outside fecha | `TopBar.tsx` |
| 8 | **CampaignTableRow focável semanticamente** — `role="link"`, `tabIndex={0}`, ativação via Enter/Space, `aria-label` descritivo | `CampaignTableRow.tsx`, `CampaignListCard.tsx` |

### Nota Revisada (após todas as melhorias)

| Pilar | Nota Original | Nota Atual |
|---|---|---|
| Layout & Estrutura | 3/4 | 3/4 |
| Tipografia & Cores | 3/4 | **3.5/4** |
| Componentes & Consistência | 3/4 | **3.5/4** |
| Responsividade & Mobile | 3/4 | **3.5/4** ⬆️ |
| Acessibilidade | **2/4** | **3.5/4** ⬆️ |
| Performance Visual | 3/4 | 3/4 |
| **Média Geral** | **2.8/4** | **3.3/4** |

---

## Conclusão

A interface do ADScale é **visualmente agradável e funcional**, com um design token system que demonstra maturidade. Após duas rodadas de melhorias, os gaps críticos foram significativamente reduzidos:

- **Acessibilidade subiu de 2/4 para 3.5/4.** Skip link, autoComplete, contraste WCAG AA, focus-trap em notificações, e elementos semanticamente focáveis foram implementados.
- **Mobile subiu de 3/4 para 3.5/4.** A tabela horizontal foi eliminada em mobile em favor de cards verticais (`CampaignListCard`).
- **Consistência visual melhorou.** Cores hardcoded do StatusBadge foram eliminadas, fontes mínimas padronizadas, e tokens CSS centralizados.

### ✅ Performance Visual (Rodada 3)
| # | Mudança | Arquivos |
|---|---|---|
| 9 | **Framer Motion reduzido** — `StatsCard`, `EmptyState`, `AuthCard`, `AppShell`, `CampaignCard`, `CampaignListCard`, `CampaignTableRow` migrados para CSS transitions (`animate-fade-in`, `hover:-translate-y`) | 7 arquivos |
| 10 | **Lazy loading de modais** — `NewCampaignModal`, `SaveTemplateModal`, `RestylingModal`, `DeliveryPackageModal` carregados via `next/dynamic` com `ssr: false` | 4 arquivos |
| 11 | **React.memo em componentes de lista** — `CampaignCard`, `CampaignListCard`, `CampaignTableRow`, `StatsCard` memoizados para evitar re-renderizações desnecessárias | 4 arquivos |
| 12 | **Componente VirtualList criado** — utilitário com `@tanstack/react-virtual` para windowing em listas >50 itens; fallback automático para renderização normal em listas curtas | `VirtualList.tsx` |
| 13 | **axe-core configurado** — `@axe-core/react` integrado via `A11yProvider`; roda automaticamente em dev reportando violações de contraste, heading-order, labels, landmarks | `A11yProvider.tsx`, `layout.tsx` |

### Nota Final (após 3 rodadas)

| Pilar | Nota Original | Nota Atual |
|---|---|---|
| Layout & Estrutura | 3/4 | 3/4 |
| Tipografia & Cores | 3/4 | **3.5/4** |
| Componentes & Consistência | 3/4 | **3.5/4** |
| Responsividade & Mobile | 3/4 | **3.5/4** |
| Acessibilidade | **2/4** | **3.5/4** |
| Performance Visual | 3/4 | **3.5/4** ⬆️ |
| **Média Geral** | **2.8/4** | **3.4/4** |

---

## Conclusão

A interface do ADScale é **visualmente agradável e funcional**, com um design token system que demonstra maturidade. Após três rodadas de melhorias, os gaps críticos foram significativamente reduzidos:

- **Acessibilidade subiu de 2/4 para 3.5/4.** Skip link, autoComplete, contraste WCAG AA, focus-trap em notificações, elementos semanticamente focáveis, e axe-core em dev.
- **Mobile subiu de 3/4 para 3.5/4.** Tabela horizontal eliminada em mobile em favor de cards verticais (`CampaignListCard`).
- **Performance Visual subiu de 3/4 para 3.5/4.** Framer Motion reduzido em 7 componentes, lazy loading de 4 modais, React.memo em componentes de lista, e utilitário de virtualização criado.
- **Consistência visual melhorou.** Cores hardcoded do StatusBadge eliminadas, fontes mínimas padronizadas, tokens CSS centralizados.

**Próximos passos recomendados (futuro):**
1. Audit completo de bundle size com `@next/bundle-analyzer`
2. Service Worker para caching de assets estáticos
3. Testes E2E de acessibilidade com Playwright + axe-core
4. Animações de página via View Transitions API (substituindo Framer Motion restante)
