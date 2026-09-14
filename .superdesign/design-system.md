# ADScale design system

Product: ADScale is a dark, forced-theme creative studio for branded ads and social pieces. Portuguese UI. Job: go from a free-text request (or a reference image) to a generated peça without a wizard.

## Product context

- Shell: floating v6 sidebar (17.5rem, 1rem radius, blur + stacked shadow) + main offset left. Desktop only; mobile uses bottom nav.
- Primary destinations: Estúdio `/`, Trabalhos `/campaigns`, Biblioteca `/library`, Marca `/brand-kit`.
- Studio home (`/`, progressive rollout) is the operational start: compositor first, then continue-work, then (intended) inspirations of the active brand.
- Canonical inspirations sources: curated ADScale selection, approved works, templates. Clicking an inspiration attaches it to the composer as style reference. Origin label stays visible. No external feed.

## Key pages

- `/` Estúdio (progressive): header ESTÚDIO + “O que você quer criar?”, continue card, composer card, empty canvas below (current problem).
- `/campaigns` Trabalhos list
- `/library` assets
- `/brand-kit` brand training
- `/settings` account, billing, team

## Branding & styling (hard constraints)

Forced dark. Inter + Space Mono only. **Chromatic correction (user 2026-08-31):** the shipped product tokens are hue 145 green; this exploration must NOT use that green cast. Surfaces are near-achromatic charcoal. Accent is ivory, not mint.

**Fonts:** Inter (`--font-sans`, `--font-heading`) for UI; Space Mono (`--font-mono`) for labels/meta (ESTÚDIO, credits, timestamps); Press Start 2P only for rare pixel moments — not this page.

**Dark tokens — Neutral Cinema (overrides hue-145 source CSS for this draft):**

| Token | Value |
|---|---|
| canvas | `oklch(0.145 0.004 260)` |
| surface-base | `oklch(0.175 0.004 260)` |
| surface-raised | `oklch(0.21 0.005 260)` |
| surface-inset | `oklch(0.12 0.003 260)` |
| text-primary | `oklch(0.96 0.005 260)` |
| text-secondary | `oklch(0.72 0.006 260)` |
| text-muted | `oklch(0.62 0.005 260)` |
| accent-primary | `oklch(0.93 0.012 90)` |
| action-primary-bg | accent-primary |
| action-primary-text | `oklch(0.16 0.01 260)` |
| border-subtle | white / 0.06 |
| border-default | white / 0.10 |
| border-strong | white / 0.20 |
| focus-ring | `oklch(0.78 0.01 260 / 0.45)` |
| selection-bg | `oklch(0.78 0.01 260 / 0.12)` |
| selection-text | `oklch(0.92 0.01 260)` |
| danger-text | `oklch(0.72 0.19 18)` |
| info-dot | `oklch(0.7 0.12 250)` |

Do not use `oklch(... 145)` anywhere in this exploration. Do not introduce neon, pink, or a second brand hue.

**Type scale:** caption 0.75rem, label 0.8125rem, body 0.875rem, body-lg/section 1rem, page title 1.25rem / semibold (`product-page-title`), display 1.5rem.

**Radius:** control/panel 0.5rem, object/overlay 0.75rem, v6 shell 1rem, pill 9999px.

**Spacing:** space-1…7 (4–48px). Page gutters 16/24/32. Content max on progressive studio: `max-w-4xl` until results (`max-w-6xl`).

**Shadows:** floating `0 12px 32px`; overlay `0 24px 80px`; v6 shell `0 16px 40px rgb(0 0 0 / 0.65)` + inset highlight + `backdrop-filter: blur(24px)`.

**Logo:** outlined ADSCALE wordmark SVG. In the sidebar it is inverted white (`filter: brightness(0) invert(1)`, opacity 0.88), height 22px, max-width 130px, centered. Never replace with initials, emoji, or a generic mark.

## Motion

duration-fast 120ms, default 180ms, slow 280ms. ease-product `cubic-bezier(0.4, 0, 0.2, 1)`.

## Layout structure (studio progressive, first paint)

Desktop split:

1. **Left aside** `.v6-shell-sidebar`: logo → 4 icon nav (Estúdio active) → brand kit card (name + “Pronta”) → “Trabalhos Recentes” groups → Docs / Configurações / Feedback → account row (initials disc + name + credits) → Sair.
2. **Main**: top-right notification bell (9+ badge) is in a slim header, not a full topbar on desktop. Content column `max-w-4xl mx-auto px-4 py-8 space-y-6`.
   - Header row: ESTÚDIO (mono 10px uppercase tracking) + h1 “O que você quer criar?” | “+ Nova campanha” outline button + native brand select “Cenbrap”.
   - Continue card: “Continuar de onde parei”, work title, meta, thumbnail 48px.
   - Composer card: raised surface, title + subtitle, dashed dropzone, empty textarea 4 rows, paperclip “Adicionar arte ou referência ou arraste e solte aqui”.
   - **Current gap:** no inspirations gallery. BrandInspirations is a sheet trigger and only mounts after an objective is selected. The bottom ~40% of the main canvas is empty black.

## Controls

- Primary button: accent fill, dark text, radius-control, min-h-10, 14px semibold.
- Secondary: 1px border-default, transparent/raised fill.
- Native select for brand switcher (not a custom dropdown).
- Icon nav: min-h-14, 10px labels, 18px lucide icons; active uses `--active-navigation-bg`.

## Inspirations (intended product, not current code)

Section title in Portuguese. Horizontal or grid of image tiles from the active brand: templates, approved peças, curated selection. Each tile: preview image, title, origin chip. Click attaches as style reference. This section should fill the empty main area so the studio feels like a creative surface, not a blank form.
