/**
 * Phase 5 / item 38: select a completed creative-work output as the winner.
 * Library registration reuses ensureCreativeWorkOutputInLibrary (item 37).
 *
 * ICE-03A: human approval persists with its requested obligations in one
 * transaction (selection outbox). Post-commit sinks are strict and
 * idempotent — "done" requires a confirmed record, never a tolerant return.
 */
import { db } from "@/server/db";
import { logger } from "@/lib/logger";
import {
  getCreativeWork,
  reviewCreativeWorkOutputPersonFidelity,
  selectCreativeWorkOutput,
  type ReviewPersonFidelityError,
} from "@/server/repositories/creative-work";
import {
  applyLibrarySelectionEffect,
  applyRecipeSelectionEffect,
  applyValueEventSelectionEffect,
} from "@/server/application/selection-effect-sinks";
import { wakeSelectionEffectsProcessor } from "@/server/application/process-selection-effects";
import {
  markSelectionEffectDone,
  recordSelectionEffectAttempt,
  type DurableEffectState,
  type EnqueuedSelectionEffect,
  type EnqueueSelectionEffectRequest,
} from "@/server/repositories/selection-effects";
import type { CreativeWorkOutput, VisualRecipe } from "@/server/db/schema";
import { getCreativeWorkSelectionPolicy, type CreativeWorkSelectionPolicy } from "@/lib/creative-work-selection-policy";
import { valueEventFromCreativeWork } from "@/server/creative-work/record-value-event";
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
  /**
   * Quem seleciona. `agent` = Seleção por agente (#355): respeita a
   * reprovação objetiva, mas pula biblioteca, evento de valor e receita —
   * não conta em métricas nem na Calibração até o operador confirmar.
   */
  selectedBy?: "operator" | "agent";
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
 * Project a durable row to the interface contract. "done" surfaces only for
 * confirmed rows; unfinished work reports pending for convergence; only a
 * dead or canceled row reports failure.
 */
export function durableEffectToProjection(effect: {
  id: string;
  state: DurableEffectState;
  errorCode: string | null;
}): SelectionEffect {
  switch (effect.state) {
    case "done":
      return { status: "done" };
    case "dead":
      return { status: "failed", code: effect.errorCode ?? "effect_dead", retryable: false };
    case "canceled":
      return { status: "failed", code: "effect_canceled", retryable: false };
    default:
      return { status: "pending", receiptId: effect.id };
  }
}

/**
 * Project an output's outbox rows to the interface contract. Kinds without
 * a row were never requested; the table itself is never exposed.
 */
export function projectOutputSelectionEffects(
  rows: Array<{
    kind: "library" | "value_event" | "recipe";
    id: string;
    state: DurableEffectState;
    errorCode: string | null;
  }>,
): SelectionEffects {
  const byKind = new Map(rows.map((row) => [row.kind, row]));
  const project = (kind: "library" | "value_event" | "recipe"): SelectionEffect => {
    const row = byKind.get(kind);
    return row ? durableEffectToProjection(row) : { status: "not_requested" };
  };
  return {
    library: project("library"),
    valueEvent: project("value_event"),
    recipe: project("recipe"),
  };
}

function effectErrorCode(cause: unknown, fallback: string): string {
  const code =
    cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code: unknown }).code)
      : fallback;
  return code.slice(0, 120);
}

/**
 * Execute one outbox obligation post-commit. A later failure never topples
 * the confirmed selection: it lands as a pending row for convergence
 * (replay of this same command, or the ICE-03B recovery processor).
 * Already-settled rows project their state without re-executing.
 */
async function executeOutboxEffect(
  enqueued: EnqueuedSelectionEffect,
  run: () => Promise<void>,
  fallbackCode: string,
): Promise<SelectionEffect> {
  if (!enqueued.created && enqueued.effect.state !== "pending") {
    return durableEffectToProjection(enqueued.effect);
  }
  try {
    await run();
  } catch (cause) {
    const code = effectErrorCode(cause, fallbackCode);
    await recordSelectionEffectAttempt(db, {
      id: enqueued.effect.id,
      errorCode: code,
    }).catch((recordError) => {
      logger.warn({
        event: "selection_effect_attempt_unrecorded",
        effectId: enqueued.effect.id,
        code,
        recordError: String(recordError),
      });
    });
    return { status: "pending", receiptId: enqueued.effect.id };
  }
  try {
    await markSelectionEffectDone(db, { id: enqueued.effect.id });
  } catch (cause) {
    // Sink wrote but confirmation did not persist: stay pending so recovery
    // replays the idempotent sink instead of claiming an unconfirmed "done".
    await recordSelectionEffectAttempt(db, {
      id: enqueued.effect.id,
      errorCode: "effect_confirm_failed",
    }).catch(() => undefined);
    logger.warn({
      event: "selection_effect_confirm_failed",
      effectId: enqueued.effect.id,
      cause: String(cause),
    });
    return { status: "pending", receiptId: enqueued.effect.id };
  }
  return { status: "done" };
}

