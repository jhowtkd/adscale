# Phase 18: Formulário Simplificado de Briefing - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning
**Source:** Milestone v5.0 Research + Requirements

<domain>
## Phase Boundary

Replace the multi-step campaign brief wizard with a minimal single-page form. Only campaign name, client, and client profile are required. Key creative upload is optional at creation time.

</domain>

<decisions>
## Implementation Decisions

### UI/UX
- Single-page form replaces multi-step wizard
- 3 required fields: campaign name, client, client profile
- Upload is optional at creation time
- Use existing shadcn/ui components and Tailwind
- Maintain i18n support (PT-BR/EN)

### Technical
- Simplify POST /api/campaigns schema
- Keep existing PATCH endpoint backward-compatible
- Remove wizard step indicators and navigation
- Preserve campaign lifecycle (draft → plan → derivations)

### Data
- No database schema changes needed
- Brief fields remain in campaigns table
- Just shift when they're populated (not what exists)

</decisions>

<specifics>
## Specific Ideas

- Form should be clean and minimal
- Client profile can be a dropdown or autocomplete
- Optional upload zone below the required fields
- Clear visual hierarchy: required fields first, optional upload second
- Loading states for form submission
- Error handling with clear messages

</specifics>

<deferred>
## Deferred Ideas

- AI analysis of uploaded creative (Phase 19)
- Advanced settings configuration (Phase 20)
- Briefing Doctor removal (Phase 21)

</deferred>

---

*Phase: 18-formulario-simplificado-de-briefing*
*Context gathered: 2026-05-26 via Research*
