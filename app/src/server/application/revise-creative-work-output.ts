import {
  creativeWorkRevisionSettlementAdapter,
  InvalidCreativeWorkRevisionError,
} from "@/server/generation/settlement-adapters";
import {
  RECOMPOSE_INSTRUCTION_PREFIX,
  resolveRevisionCompositionMode,
} from "@/server/creative-work/art-refinement";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
import {
  compileOutputReview,
  outputReviewInputSchema,
  parsePersistedOutputReviewDraft,
  parsePersistedOutputRevisionContext,
  type OutputRevisionContextV1,
} from "@/server/creative-work/output-review";
import { logCreativeWorkGenerationLifecycle } from "@/server/creative-work/job-telemetry";

type RevisionErrorCode =
  | "work_not_found"
  | "output_not_ready"
  | "invalid_revision"
  | "stale_review"
  | "quote_changed"
  | "credit_blocked"
  | "dispatch_failed";

export type ReviseCreativeWorkOutputResult =
  | {
      ok: true;
      value: {
        output: NonNullable<
          Awaited<ReturnType<typeof getCreativeWork>>
        >["outputs"][number];
      };
    }
  | { ok: false; error: { code: RevisionErrorCode; details?: unknown } };

type LegacyCommand = {
  workspaceId: string;
  workItemId: string;
  userId: string;
  outputId: string;
  revisionKey: string;
  instruction: string;
  revisionAssetId: string | null;
  /**
   * Internal composition mode (plan 04, T2): "edit" conditions on the parent
   * pixels, "recompose" rebuilds from the original briefing/photos/brand.
   * Internal only — never bound to a client-controlled field — and never a
   * preservation escape: adaptation/restyle protocols constrain to edit.
   */
  compositionMode?: "edit" | "recompose";
  /** Resolved protocol mode of the work, for the preservation constraint. */
  protocolMode?: string | null;
};

type ReviewedCommand = {
  workspaceId: string;
  workItemId: string;
  userId: string;
  outputId: string;
  revisionKey: string;
  reviewRevision: number;
  expectedCredits: number;
};

export async function reviseCreativeWorkOutput(
  input: LegacyCommand | ReviewedCommand,
): Promise<ReviseCreativeWorkOutputResult> {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!aggregate) return { ok: false, error: { code: "work_not_found" } };

  const parent = aggregate.outputs.find((output) => output.id === input.outputId);
  if (!parent || parent.status !== "completed" || !parent.outputKey) {
    return { ok: false, error: { code: "output_not_ready" } };
  }

  if ("reviewRevision" in input) {
    return reviseReviewedOutput(aggregate, parent, input);
  }
  const effectiveMode = resolveRevisionCompositionMode(input.compositionMode ?? "edit", input.protocolMode);
  const instruction = effectiveMode === "recompose"
    ? `${RECOMPOSE_INSTRUCTION_PREFIX}${input.instruction}`
    : input.instruction;

  try {
    const settled = await startGenerationSettlement(
      creativeWorkRevisionSettlementAdapter({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        userId: input.userId,
        parentOutputId: parent.id,
        revisionKey: input.revisionKey,
        instruction,
        revisionAssetId: input.revisionAssetId,
        objective: aggregate.work.brief?.objective ?? null,
      }),
    );
    if (!settled.ok) {
      if (settled.error.code === "credit_blocked") {
        return {
          ok: false,
          error: { code: "credit_blocked", details: settled.error.details },
        };
      }
      return { ok: false, error: { code: "dispatch_failed" } };
    }
    logCreativeWorkGenerationLifecycle({
      event: "creative_work_generation_accepted",
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      generationCorrelationId: settled.value.output.generationCorrelationId,
      unitCount: 1,
      outputIds: [settled.value.output.id],
      credits: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      unitChargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      result: "accepted",
    });
    return { ok: true, value: { output: settled.value.output } };
  } catch (error) {
    if (error instanceof InvalidCreativeWorkRevisionError) {
      return { ok: false, error: { code: "invalid_revision" } };
    }
    throw error;
  }
}

