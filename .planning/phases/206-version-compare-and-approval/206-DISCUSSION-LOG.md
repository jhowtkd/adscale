# Phase 206: Version Compare and Approval - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-28
**Phase:** 206-version-compare-and-approval
**Areas discussed:** Comparison entry and selection, semantic plan diff, visual creative comparison, approval/promotion/conflicts

---

## Comparison entry and selection

| Question | Options considered | Selected |
|---|---|---|
| Entry point | Panel + chat shortcuts; panel only; chat only | Panel + chat shortcuts |
| Initial pair | Approved vs working; two newest; always manual | Approved vs working |
| Detailed surface | Wide view over chat; context panel; inline chat block | Wide view over chat |
| History presentation | Rich list; timeline; compact list | Linear timeline |

**Notes:** The timeline must communicate a linear lineage and must not imply branch/merge behavior.

---

## Semantic plan diff

| Question | Options considered | Selected |
|---|---|---|
| Default scope | Changes + reveal all; all fields; summary only | Changes + reveal all |
| Field presentation | Before/after per field; inline text diff; two full plans | Before/after per field |
| List ordering | Order is meaningful; content only; only angles/hooks | Order is meaningful |
| Context header | Version/status/feedback; minimal; full technical provenance | Version/status/feedback |

**Notes:** Existing normalized sorting cannot remain the sole diff logic because reordering communicates strategic priority.

---

## Visual creative comparison

| Question | Options considered | Selected |
|---|---|---|
| Preview layout | Responsive side by side; overlay slider; A/B toggle | Responsive side by side |
| Image inspection | Full image + synchronized zoom; static full image; independent zoom | Full image + synchronized zoom |
| Metadata | Decision essentials; minimal; complete | Decision essentials |
| Change summary | Feedback + declared intent; new AI visual analysis; metadata only | Feedback + declared intent |

**Notes:** The product should not imply pixel-diff or visual-analysis certainty. Persisted intent is labeled as intent.

---

## Approval, promotion, and conflicts

| Question | Options considered | Selected |
|---|---|---|
| Canonical effect | Atomic canonical sync; assistant pointer only; publish later | Atomic canonical sync |
| Confirmation | Effects modal; direct button; typed confirmation | Effects modal |
| Post-promotion state | Align working + stale conflicts; keep working; cancel proposals | Align working + stale conflicts |
| CAS conflict | Reload and reconfirm; auto-retry; close comparison | Reload and reconfirm |
| Eligible versions | Ready or previously approved; latest ready only; any persisted | Ready or previously approved |
| Creative-plan relationship | Warn only; promote both; block creative | Promote both |
| Compound atomicity | All or nothing; creative first; separate confirmations | All or nothing |
| Compound review | Summary + expandable diff; separate plan compare required; warning only | Separate plan compare required |

**Notes:** Creative approval is a compound plan+creative promotion. The exact linked plan must be reviewed separately first, and both canonical transitions commit atomically without credit spend.

---

## the agent's Discretion

- Component boundaries, endpoint names, styling details, and the exact server-verifiable acknowledgement mechanism for linked-plan review.
- Loading, empty, preview-error, keyboard, and focus behavior within established assistant and accessibility patterns.

## Deferred Ideas

None.
