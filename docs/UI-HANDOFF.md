# ADScale UI Handoff — replicar a interface em outro app

Documento **auto-contido** para outro agente (ou time) recriar a cara do ADScale sem precisar vasculhar o monorepo. Fonte de verdade visual: tokens OKLCH em produção (`app/src/app/globals.css`). Hex abaixo são aproximações legíveis.

## Como usar este brief

Cole este arquivo no chat do outro app e peça algo como:

> Aplique o design system ADScale deste handoff. Comece pelos tokens CSS, depois o shell flutuante (sidebar + topbar), depois primitives (Button, Input, Badge, Panel, EmptyState). Não invente roxo/indigo nem glassmorphism decorativo.

**Stack de referência (origem):** Next.js + Tailwind v4 + CSS variables + shadcn/Base UI + Lucide + Framer Motion + `next-themes`.

**Não copiar:** lógica de negócio, rotas, APIs, copy de produto ADScale — só visual, layout e padrões de UI.

---

## 1. Identidade visual (o “porquê”)

**Frase-guia:** *Creative studio às 2h da manhã* — produtividade tipo Linear (calmo, estruturado) + accent streetwear (verde elétrico, contraste profundo).

| Princípio | Na prática |
|-----------|------------|
| Neutros tintados + verde ≤10% | Verde só em CTA, nav ativa, focus, progresso |
| Elevação tonal, não sombra exagerada | `canvas → surface-base → surface-raised` + borda 1px |
| Tipografia com escala clara | Inter no produto; Space Mono em labels; Press Start 2P só em marketing/impacto |
| Shell flutuante (v6) | Sidebar e topbar como painéis glass-ish com blur, separados do canvas |
| Sem “AI slop” | Sem roxo/indigo de marca, sem gradient text, sem card-dentro-de-card, sem métricas-herói genéricas |

**Hue canônico:** `145` em OKLCH (verde). Todo o tema gira em torno disso.

---

## 2. Tokens CSS (copiar primeiro)

Cole no `:root` / `.dark` do app destino. Nomes canônicos (use estes; ignore aliases legados tipo `--accent-green` se estiver começando do zero).