async function reviseReviewedOutput(
  aggregate: NonNullable<Awaited<ReturnType<typeof getCreativeWork>>>,
  parent: NonNullable<Awaited<ReturnType<typeof getCreativeWork>>>["outputs"][number],
  input: ReviewedCommand,
): Promise<ReviseCreativeWorkOutputResult> {
  const operationKey = `revision:${input.revisionKey}`;
  const existing = aggregate.outputs.find(
    (output) => output.operationKey === operationKey,
  );
  if (existing) {
    if (existing.parentOutputId !== parent.id) {
      return { ok: false, error: { code: "invalid_revision" } };
    }
    // A reviewed command replays only with its frozen, schema-valid context.
    // Never degrade to the legacy path here: an invalid stored context must
    // reject the command instead of reinterpreting the row.
    const frozenContext = parsePersistedOutputRevisionContext(
      existing.revisionContext,
    );
    const replayInstruction = existing.revisionInstruction ?? "";
    if (
      !frozenContext ||
      frozenContext.reviewRevision !== input.reviewRevision ||
      !replayInstruction
    ) {
      return { ok: false, error: { code: "invalid_revision" } };
    }
    const replayAssetId = existing.revisionAssetId ?? null;
    // Replay resumes the canonical settlement with the frozen row above —
    // never by re-reading a possibly edited draft. The kernel replays without
    // a second charge (unclaimed reserve + join); a failed/credit_blocked row
    // is re-queued and charged exactly once by the same billing key.
    try {
      const settled = await startGenerationSettlement(
        creativeWorkRevisionSettlementAdapter({
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          userId: input.userId,
          parentOutputId: parent.id,
          revisionKey: input.revisionKey,
          instruction: replayInstruction,
          revisionAssetId: replayAssetId,
          objective: aggregate.work.brief?.objective ?? null,
          context: frozenContext,
          expectedReviewRevision: frozenContext.reviewRevision,
        }),
      );
      if (!settled.ok) {
        if (settled.error.code === "credit_blocked") {
          return {
            ok: false,
            error: { code: "credit_blocked", details: settled.error.details },
          };
        }
        return { ok: false, error: { code: "dispatch_failed" } };
      }
      return { ok: true, value: { output: settled.value.output } };
    } catch (error) {
      if (error instanceof InvalidCreativeWorkRevisionError) {
        return { ok: false, error: { code: "stale_review" } };
      }
      throw error;
    }
  }

  // A persisted but schema-invalid draft is never trusted: reject the command
  // instead of confirming a revision against unknown state.
  const draft = parsePersistedOutputReviewDraft(parent.reviewDraft);
  if (
    !draft ||
    draft.revision !== input.reviewRevision ||
    draft.revisionKey !== input.revisionKey
  ) {
    return { ok: false, error: { code: "stale_review" } };
  }
  if (input.expectedCredits !== GENERATION_CREDIT_COSTS.creativeWorkOutput) {
    return { ok: false, error: { code: "quote_changed" } };
  }

  const parsed = outputReviewInputSchema.safeParse({
    action: draft.action,
    targetFormat: draft.targetFormat,
    instruction: draft.instruction,
    revisionAssetId: draft.revisionAssetId,
    annotations: draft.annotations,
  });
  if (!parsed.success) {
    return { ok: false, error: { code: "invalid_revision" } };
  }
  if (
    parsed.data.action === "refine" &&
    !parsed.data.instruction.trim() &&
    parsed.data.annotations.length === 0
  ) {
    return { ok: false, error: { code: "invalid_revision" } };
  }

  if (parsed.data.revisionAssetId) {
    const asset = await getWorkspaceAssetById(
      parsed.data.revisionAssetId,
      input.workspaceId,
    );
    if (!asset || !asset.type.startsWith("image/")) {
      return { ok: false, error: { code: "invalid_revision" } };
    }
  }

  const context: OutputRevisionContextV1 = {
    version: 1,
    sourceOutputId: parent.id,
    sourceOutputVersion: parent.versionNumber,
    reviewRevision: draft.revision,
    action: parsed.data.action,
    targetFormat: parsed.data.targetFormat,
    instruction: parsed.data.instruction,
    annotations: parsed.data.annotations,
    revisionAssetId: parsed.data.revisionAssetId,
  };
  const instruction = compileOutputReview(parsed.data);

  try {
    const settled = await startGenerationSettlement(
      creativeWorkRevisionSettlementAdapter({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        userId: input.userId,
        parentOutputId: parent.id,
        revisionKey: input.revisionKey,
        instruction,
        revisionAssetId: parsed.data.revisionAssetId,
        objective: aggregate.work.brief?.objective ?? null,
        context,
        expectedReviewRevision: input.reviewRevision,
      }),
    );
    if (!settled.ok) {
      if (settled.error.code === "credit_blocked") {
        return {
          ok: false,
          error: { code: "credit_blocked", details: settled.error.details },
        };
      }
      return { ok: false, error: { code: "dispatch_failed" } };
    }
    logCreativeWorkGenerationLifecycle({
      event: "creative_work_generation_accepted",
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      generationCorrelationId: settled.value.output.generationCorrelationId,
      unitCount: 1,
      outputIds: [settled.value.output.id],
      credits: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      unitChargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
      result: "accepted",
    });
    return { ok: true, value: { output: settled.value.output } };
  } catch (error) {
    if (error instanceof InvalidCreativeWorkRevisionError) {
      return { ok: false, error: { code: "stale_review" } };
    }
    throw error;
  }
}
