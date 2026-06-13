# Phase 109: Visual Foundations and Baseline - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Define the visual foundation that constrains Phases 110–114: canonical surface rules, semantic tokens, geometry and density contracts, layer ordering, authenticated route ownership, and representative browser baselines. This phase establishes and proves the system; broad route migration remains in later phases and existing product behavior must not change.

</domain>

<decisions>
## Implementation Decisions

### Surface model
- Tonal planes are the default page structure: canvas, base surface and raised surface establish hierarchy before containers are introduced.
- Static sections should remain open or use a tonal change; they should not become cards merely to create separation.
- Cards are reserved for actionable domain objects such as campaigns, derivations, learnings or selectable items.
- Nested cards are not part of the target vocabulary.

### Glass, elevation and separation
- `glass-card` may remain on actionable objects where it reinforces inspectability or selection, but it must not be the default wrapper for static sections or page structure.
- Sections are separated primarily through spacing rhythm, section headings, tonal backgrounds and 1px dividers.
- Shadows are reserved for floating elements such as menus, popovers, dialogs, sheets and other overlays; ordinary page panels should not lift decoratively.

### Carried milestone direction
- The authenticated app should feel compact and professional, not spacious/editorial or visually playful.
- Existing electric-green identity remains, used as a restrained accent for primary actions, focus, active selection and meaningful status.
- Hierarchy, density and competing actions may be reorganized, but no capability, business rule, permission or workflow contract may change.
- The system must support the complete authenticated app from mobile through ultrawide.

### Claude's Discretion
- Exact semantic token names and whether canonical values migrate to OKLCH in this phase or through aliases first.
- Exact typography, spacing, radius, border and motion scales, provided the result remains compact, professional and accessible.
- Exact content-width recipes for reading, forms, operational pages, dense data and galleries.
- Exact numeric z-index/layer scale and geometry token values.
- Selection of representative authenticated routes, fixtures and states for the Phase 109 baseline, provided every route/family receives one later-phase owner and a Phase 114 browser scenario.
- Whether foundation contracts are encoded only in CSS/utilities or accompanied by small shared primitives, provided broad route migration is deferred.

</decisions>

<specifics>
## Specific Ideas

- The visual target is a professional production tool where hierarchy comes from tonal depth and disciplined spacing, not repeated bordered boxes.
- Keep cards visually meaningful: seeing a card should imply an object the user can inspect, select or act on.
- Preserve metadata required by expert users; later phases should use hierarchy or progressive disclosure instead of deleting context to make screens look cleaner.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/app/globals.css`: existing light/dark semantic variables, shadcn mappings, status tokens, radii and easing are the starting point for the canonical contract.
- `app/src/components/ui/`: existing button, input, select, dialog, sheet, dropdown, table, badge, status, empty and skeleton primitives should be consolidated rather than replaced by another UI kit.
- `PRODUCT.md` and `DESIGN.md`: already define product register, restrained green strategy, typography, accessibility intent and anti-patterns.

### Established Patterns
- Tailwind utilities consume CSS custom properties; foundation changes should preserve this integration and support incremental migration.
- Existing route widths diverge (`max-w-[1600px]`, `max-w-7xl`, `max-w-6xl`, `max-w-[1100px]`, `max-w-[720px]`, `max-w-[560px]`), so Phase 109 must classify width recipes rather than force one universal maximum.
- `glass-card`, rounded panels, local borders and raw shadow/radius values are widely repeated; the phase should define usage rules and migration targets without rewriting every consumer.
- Prior product phases consistently preserve operational metadata and use compact dashboard modules; the new foundation should clarify these patterns rather than erase them.

### Integration Points
- `app/src/app/globals.css` for canonical semantic, geometry, density, layer and motion tokens.
- Shared UI primitives under `app/src/components/ui/` for representative state and vocabulary proof.
- `app/src/components/layout/AppShell.tsx` and `TopBar.tsx` as evidence inputs for geometry/layer contracts; their full responsive migration belongs to Phase 110.
- Authenticated routes under `app/src/app/(dashboard)/` and feature families under `app/src/components/` for the ownership and browser-scenario matrix.

</code_context>

<deferred>
## Deferred Ideas

- Full shell and navigation migration — Phase 110.
- Broad operational page and component migration — Phase 111.
- Campaign workspace, sticky action and overlay migration — Phase 112.
- Dashboard and secondary route consistency, localization and accessibility remediation — Phase 113.
- Full viewport/language/theme regression gate — Phase 114.

</deferred>

---

*Phase: 109-visual-foundations-and-baseline*
*Context gathered: 2026-06-13*
