# Feature Research

**Domain:** Iterative creative copilot
**Researched:** 2026-06-27
**Confidence:** HIGH

## Table Stakes

| Feature | Why | Complexity |
|---|---|---|
| Immutable version history | User must trust no approved work was overwritten | MEDIUM |
| Current-version marker | Chat and campaign need one canonical approved state | MEDIUM |
| Feedback → proposed change | User intent must become inspectable before mutation | HIGH |
| Semantic compare | Raw JSON diff is unreadable for strategy/creative work | MEDIUM |
| Explicit approval | Selected version must not become current silently | MEDIUM |
| Stale/conflict rejection | Two tabs/actions cannot approve old state | MEDIUM |
| Resume | Reload returns selected compare pair and pending proposal | MEDIUM |

## Differentiators

| Feature | Value | Complexity |
|---|---|---|
| One loop across plan and creative | Strategy and visual output stay connected | HIGH |
| Change provenance | Shows user feedback, source version, action, cost | MEDIUM |
| Outcome-first revision card | Explains expected change before spending credits | MEDIUM |
| Revert by promotion | Old version becomes current without destructive rollback | LOW |

## Anti-Features

| Feature | Problem | Alternative |
|---|---|---|
| Arbitrary branching/merge UI | Git complexity inside creative workflow | Linear history with explicit source parent |
| Automatic “best” approval | Removes creative control | Recommendation only; user approves |
| Pixel-level image diff | High complexity, low strategic value | Side-by-side creatives + metadata/change summary |
| New journey types | Dilutes depth before iterative loop works | Keep two existing entry journeys |
| Cross-thread memory | Separate consent/provenance problem | Defer to future milestone |

## MVP v13.9

- Version model for `plan` and `creative` artifacts.
- Propose revision from chat feedback.
- Confirm action before provider cost/write.
- Side-by-side compare with semantic change summary.
- Approve/promote exactly one current version.
- Resume and recover failed/canceled revisions.

## Dependencies

`immutable versions` → `proposal commands` → `execution` → `compare` → `approval/current pointer` → `E2E`

## Deferred

- Multiuser merge/conflict resolution beyond stale rejection.
- Voice feedback.
- Automatic preference learning.
- Cross-thread answer reuse.

## Sources

- Existing ADScale action confirmation, review sheet, derivation parent relation, plan model.
- v13.8 user direction: depth in chat before new modes.

---
*Feature research for v13.9 Copiloto Criativo Iterativo.*
