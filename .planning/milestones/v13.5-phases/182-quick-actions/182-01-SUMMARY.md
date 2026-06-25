---
phase: 182-quick-actions
plan: 01
subsystem: assistant
tags: [assistant, action-contracts, quick-actions, ACT-04]

provides:
  - quick_format_adapt, quick_regenerate, quick_review, quick_save_reference, quick_package contracts
  - Registry registration alongside quick_restyle and start_complete_campaign

key-files:
  created:
    - app/src/server/assistant/action-contracts/contracts/quick-format-adapt.ts
    - app/src/server/assistant/action-contracts/contracts/quick-package.ts
    - app/src/server/assistant/action-contracts/contracts/quick-regenerate.ts
    - app/src/server/assistant/action-contracts/contracts/quick-review.ts
    - app/src/server/assistant/action-contracts/contracts/quick-save-reference.ts
    - app/src/server/assistant/action-contracts/quick-actions.test.ts
  modified:
    - app/src/server/assistant/action-contracts/contracts/index.ts

requirements-completed: [ACT-04]
---

# Summary 182-01: Register ACT-04 contracts

Registered five quick-action contracts with Zod input schemas, credit metadata, optional-field risk copy, and confirmation policy. Extended `contracts/index.ts` to register all seven assistant action types.

**Verify:** `quick-actions.test.ts` green.
