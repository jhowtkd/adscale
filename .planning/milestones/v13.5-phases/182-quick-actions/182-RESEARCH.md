# Phase 182: Quick Actions - Research

**Researched:** 2026-06-25
**Domain:** Post-confirm action execution for quick_action contracts
**Confidence:** HIGH

## Summary

Phase 182 wires **confirmed assistant actions** to existing generation/review pipelines. The confirm route already revalidates contracts (Phase 180); this phase adds `executeConfirmedAssistantAction` dispatcher and five ACT-04 contracts. Async jobs pass `assistantActionId` to `derivation.generate` — `syncAssistantActionFromJob` (Phase 178) completes the loop.

## Validation Architecture

| Layer | Mechanism |
|-------|-----------|
| Contract gate | `revalidateOnConfirm` + Zod per contract (existing) |
| Execution gate | Handler validates assets/derivations scoped to workspace |
| Async completion | Inngest derivation job + `assistantActionId` |
| Sync completion | review/save-reference transition to `completed` inline |
| Tests | `quick-actions.test.ts` proves no campaign brief fields required |

## Key Integration Points

- `POST /api/campaigns/[id]/restyle` logic → `executeQuickRestyle`
- `derivations/[id]/{regenerate,review,save-reference,delivery-package}` → parallel handlers
- Confirm route: confirm → execute (non-blocking failure surfaces 400/402)

---
*Phase: 182-quick-actions*
