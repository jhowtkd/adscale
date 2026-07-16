# Task 6 — Operational home and autosaving smart composer

## Status

Complete. The dashboard now starts in one autosaving creative composer, restores `?workId=`, keeps the work's persisted brand authoritative, and runs the existing prepare/quote/generate path without an intent picker, copy screen, asset-selection step, or client-side confirmation.

## Delivered

- `useCreativeComposer` owns the six approved UI states, 500 ms create/autosave, flush-before-generate, source upload/actions, preparation, canonical quote, restoration, and local plus mutation double-submit guards.
- Text-first creates one idempotent draft from the first trimmed non-empty request. Attachment-first uploads through `/api/workspace/assets`, then uses the existing POST with a strict scoped `assetId`/`usage` contract and no synthetic text.
- Initial source dispatch failure is persisted and returned as `failed/dispatch_failed`; source mutations invalidate/refetch work detail on both success and error so retry appears immediately.
- `CreativeSourceChip` is mounted in the composer and uses `useCreativeWorkSourceActions` for usage, retry, and remove.
- The home hierarchy is `CreativeComposer`, exact canonical continue hero, four in-place tool cards, and an intentionally empty `BrandInspirations` slot for Task 8.
- Tool presets focus the same textarea and use shared `quoteCreativeWork` pricing. Optional format/target settings stay inline and collapsed.
- The Next 16 page reads async `searchParams` server-side and passes only a string `workId` into the client boundary.

## TDD evidence

- RED: missing composer/tool modules; old home intent picker; no attachment-first schema; source errors did not invalidate detail; quote stayed at 15 after selecting `single`.
- GREEN: focused interaction, hook, route, and source contracts pass.

## Verification

- Required brief subset: **12 passed** across 4 files after the canonical-quote correction.
- Focused plus route/source regressions: **34 passed** across 6 files.
- Full `npm test`: **589 files passed; 3856 passed, 7 skipped; exit 0**.
- `npm run typecheck`: **pass**.
- ESLint on changed production TypeScript: **pass**.
- `git diff --check`: **pass**.

## Commits

- `51b3721c` — `fix: support attachment-first creative drafts`
- `4aa03b1e` — `feat: replace home with smart creative composer`

## Concerns / deliberate boundary

- `BrandInspirations` is only a semantic slot; Task 8 owns its content and data contract.
- No new template feed/integration was added. Existing source actions retain the already-delivered asset-or-template contract.
- The full suite emits existing jsdom/local-storage warnings and refreshes generated evidence timestamps; the generated timestamp change was removed. Pre-existing edits to `128-BASELINE.md` and `128-VERIFICATION.md` were preserved and excluded from commits.
