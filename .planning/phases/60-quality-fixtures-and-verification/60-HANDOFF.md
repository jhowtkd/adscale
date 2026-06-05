# v11.5 Quality Loop — Verification & Handoff

**Date:** 2026-06-05  
**Audience:** Platform owner / developer validating beta generation quality

## Purpose

This guide walks through one complete quality loop: from stored creative contract and prompt provenance through score/QA, hard-failure gate, regeneration suggestion, and user-confirmed child derivation. Use it after automated fixture tests pass and before signing off beta quality improvements.

## Automated pre-check

Run the fixture regression suite before manual spot-check:

```bash
cd app && npm test -- \
  tests/unit/ai/quality-fixtures.test.ts \
  tests/unit/ai/quality-prompt-regression.test.ts \
  tests/unit/ai/quality-fixture-pipeline.test.ts
```

All tests must pass. These cover six synthetic failure modes without OpenAI calls or real customer assets.

## Manual quality loop

1. **Pick a derivation** with `qualityVerdict` of `improvable` or `invalid`, or generate one in dev at `https://app.example.com/campaigns/{campaignId}` (workspace campaign gallery).

2. **Inspect contract + provenance** — in the derivation review modal or via API/DB:
   - `creativeContract` (generation mode, target format, CTA semantics, source package)
   - `promptProvenance` (builder version, sections applied)
   - `inputPrompt` (original generation prompt) and revised `prompt` if present

3. **Review score** — check stored fields or re-run scoring in dev:
   - `qualityScore`, `scoreBreakdown`, `scoreIssues`, `scoreStatus`

4. **Review QA** — inspect `qaChecklist`, `qaIssues`, `qaStatus`, or trigger:
   - `POST /api/derivations/[id]/qa` on an approved output image

5. **Confirm gate** — verify:
   - `qualityVerdict` matches hard failures (`invalid` when blocking codes present)
   - `hardFailures` vs `polishSuggestions` separation
   - Localized hard-failure code titles in review UI (`app/src/components/workspace/` derivation review)

6. **Read regeneration suggestion** — open **Regenerate** on the derivation:
   - Component: `app/src/components/workspace/RegenerateFeedbackDialog.tsx`
   - Verify primary reason summary appears before confirm (Phase 59)
   - Preview `regenerationSuggestion` / correction brief content

7. **Confirm regeneration** — submit regenerate dialog:
   - API: `POST /app/api/derivations/[id]/regenerate/route.ts`
   - Child derivation should have: `parentId`, `feedback`, `regenerationCorrectionBrief`, inherited `creativeContract`

## What to record

| Field | Notes |
|-------|-------|
| Failure mode category | Map to fixture id if similar (`fixture-wrong-cta`, etc.) |
| Hard failure codes | e.g. `cta_drift`, `invalid_format_layout` |
| Regeneration outcome | Did child output improve vs parent? |
| Residual gaps | See `60-LIMITATIONS.md` for model-dependent issues |

## Out of scope

- Beta users cannot see full prompts or owner-only quality diagnostics
- No automatic multi-attempt retry loops without user confirmation
- Synthetic fixtures do not replace final pixel review before export

## Related docs

- Residual limitations: [60-LIMITATIONS.md](./60-LIMITATIONS.md)
- Automated validation contract: [60-VALIDATION.md](./60-VALIDATION.md)
- Beta feedback triage (separate): [56-HANDOFF.md](../56-verification-and-privacy-audit/56-HANDOFF.md)
