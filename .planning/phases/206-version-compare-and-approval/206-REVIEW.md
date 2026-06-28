---
phase: 206-version-compare-and-approval
reviewed: 2026-06-28T18:36:17Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - app/drizzle/0067_assistant_artifact_approvals.sql
  - app/src/app/api/assistant/threads/[threadId]/artifact-versions/compare/route.ts
  - app/src/app/api/assistant/threads/[threadId]/artifact-versions/comparison-acknowledgements/route.ts
  - app/src/app/api/assistant/threads/[threadId]/artifact-versions/promote/route.ts
  - app/src/components/assistant/AssistantActionCard.tsx
  - app/src/components/assistant/AssistantChatCore.tsx
  - app/src/components/assistant/AssistantContextPanel.tsx
  - app/src/components/assistant/AssistantMessageList.tsx
  - app/src/components/assistant/AssistantSurfaceContext.tsx
  - app/src/components/assistant/VersionComparisonDialog.tsx
  - app/src/components/assistant/VersionHistory.tsx
  - app/src/lib/assistant/artifact-version.ts
  - app/src/lib/hooks/use-assistant-artifact-versions.ts
  - app/src/lib/hooks/use-assistant-threads.ts
  - app/src/server/assistant/artifact-version/comparison.ts
  - app/src/server/assistant/artifact-version/promotion.ts
  - app/src/server/assistant/artifact-version/service.ts
  - app/src/server/assistant/plan-iteration/diff.ts
  - app/src/server/db/schema.ts
  - app/src/server/repositories/artifact-version.ts
findings:
  critical: 1
  warning: 3
  info: 0
  total: 4
status: issues_found
---

# Phase 206: Code Review Report

**Reviewed:** 2026-06-28T18:36:17Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

The scoped comparison, acknowledgement, and transactional promotion paths were reviewed end to end. Scope checks and compound rollback are present, but first-time approval is unreachable. Idempotency replay is not bound to the command, long histories can hide the real head, and creative preview failure state survives version changes.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01 [BLOCKER]: A lineage with no current official version can never receive its first approval

**Files:**

- `/Users/jhonatan/Repos/ADScale_2/app/src/lib/assistant/artifact-version.ts:216-223`
- `/Users/jhonatan/Repos/ADScale_2/app/src/components/assistant/VersionHistory.tsx:78-82,193-201`
- `/Users/jhonatan/Repos/ADScale_2/app/src/components/assistant/VersionComparisonDialog.tsx:321-323,384-395`
- `/Users/jhonatan/Repos/ADScale_2/app/src/server/repositories/artifact-version.ts:585-587`

**Issue:** `approvedCurrentVersionId` is nullable in the head table, and the creative revision flow legitimately creates heads with `approvedCurrentVersionId: null`. The promotion command nevertheless requires `expectedOfficialVersionId` to be a UUID, the dialog refuses to submit without `official`, and history exposes comparison actions only when an official exists. Even a direct API caller cannot succeed because the repository compares the nullable head to the required UUID. A ready first version is therefore permanently blocked from becoming official.

**Fix:** Make `expectedOfficialVersionId` nullable in `promotionTargetSchema` and the repository target type, preserve the strict CAS comparison against `null`, and allow the UI to compare/select a ready version and confirm a `none -> vN` transition when no official exists. Add one integration test with a null official head.

## Warnings

### WR-01 [WARNING]: `operationId` replay is accepted without proving it belongs to the submitted command

**Files:**

- `/Users/jhonatan/Repos/ADScale_2/app/drizzle/0067_assistant_artifact_approvals.sql:46`
- `/Users/jhonatan/Repos/ADScale_2/app/src/server/repositories/artifact-version.ts:722-744,770-778`

**Issue:** Replay lookup uses only `operationId` plus scope. Any existing event causes an immediate success response, without checking the requested lineage, target version, or operation shape. Reusing an operation ID for another command can therefore return `200` with unrelated promotions while performing no requested mutation. Concurrent reuse on different lineages can also commit both commands because uniqueness is only `(operation_id, lineage_id)`. Replay additionally reports `staleProposalCount: 0` instead of the original result.

**Fix:** Persist one operation record containing a digest of the complete normalized command and the original result, claim it atomically, and reject an existing ID whose digest differs. Replay the stored result for an identical digest. A smaller acceptable fix is to validate every replay event against the exact submitted target set and reject mismatches, while handling concurrent same-command CAS conflicts by re-reading the committed operation.

### WR-02 [WARNING]: The 50-version presentation cap can erase the actual official or working head

**Files:**

- `/Users/jhonatan/Repos/ADScale_2/app/src/server/repositories/artifact-version.ts:205-223`
- `/Users/jhonatan/Repos/ADScale_2/app/src/server/assistant/artifact-version/service.ts:167-186,216-224`

**Issue:** `getLineagePresentation` loads only the newest 50 versions, then resolves both head pointers exclusively from that truncated list. If an older official or working version falls outside the window, the API reports that pointer as `null` even though the database head is valid. The UI then loses the official comparison target and promotion path, and conflict recovery labels the real official as unknown.

**Fix:** After loading the page and head, fetch any pointed version IDs missing from the page and merge them before building `approvedCurrent` and `working`. Keep the 50-row history window if desired.

### WR-03 [WARNING]: A failed creative preview remains failed after selecting a different version

**File:** `/Users/jhonatan/Repos/ADScale_2/app/src/components/assistant/VersionComparisonDialog.tsx:162-164,213-250,453-464`

**Issue:** `CreativeComparison` stores image failures only by side (`A` or `B`). Changing the selected version does not remount the component or clear that state, so a failure for one URL makes the next valid version on the same side render the error fallback until the user manually retries.

**Fix:** Key failure state by version identity/URL, or reset the affected side when `comparison.versionA` or `comparison.versionB` changes. Add a component test that fails version A, selects another A, and verifies the new image renders immediately.

---

_Reviewed: 2026-06-28T18:36:17Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
