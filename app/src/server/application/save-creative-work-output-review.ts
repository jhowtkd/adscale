import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
import {
  outputReviewInputSchema,
  type OutputReviewDraftV1,
  type OutputReviewInput,
} from "@/server/creative-work/output-review";
import { saveOutputReviewDraft } from "@/server/repositories/creative-work-output-review";

export type SaveCreativeWorkOutputReviewErrorCode =
  | "invalid_input"
  | "not_found"
  | "not_ready"
  | "review_conflict"
  | "invalid_reference";

export type SaveCreativeWorkOutputReviewResult =
  | {
      ok: true;
      value: { draft: OutputReviewDraftV1; revisionCreditCost: number };
    }
  | { ok: false; error: { code: SaveCreativeWorkOutputReviewErrorCode } };

export async function saveCreativeWorkOutputReview(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  expectedReviewRevision: number;
  draft: OutputReviewInput;
}): Promise<SaveCreativeWorkOutputReviewResult> {
  const parsed = outputReviewInputSchema.safeParse(input.draft);
  if (!parsed.success) {
    return { ok: false, error: { code: "invalid_input" } };
  }
  if (
    !Number.isInteger(input.expectedReviewRevision) ||
    input.expectedReviewRevision < 0
  ) {
    return { ok: false, error: { code: "invalid_input" } };
  }

  const saved = await saveOutputReviewDraft({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputId: input.outputId,
    expectedReviewRevision: input.expectedReviewRevision,
    draft: parsed.data,
  });
  if (!saved.ok) {
    return { ok: false, error: { code: saved.code } };
  }
  return {
    ok: true,
    value: {
      draft: saved.draft,
      revisionCreditCost: GENERATION_CREDIT_COSTS.creativeWorkOutput,
    },
  };
}
