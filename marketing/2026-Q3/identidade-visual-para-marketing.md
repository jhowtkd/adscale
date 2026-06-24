# Identidade Visual pra Marketing — ADScale

> **Por que este doc existe:** o Jhonatan quer usar os tokens que
> já estão no app pra identidade visual de marketing (carrossel,
> Reels, capa de LinkedIn, etc.). Isso garante consistência entre
> o que o lead vê no post e o que encontra no produto.
>
> **Fonte dos tokens:**
> - [`/design.md`](../../../design.md) — design system em texto
> - [`/app/src/app/globals.css`](../../../app/src/app/globals.css) — implementação em CSS custom properties
>
> **Valores abaixo já estão prontos pra colar no Canva / Figma / CapCut.**

---

## 1. A vibe (o que precisa passar)

> "The Creative Studio at 2am" — profissional sem perder energia.
> Estilo Linear (estrutura) + streetwear (acidente visual em verde neon).

- **Calmo no produto.** Verde é acento, não wallpaper.
- **Mais agressivo no marketing.** Pode usar mais preto + verde contrastado, dot grids, leve glow radial. Mas sem gradient text e sem glassmorphism exagerado.
- **Pixel font (Press Start 2P) é pra momentos de impacto.** Hero, CTA primário, número grande. Não usa em texto corrido.

---

## 2. Paleta de cores (extraída do `design.md`)

### Light mode (default)

| Token | Hex | Quando usar no marketing |
|-------|-----|---------------------------|
| `--deep-bg-light` | `#fafafa` | Background de carrossel, capa de LinkedIn clara |
| `--surface-base-light` | `#ffffff` | Cards, fundo de slide |
| `--surface-raised-light` | `#f5f5f5` | Fundo secundário (alternar com branco) |
| `--text-primary-light` | `#0a0a0a` | Texto principal, títulos |
| `--text-secondary-light` | `#444444` | Texto de apoio |
| `--text-muted-light` | `#525252` | Legendas, fonte pequena |
| `--accent-green-light-mode` | `#00b34a` | **CTA primário, badge "novo", divisor** |
| `--accent-green-bright-light` | `#00e85e` | Hover, foco, número em destaque |
| `--accent-green-dark-light` | `#007a33` | Hover de hover, profundidade |
| `--accent-rose-light` | `#d43d5c` | Erro, "pare de fazer X" |
| `--accent-amber-light` | `#c7920a` | Aviso, "atenção" |
| `--ink` | `#0a0a0a` | Botão primário sólido |

### Dark mode (pra conteúdo de impacto)

| Token | Hex | Quando usar no marketing |
|-------|-----|---------------------------|
| `--deep-bg-dark` | `#0a0a0a` | Background de Reels "studio at 2am" |
| `--surface-base-dark` | `#111111` | Cards em dark mode |
| `--surface-raised-dark` | `#1a1a1a` | Fundo secundário dark |
| `--text-primary-dark` | `#ffffff` | Texto principal em dark |
| `--text-secondary-dark` | `#888888` | Texto de apoio em dark |
| `--accent-green-dark-mode` | `#00e85e` | Accent em dark (mais brilhante) |
| `--accent-green-bright-dark` | `#3fff80` | Highlight extremo em dark |

### Regra de uso

- **Background claro** (90% dos posts): `#fafafa` ou `#ffffff`. Texto `#0a0a0a`. Accent `#00b34a`.
- **Background escuro** (10% dos posts, "studio at 2am"): `#0a0a0a`. Texto `#ffffff`. Accent `#00e85e` ou `#3fff80`.
- **Não usar** gradientes no texto, glassmorphism exagerado, ou borders com stripe colorida.

---

## 3. Tipografia (extraída do `design.md`)

| Token | Stack | Onde usar no marketing |
|-------|-------|------------------------|
| `display` | **Press Start 2P** | **Sparingly.** Hero stat, número grande de impacto, CTA primário em capa. |
| `headline` | **Inter 800** | Título de carrossel, headline de Reels (texto na tela). |
| `title` | **Inter 600** | Subtítulo, chamada secundária. |
| `body` | **Inter 400** | Texto corrido, parágrafo de explicação. |
| `label` | **Space Mono, uppercase, tracking 0.2em** | Badge `(01)`, label de seção, número de slide, tag. |