```css
:root {
  /* Fonts */
  --font-inter: Inter, ui-sans-serif, system-ui, sans-serif;
  --font-space-mono: "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --font-press-start: "Press Start 2P", cursive;

  /* Spacing (8px grid) */
  --space-1: 0.25rem;  /* 4 */
  --space-2: 0.5rem;   /* 8 */
  --space-3: 0.75rem;  /* 12 */
  --space-4: 1rem;     /* 16 */
  --space-5: 1.5rem;   /* 24 */
  --space-6: 2rem;     /* 32 */
  --space-7: 3rem;     /* 48 */

  /* Control heights */
  --control-sm: 1.75rem;   /* 28 */
  --control-md: 2rem;      /* 32 */
  --control-lg: 2.25rem;   /* 36 */
  --control-touch: 2.75rem;/* 44 */

  /* Type scale (product) */
  --text-caption: 0.75rem;   /* 12 */
  --text-label: 0.8125rem;   /* 13 */
  --text-body: 0.875rem;     /* 14 */
  --text-body-lg: 1rem;      /* 16 mobile controls */
  --text-section: 1rem;      /* 16 semibold */
  --text-page: 1.25rem;      /* 20 semibold */
  --text-display: 1.5rem;    /* 24 */

  /* Radius */
  --radius-control: 0.375rem; /* 6 — buttons, inputs, nav items */
  --radius-panel: 0.5rem;     /* 8 */
  --radius-object: 0.75rem;   /* 12 — cards/panels */
  --radius-overlay: 0.75rem;  /* 12 — dialogs */
  --radius-pill: 9999px;

  /* Motion */
  --duration-fast: 120ms;
  --duration-default: 180ms;
  --duration-slow: 280ms;
  --ease-product: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1);

  /* Shell v6 */
  --shell-topbar-mobile: 3rem;
  --shell-topbar-desktop: 3.5rem;
  --shell-v6-gap: 1rem;
  --shell-v6-sidebar-width: 17.5rem; /* 280px */
  --shell-bottom-nav: 4.75rem;
  --shell-safe-bottom: calc(var(--shell-bottom-nav) + env(safe-area-inset-bottom, 0px));
  --shell-v6-topbar-offset: calc(var(--shell-v6-gap) * 2 + var(--shell-topbar-desktop));
  --shell-v6-main-offset-left: calc(var(--shell-v6-gap) * 2 + var(--shell-v6-sidebar-width));

  /* Page gutters / content widths */
  --page-gutter-mobile: 1rem;
  --page-gutter-tablet: 1.5rem;
  --page-gutter-desktop: 2rem;
  --page-gutter-wide: 2.5rem;
  --page-gutter: var(--page-gutter-mobile);
  --content-reading: 45rem;
  --content-form: 40rem;
  --content-operational: 80rem;
  --content-workspace: 87.5rem;
  --content-wide: 100rem;

  /* Z-index layers */
  --layer-base: 0;
  --layer-raised: 10;
  --layer-sticky: 20;
  --layer-shell: 30;
  --layer-shell-floating: 40;
  --layer-popover: 50;
  --layer-backdrop: 60;
  --layer-overlay: 70;
  --layer-toast: 80;

  /* ——— LIGHT ——— */
  --canvas: oklch(0.965 0.006 145);           /* ~#f4f6f3 */
  --surface-base: oklch(0.992 0.004 145);     /* ~#fcfdfc */
  --surface-raised: oklch(0.955 0.007 145);   /* ~#eef1ed */
  --surface-inset: oklch(0.945 0.007 145);
  --surface-overlay: oklch(0.995 0.003 145);
  --text-primary: oklch(0.18 0.012 145);      /* ~#141a15 */
  --text-secondary: oklch(0.38 0.012 145);
  --text-muted: oklch(0.46 0.01 145);
  --text-disabled: oklch(0.63 0.008 145);
  --text-on-accent: oklch(0.16 0.02 145);     /* texto em cima do verde */
  --border-subtle: oklch(0.18 0.012 145 / 0.06);
  --border-default: oklch(0.18 0.012 145 / 0.12);
  --border-strong: oklch(0.18 0.012 145 / 0.22);
  --focus-ring: oklch(0.52 0.012 145 / 0.45);
  --accent-primary: oklch(0.62 0.21 145);     /* verde CTA ~#00b34a */
  --accent-primary-hover: oklch(0.68 0.23 145);
  --accent-primary-subtle: oklch(0.58 0.01 145 / 0.12);
  --accent-primary-text: var(--text-secondary);
  --neutral-bg: oklch(0.58 0.01 145 / 0.12);
  --neutral-border: oklch(0.52 0.01 145 / 0.24);
  --neutral-text: oklch(0.34 0.01 145);
  --neutral-dot: oklch(0.48 0.01 145);
  --warning-bg: oklch(0.68 0.14 82 / 0.16);
  --warning-border: oklch(0.58 0.13 82 / 0.3);
  --warning-text: oklch(0.39 0.1 82);
  --danger-bg: oklch(0.58 0.2 18 / 0.12);
  --danger-border: oklch(0.52 0.18 18 / 0.28);
  --danger-text: oklch(0.43 0.17 18);
  --info-bg: oklch(0.62 0.13 245 / 0.12);
  --info-border: oklch(0.54 0.12 245 / 0.28);
  --info-text: oklch(0.4 0.12 245);
  --success-bg: var(--neutral-bg);
  --success-border: var(--neutral-border);
  --success-text: var(--neutral-text);
  --shadow-floating: 0 12px 32px color-mix(in oklch, var(--text-primary) 12%, transparent);
  --shadow-overlay: 0 24px 80px color-mix(in oklch, var(--text-primary) 16%, transparent);
}

.dark {
  --canvas: oklch(0.15 0.008 145);            /* ~#0f1210 */
  --surface-base: oklch(0.18 0.009 145);
  --surface-raised: oklch(0.22 0.01 145);
  --surface-inset: oklch(0.13 0.007 145);
  --surface-overlay: oklch(0.2 0.01 145);
  --text-primary: oklch(0.96 0.006 145);
  --text-secondary: oklch(0.72 0.008 145);
  --text-muted: oklch(0.66 0.01 145);
  --text-disabled: oklch(0.48 0.009 145);
  --text-on-accent: oklch(0.16 0.02 145);
  --border-subtle: oklch(0.96 0.006 145 / 0.06);
  --border-default: oklch(0.96 0.006 145 / 0.1);
  --border-strong: oklch(0.96 0.006 145 / 0.2);
  --focus-ring: oklch(0.72 0.01 145 / 0.45);
  --accent-primary: oklch(0.78 0.22 145);     /* verde mais claro no dark */
  --accent-primary-hover: oklch(0.84 0.2 145);
  --accent-primary-subtle: oklch(0.72 0.01 145 / 0.12);
  --neutral-bg: oklch(0.72 0.01 145 / 0.12);
  --neutral-border: oklch(0.72 0.01 145 / 0.24);
  --neutral-text: oklch(0.78 0.01 145);
  --neutral-dot: oklch(0.64 0.01 145);
  --warning-bg: oklch(0.76 0.15 82 / 0.16);
  --warning-border: oklch(0.76 0.15 82 / 0.3);
  --warning-text: oklch(0.8 0.14 82);
  --danger-bg: oklch(0.67 0.2 18 / 0.16);
  --danger-border: oklch(0.67 0.2 18 / 0.3);
  --danger-text: oklch(0.72 0.19 18);
  --info-bg: oklch(0.7 0.14 245 / 0.14);
  --info-border: oklch(0.7 0.14 245 / 0.3);
  --info-text: oklch(0.76 0.13 245);
  --success-bg: var(--neutral-bg);
  --success-border: var(--neutral-border);
  --success-text: var(--neutral-text);
}

body {
  background: var(--canvas);
  color: var(--text-primary);
  font-family: var(--font-inter), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Mapa shadcn (se usar):**

| Token shadcn | ADScale |
|--------------|---------|
| `--background` | `--canvas` |
| `--foreground` | `--text-primary` |
| `--card` | `--surface-base` |
| `--primary` | `--accent-primary` |
| `--primary-foreground` | `--text-on-accent` |
| `--muted-foreground` | `--text-muted` |
| `--border` | `--border-subtle` |
| `--ring` | `--focus-ring` |
| `--destructive` | `--danger-text` |

---

## 3. Tipografia

| Papel | Fonte | Uso |
|-------|-------|-----|
| UI / body | Inter | Quase tudo no produto |
| Labels / índices | Space Mono, uppercase, tracking largo (~0.08–0.2em) | plano do usuário, badges editoriais, `(01)` |
| Impacto | Press Start 2P | **Só** marketing/hero — nunca em dashboard/settings |

**Classes de produto:**

- Título de página: `font-size: var(--text-page); font-weight: 600; line-height: 1.25`
- Título de seção: `font-size: var(--text-section); font-weight: 600; line-height: 1.35`
- Corpo: `--text-body` (14px); em touch/mobile controls pode subir para `--text-body-lg`

Carregar fontes (Google Fonts ou local):

```
Inter (400, 500, 600, 700, 800)
Space Mono (400, 500, 700)
Press Start 2P (400) — opcional se não houver marketing
```

---

## 4. Shell flutuante (assinatura do layout)

Padrão atual: **painel lateral fixo + topbar flutuante**, ambos com blur, borda e sombra; o conteúdo principal offseta à direita/abaixo.

```
┌──── gap ────┬──────────────────────────────┐
│ ┌─────────┐ │ ┌──── topbar (fixed) ──────┐ │
│ │ sidebar │ │ └──────────────────────────┘ │
│ │ 280px   │ │                              │
│ │ rounded │ │   main content               │
│ │ 1rem    │ │                              │
│ └─────────┘ │                              │
└─────────────┴──────────────────────────────┘
```

### CSS do shell (essencial)

```css
.v6-shell-sidebar {
  position: fixed;
  top: var(--shell-v6-gap);
  left: var(--shell-v6-gap);
  bottom: var(--shell-v6-gap);
  z-index: calc(var(--layer-shell-floating) + 1);
  width: var(--shell-v6-sidebar-width);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  overflow: hidden;
  border-radius: 1rem;
  border: 1px solid var(--border-default);
  background: var(--surface-raised);
  padding: 0.875rem 0.75rem;
  box-shadow:
    0 16px 40px rgb(0 0 0 / 0.65),
    0 4px 12px rgb(0 0 0 / 0.4),
    inset 0 1px 0 rgb(255 255 255 / 0.06);
  backdrop-filter: blur(24px) saturate(140%);
}

