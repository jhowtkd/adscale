/**
 * Phase 5 / item 38: select a completed creative-work output as the winner.
 * Library registration reuses ensureCreativeWorkOutputInLibrary (item 37).
 */
import { ensureCreativeWorkOutputInLibrary } from "@/server/application/ensure-creative-work-output-library";
import {
  getCreativeWork,
  markCreativeWorkSelectionEffectDone,
  reviewCreativeWorkOutputPersonFidelity,
  selectCreativeWorkOutput,
  type ReviewPersonFidelityError,
} from "@/server/repositories/creative-work";
import type { CreativeWorkOutput, VisualRecipe } from "@/server/db/schema";
import { getCreativeWorkSelectionPolicy, type CreativeWorkSelectionPolicy } from "@/lib/creative-work-selection-policy";
import { recordCreativeWorkValueEvent, valueEventFromCreativeWork } from "@/server/creative-work/record-value-event";
import { saveVisualRecipeFromOutput } from "@/server/application/save-visual-recipe";
import { extractVisualRecipe } from "@/server/creative-work/visual-recipe";

export type SelectCreativeWorkOutputInput = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  /** Default true — skip library registration when false. */
  saveToLibrary?: boolean;
  /** Required for legacy/inconclusive objective checks; never bypasses a fail. */
  confirmObjective?: boolean;
  /** Persist a brand-scoped visual recipe from this structured piece. */
  saveAsRecipe?: boolean;
};

export type SelectCreativeWorkOutputError =
  | { code: "work_not_found" }
  | { code: "calibration_managed" }
  | { code: "work_not_prepared" }
  | { code: "output_not_found" }
  | { code: "output_not_selectable"; status: string }
  | { code: "output_missing_key" }
  | { code: "objective_selection_blocked"; policy: CreativeWorkSelectionPolicy }
  | { code: "objective_confirmation_required"; policy: CreativeWorkSelectionPolicy }
  | { code: "visual_recipe_not_structured"; reason: string };


export type SelectionEffect =
  | { status: "done" }
  | { status: "not_requested" }
  | { status: "pending"; receiptId: string }
  | { status: "failed"; code: string; retryable: boolean };

export type SelectionEffects = {
  library: SelectionEffect;
  valueEvent: SelectionEffect;
  recipe: SelectionEffect;
};

export type SelectCreativeWorkOutputSuccess = {
  output: CreativeWorkOutput;
  recipe?: VisualRecipe;
  effects: SelectionEffects;
};

export type SelectCreativeWorkOutputResult =
  | { ok: true; value: SelectCreativeWorkOutputSuccess }
  | { ok: false; error: SelectCreativeWorkOutputError };

/**
 * Um efeito posterior nunca derruba a selecao ja confirmada. Erro inesperado
 * vira estado tipado; a excecao nao sobe. `retryable` diz se outra chamada do
 * MESMO comando pode resolver — nao promete recuperacao automatica.
 */
async function runEffect(
  run: () => Promise<void>,
  fallbackCode: string,
): Promise<SelectionEffect> {
  try {
    await run();
    return { status: "done" };
  } catch (cause) {
    const code = cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code: unknown }).code)
      : fallbackCode;
    return { status: "failed", code, retryable: true };
  }
}