### Regra de uso

- **Carrossel slide 1:** Inter 800 bold, ≥ 36pt, alinhado à esquerda.
- **Carrossel slides 2-N:** Inter 600 ou 400, ≥ 18pt, com 1 ideia por slide.
- **Reels texto na tela:** Inter 800, 40-60pt, alto contraste, máximo 5 palavras.
- **Press Start 2P:** máximo 1x por carrossel (slide 1 ou slide final). Nunca em texto longo.
- **Space Mono:** sempre em MAIÚSCULAS, com tracking 0.2em. Usar pra labels de seção.

### Fontes pra instalar

- **Inter** (Google Fonts) — weight 400, 600, 800.
- **Space Mono** (Google Fonts) — weight 400, 700.
- **Press Start 2P** (Google Fonts) — weight 400.

Já vêm no app. Em Canva/Figma, é só buscar e usar.

---

## 4. Raios de borda

| Token | Valor | Quando usar no marketing |
|-------|-------|------------------------|
| `--radius-sm` | 2px | Tags, badges pequenas |
| `--radius-md` | 4px | Botões, inputs (default) |
| `--radius-lg` | 8px | Cards, subseções |
| `--radius-xl` | 12px | Cards grandes, capa de carrossel |
| `--radius-full` | 9999px | Pills, badges circulares, avatares |

### Regra de uso

- **Padrão:** 8px (cards) ou 12px (capas).
- **Pílulas/badges:** full.
- **Botões CTA:** 4-8px (não totalmente arredondado — passa seriedade).
- **Evitar:** 0px (sharp demais, perde personalidade) ou > 20px (fica genérico de app de lifestyle).

---

## 5. Espaçamento (8px grid)

| Token | Valor | Quando usar |
|-------|-------|-------------|
| `xs` | 4px | Espaço entre ícone e label |
| `sm` | 8px | Espaço entre parágrafos curtos |
| `md` | 16px | Espaço padrão entre blocos |
| `lg` | 24px | Espaço entre seções |
| `xl` | 32px | Espaço antes/depois de título principal |
| `section` | clamp(6rem, 15vh, 12rem) | Espaço entre seções de página (não aplica a carrossel) |

---

## 6. Componentes prontos pra copiar no Canva

### 6.1 Botão primário (CTA)

```
Fundo: #0a0a0a (--ink)
Texto: #ffffff
Radius: 4px (--radius-md)
Padding: 10px 20px
Fonte: Inter 600, 14-16pt
```

**Variação hover (pra capa):**
```
Fundo: #00b34a (--accent-green-light-mode)
Texto: #0a0a0a
```

### 6.2 Botão CTA verde (pílula)

```
Fundo: #00b34a
Texto: #0a0a0a
Radius: 9999px (--radius-full) ou 8px
Padding: 12px 24px
Fonte: Inter 600, 16pt
```

### 6.3 Card surface

```
Fundo: #ffffff
Texto: #0a0a0a
Radius: 12px (--radius-xl)
Padding: 16-24px
Border: 1px solid #e5e5e5 (sutil, opcional)
```

### 6.4 Badge / Label

```
Fundo: #f5f5f5 (--surface-raised)
Texto: #0a0a0a
Radius: 2-4px
Padding: 4px 8px
Fonte: Space Mono, 10-12pt, MAIÚSCULAS, tracking 0.2em
```

**Variação verde (destaque):**
```
Fundo: #00b34a
Texto: #0a0a0a
```

### 6.5 Section label `(01)`, `(02)`...

Estilo editorial — marca estrutura de posts longos (carrossel com 6+ slides, ou capa de LinkedIn).

```
Texto: (01) — Em Inter ou Space Mono, 11-12pt, MAIÚSCULAS
Cor: #00b34a (verde accent)
Posição: topo do slide / início do post
```

---

## 7. Logo (a definir)

