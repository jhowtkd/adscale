# Task 5 — One-confirmation creative generation

## Status

Complete. `/generate` is a thin authenticated adapter over `generateCreativeWork`, which prepares a draft, freezes ready-source and ranked identity snapshots, charges the canonical quote, creates planned rows idempotently, and dispatches only newly inserted output IDs.

## Delivered

- Canonical billing key: `creative-work:${workItemId}:initial`; the charged amount is always `quote.credits` (`5 × unitCount`).
- Ranked identity: top three `buildIdentityOptions()` results; Brand-Kit-only remains valid and returns `brandTrainingSuggestion`.
- Stable retry behavior: an HTTP repeat returns persisted rows and billing key without spend or event duplication; a charge-blocked frozen `ready` work can resume.
- Dispatch failure: newly created rows become `failed`, the exact batch quote is refunded under an idempotent key, and aggregate status is refreshed for manual recovery.
- Authoritative output events: `{ workspaceId, workItemId, outputId }` only. The job reloads creative level, target format, version/revision data, prompt inputs, and snapshots from persistence.
- Prompt/reference contract: persisted brief/copy/input/identity feed the prompt; only `style`/`both` source assets become provider image references, while content analysis stays textual. Brand required/prohibited rules remain final constraints.
- Automatic retry: provider/transport errors explicitly marked `retryable: true` CAS `retryCount` from 0 to 1, requeue and dispatch the same output ID/billing key once. Final low-quality policy rejection never auto-retries. Sibling output rows are untouched.

## TDD evidence

- RED: missing application command and `{ outputs, newlyCreatedIds }` repository result.
- RED: old route executed DB/billing orchestration instead of calling the command.
- RED: job trusted event creative level/format, prompt omitted persisted input/revision, and no retry CAS existed.
- RED: retry after a blocked charge could not resume the frozen `ready` work.
- GREEN: all focused contracts below pass.

## Verification

- Focused Task 5 plus adjacent repository/preparation/retry tests: **112 passed** across 9 files.
- Required brief subset: **53 passed** across 6 files.
- Full `npm test`: **exit 0**.
- `npm run typecheck`: **pass**.
- `git diff --check`: **pass**.

## Concerns / deliberate boundary

- Automatic retry intentionally requires the thrown provider/transport error to carry `retryable: true`; unmarked errors become terminal and use the existing manual retry. This keeps unknown and policy failures out of automatic retry.
- The full suite emits existing jsdom/local-storage warnings and refreshes generated evaluation timestamps; the generated evidence timestamp change was removed from this task. Pre-existing edits to `128-BASELINE.md` and `128-VERIFICATION.md` were preserved and excluded from commits.
