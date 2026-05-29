# Ad Scale — Design System

## Atmosphere

**Professional sem perder a energia.** O Ad Scale é uma ferramenta de produtividade para profissionais de marketing, mas não é mais um SaaS cinza e sem alma. A vibe é de **startup jovem e confiante** — tipo Linear na organização, mas com o punch visual de uma marca de streetwear.

A atualização traz um verde mais vibrante e elétrico (#00e85e), tipografia pixel para momentos de impacto, e uma estética que mistura precisão técnica com atitude criativa.

- **Tom**: Jovial e energético, mas nunca infantil
- **Sensação**: Você está usando uma ferramenta de gente grande, mas que entende seu dia a dia
- **Metáfora**: Um estúdio criativo às 2am — focado, intenso, mas com estilo
- **Contraste**: Dark theme profundo com acentos neon vibrantes que "pulsam" de energia

## Color Palette

### Theme System
The app supports **Light** and **Dark** modes via CSS custom properties. The `next-themes` library manages theme switching with `defaultTheme="light"`.

### Light Mode (Default)

#### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| --deep-bg | #fafafa | Page background, deepest layer |
| --surface-base | #ffffff | Cards, panels, sidebar |
| --surface-raised | #f5f5f5 | Elevated surfaces, hover states |
| --cream | #f8f8f8 | Alternate section backgrounds |

#### Text
| Token | Hex | Usage |
|-------|-----|-------|
| --text-primary | #0a0a0a | Headings, primary text |
| --text-secondary | #555555 | Body text, descriptions |
| --text-muted | #888888 | Placeholders, disabled text |
| --ghost | #666666 | Secondary info, meta text, numbering |

#### Borders
| Token | Hex | Usage |
|-------|-----|-------|
| --border-dim | rgba(0,0,0,0.06) | Dividers, card borders, subtle separators |
| --border-medium | rgba(0,0,0,0.12) | Input borders, focus rings |
| --pale | #e8e8e8 | Light borders, dividers |

#### Accents
| Token | Hex | Usage |
|-------|-----|-------|
| --accent-green | #00b34a | Primary actions, active states, links, CTAs |
| --accent-green-light | #00e85e | Hover states, highlights, glows |
| --accent-green-dark | #007a33 | Checkmarks on light backgrounds |
| --accent-green-dim | rgba(0,179,74,0.12) | Subtle backgrounds for active items |
| --accent-amber | #c7920a | Warnings, processing states |
| --accent-rose | #d43d5c | Errors, destructive actions |
| --accent-secondary | #6b6b7b | Neutral accents |

### Dark Mode

#### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| --deep-bg | #0a0a0a | Page background, deepest layer |
| --surface-base | #111111 | Cards, panels, sidebar |
| --surface-raised | #1a1a1a | Elevated surfaces, hover states |
| --cream | #f8f8f8 | Alternate section backgrounds (landing/marketing) |

#### Text
| Token | Hex | Usage |
|-------|-----|-------|
| --text-primary | #ffffff | Headings, primary text |
| --text-secondary | #888888 | Body text, descriptions |
| --text-muted | #555555 | Placeholders, disabled text |
| --ghost | #bbbbbb | Secondary info, meta text, numbering |

#### Borders
| Token | Hex | Usage |
|-------|-----|-------|
| --border-dim | rgba(255,255,255,0.04) | Dividers, card borders, subtle separators |
| --border-medium | rgba(255,255,255,0.08) | Input borders, focus rings |
| --pale | #e8e8e8 | Light borders, dividers (light bg) |

#### Accents
| Token | Hex | Usage |
|-------|-----|-------|
| --accent-green | #00e85e | Primary actions, active states, links, CTAs |
| --accent-green-light | #3fff80 | Hover states, highlights, glows |
| --accent-green-dark | #00a844 | Checkmarks on light backgrounds |
| --accent-green-dim | rgba(0,232,94,0.12) | Subtle backgrounds for active items |
| --accent-amber | #D4A017 | Warnings, processing states |
| --accent-rose | #E11D48 | Errors, destructive actions |
| --accent-secondary | #8d8d98 | Neutral accents |

### Status Colors
| Status | Background | Text | Dot |
|--------|-----------|------|-----|
| Draft | rgba(180,180,190,0.12) | --text-primary | #8d8d98 |
| Active/Completed | --accent-green-dim | --text-primary | --accent-green |
| Processing/Queued | rgba(245,158,11,0.16) | --text-primary | #F59E0B |
| Failed/Rejected | rgba(244,63,94,0.16) | --text-primary | #F43F5E |

## Typography

### Font Stack
- **Sans-serif**: Inter, ui-sans-serif, system-ui, sans-serif
- **Mono / Labels**: "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace
- **Pixel / CTAs**: "Press Start 2P", cursive
- **Headings**: Inter (semibold/extrabold), occasional pixel for impact

### Scale
| Size | Tailwind | Usage |
|------|----------|-------|
| 10-11px | text-[10px] | Labels, badges, captions (mono, uppercase, tracking wide) |
| 12px | text-xs | Badges, labels |
| 13px | text-[13px] | Buttons, inputs, table cells |
| 14px | text-sm | Body text, descriptions, card content |
| 15px | text-[15px] | Body descriptions (comfortable reading) |
| 16px | text-base | Card titles, section headings |
| 18px | text-lg | Page titles |
| display | clamp(3rem, 8vw, 7rem) | Hero headlines |
| headline | clamp(2rem, 5vw, 4rem) | Section titles |

### Weights
- **Extrabold (800)**: Hero headlines only
- **Bold (700)**: Card titles, emphasis
- **Semibold (600)**: Page titles, KPI values, FAQ questions
- **Medium (500)**: Buttons, nav items, labels
- **Regular (400)**: Body text, descriptions

### Formatting Rules
- **Labels/badges**: ALL CAPS + wide tracking (0.2-0.4em) + mono font
- **Section numbering**: `(01)`, `(02)` pattern in green + mono
- **Stats/CTAs**: pixel font, large size, tight tracking
- **Body max width**: 500-600px for comfortable reading

## Spacing

### System (8px base)
| Size | Usage |
|------|-------|
| 4px | Tight gaps (icon to text) |
| 8px | Compact spacing |
| 12px | Small internal padding |
| 16px | Standard gap |
| 24px | Card internal padding (compact) |
| 32px | Card padding (standard) |
| 40px | Section element gaps |
| 64px | Between major blocks |
| clamp(6rem, 15vh, 12rem) | Between page sections |

### Layout
- **Page padding**: px-6 (mobile), px-10 (desktop)
- **Max content width**: 1400px
- **Max narrow content**: 900px (FAQ, CTA)
- **Sidebar width**: 64px (icon-only), 240px (expanded)
- **Top bar height**: 56px (h-14)
- **Dashboard grid gap**: 12px (gap-3)

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| --radius-sm | 2px | Minimal rounding, skeletons |
| --radius-md | 4px | Buttons, inputs, small elements |
| --radius-lg | 8px | Cards, panels |
| --radius-xl | 12px | Large cards, modals |
| --radius-full | 9999px | Avatars, badges, pills |

## Component Patterns

### Cards

#### Standard Card
```
glass-card
rounded-xl (8px)
py-4 px-4
gap-4 (flex flex-col)
transition-all duration-300 ease-out
hover:shadow-lg hover:-translate-y-0.5
```

**Note:** Use `glass-card` utility class instead of manual `bg-[var(--surface-base)] border border-[var(--border-dim)]`. The glass-card adapts to light/dark mode automatically.

#### Glass Card (dark)
```css
background: rgba(255, 255, 255, 0.02);
backdrop-filter: blur(12px);
border: 1px solid rgba(255, 255, 255, 0.04);
border-radius: 8px;
```

#### Glass Card (light)
```css
background: rgba(255, 255, 255, 0.5);
backdrop-filter: blur(12px);
border: 1px solid rgba(10, 10, 10, 0.04);
border-radius: 8px;
```

### Buttons

#### Primary (`.btn-primary`)
- Background: ink (#0a0a0a)
- Text: white, pixel font, 9px, uppercase, wide tracking
- Padding: 20px 40px
- Hover: green fill slides up from bottom (translateY animation)
- Hover text: ink
- Optional: `animate-pulse-glow` for emphasis

#### Default (shadcn)
```
bg-accent-green text-ink rounded-lg h-8 px-2.5
font-sans text-sm font-medium
hover:bg-accent-green-light
```

#### Outline
```
border-border bg-transparent hover:bg-surface-raised
```

#### Pill (`.btn-pill`)
- Background: green
- Text: ink, mono font, 12px, semibold
- Padding: 14px 32px
- Border-radius: 100px (full)
- Hover: scale(1.03) + green glow shadow

### Inputs
```
bg-[#1a1a1a] (surface-raised)
border border-white/[0.08]
rounded-[4px]
text-[13px] text-white
focus:ring-1 focus:ring-[#00e85e]
```

### Badges/Chips
```
px-4 py-2 rounded-full
border border-ink/[0.06] bg-white/60 backdrop-blur-sm
text-[10px] font-mono uppercase tracking-[0.2em] text-muted
```

### Status Badges
- Use colored dot + text on subtle background
- Text always --text-primary for WCAG AA contrast
- Dot color indicates status meaning

## Shadows & Effects

### Glass Backdrop
```css
glass-backdrop: rgba(10,10,10,0.88) + backdrop-filter: blur(16px)
glass-backdrop-strong: rgba(10,10,10,0.96) + backdrop-filter: blur(20px)
```

### Ambient Effects
```css
/* Radial glow */
.absolute .w-[600px] .h-[400px] .bg-green/[0.03] .rounded-full .blur-[100px]

/* Dot grid */
background-image: radial-gradient(circle, #color 1px, transparent 1px);
background-size: 32px 32px;

/* Film grain */
.grain::after { /* SVG noise texture, animated */ }
```

### Card Hover
```css
transition-all duration-300 ease-out
hover:shadow-lg hover:-translate-y-0.5
```

## Animations

### Easings
| Name | Value | Usage |
|------|-------|-------|
| --ease-default | cubic-bezier(0.4, 0, 0.2, 1) | Standard transitions |
| --ease-spring | cubic-bezier(0.16, 1, 0.3, 1) | Enter animations |
| --ease-out-expo | cubic-bezier(0.19, 1, 0.22, 1) | Fade-in, quick reveals |
| --ease-in-out | cubic-bezier(0.4, 0, 0.6, 1) | Symmetric transitions |
| out-expo | cubic-bezier(0.16, 1, 0.3, 1) | Reveals, transforms |
| out-quint | cubic-bezier(0.22, 1, 0.36, 1) | Subtle movements |

### Durations
| Duration | Usage |
|----------|-------|
| 300ms | Color transitions, opacity, scale |
| 500ms | Hover states, interactive feedback |
| 700ms | Navbar transitions, major state changes |
| 1000ms | Page element reveals |
| 1200ms | Split text, dramatic reveals |

### Key Animations
| Animation | Duration | Easing |
|-----------|----------|--------|
| fade-in | 250ms | --ease-out-expo |
| pulse-dot | 2s | ease-in-out (infinite) |
| pulse-glow | 2s | ease-in-out (infinite) |
| shimmer | 1.5s | linear (infinite) |
| shake | 400ms | ease-in-out |
| spin-slow | varies | linear |
| float | 6s | ease-in-out (infinite) |
| marquee | 45s | linear (infinite) |
| grain | 8s | steps (infinite) |

### Reveal Patterns
| Pattern | Description |
|---------|-------------|
| FadeUp | opacity 0 + translateY(30px) to visible |
| SplitText | Word-by-word reveal with stagger |
| DrawLine | Horizontal line scales from left (scaleX 0->1) |
| TypeLoop | Typewriter effect cycling through words |

### Hover Interactions
- Cards: `-translate-y-0.5` + subtle shadow
- List items: background tint + text darkens
- Stat numbers: color transition to green
- Links: color transition to green
- Magnetic: slight follow-cursor displacement on hover

## Layout Patterns

### Section Structure
```
<section className="py-section px-6 sm:px-10 relative">
  <div className="max-w-[1400px] mx-auto">
    {/* Label */}
    <span className="font-mono text-[10px] text-green uppercase tracking-[0.4em] block mb-12 sm:mb-16">
      (01) Section Name
    </span>

    {/* Headline with split layout */}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-20">
      <div className="lg:col-span-7">
        <h2 className="text-headline font-sans font-extrabold text-white">...</h2>
      </div>
      <div className="lg:col-span-5 flex items-end">
        <p className="text-[15px] text-muted leading-[1.8]">...</p>
      </div>
    </div>

    {/* Content */}
  </div>
</section>
```

### Dark Sections
- Background: bg-ink (#0a0a0a)
- Add dot grid: radial-gradient, opacity 0.012-0.015
- Add ambient glow: large blurred green circle, opacity 0.03-0.04
- Text: white with opacity scale (0.25 to 1.0)
- Borders: white/[0.04] to white/[0.08]

### Light Sections
- Background: bg-white or bg-cream
- Borders: ink/[0.05] to ink/[0.08]
- Grain overlay: .grain class for texture

### Dashboard Grid
```
KPIs: grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3
Main: grid-cols-[1fr_320px] gap-3
```

### App Shell
```
Sidebar: fixed left-0, 64px wide (desktop icon-only)
TopBar: fixed, h-14
Main: min-h-screen, pt-14, md:ml-[sidebar-width]
Mobile nav: fixed bottom-0, grid-cols-4
```

## Responsive Breakpoints

| Breakpoint | Tailwind | Behavior |
|------------|----------|----------|
| Mobile | default | Bottom nav, single column, hamburger menu, px-6 |
| sm | 640px | 2-col grids, larger padding |
| lg | 1024px | Full 12-col grid, desktop nav, px-10 |

### Mobile Specifics
- Hamburger menu: 2-line animated (rotates to X)
- Full-screen mobile overlay with staggered link reveal
- Stat cards: 2-column grid maintained
- Feature list: stacked single column
- Pricing: stacked with featured card still scaled

## Iconography

- Library: Lucide React
- Default size: 14-18px
- Stroke width: 1.5 (default) to 2.5 (emphasis)
- Colors: ghost (resting) -> green (hover/active)
- Container: rounded-md or rounded-full, bg-ink/[0.02] or bg-green/10

## Accessibility

- Skip link to main content (sr-only until focused)
- Focus rings: ring-[var(--accent-green)] / ring-1
- Reduced motion: all animations disabled with media query
- WCAG AA contrast on all status badge text (uses --text-primary)
- aria-label on icon-only buttons and nav items

## Theme Toggle

A `ThemeToggle` component is available in `components/ui/ThemeToggle.tsx`. It uses `next-themes` and is integrated into the `TopBar`.

- **Default theme**: Light mode
- **Toggle position**: TopBar, next to LanguageSwitcher
- **Animation**: Smooth Sun/Moon icon transition with rotation
- **Persistence**: User preference is saved in localStorage

## Do's and Don'ts

### Do
- Use extreme whitespace between sections
- Layer subtle backgrounds (grain + dots + gradient)
- Make hover states feel rewarding (color + scale + translate)
- Use numbered labels for editorial feel
- Keep body text at comfortable width (max 500-600px)
- Use green sparingly as accent, not as primary surface

### Don't
- Use purple, indigo, or violet
- Add too many competing animations
- Use borders heavier than 1-2px
- Use full opacity for secondary text
- Break the 8px spacing grid
- Use more than 3 font weights per view
- Use gradient text (background-clip: text)
- Use side-stripe borders as accents
- Nest cards within cards
