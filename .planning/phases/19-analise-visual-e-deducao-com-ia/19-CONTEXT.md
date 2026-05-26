# Phase 19: Análise Visual e Dedução com IA - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning
**Source:** Milestone v5.0 Research + Requirements

<domain>
## Phase Boundary

When user uploads a key creative, trigger async AI visual analysis to deduce campaign fields (product, objective, target audience, tone, offer, platforms). Present deduced fields in an editable form. Handle failures gracefully.

</domain>

<decisions>
## Implementation Decisions

### AI Analysis
- Use gpt-5-mini (already supports vision, no new dependencies)
- Pass image as base64 or R2 presigned URL
- Use Zod structured output for reliable parsing
- Implement confidence scoring for each deduced field

### UX
- Non-blocking analysis: upload completes first, analysis runs async
- Show skeleton loader during analysis
- Present deduced fields in editable form
- Allow user to edit any field before saving
- Graceful degradation: if analysis fails, form loads empty

### Technical
- New endpoint: POST /api/campaigns/[id]/analyze
- Reuse existing auto-briefing infrastructure (70% overlap)
- Store analysis result in campaign_assets.metadata
- Decouple upload from analysis

### Data Flow
1. User uploads key creative
2. Upload completes, asset created
3. Trigger async AI analysis
4. AI returns deduced fields with confidence
5. Present in editable form
6. User reviews/edits
7. Save to campaign

</decisions>

<specifics>
## Specific Ideas

- Analysis prompt should ask for: product, objective, target audience, tone, offer, platforms
- Confidence indicators: high/medium/low badges per field
- "Apply Suggestions" button to fill form with AI data
- Never auto-overwrite user manual input
- Cache analysis results to avoid re-analyzing same image
- Resize image to ~512px before API call to reduce costs

</specifics>

<deferred>
## Deferred Ideas

- Multi-image analysis (v5.1)
- Visual similarity scoring (future)
- Brand kit extraction (future)
- Per-field confidence visualization (v5.1)

</deferred>

---

*Phase: 19-analise-visual-e-deducao-com-ia*
*Context gathered: 2026-05-26 via Research*
