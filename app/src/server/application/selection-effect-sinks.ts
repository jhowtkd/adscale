/**
 * Strict idempotent sinks for selection obligations (ICE-03A/03B).
 *
 * Shared by the selection command (inline attempt) and the recovery
 * processor (replay): repeating an effect produces the same logical
 * change. Sinks throw coded errors — never swallow — so the caller can
 * classify transient versus permanent failures. Sinks never generate
 * images, charge, re-approve or select another output.
 */
import { ensureCreativeWorkOutputInLibrary } from "@/server/application/ensure-creative-work-output-library";
import { saveVisualRecipeFromOutput } from "@/server/application/save-visual-recipe";
import { markCreativeWorkSelectionEffectDone } from "@/server/repositories/creative-work";
import { recordCreativeWorkValueEventStrict } from "@/server/creative-work/record-value-event";
import type { VisualRecipe } from "@/server/db/schema";

export function sinkErrorCode(cause: unknown, fallback: string): string {
  const code =
    cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code: unknown }).code)
      : fallback;
  return code.slice(0, 120);
}

export async function applyLibrarySelectionEffect(input: {
  workspaceId: string;
  outputKey: string;
  theme: string;
  creativeLevel: string;
}): Promise<void> {
  const registered = await ensureCreativeWorkOutputInLibrary({
    workspaceId: input.workspaceId,
    outputKey: input.outputKey,
    theme: input.theme,
    creativeLevel: input.creativeLevel,
  });
  if (registered.conflict) {
    throw Object.assign(new Error("library_key_owned_elsewhere"), {
      code: "library_key_owned_elsewhere",
    });
  }
}

export async function applyValueEventSelectionEffect(input: {
  kind: "approved";
  userId: string;
  workspaceId: string;
  creativeWorkId: string;
  outputId: string;
  outputKey: string;
  protocol: string;
  origin?: string | null;
  campaignId?: string | null;
  clientProfileId?: string | null;
  /** Approval time: the value event cohorts on it, never on processing time. */
  occurredAt?: Date;
}): Promise<void> {
  await recordCreativeWorkValueEventStrict(input);
}

export async function applyRecipeSelectionEffect(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  /** Compat receipt close; failures never fail the sink (outbox is authority). */
  receiptId?: string;
}): Promise<{ recipe?: VisualRecipe }> {
  const saved = await saveVisualRecipeFromOutput({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputId: input.outputId,
  }).catch((cause) => ({
    ok: false as const,
    error: { code: sinkErrorCode(cause, "save_recipe_threw") },
  }));
  if (!saved.ok) {
    throw Object.assign(new Error(saved.error.code), { code: saved.error.code });
  }
  if (input.receiptId) {
    // Close the legacy jsonb receipt (non-fatal readers compat); the
    // outbox row stays the authority for the effect state.
    await markCreativeWorkSelectionEffectDone(
      input.workspaceId,
      input.workItemId,
      input.outputId,
      input.receiptId,
    ).catch(() => undefined);
  }
  return { recipe: saved.value.recipe };
}