Não há logo pronto no app (procurei: não tem SVG/PNG oficial em `app/public/`). **3 caminhos:**

1. **Wordmark simples** "ADScale" em Inter 800, com a barra do A ou detalhe em verde (#00b34a). Faz no Canva em 30 min.
2. **Pictograma** — usar só o "AD" em verde como favicon / avatar, e "ADScale" como wordmark completo.
3. **Pedir designer** (Freelancer, Fiverr). ~R$ 200-500 por 3 opções.

**Recomendação pra Fase 0:** opção 1 (wordmark Inter 800 + detalhe verde). Custa 30 min, é consistente com a tipografia do app, e tá pronto pra rodar.

---

## 8. Como configurar o Canva pra usar esses tokens

### 8.1 Brand Kit (Canva Pro)

1. Canva → Brand Kit → Fonts:
   - Adicionar **Inter** (weight 400, 600, 800).
   - Adicionar **Space Mono** (weight 400, 700).
   - Adicionar **Press Start 2P** (weight 400).
2. Cores:
   - Adicionar os 12 hex codes da seção 2.
3. Logo:
   - Fazer upload do wordmark quando decidir (seção 7).

### 8.2 Template de carrossel (criar 1x, usar N vezes)

**No Canva:**
1. Custom size: 1080×1350px (4:5 — formato que mais entrega no IG).
2. Background: `#fafafa`.
3. Texto do título: Inter 800, 48pt, `#0a0a0a`, alinhado à esquerda, padding 60px.
4. Texto do corpo: Inter 400, 22pt, `#0a0a0a`.
5. Label de seção: Space Mono, 14pt, MAIÚSCULAS, `#00b34a`, padding 8px 16px, bg `#f5f5f5`.
6. Slide CTA: bg `#0a0a0a`, texto `#ffffff`, CTA botão `#00b34a`.
7. Export: PNG (1080×1350, sem compressão).

**Salvar como template.** Toda semana só duplicar e mudar texto.

### 8.3 Template de Reels (criar 1x, usar N vezes)

**No CapCut:**
1. Resolução: 1080×1920 (9:16).
2. Background: `#0a0a0a` (dark mode studio vibe).
3. Texto na tela: Inter 800, 60-80pt, branco, centralizado, fundo semi-transparente preto.
4. Accent: número ou palavra-chave em `#00e85e` (verde brilhante).
5. Duração: 15-30s (Reels curtos) ou 30-60s (Reels longos).

**Salvar como preset.** Trocar conteúdo a cada post.

---

## 9. Checklist de setup (1 tarde)

| Passo | Tempo | Onde |
|-------|-------|------|
| Adicionar Inter, Space Mono, Press Start 2P ao Canva | 10 min | Canva Brand Kit |
| Adicionar 12 hex codes da paleta ao Canva | 10 min | Canva Brand Kit |
| Criar 1 template de carrossel (5-7 slides) | 45 min | Canva |
| Criar 1 template de Reels (1080×1920, dark) | 30 min | CapCut |
| Criar wordmark simples "ADScale" em Inter 800 + detalhe verde | 30 min | Canva |
| Testar export: PNG do carrossel + MP4 do Reels | 15 min | — |
| **Total** | **~2h20** | — |

**Quando:** uma tarde de sábado. Pronto pra rodar na segunda.

---

## 10. Anti-padrões (o que NÃO fazer)

Pra manter consistência com o design system:

- ❌ Gradiente no texto (tipo "ADScale" com gradient rainbow).
- ❌ Glassmorphism exagerado (cards com blur empilhado).
- ❌ Borders com stripe colorida lateral.
- ❌ Pure `#000` ou `#fff` (usar `--ink` e tokens de texto).
- ❌ Purple/indigo como accent (queimou no mercado de AI).
- ❌ Fonte pixel em texto longo (manter só pra impacto).
- ❌ Múltiplos acentos competindo (verde é o accent, não verde + amarelo + rosa + roxo).

---

*Mantido em `marketing/2026-Q3/` · PT-BR · Última atualização: 2026-06-23*
