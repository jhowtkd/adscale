import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  creativeWorkOutputs,
  workspaceAssets,
} from "../db/schema";
import { parsePersistedOutputReviewDraft } from "../creative-work/output-review";
import type {
  OutputReviewDraftV1,
  OutputReviewInput,
} from "../creative-work/output-review";

export type SaveOutputReviewDraftInput = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  expectedReviewRevision: number;
  draft: OutputReviewInput;
};

export type SaveOutputReviewDraftResult =
  | { ok: true; draft: OutputReviewDraftV1 }
  | {
      ok: false;
      code: "not_found" | "not_ready" | "review_conflict" | "invalid_reference";
    };

/**
 * Saves a mutable review draft scoped to one output with its own CAS.
 * Never touches the operational updatedAt: the draft revision is its own
 * authority. Validates the optional reference in the same workspace.
 */
export async function saveOutputReviewDraft(
  input: SaveOutputReviewDraftInput,
): Promise<SaveOutputReviewDraftResult> {
  return db.transaction(async (tx) => {
    const [parent] = await tx
      .select()
      .from(creativeWorkOutputs)
      .where(
        and(
          eq(creativeWorkOutputs.workspaceId, input.workspaceId),
          eq(creativeWorkOutputs.workItemId, input.workItemId),
          eq(creativeWorkOutputs.id, input.outputId),
        ),
      )
      .for("update")
      .limit(1);
    if (!parent) return { ok: false as const, code: "not_found" as const };
    if (parent.status !== "completed" || !parent.outputKey) {
      return { ok: false as const, code: "not_ready" as const };
    }

    if (input.draft.revisionAssetId) {
      const [asset] = await tx
        .select({ id: workspaceAssets.id, type: workspaceAssets.type })
        .from(workspaceAssets)
        .where(
          and(
            eq(workspaceAssets.workspaceId, input.workspaceId),
            eq(workspaceAssets.id, input.draft.revisionAssetId),
          ),
        )
        .limit(1);
      if (!asset?.type.startsWith("image/")) {
        return { ok: false as const, code: "invalid_reference" as const };
      }
    }

    const currentRevision = parent.reviewDraft == null
      ? 0
      : parsePersistedOutputReviewDraft(parent.reviewDraft)?.revision;
    // A persisted but schema-invalid draft is never trusted as CAS authority
    // and never silently overwritten as a fresh draft: reject the writer so
    // the conflict surfaces instead of clobbering unknown state.
    if (currentRevision === undefined) {
      return { ok: false as const, code: "review_conflict" as const };
    }
    if (currentRevision !== input.expectedReviewRevision) {
      return { ok: false as const, code: "review_conflict" as const };
    }

    const next: OutputReviewDraftV1 = {
      ...input.draft,
      targetFormat:
        input.draft.action === "format"
          ? input.draft.targetFormat
          : parent.targetFormat,
      version: 1,
      revision: input.expectedReviewRevision + 1,
      revisionKey: crypto.randomUUID(),
    };

    await tx
      .update(creativeWorkOutputs)
      .set({ reviewDraft: next })
      .where(
        and(
          eq(creativeWorkOutputs.workspaceId, input.workspaceId),
          eq(creativeWorkOutputs.workItemId, input.workItemId),
          eq(creativeWorkOutputs.id, input.outputId),
        ),
      );

    return { ok: true as const, draft: next };
  });
}
