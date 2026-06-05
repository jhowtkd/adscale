---
name: ADScale
description: Product UI for AI-powered static ad creative production — fast, expert, neon-accented studio energy.
colors:
  deep-bg-light: "#fafafa"
  surface-base-light: "#ffffff"
  surface-raised-light: "#f5f5f5"
  text-primary-light: "#0a0a0a"
  text-secondary-light: "#444444"
  text-muted-light: "#525252"
  accent-green-light-mode: "#00b34a"
  accent-green-bright-light: "#00e85e"
  accent-green-dark-light: "#007a33"
  accent-rose-light: "#d43d5c"
  accent-amber-light: "#c7920a"
  deep-bg-dark: "#0a0a0a"
  surface-base-dark: "#111111"
  surface-raised-dark: "#1a1a1a"
  text-primary-dark: "#ffffff"
  text-secondary-dark: "#888888"
  accent-green-dark-mode: "#00e85e"
  accent-green-bright-dark: "#3fff80"
  ink: "#0a0a0a"
typography:
  display:
    fontFamily: '"Press Start 2P", cursive'
    fontSize: "clamp(3rem, 8vw, 7rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "normal"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 4rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.8
    letterSpacing: "normal"
  label:
    fontFamily: '"Space Mono", ui-monospace, Menlo, monospace'
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.2em"
rounded:
  sm: "2px"
  md: "4px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "clamp(6rem, 15vh, 12rem)"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-green-light-mode}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-cta-green:
    backgroundColor: "{colors.accent-green-light-mode}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  card-surface:
    backgroundColor: "{colors.surface-base-light}"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

## Overview: The Creative Studio at 2am

**Professional without losing energy.** ADScale is a productivity surface for marketers and designers: organized like a best-in-class app (Linear-level structure), with streetwear-level accent punch (electric green, pixel moments, dark-depth contrast).

**Color strategy:** Restrained neutrals + green accent ≤10% on product screens; marketing surfaces may go **Committed** (more ink + green contrast). Default theme is **light** (`next-themes`); dark mode deepens backgrounds for long review sessions.

**Scene:** A trafficker at a desk, mid-campaign, scanning a gallery of AI derivations before export. Ambient office light; UI stays calm, status and CTAs read instantly.

**Motion:** Purposeful, ease-out-expo / out-quint; no bounce. Respect `prefers-reduced-motion`.

Implementation tokens live in `app/src/app/globals.css` as CSS custom properties (`--deep-bg`, `--accent-green`, etc.). Prefer tokens over raw hex in components.

## Colors: Electric Green on Tinted Neutrals

| Role | Light (`:root`) | Dark (`.dark`) | Usage |
|------|-----------------|----------------|--------|
| Canvas | `#fafafa` | `#0a0a0a` | `--deep-bg` page background |
| Surface | `#ffffff` / `#f5f5f5` | `#111111` / `#1a1a1a` | `--surface-base`, `--surface-raised` |
| Text | `#0a0a0a` → muted steps | `#ffffff` → `#888888` | `--text-primary`, `--text-secondary`, `--text-muted` |
| Primary accent | `#00b34a` / `#00e85e` hover | `#00e85e` / `#3fff80` hover | CTAs, active nav, focus ring |
| Semantic | `#c7920a` amber, `#d43d5c` rose | same family | warnings, destructive |

- Green is **accent**, not a full bleed surface on dashboard views.
- Status badges use tinted backgrounds + dot color; badge text stays `--text-primary` or `--accent-green-text` for contrast.
- **Do not** use purple/indigo as brand accents. **No** pure `#000` / `#fff` in new work; use `--ink` and theme text tokens (impeccable OKLCH migration can happen incrementally in CSS).

## Typography: Inter + Mono Labels + Pixel Impact

| Role | Stack | Typical use |
|------|-------|-------------|
| UI / body | Inter | Tables, forms, descriptions (max ~65–75ch in marketing copy blocks) |
| Labels / indices | Space Mono, uppercase, wide tracking | `(01)` section labels, badges |
| Impact | Press Start 2P | Sparingly: hero stats, primary marketing CTAs |

Hierarchy via **scale + weight** (≥1.25 ratio between steps). Page titles ~18px semibold; body 14–15px; KPI/display via clamp on marketing only.

## Elevation: Tonal Layers + Subtle Lift

Product UI is mostly **flat tonal layering** (`deep-bg` → `surface-base` → `surface-raised`) with 1px `--border-dim` borders.

- **Cards:** `glass-card` utility where documented; hover: slight translate-y + shadow (`duration-300`, ease-out), not layout-thrashing transforms.
- **Overlays:** top bar / dropdowns use raised surface + soft shadow (`0 24px 80px rgba(0,0,0,0.1)` in light).
- **Marketing:** optional ambient green radial glow (low opacity), dot grids, grain overlay on light sections only.
- **Banned:** nested cards, side-stripe colored borders, gradient text.

## Components

**App shell:** icon sidebar (64px) + `h-14` top bar; main `pt-14`; mobile bottom nav (4 cols). Max content width 1400px; dashboard grids `gap-3`.

**Buttons:** shadcn default maps to green accent; marketing `.btn-primary` ink fill with green hover slide; `.btn-pill` full radius green.

**Inputs:** `surface-raised` background, `--border-medium`, 13px type, focus ring on `--accent-green`.

**Cards / panels:** `rounded-xl`, compact `p-4`, flex column gaps; use `glass-card` instead of hand-rolled borders when possible.

**Status:** dot + label on semantic tinted bg (draft, processing, completed, failed tokens in CSS).

**Icons:** Lucide, 14–18px, ghost → green on active/hover.

**Theme toggle:** `ThemeToggle` in TopBar; persists via `next-themes`.

## Do's and Don'ts

### Do

- Optimize for **speed to exportable variations** (clear primary actions, visible job/status state).
- Use green sparingly for **progress, success, and primary CTAs**.
- Keep section rhythm with varied spacing (8px grid; larger gaps between major blocks).
- Number marketing sections `(01)`, `(02)` in mono green for editorial structure.
- Show **actionable errors** in campaign workspace before users blame generation quality.

### Don't

- Slide into **gray generic SaaS** (anonymous layouts, timid typography, no brand pulse).
- Use **AI slop** templates: identical card grids, hero metrics, glassmorphism as wallpaper, gradient text.
- Overuse pixel font in product chrome (dashboard, settings, forms).
- Animate layout properties (width/height/top/left); use opacity/transform.
- Break briefing/brand/CTA contracts in UI copy or empty states that imply features we do not ship.
