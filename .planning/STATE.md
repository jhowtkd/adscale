---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Simplificação do Fluxo de Criação de Campanha
status: in_progress
last_updated: "2026-05-26T23:35:00.000Z"
last_activity: 2026-05-26 — Completed plan 20-02 (Frontend Generation Mode Step Component)
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 6
  completed_plans: 6
---

# State: ADScale

## Current Position

Phase: 20-modo-de-geracao-com-configuracoes-avancadas
Plan: 20-02 (complete)
Status: Plan 20-02 complete — Frontend Generation Mode Step Component implemented
Last activity: 2026-05-26 — Completed plan 20-02 (Frontend Generation Mode Step Component)

## Accumulated Context

- Milestone v1.0 delivered: full server layer, auth, campaigns, upload, AI plan, derivations, review, export, dashboard, tests
- Milestone v2.0 delivered: full i18n PT-BR infrastructure, UI translation, AI prompt localization
- Milestone v3.0 delivered: art variation, format adaptation, restyling modes, creativity templates, literal CTA enforcement
- Milestone v4.0 delivered: Stripe subscriptions with trial, LGPD compliance (privacy, terms, cookie banner, data export, account deletion)
- Milestone v4.0 ended at phases 16-17; v5.0 continues numbering from phase 18
- 80+ tests passing, build clean (pre-existing lint warnings remain)
- Tech debt: 24 pre-existing ESLint warnings, mock-data.ts used for types in some UI components

## v5.0 Roadmap

| Phase | Name | Requirements |
|-------|------|-------------|
| 18 | Formulário Simplificado de Briefing | BRIEF-01..04 |
| 19 | Análise Visual e Dedução com IA | AI-01..07 |
| 20 | Modo de Geração com Configurações Avançadas | GEN-01..06 |
| 21 | Remoção do Briefing Doctor e Limpeza | CLEAN-01..04 |

**Coverage:** 21/21 requirements mapped ✓

## Decisions Made

- v5.0 will simplify campaign creation from multi-step brief to single-page flow
- AI will visually analyze uploaded key creative to deduce campaign information
- Advanced settings (creativity profile, per-piece CTA) will move to generation mode
- Briefing Doctor will be removed from the flow
- Form fields: campaign name, client, client profile (required); AI-deduced fields (editable)
- **18-01:** `client` is now required in campaign creation (was optional)
- **18-01:** `clientProfileId` is required-but-nullable (enforces explicit choice, allows "no profile")
- **18-01:** All other campaign fields remain optional for backward compatibility
- **18-01:** Frontend creation hook sends only 3 required fields (name, client, clientProfileId)
- **18-02:** Upload zone in creation modal is visual-only; actual upload happens in campaign workspace
- **18-02:** Client profile selector uses native `<select>` with existing useClientProfiles hook
- **18-02:** Old wizard elements (template selector, generation mode, target formats) removed from creation modal
- **19-01:** OpenAI structured output requires `.nullable()` not `.optional()` for all fields
- **19-01:** AI vision analysis uses `getPublicUrl(asset.key)` to construct image URLs dynamically
- **19-01:** Analysis failures gracefully return 200 with empty result and "failed" status
- **19-01:** Existing `getAssetWithMetadata`/`updateAssetMetadata` handle metadata merging for analysis results
- **19-02:** AI analysis integrated into BriefingStep (not page.tsx) since form state lives there
- **19-02:** CreativeUploadWithAnalysis replaces BaseCreativeUploadCard to enable automatic AI trigger
- **19-02:** Auto-filled form fields only when empty (never overwrite user manual input)
- **19-02:** AIDeducedFieldsEditor shows confidence badges with color-coded borders (high/medium/low)
- **20-01:** `platformSpecificNotes` reused as metadata cache for CTA suggestions (avoids schema migration)
- **20-01:** CTA suggestions generated in Portuguese (Brazilian) for local market targeting
- **20-01:** Default fallback CTAs ensure endpoint always returns useful suggestions even on AI failure
- **20-02:** Generation settings extracted from BriefingStep into dedicated GenerationStep component
- **20-02:** Campaign workspace expanded from 4 to 5 steps (Brief → Upload → Generation → Plan → Gallery)
- **20-02:** AI suggestions displayed as clickable chips with confidence-based color coding

## Next Steps

1. Plan 20-02 complete — Generation Mode UI ready
2. Execute plan 20-03: Flow Integration (wire suggestions into generation flow)
3. Phase 21: Remove Briefing Doctor and cleanup

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-26)  
See: .planning/milestones/v5.0/v5.0-ROADMAP.md (created 2026-05-26)

**Core value:** Users can go from a single base creative and a brief to multiple platform-ready ad variations in minutes, with full creative control and review.
**Current focus:** Milestone v5.0 — Simplificação do Fluxo de Criação de Campanha (plan 20-02 complete, ready for 20-03)
