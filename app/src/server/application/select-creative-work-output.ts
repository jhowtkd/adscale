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

export type SelectCreativeWorkOutputInput = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  /** Default true — skip library registration when false. */
  saveToLibrary?: boolean;
};

export type SelectCreativeWorkOutputError =
  | { code: "work_not_found" }
  | { code: "work_not_prepared" }
  | { code: "output_not_found" }
  | { code: "output_not_selectable"; status: string }
  | { code: "output_missing_key" };

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

  const selected = await selectCreativeWorkOutput(
    input.workspaceId,
    input.workItemId,
    input.outputId
  );
  if (!selected) {
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
