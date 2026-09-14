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
import { GENERATION_CREDIT_COSTS } from "@/server/generation/canonical/types";
import { logCreativeWorkGenerationLifecycle } from "@/server/creative-work/job-telemetry";

type RevisionErrorCode =
  | "work_not_found"
  | "output_not_ready"
  | "invalid_revision"
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

export async function reviseCreativeWorkOutput(input: {
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
}): Promise<ReviseCreativeWorkOutputResult> {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!aggregate) return { ok: false, error: { code: "work_not_found" } };

  const parent = aggregate.outputs.find((output) => output.id === input.outputId);
  if (!parent || parent.status !== "completed" || !parent.outputKey) {
    return { ok: false, error: { code: "output_not_ready" } };
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
