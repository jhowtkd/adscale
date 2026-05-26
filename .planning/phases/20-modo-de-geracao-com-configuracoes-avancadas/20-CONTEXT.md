# Phase 20: Modo de Geração com Configurações Avançadas - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning
**Source:** Milestone v5.0 Research + Requirements

<domain>
## Phase Boundary

Move advanced briefing settings (creativity profile, per-piece CTA, output format, derivation mode) into the generation mode screen. Add AI-powered suggestions for creativity profile and CTAs based on campaign context and visual analysis.

</domain>

<decisions>
## Implementation Decisions

### UI/UX
- Generation mode screen is a new step in the campaign workflow
- Show after briefing is complete and key creative is uploaded
- Creativity profile: conservative, balanced, bold (with descriptions)
- CTA per piece with AI suggestions
- Output format: 1:1, 4:5, 9:16
- Derivation mode: Variar arte, Variar formato, Restilização

### Technical
- Reuse existing generation mode configuration from campaign table
- AI suggestions use the same analyze endpoint from Phase 19
- Store generation settings in campaign record via PATCH
- Keep plan generation logic unchanged

### Data Flow
1. User completes briefing (Phase 18)
2. User uploads key creative (Phase 19)
3. User navigates to generation mode
4. AI suggests creativity profile based on visual analysis
5. AI suggests CTAs based on campaign context
6. User configures settings and proceeds to plan generation

</decisions>

<specifics>
## Specific Ideas

- Generation mode screen should have clear sections:
  - Modo de derivação (cards with icons)
  - Perfil de criatividade (slider or cards)
  - CTA por peça (input fields with AI suggestions)
  - Formato de saída (toggle buttons)
- AI suggestions appear as chips/tags that user can click to fill
- "Usar sugestões da IA" button to apply all AI suggestions at once
- Settings persist when user navigates back

</specifics>

<deferred>
## Deferred Ideas

- Smart CTA suggestions by industry (v5.1)
- Historical campaign suggestion (v5.1)
- Per-field confidence visualization (v5.1)

</deferred>

---

*Phase: 20-modo-de-geracao-com-configuracoes-avancadas*
*Context gathered: 2026-05-26 via Research*
