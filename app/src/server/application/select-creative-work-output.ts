/**
 * Phase 5 / item 38: select a completed creative-work output as the winner.
 * Library registration reuses ensureCreativeWorkOutputInLibrary (item 37).
 */
import { ensureCreativeWorkOutputInLibrary } from "@/server/application/ensure-creative-work-output-library";
import {
  getCreativeWork,
  selectCreativeWorkOutput,
} from "@/server/repositories/creative-work";
import type { CreativeWorkOutput } from "@/server/db/schema";
import { getCreativeWorkSelectionPolicy, type CreativeWorkSelectionPolicy } from "@/lib/creative-work-selection-policy";
import { isLayerizationSelectionLocked, layerizationStateFromDatabase } from "@/server/layerize/contracts";

export type SelectCreativeWorkOutputInput = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  /** Default true — skip library registration when false. */
  saveToLibrary?: boolean;
  /** Required for legacy/inconclusive objective checks; never bypasses a fail. */
  confirmObjective?: boolean;
};

export type SelectCreativeWorkOutputError =
  | { code: "work_not_found" }
  | { code: "work_not_prepared" }
  | { code: "output_not_found" }
  | { code: "output_not_selectable"; status: string }
  | { code: "output_missing_key" }
  | { code: "objective_selection_blocked"; policy: CreativeWorkSelectionPolicy }
  | { code: "objective_confirmation_required"; policy: CreativeWorkSelectionPolicy }
  | { code: "layerization_selection_locked" };


export type SelectCreativeWorkOutputSuccess = {
  output: CreativeWorkOutput;
};

export type SelectCreativeWorkOutputResult =
  | { ok: true; value: SelectCreativeWorkOutputSuccess }
  | { ok: false; error: SelectCreativeWorkOutputError };

export async function selectCreativeWorkOutputCommand(
  input: SelectCreativeWorkOutputInput
): Promise<SelectCreativeWorkOutputResult> {
  const saveToLibrary = input.saveToLibrary ?? true;

  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) {
    return { ok: false, error: { code: "work_not_found" } };
  }
  if (!existing.work.brief) {
    return { ok: false, error: { code: "work_not_prepared" } };
  }

  const output = existing.outputs.find((o) => o.id === input.outputId);
  if (!output) {
    return { ok: false, error: { code: "output_not_found" } };
  }

  if (output.status !== "completed") {
    return {
      ok: false,
      error: { code: "output_not_selectable", status: output.status },
    };
  }

  if (!output.outputKey) {
    return { ok: false, error: { code: "output_missing_key" } };
  }

  const policy = getCreativeWorkSelectionPolicy(output.quality);
  if (!policy.selectable) {
    return { ok: false, error: { code: "objective_selection_blocked", policy } };
  }
  if (policy.requiresConfirmation && !input.confirmObjective) {
    return { ok: false, error: { code: "objective_confirmation_required", policy } };
  }

  const locked = existing.outputs.find((candidate) => (
    candidate.id !== input.outputId
    && isLayerizationSelectionLocked(layerizationStateFromDatabase(candidate.layerization))
  ));
  if (locked) {
    return { ok: false, error: { code: "layerization_selection_locked" } };
  }

  const selected = await selectCreativeWorkOutput(
    input.workspaceId,
    input.workItemId,
    input.outputId,
    { confirmObjective: input.confirmObjective }
  );
  if (!selected) {
    const current = await getCreativeWork(input.workspaceId, input.workItemId);
    const currentOutput = current?.outputs.find((candidate) => candidate.id === input.outputId);
    if (!current) {
      return { ok: false, error: { code: "work_not_found" } };
    }
    if (!currentOutput) {
      return { ok: false, error: { code: "output_not_found" } };
    }
    if (currentOutput.status !== "completed") {
      return {
        ok: false,
        error: { code: "output_not_selectable", status: currentOutput.status },
      };
    }
    if (!currentOutput.outputKey) {
      return { ok: false, error: { code: "output_missing_key" } };
    }
    const currentPolicy = getCreativeWorkSelectionPolicy(currentOutput.quality);
    if (!currentPolicy.selectable) {
      return { ok: false, error: { code: "objective_selection_blocked", policy: currentPolicy } };
    }
    if (currentPolicy.requiresConfirmation && !input.confirmObjective) {
      return { ok: false, error: { code: "objective_confirmation_required", policy: currentPolicy } };
    }
    return { ok: false, error: { code: "output_not_found" } };
  }

  if (saveToLibrary) {
    await ensureCreativeWorkOutputInLibrary({
      workspaceId: input.workspaceId,
      outputKey: output.outputKey,
      theme: existing.work.brief.theme,
      creativeLevel: output.creativeLevel,
    });
  }

  return { ok: true, value: { output: selected } };
}
