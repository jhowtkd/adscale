---
name: ADScale
description: Product UI for AI-powered static ad creative production — calm Neutral Cinema studio, graphite in light and ivory in dark.
colors:
  canvas-light: "oklch(0.965 0.004 260)"
  surface-base-light: "oklch(0.992 0.003 260)"
  surface-raised-light: "oklch(0.955 0.004 260)"
  text-primary-light: "oklch(0.18 0.012 260)"
  text-secondary-light: "oklch(0.38 0.01 260)"
  text-muted-light: "oklch(0.40 0.008 260)"
  accent-graphite-light: "oklch(0.32 0.025 260)"
  canvas-dark: "oklch(0.145 0.004 260)"
  surface-base-dark: "oklch(0.175 0.004 260)"
  surface-raised-dark: "oklch(0.21 0.005 260)"
  text-primary-dark: "oklch(0.96 0.005 260)"
  text-secondary-dark: "oklch(0.72 0.006 260)"
  accent-ivory-dark: "oklch(0.93 0.012 90)"
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
    backgroundColor: "{colors.accent-graphite-light}"
    textColor: "oklch(0.98 0.005 260)"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "oklch(0.28 0.02 260)"
    textColor: "oklch(0.98 0.005 260)"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  card-surface:
    backgroundColor: "{colors.surface-base-light}"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

## Overview: Neutral Cinema

**Professional without losing energy.** ADScale is a productivity surface for marketers and designers: organized like a best-in-class app (Linear-level structure), with restrained cinema lighting instead of neon punch.

**Color strategy:** Cool graphite neutrals (hue 260) in light; the same hue in dark with an ivory accent (hue 90). Semantic green/amber/rose stay on status only. Default theme is **light** (`next-themes`); dark mode deepens the canvas for long review sessions.

**Scene:** A trafficker at a desk, mid-work, scanning a gallery of AI pieces before export. Ambient office light; UI stays calm, status and CTAs read instantly.

**Motion:** Purposeful, ease-out-expo / out-quint; no bounce. Respect `prefers-reduced-motion`.

Implementation tokens live in `app/src/app/globals.css` as CSS custom properties (`--canvas`, `--accent-primary`, `--surface-base`, etc.). Prefer tokens over raw hex in components. Electric green (`--accent-green`) is not a production token.

## Colors: Graphite / Ivory on Cool Neutrals

| Role | Light (`:root`) | Dark (`.dark`) | Usage |
|------|-----------------|----------------|--------|
| Canvas | `oklch(0.965 0.004 260)` | `oklch(0.145 0.004 260)` | `--canvas` / `--deep-bg` page background |
| Surface | `oklch(0.992 0.003 260)` / `oklch(0.955 0.004 260)` | `oklch(0.175 0.004 260)` / `oklch(0.21 0.005 260)` | `--surface-base`, `--surface-raised` |
| Text | `oklch(0.18 0.012 260)` → muted steps | `oklch(0.96 0.005 260)` → `oklch(0.72 0.006 260)` | `--text-primary`, `--text-secondary`, `--text-muted` |
| Primary accent | Graphite `oklch(0.32 0.025 260)` | Ivory `oklch(0.93 0.012 90)` | CTAs, active nav, `--accent-primary` |
| Semantic | Success / warning / danger / info families in CSS | same families | status only — not brand accent |

- Accent is **graphite (light) or ivory (dark)**, not a green bleed on product screens.
- Status badges use tinted backgrounds + dot color; badge text stays `--text-primary` or the matching `--*-text` token.
- **Do not** use purple/indigo as brand accents. **Do not** reintroduce `--accent-green` in product CSS. Use `--accent-primary` and semantic status tokens.

## Typography: Inter + Mono Labels + Pixel Impact

| Role | Stack | Typical use |
|------|-------|-------------|
| UI / body | Inter | Tables, forms, descriptions (max ~65–75ch in marketing copy blocks) |
| Labels / indices | Space Mono, uppercase, wide tracking | `(01)` section labels, badges |
| Impact | Press Start 2P | Sparingly: hero stats, primary marketing CTAs |

Hierarchy via **scale + weight** (≥1.25 ratio between steps). Page titles ~18px semibold; body 14–15px; KPI/display via clamp on marketing only.

## Elevation: Tonal Layers + Subtle Lift

Product UI is mostly **flat tonal layering** (`canvas` → `surface-base` → `surface-raised`) with 1px `--border-subtle` borders.

- **Cards:** `glass-card` utility where documented; hover: slight translate-y + shadow (`duration-300`, ease-out), not layout-thrashing transforms.
- **Overlays:** top bar / dropdowns use raised surface + soft shadow (`--shadow-overlay`).
- **Banned:** nested cards, side-stripe colored borders, gradient text.

## Components

**App shell:** icon sidebar (64px) + `h-14` top bar; main `pt-14`; mobile bottom nav (4 cols). Max content width 1400px; dashboard grids `gap-3`.

**Buttons:** shadcn default maps to `--accent-primary` (graphite in light, ivory in dark).

**Inputs:** `surface-raised` background, `--border-default`, 13px type, focus ring on `--focus-ring`.

**Cards / panels:** `rounded-xl`, compact `p-4`, flex column gaps; use `glass-card` instead of hand-rolled borders when possible.

**Status:** dot + label on semantic tinted bg (draft, processing, completed, failed tokens in CSS).

**Icons:** Lucide, 14–18px, ghost → accent on active/hover.

**Theme toggle:** `ThemeToggle` in TopBar; persists via `next-themes`.

## Do's and Don'ts

### Do

- Optimize for **speed to exportable pieces** (clear primary actions, visible job/status state).
- Use accent sparingly for **primary CTAs and focus**; keep success/warning/danger on status tokens.
- Keep section rhythm with varied spacing (8px grid; larger gaps between major blocks).
- Show **actionable errors** in the Estúdio before users blame generation quality.

### Don't

- Slide into **gray generic SaaS** (anonymous layouts, timid typography, no brand pulse).
- Use **AI slop** templates: identical card grids, hero metrics, glassmorphism as wallpaper, gradient text.
- Overuse pixel font in product chrome (Estúdio, settings, forms).
- Animate layout properties (width/height/top/left); use opacity/transform.
- Document electric green as the product accent — production is Neutral Cinema.
- Break briefing/brand/CTA contracts in UI copy or empty states that imply features we do not ship.