export async function selectCreativeWorkOutputCommand(
  input: SelectCreativeWorkOutputInput
): Promise<SelectCreativeWorkOutputResult> {
  const saveToLibrary = input.saveToLibrary ?? true;

  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) {
    return { ok: false, error: { code: "work_not_found" } };
  }
  // Calibration examples are judged only through their session review —
  // generic selection would leak unvalidated outputs into the library.
  if (existing.work.trainingSessionId) {
    return { ok: false, error: { code: "calibration_managed" } };
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

  const policy = getCreativeWorkSelectionPolicy(output.quality, output.id);
  if (!policy.selectable) {
    return { ok: false, error: { code: "objective_selection_blocked", policy } };
  }
  if (policy.requiresConfirmation && !input.confirmObjective) {
    return { ok: false, error: { code: "objective_confirmation_required", policy } };
  }

  if (input.saveAsRecipe) {
    const structured = extractVisualRecipe({
      workId: existing.work.id,
      outputId: output.id,
      clientProfileId: existing.work.clientProfileId,
      isSelected: true,
      format: output.targetFormat,
      quality: output.quality,
    });
    if (!structured.ok) {
      return { ok: false, error: { code: "visual_recipe_not_structured", reason: structured.error } };
    }
  }

  // Valores ja estreitados pelas validacoes acima (linhas 57 e 73). Capturar
  // em const porque o estreitamento de propriedade nao sobrevive ao closure
  // dos efeitos.
  const outputKey = output.outputKey;
  const briefTheme = existing.work.brief.theme;

  // O recibo identifica a obrigacao persistida. Numa retomada, reutiliza-se o
  // recibo ja gravado — a retentativa salva so o efeito, nunca gera, cobra ou
  // refaz a aprovacao.
  const receiptId = input.saveAsRecipe
    ? output.selectionEffects?.recipe?.receiptId ?? crypto.randomUUID()
    : "";

  const selected = await selectCreativeWorkOutput(
    input.workspaceId,
    input.workItemId,
    input.outputId,
    {
      confirmObjective: input.confirmObjective,
      ...(input.saveAsRecipe ? { pendingRecipeReceiptId: receiptId } : {}),
    }
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
    const currentPolicy = getCreativeWorkSelectionPolicy(currentOutput.quality, currentOutput.id);
    if (!currentPolicy.selectable) {
      return { ok: false, error: { code: "objective_selection_blocked", policy: currentPolicy } };
    }
    if (currentPolicy.requiresConfirmation && !input.confirmObjective) {
      return { ok: false, error: { code: "objective_confirmation_required", policy: currentPolicy } };
    }
    return { ok: false, error: { code: "output_not_found" } };
  }

  // A selecao esta commitada a partir daqui. Nenhum caminho abaixo pode
  // reclassificar isso como fracasso do comando.
  let library: SelectionEffect = { status: "not_requested" };
  if (saveToLibrary) {
    library = await runEffect(async () => {
      const registered = await ensureCreativeWorkOutputInLibrary({
        workspaceId: input.workspaceId,
        outputKey,
        theme: briefTheme,
        creativeLevel: output.creativeLevel,
      });
      if (registered.conflict) {
        throw Object.assign(new Error("library_key_owned_elsewhere"), {
          code: "library_key_owned_elsewhere",
        });
      }
    }, "library_failed");
  }

  let valueEvent: SelectionEffect = { status: "not_requested" };
  const selectedKey = selected.outputKey;
  if (existing.work.createdByUserId && selectedKey) {
    const context = valueEventFromCreativeWork(existing.work);
    valueEvent = await runEffect(async () => {
      await recordCreativeWorkValueEvent({
        ...context,
        kind: "approved",
        outputId: selected.id,
        outputKey: selectedKey,
      });
    }, "value_event_failed");
  }

  let recipe: VisualRecipe | undefined;
  let recipeEffect: SelectionEffect = { status: "not_requested" };
  if (input.saveAsRecipe) {
    const saved = await saveVisualRecipeFromOutput({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      outputId: input.outputId,
    }).catch(() => ({ ok: false as const, error: { code: "save_recipe_threw" } }));
    if (saved.ok) {
      recipe = saved.value.recipe;
      recipeEffect = { status: "done" };
      // Fechar o recibo e efeito nao fatal: se esta escrita curta falhar, o
      // recibo fica pendente e uma nova chamada o reconcilia.
      await runEffect(
        () => markCreativeWorkSelectionEffectDone(
          input.workspaceId, input.workItemId, input.outputId, receiptId,
        ).then(() => undefined),
        "receipt_close_failed",
      );
    } else {
      // O recibo ja existe no banco (gravado na transacao da selecao): a
      // pendencia tem lastro e pode ser retomada pelo mesmo comando.
      recipeEffect = { status: "pending", receiptId };
    }
  }

  return {
    ok: true,
    value: { output: selected, recipe, effects: { library, valueEvent, recipe: recipeEffect } },
  };
}

export type ReviewCreativeWorkPersonFidelityInput = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  userId: string;
  referenceHash: string;
  accepted: boolean;
};

export type ReviewCreativeWorkPersonFidelityError =
  | { code: "work_not_found" }
  | ReviewPersonFidelityError;

export type ReviewCreativeWorkPersonFidelityResult =
  | { ok: true; value: { output: CreativeWorkOutput } }
  | { ok: false; error: ReviewCreativeWorkPersonFidelityError };

/**
 * Record the specific human review of a person-fidelity assessment
 * (plan 03, T3). Authenticated command: verifies workspace/work/output and
 * the reference hash, then persists the bound review. An accepted review
 * resolves inconclusive doubt only — a confirmed mismatch stays blocked and
 * needs a new image. This command registers the review WITHOUT executing
 * selection or its library/revenue effects.
 */
export async function reviewCreativeWorkPersonFidelity(
  input: ReviewCreativeWorkPersonFidelityInput,
): Promise<ReviewCreativeWorkPersonFidelityResult> {
  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) {
    return { ok: false, error: { code: "work_not_found" } };
  }
  const output = existing.outputs.find((candidate) => candidate.id === input.outputId);
  if (!output) {
    return { ok: false, error: { code: "output_not_found" } };
  }
  const reviewed = await reviewCreativeWorkOutputPersonFidelity({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputId: input.outputId,
    actorId: input.userId,
    referenceHash: input.referenceHash,
    accepted: input.accepted,
  });
  if (!reviewed.ok) return reviewed;
  return { ok: true, value: { output: reviewed.output } };
}
