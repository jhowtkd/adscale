# Phase 21: Remoção do Briefing Doctor e Limpeza - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning
**Source:** Milestone v5.0 Research + Requirements

<domain>
## Phase Boundary

Remove Briefing Doctor from the entire codebase — UI components, API routes, hooks, translations, and documentation. Ensure no references remain and build stays clean.

</domain>

<decisions>
## Implementation Decisions

### Cleanup Strategy
- Remove Briefing Doctor from creation flow
- Delete Briefing Doctor routes, hooks, and components
- Remove Briefing Doctor translations from i18n files
- Remove Briefing Doctor references from documentation
- Ensure no runtime errors from missing code

### Safety
- Build must pass after removal
- No broken imports
- Existing campaigns that used Briefing Doctor still display correctly
- Data preserved, UI removed

### Scope
- Components: BriefingDoctor, CreativeDiagnosisCard, etc.
- Hooks: useBriefingDoctor, useCreativeDiagnosis
- Routes: /api/campaigns/[id]/briefing-doctor
- Translations: All Briefing Doctor keys
- Documentation: README, inline comments

</decisions>

<specifics>
## Specific Ideas

- Search for "briefing-doctor", "BriefingDoctor", "creative-diagnosis" across codebase
- Remove files entirely if they only contain Briefing Doctor code
- Update imports in files that reference Briefing Doctor
- Run build after each removal to catch issues early
- Keep git commits atomic (one per file/group)

</specifics>

<deferred>
## Deferred Ideas

- None — this is a complete removal

</deferred>

---

*Phase: 21-remocao-do-briefing-doctor-e-limpeza*
*Context gathered: 2026-05-26 via Research*