.v6-shell-topbar {
  position: fixed;
  top: var(--shell-v6-gap);
  right: var(--shell-v6-gap);
  left: var(--shell-v6-main-offset-left);
  z-index: var(--layer-shell-floating);
  height: var(--shell-topbar-desktop);
  display: flex;
  align-items: center;
  gap: 1rem;
  border-radius: 1rem;
  border: 1px solid var(--border-default);
  background: var(--surface-raised);
  padding-inline: 1rem;
  box-shadow:
    0 16px 40px rgb(0 0 0 / 0.6),
    0 4px 12px rgb(0 0 0 / 0.35),
    inset 0 1px 0 rgb(255 255 255 / 0.05);
  backdrop-filter: blur(24px) saturate(140%);
}

.v6-shell-main {
  min-height: 100vh;
  padding-top: var(--shell-v6-topbar-offset);
  padding-right: var(--shell-v6-gap);
  padding-bottom: 2rem;
  padding-left: var(--shell-v6-main-offset-left);
}

@media (max-width: 767px) {
  .v6-shell-sidebar { display: none; }
  .v6-shell-topbar { left: var(--shell-v6-gap); }
  .v6-shell-main { padding-left: var(--shell-v6-gap); }
  /* No mobile: bottom nav ou sheet “More” em vez da sidebar */
}
```

### Anatomia da sidebar

1. **Logo** centrado, opacidade baixa (~0.42), invertido no dark se necessário  
2. **Nav principal em grid 3 colunas** — ícone Lucide 18px + label 10px (Home / Works / Library)  
3. **Feature slot** opcional (ex.: brand kit)  
4. **Região scrollável** (lista recente / mapa)  
5. **Footer:** Settings + avatar (iniciais 30px) + plano em Space Mono + logout  

**Item ativo:** `background: accent-primary-subtle; color: accent-primary-text`  
**Item idle:** `text-secondary`; hover → `surface-base` + `text-primary`

### Anatomia da topbar

- Esquerda: título da rota atual (contexto)  
- Direita: ações (feedback, idioma, notificações, menu usuário)  
- Ícones Lucide 16–18px; ghost → verde no hover/ativo  

---

## 5. Primitives de página

| Primitive | Comportamento |
|-----------|----------------|
| **PageFrame** | Wrapper com `--page-gutter` + max-width (`operational` 80rem, `form` 40rem, `reading` 45rem, `workspace` 87.5rem, `wide` 100rem) |
| **PageHeader** | `h1.product-page-title` + description `text-secondary` + actions à direita; borda inferior subtle; `py-6` |
| **Panel** | `rounded-object` + `border-subtle/dim` + `bg-surface-base`; padding `none` \| `sm` (p-3) \| `md` (p-6) |
| **EmptyState** | Centro, max-w-md; ícone em box raised 64px OU imagem; título seção; descrição; CTA Button; steps opcionais numerados com accent |

---

## 6. Componentes (receitas)

### Button

- Base: `rounded-control`, `h-control-md`, `text-body`, `font-medium`, transição `duration-default` + `ease-product`
- Active press: `scale(0.97)` + `translateY(1px)` (exceto se tem popup)
- Focus: ring 3px em `--focus-ring` / shadcn ring
- Variantes: `default` (primary fill), `outline`, `secondary`, `ghost`, `destructive` (bg tint + texto danger), `link`
- Tamanhos: `xs` / `sm` / `default` / `lg` / `icon*`

### Input / Textarea

- Altura `control-md`, `rounded-control`, borda `input`/`border-default`, bg transparente (dark: input/30)
- Placeholder `text-muted`
- Focus: border ring + ring 3px
- Invalid: danger border + ring

### Badge

- Pill (`radius-pill`), altura `control-sm`, `text-caption`
- Semânticos: `neutral` | `success` | `warning` | `danger` | `info` — cada um usa trio `*-bg` / `*-border` / `*-text`
- Status de produto: bolinha colorida (`*-dot`) + label sobre fundo tintado

### Dialog / Sheet

- Overlay: `radius-overlay`, sombra `--shadow-overlay`
- Mobile: sheet bottom, `rounded-t-overlay`, max-h 90dvh
- Desktop: centered modal

### Ícones

- Biblioteca: **Lucide**
- Produto: 14–18px, `strokeWidth` ~1.5–2
- Em empty states grandes: 32px, stroke 1.5, cor `accent-primary`

---

## 7. Elevação, superfícies e efeitos

**Padrão produto:** flat tonal + 1px border. Não empilhar cards.

Efeitos permitidos (com parcimônia):

| Classe / efeito | Quando |
|-----------------|--------|
| Shell blur + shadow | Só sidebar/topbar flutuantes |
| `glass-card` | Cards leves com blur (marketing ou destaques); dark = white 6% |
| `grain` | Overlay noise ~3% opacity em seções light de marketing |
| `ambient-glow` | Blob blur grande muted — marketing, não dashboard |
| `GlowingEffect` (borda reativa) | Opcional na sidebar; não espalhar |

**Proibido:** nested cards, faixa colorida lateral em cards, gradient text, purple/indigo brand.

---

## 8. Motion

- Preferir **opacity + transform**; nunca animar width/height/top/left
- Entrada: fade-in + translateY(12px), ~250ms `ease-out-expo`
- Hover de card: translateY leve + shadow, ~300ms ease-out
- Respeitar `prefers-reduced-motion`
- Ênfase de campo atualizado por IA: ring accent que some (~650ms) — opcional

---

## 9. Tema

- Default: **light**
- Toggle com `next-themes` (ou equivalente): classe `.dark` no `html`
- Persistência localStorage / system preference

---

## 10. Checklist de implementação (ordem sugerida)

1. [ ] Instalar fontes Inter + Space Mono (+ Press Start se marketing)  
2. [ ] Colar tokens `:root` / `.dark` e mapear para o design system do app  
3. [ ] `body` com `canvas` + Inter + antialiasing  
4. [ ] Classes shell: `.v6-shell-sidebar`, `.v6-shell-topbar`, `.v6-shell-main`  
5. [ ] Layout raiz: sidebar + topbar + main com offsets  
6. [ ] Button / Input / Badge / Dialog alinhados aos tokens  
7. [ ] PageFrame + PageHeader + Panel + EmptyState  
8. [ ] Theme toggle  
9. [ ] Mobile: esconder sidebar; topbar full-bleed com gap; bottom nav se necessário  
10. [ ] Auditoria visual: verde ≤10%, sem roxo, sem nested cards, reduced-motion OK  

---

## 11. Do’s / Don’ts (colinha)

### Do

- Verde só em progresso, sucesso e CTA primário  
- Ritmo de espaçamento no grid de 8px; gaps maiores entre blocos  
- Erros acionáveis (estado + próximo passo)  
- Labels mono em uppercase para metadados  

### Don’t

- SaaS cinza genérico sem pulso de marca  
- Templates “AI”: grid idêntico de cards, glass wallpaper, hero de métricas  
- Pixel font no chrome do produto  
- Animar layout properties  
- Inventar segunda cor de marca (azul/roxo) “porque SaaS”  

---

## 12. Prompt pronto pra colar no outro app

```text
Você vai recriar a interface visual do ADScale neste repositório.