export async function selectCreativeWorkOutputCommand(
  input: SelectCreativeWorkOutputInput
): Promise<SelectCreativeWorkOutputResult> {
  const selectedBy = input.selectedBy ?? "operator";
  const isAgent = selectedBy === "agent";
  const saveToLibrary = isAgent ? false : (input.saveToLibrary ?? true);
  const saveAsRecipe = isAgent ? false : input.saveAsRecipe;

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

  if (saveAsRecipe) {
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
  const receiptId = saveAsRecipe
    ? output.selectionEffects?.recipe?.receiptId ?? crypto.randomUUID()
    : "";
  const requestedAt = new Date();

  const effectRequests: EnqueueSelectionEffectRequest[] = [];
  if (saveToLibrary) {
    effectRequests.push({
      kind: "library",
      payload: {
        version: 1,
        kind: "library",
        outputKey,
        theme: briefTheme,
        creativeLevel: output.creativeLevel,
      },
    });
  }
  // Seleção por agente não registra evento de valor: sem métricas até o operador confirmar.
  const valueContext =
    !isAgent && existing.work.createdByUserId && outputKey
      ? valueEventFromCreativeWork(existing.work)
      : null;
  if (valueContext) {
    effectRequests.push({
      kind: "value_event",
      payload: {
        version: 1,
        kind: "value_event",
        eventKey: "creative_work_approved",
        userId: valueContext.userId,
        protocol: valueContext.protocol,
        origin: valueContext.origin,
        campaignId: valueContext.campaignId,
        clientProfileId: valueContext.clientProfileId,
        creativeWorkId: valueContext.creativeWorkId,
        outputKey,
      },
    });
  }
  if (saveAsRecipe) {
    effectRequests.push({
      kind: "recipe",
      payload: { version: 1, kind: "recipe", receiptId },
    });
  }

  const selection = await selectCreativeWorkOutput(
    input.workspaceId,
    input.workItemId,
    input.outputId,
    {
      confirmObjective: input.confirmObjective,
      // Ramo operador preserva a chamada exata (repositório defaulteia operator).
      ...(isAgent ? { selectedBy: selectedBy as "agent" } : {}),
      ...(saveAsRecipe ? { pendingRecipeReceiptId: receiptId } : {}),
      effects: effectRequests,
      effectsRequestedAt: requestedAt,
    }
  );
  if (!selection) {
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
  const selected = selection.output;
  const enqueuedByKind = new Map(selection.enqueued.map((entry) => [entry.kind, entry]));

  // A selecao esta commitada a partir daqui. Nenhum caminho abaixo pode
  // reclassificar isso como fracasso do comando.
  let library: SelectionEffect = { status: "not_requested" };
  const libraryEntry = enqueuedByKind.get("library");
  if (libraryEntry) {
    library = await executeOutboxEffect(libraryEntry, async () => {
      await applyLibrarySelectionEffect({
        workspaceId: input.workspaceId,
        outputKey,
        theme: briefTheme,
        creativeLevel: output.creativeLevel,
      });
    }, "library_failed");
  }

  let valueEvent: SelectionEffect = { status: "not_requested" };
  const valueEntry = enqueuedByKind.get("value_event");
  // selected.outputKey tem garantia de repositório; outputKey é o fallback inalcançável.
  const selectedKey = selected.outputKey ?? outputKey;
  if (valueEntry && valueContext) {
    valueEvent = await executeOutboxEffect(valueEntry, async () => {
      await applyValueEventSelectionEffect({
        ...valueContext,
        kind: "approved",
        outputId: selected.id,
        outputKey: selectedKey,
      });
    }, "value_event_failed");
  }

  let recipe: VisualRecipe | undefined;
  let recipeEffect: SelectionEffect = { status: "not_requested" };
  const recipeEntry = enqueuedByKind.get("recipe");
  if (recipeEntry) {
    recipeEffect = await executeOutboxEffect(recipeEntry, async () => {
      const saved = await applyRecipeSelectionEffect({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        outputId: input.outputId,
        receiptId,
      });
      recipe = saved.recipe;
    }, "save_recipe_failed");
  }

  const effects = { library, valueEvent, recipe: recipeEffect };
  // Anything still pending converges on its own: wake the processor
  // (best effort — the sweep recovers a lost wake-up). The selection is
  // committed either way; this never fails the command.
  if ([library, valueEvent, recipeEffect].some((effect) => effect.status === "pending")) {
    await wakeSelectionEffectsProcessor({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      outputId: input.outputId,
    });
  }
  return { ok: true, value: { output: selected, recipe, effects } };
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