Leia o documento UI-HANDOFF completo (tokens OKLCH hue 145, shell flutuante v6,
primitives, do/don't).

Escopo:
1. Aplicar tokens CSS (:root + .dark) como fonte de verdade.
2. Implementar shell: sidebar fixa 280px + topbar flutuante + main offset.
3. Alinhar Button, Input, Badge, Panel, PageHeader, EmptyState aos tokens.
4. Theme light/dark.
5. Mobile: sidebar hidden; topbar com left=gap.

Fora de escopo: lógica de negócio ADScale, copy de produto, APIs.

Critérios de done:
- Verde elétrico como único accent de marca
- Sem purple/indigo, sem nested cards, sem gradient text
- Shell com border-radius 1rem, blur e sombra como no handoff
- prefers-reduced-motion respeitado
```

---

## 13. Skills sugeridas (agente receptor)

Se o ambiente tiver skills Cursor, invocar nesta ordem:

1. `design-an-interface` / design system do app destino — mapear tokens → componentes locais  
2. `frontend-design` ou skill de UI do projeto — evitar layouts genéricos  
3. `verify-before-complete` — checklist visual + reduced-motion  

---

## Referências no monorepo ADScale (opcional)

| Artefato | Path |
|----------|------|
| Tokens + utilities | `app/src/app/globals.css` |
| Brief curto legado (hex) | `design.md` |
| Tokens JSON marketing | `marketing/2026-Q3/tokens/design-tokens.json` |
| Shell | `app/src/components/layout/V6ShellLayout.tsx` |
| Sidebar | `app/src/components/layout/AppSidebar.tsx` |
| TopBar | `app/src/components/layout/TopBar.tsx` |
| Button / Badge / Input | `app/src/components/ui/*` |
| Page primitives | `app/src/components/layout/Page*.tsx`, `Panel.tsx` |

Se houver divergência entre este handoff e `design.md` (hex antigo), **prevalece o OKLCH deste arquivo / `globals.css`**.
