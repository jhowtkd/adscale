import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  markCreativeWorkSelectionEffectDone: vi.fn(),
  selectCreativeWorkOutput: vi.fn(),
  reviewCreativeWorkOutputPersonFidelity: vi.fn(),
}));

vi.mock("@/server/repositories/selection-effects", () => ({
  markSelectionEffectDone: vi.fn(),
  recordSelectionEffectAttempt: vi.fn(),
}));

vi.mock("@/server/application/ensure-creative-work-output-library", () => ({
  ensureCreativeWorkOutputInLibrary: vi.fn(),
}));

vi.mock("@/server/application/save-visual-recipe", () => ({
  saveVisualRecipeFromOutput: vi.fn(),
}));

vi.mock("@/server/creative-work/record-value-event", () => ({
  recordCreativeWorkValueEventStrict: vi.fn(),
  valueEventFromCreativeWork: vi.fn((work: { id: string; workspaceId: string; createdByUserId: string; clientProfileId: string; campaignId?: string | null; toolKind: string }) => ({
    userId: work.createdByUserId,
    workspaceId: work.workspaceId,
    creativeWorkId: work.id,
    protocol: work.toolKind,
    origin: work.campaignId ? "campaign" : "studio",
    campaignId: work.campaignId ?? null,
    clientProfileId: work.clientProfileId,
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  getCreativeWork,
  markCreativeWorkSelectionEffectDone,
  reviewCreativeWorkOutputPersonFidelity,
  selectCreativeWorkOutput,
} from "@/server/repositories/creative-work";
import {
  markSelectionEffectDone,
  recordSelectionEffectAttempt,
} from "@/server/repositories/selection-effects";
import { ensureCreativeWorkOutputInLibrary } from "@/server/application/ensure-creative-work-output-library";
import { saveVisualRecipeFromOutput } from "@/server/application/save-visual-recipe";
import { durableEffectToProjection, reviewCreativeWorkPersonFidelity, selectCreativeWorkOutputCommand } from "./select-creative-work-output";
import { recordCreativeWorkValueEventStrict } from "@/server/creative-work/record-value-event";

const mockGet = vi.mocked(getCreativeWork);
const mockSelect = vi.mocked(selectCreativeWorkOutput);
const mockReviewPersonFidelity = vi.mocked(reviewCreativeWorkOutputPersonFidelity);
const mockEnsure = vi.mocked(ensureCreativeWorkOutputInLibrary);
const mockSaveRecipe = vi.mocked(saveVisualRecipeFromOutput);
const mockRecordValueStrict = vi.mocked(recordCreativeWorkValueEventStrict);
const mockMarkDone = vi.mocked(markSelectionEffectDone);
const mockRecordAttempt = vi.mocked(recordSelectionEffectAttempt);
const mockMarkRecipeDone = vi.mocked(markCreativeWorkSelectionEffectDone);

function enqueuedEntry(kind: string, overrides: Record<string, unknown> = {}) {
  return {
    kind,
    created: true,
    effect: { id: `effect-${kind}`, state: "pending", errorCode: null },
    ...overrides,
  };
}

const workItem = {
  id: "work-1",
  workspaceId: "ws-1",
  createdByUserId: "user-1",
  clientProfileId: "profile-1",
  campaignId: null,
  toolKind: "social_post",
  brief: { theme: "Tema do Post", objective: "O", audience: "A", offer: "Of" },
};

const completedOutput = {
  id: "output-1",
  workspaceId: "ws-1",
  workItemId: "work-1",
  creativeLevel: "balanced",
  status: "completed",
  outputKey: "creative-work/output-1/out.png",
  isSelected: false,
};

/**
 * Peça estruturada mínima que satisfaz extractVisualRecipe: tipografia
 * determinística, layout válido, fonte, copy completa e geometria de logo.
 * Sem ela a pré-validação recusa antes do commit e o teste mediria outra coisa.
 */
const structuredOutput = {
  ...completedOutput,
  targetFormat: "4:5",
  quality: {
    textComposition: {
      execution: "deterministic",
      appliedLayout: "bottom",
      typographyPlan: { fontAssetKey: "brand/fonts/inter.ttf" },
      copy: { headline: "Titulo", body: "Corpo", cta: "Clique" },
      dimensions: { width: 1080, height: 1350 },
      layers: [{ role: "headline", box: { left: 80, top: 900, width: 920, height: 120 } }],
    },
    exactComposition: {
      composed: [
        {
          referenceId: "ref-logo",
          assetKey: "brand/logo.png",
          category: "logo",
          box: { left: 80, top: 80, width: 200, height: 80 },
        },
      ],
      dimensions: { width: 1080, height: 1350 },
    },
  },
};

describe("selectCreativeWorkOutputCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue({
      output: { ...completedOutput, isSelected: true },
      enqueued: [enqueuedEntry("library"), enqueuedEntry("value_event")],
    } as never);
    mockEnsure.mockResolvedValue({
      asset: { id: "asset-1" } as never,
      created: true,
    });
    mockRecordValueStrict.mockResolvedValue({} as never);
    mockMarkDone.mockResolvedValue(undefined as never);
    mockRecordAttempt.mockResolvedValue(undefined as never);
    mockMarkRecipeDone.mockResolvedValue(undefined as never);
  });

  it("selects completed output and ensures library by default", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [completedOutput],
    } as never);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      confirmObjective: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.output.isSelected).toBe(true);
    expect(mockSelect).toHaveBeenCalledWith("ws-1", "work-1", "output-1", {
      confirmObjective: true,
      effects: [
        {
          kind: "library",
          payload: expect.objectContaining({
            kind: "library",
            outputKey: completedOutput.outputKey,
            theme: "Tema do Post",
          }),
        },
        {
          kind: "value_event",
          payload: expect.objectContaining({
            kind: "value_event",
            eventKey: "creative_work_approved",
            protocol: "social_post",
          }),
        },
      ],
      effectsRequestedAt: expect.any(Date),
    });
    expect(mockEnsure).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      outputKey: completedOutput.outputKey,
      theme: "Tema do Post",
      creativeLevel: "balanced",
    });
    expect(mockRecordValueStrict).toHaveBeenCalledWith(expect.objectContaining({
      kind: "approved",
      outputId: "output-1",
      outputKey: completedOutput.outputKey,
      protocol: "social_post",
      origin: "studio",
    }));
    expect(result.value.effects).toEqual({
      library: { status: "done" },
      valueEvent: { status: "done" },
      recipe: { status: "not_requested" },
    });
    expect(mockMarkDone).toHaveBeenCalledTimes(2);
  });

  it("agent selection skips library, value event and recipe (Seleção por agente)", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{
        ...completedOutput,
        quality: { schemaVersion: 1, objectiveVerdict: "pass", qualityScore: 1 },
      }],
    } as never);
    mockSelect.mockResolvedValue({
      output: { ...completedOutput, isSelected: true },
      enqueued: [],
    } as never);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      selectedBy: "agent",
      saveAsRecipe: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockSelect).toHaveBeenCalledWith("ws-1", "work-1", "output-1", {
      confirmObjective: undefined,
      selectedBy: "agent",
      effects: [],
      effectsRequestedAt: expect.any(Date),
    });
    expect(mockEnsure).not.toHaveBeenCalled();
    expect(mockRecordValueStrict).not.toHaveBeenCalled();
    expect(mockSaveRecipe).not.toHaveBeenCalled();
    expect(result.value.effects).toEqual({
      library: { status: "not_requested" },
      valueEvent: { status: "not_requested" },
      recipe: { status: "not_requested" },
    });
  });

  it("operator confirmation after agent selection enqueues the then-legitimate effects", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{
        ...completedOutput,
        isSelected: true,
        selectedBy: "agent",
        quality: { schemaVersion: 1, objectiveVerdict: "pass", qualityScore: 1 },
      }],
    } as never);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      confirmObjective: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mockEnsure).toHaveBeenCalledTimes(1);
    expect(mockRecordValueStrict).toHaveBeenCalledTimes(1);
    expect(result.value.effects).toEqual({
      library: { status: "done" },
      valueEvent: { status: "done" },
      recipe: { status: "not_requested" },
    });
  });

  it("skips library ensure when saveToLibrary=false", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [completedOutput],
    } as never);
    mockSelect.mockResolvedValue({
      output: { ...completedOutput, isSelected: true },
      enqueued: [enqueuedEntry("value_event")],
    } as never);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      saveToLibrary: false,
      confirmObjective: true,
    });

    expect(result.ok).toBe(true);
    expect(mockEnsure).not.toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalledWith(
      "ws-1",
      "work-1",
      "output-1",
      expect.objectContaining({
        effects: [expect.objectContaining({ kind: "value_event" })],
      }),
    );
  });

  it("selects an objective pass directly regardless of subjective score", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{
        ...completedOutput,
        quality: { schemaVersion: 1, objectiveVerdict: "pass", qualityScore: 1 },
      }],
    } as never);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });

    expect(result.ok).toBe(true);
    expect(mockSelect).toHaveBeenCalledWith("ws-1", "work-1", "output-1", {
      confirmObjective: undefined,
      effects: expect.any(Array),
      effectsRequestedAt: expect.any(Date),
    });
  });

  it.each([
    [{ schemaVersion: 1, objectiveVerdict: "fail", qualityScore: 100 }, "objective_fail"],
    [{ qualityVerdict: "invalid", qualityScore: 100 }, "objective_legacy_fail"],
    [{ qualityVerdict: "acceptable", hardFailures: [{ code: "wrong_brand" }] }, "objective_legacy_fail"],
  ] as const)("blocks an objective rejection for %j", async (quality, rationale) => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{ ...completedOutput, quality }],
    } as never);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      confirmObjective: true,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "objective_selection_blocked",
        policy: expect.objectContaining({ rationale, nextStep: "generate_again" }),
      },
    });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation for inconclusive and safe legacy outputs", async () => {
    for (const quality of [
      { schemaVersion: 1, objectiveVerdict: "inconclusive" },
      { qualityVerdict: "improvable", qualityScore: 40 },
    ]) {
      vi.clearAllMocks();
      mockGet.mockResolvedValue({
        work: workItem,
        outputs: [{ ...completedOutput, quality }],
      } as never);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
      });

      expect(result).toEqual({
        ok: false,
        error: expect.objectContaining({ code: "objective_confirmation_required" }),
      });
      expect(mockSelect).not.toHaveBeenCalled();
    }
  });

  it("reports the current objective block when selection loses a quality race", async () => {
    mockGet
      .mockResolvedValueOnce({
        work: workItem,
        outputs: [{
          ...completedOutput,
          quality: { schemaVersion: 1, objectiveVerdict: "pass" },
        }],
      } as never)
      .mockResolvedValueOnce({
        work: workItem,
        outputs: [{
          ...completedOutput,
          quality: { schemaVersion: 1, objectiveVerdict: "fail" },
        }],
      } as never);
    mockSelect.mockResolvedValue(null);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      confirmObjective: true,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "objective_selection_blocked" }),
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it("allows only one concurrent caller to win a selection race", async () => {
    let readCount = 0;
    mockGet.mockImplementation(async () => {
      readCount += 1;
      return {
        work: workItem,
        outputs: [{
          ...completedOutput,
          quality:
            readCount <= 2
              ? { schemaVersion: 1, objectiveVerdict: "pass" }
              : { schemaVersion: 1, objectiveVerdict: "fail" },
        }],
      } as never;
    });
    mockSelect
      .mockResolvedValueOnce({
        output: { ...completedOutput, isSelected: true },
        enqueued: [enqueuedEntry("library"), enqueuedEntry("value_event")],
      })
      .mockResolvedValueOnce(null);

    const results = await Promise.all([
      selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
      }),
      selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
      }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, error: expect.objectContaining({ code: "objective_selection_blocked" }) },
    ]);
    expect(mockEnsure).toHaveBeenCalledTimes(1);
  });

  it("rejects missing work", async () => {
    mockGet.mockResolvedValue(null);
    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "missing",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("work_not_found");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("rejects an unprepared work before selecting", async () => {
    mockGet.mockResolvedValue({ work: { ...workItem, brief: null }, outputs: [completedOutput], sources: [] } as never);
    const result = await selectCreativeWorkOutputCommand({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" });
    expect(result).toEqual({ ok: false, error: { code: "work_not_prepared" } });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("rejects missing output", async () => {
    mockGet.mockResolvedValue({ work: workItem, outputs: [] } as never);
    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("output_not_found");
  });

  it("rejects non-completed output", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [{ ...completedOutput, status: "processing" }],
    } as never);
    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("output_not_selectable");
      if (result.error.code === "output_not_selectable") {
        expect(result.error.status).toBe("processing");
      }
    }
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("selects another Piece while layerization is still pre-submit", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [
        {
          ...completedOutput,
          id: "output-locked",
          isSelected: true,
          layerization: {
            status: "queued",
            attemptId: "attempt-1",
            callbackTokenHash: "a".repeat(64),
            callbackConsumedAt: null,
            requestedByUserId: "owner-1",
            createdAt: "2026-08-13T12:00:00.000Z",
            updatedAt: "2026-08-13T12:00:00.000Z",
            callbackDeadlineAt: "2026-08-13T14:00:00.000Z",
            latencyMs: null,
            providerRequestId: null,
            providerModel: "bytedance/seedream/v5/pro/layerize",
            providerEndpoint: "https://queue.fal.run/bytedance/seedream/v5/pro/layerize",
            estimatedCostUsd: null,
            baseWidth: null,
            baseHeight: null,
            layers: [],
            psdKey: null,
            diagnosticZipKey: null,
            fidelity: null,
            failureCode: null,
          },
        },
        { ...completedOutput, id: "output-2" },
      ],
    } as never);
    mockSelect.mockResolvedValue({
      output: { ...completedOutput, id: "output-2", isSelected: true },
      enqueued: [enqueuedEntry("library"), enqueuedEntry("value_event")],
    } as never);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-2",
      confirmObjective: true,
    });

    // Troca posterior da peça: a nova seleção enfileira e executa as
    // obrigações da peça nova, sem reaproveitar as da peça anterior.
    expect(result).toMatchObject({
      ok: true,
      value: {
        output: { id: "output-2", isSelected: true },
        effects: { library: { status: "done" }, valueEvent: { status: "done" } },
      },
    });
    expect(mockSelect).toHaveBeenCalledWith("ws-1", "work-1", "output-2", {
      confirmObjective: true,
      effects: expect.any(Array),
      effectsRequestedAt: expect.any(Date),
    });
  });

  it("rejects saveAsRecipe when the piece is raster-only", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [completedOutput],
    } as never);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      confirmObjective: true,
      saveAsRecipe: true,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "visual_recipe_not_structured", reason: "raster_only" },
    });
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockSaveRecipe).not.toHaveBeenCalled();
  });

  describe("efeitos posteriores ao commit da selecao", () => {
    function mockEnqueuedSelection(output: Record<string, unknown>, kinds: string[]) {
      mockSelect.mockResolvedValue({
        output: { ...output, isSelected: true },
        enqueued: kinds.map((kind) => enqueuedEntry(kind)),
      } as never);
    }

    it("confirma a selecao e marca a receita como pendente quando o efeito falha", async () => {
      mockGet.mockResolvedValue({ work: workItem, outputs: [structuredOutput], sources: [] } as never);
      mockEnqueuedSelection(structuredOutput, ["library", "value_event", "recipe"]);
      mockSaveRecipe.mockResolvedValue({ ok: false, error: { code: "missing_font" } } as never);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
        saveAsRecipe: true,
      });

      expect(result).toMatchObject({
        ok: true,
        value: {
          output: { isSelected: true },
          effects: { recipe: { status: "pending", receiptId: "effect-recipe" } },
        },
      });
      // O recibo veio da transacao, nao foi inventado na resposta.
      expect(mockSelect).toHaveBeenCalledWith(
        "ws-1",
        "work-1",
        "output-1",
        expect.objectContaining({ pendingRecipeReceiptId: expect.any(String) }),
      );
      expect(mockRecordAttempt).toHaveBeenCalledWith(expect.anything(), {
        id: "effect-recipe",
        errorCode: "missing_font",
      });
    });

    it("confirma a selecao quando a biblioteca falha e registra a pendencia duravel", async () => {
      mockGet.mockResolvedValue({ work: workItem, outputs: [completedOutput], sources: [] } as never);
      mockEnqueuedSelection(completedOutput, ["library", "value_event"]);
      mockEnsure.mockRejectedValue(
        Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }),
      );

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
        saveToLibrary: true,
      });

      expect(result).toMatchObject({
        ok: true,
        value: { effects: { library: { status: "pending", receiptId: "effect-library" } } },
      });
      expect(mockRecordAttempt).toHaveBeenCalledWith(expect.anything(), {
        id: "effect-library",
        errorCode: "23505",
      });
      expect(mockMarkDone).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: "effect-library" }),
      );
    });

    it("isola os efeitos: a falha da biblioteca nao impede o evento de valor nem a receita", async () => {
      mockGet.mockResolvedValue({ work: workItem, outputs: [structuredOutput], sources: [] } as never);
      mockEnqueuedSelection(structuredOutput, ["library", "value_event", "recipe"]);
      mockEnsure.mockRejectedValue(new Error("head timeout"));
      mockSaveRecipe.mockResolvedValue({ ok: true, value: { recipe: { version: 1 } } } as never);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
        saveToLibrary: true,
        saveAsRecipe: true,
      });

      expect(result).toMatchObject({
        ok: true,
        value: {
          effects: {
            library: { status: "pending" },
            valueEvent: { status: "done" },
            recipe: { status: "done" },
          },
        },
      });
      expect(mockRecordValueStrict).toHaveBeenCalledTimes(1);
      expect(mockSaveRecipe).toHaveBeenCalledTimes(1);
      expect(mockMarkRecipeDone).toHaveBeenCalledTimes(1);
    });

    it("marca not_requested o que nao foi pedido", async () => {
      mockGet.mockResolvedValue({ work: workItem, outputs: [completedOutput], sources: [] } as never);
      mockEnqueuedSelection(completedOutput, ["value_event"]);
      mockEnsure.mockResolvedValue({ asset: { id: "asset-1" }, created: true } as never);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
        saveToLibrary: false,
      });

      expect(result).toMatchObject({
        ok: true,
        value: { effects: { library: { status: "not_requested" }, recipe: { status: "not_requested" } } },
      });
      expect(mockEnsure).not.toHaveBeenCalled();
    });

    it("replay nao reexecuta efeitos liquidados e projeta o estado duravel", async () => {
      mockGet.mockResolvedValue({ work: workItem, outputs: [completedOutput], sources: [] } as never);
      mockSelect.mockResolvedValue({
        output: { ...completedOutput, isSelected: true },
        enqueued: [
          enqueuedEntry("library", {
            created: false,
            effect: { id: "effect-library", state: "done", errorCode: null },
          }),
          enqueuedEntry("value_event", {
            created: false,
            effect: { id: "effect-value", state: "done", errorCode: null },
          }),
        ],
      } as never);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
      });

      expect(result).toMatchObject({
        ok: true,
        value: {
          effects: { library: { status: "done" }, valueEvent: { status: "done" } },
        },
      });
      expect(mockEnsure).not.toHaveBeenCalled();
      expect(mockRecordValueStrict).not.toHaveBeenCalled();
      expect(mockMarkDone).not.toHaveBeenCalled();
    });

    it("mantem erro de validacao ANTES do commit como erro do comando", async () => {
      mockGet.mockResolvedValue({ work: workItem, outputs: [completedOutput], sources: [] } as never);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
        saveAsRecipe: true,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "visual_recipe_not_structured", reason: "raster_only" },
      });
      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockSaveRecipe).not.toHaveBeenCalled();
    });

    it("retoma somente o efeito pendente numa segunda chamada, sem regerar nem recobrar", async () => {
      mockGet.mockResolvedValue({
        work: workItem,
        outputs: [{
          ...structuredOutput,
          isSelected: true,
          selectionEffects: {
            version: 1,
            recipe: { receiptId: "receipt-1", requestedAt: "2026-09-12T10:00:00.000Z", state: "pending" },
          },
        }],
        sources: [],
      } as never);
      mockSelect.mockResolvedValue({
        output: { ...structuredOutput, isSelected: true },
        enqueued: [
          enqueuedEntry("library"),
          enqueuedEntry("value_event"),
          enqueuedEntry("recipe", {
            created: false,
            effect: { id: "effect-recipe", state: "pending", errorCode: null },
          }),
        ],
      } as never);
      mockSaveRecipe.mockResolvedValue({ ok: true, value: { recipe: { version: 1 } } } as never);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: "ws-1",
        workItemId: "work-1",
        outputId: "output-1",
        confirmObjective: true,
        saveAsRecipe: true,
      });

      expect(result).toMatchObject({ ok: true, value: { effects: { recipe: { status: "done" } } } });
      // O recibo existente e reutilizado: a retentativa nao cria outra obrigacao.
      expect(mockSelect).toHaveBeenCalledWith(
        "ws-1",
        "work-1",
        "output-1",
        expect.objectContaining({ pendingRecipeReceiptId: "receipt-1" }),
      );
      expect(mockSaveRecipe).toHaveBeenCalledTimes(1);
    });
  });

  describe("durableEffectToProjection", () => {
    it("maps durable states to the interface contract", () => {
      expect(
        durableEffectToProjection({ id: "e1", state: "done", errorCode: null }),
      ).toEqual({ status: "done" });
      expect(
        durableEffectToProjection({ id: "e2", state: "pending", errorCode: null }),
      ).toEqual({ status: "pending", receiptId: "e2" });
      expect(
        durableEffectToProjection({ id: "e3", state: "processing", errorCode: null }),
      ).toEqual({ status: "pending", receiptId: "e3" });
      expect(
        durableEffectToProjection({ id: "e4", state: "retry_wait", errorCode: "timeout" }),
      ).toEqual({ status: "pending", receiptId: "e4" });
      expect(
        durableEffectToProjection({ id: "e5", state: "dead", errorCode: "library_key_owned_elsewhere" }),
      ).toEqual({ status: "failed", code: "library_key_owned_elsewhere", retryable: false });
      expect(
        durableEffectToProjection({ id: "e6", state: "dead", errorCode: null }),
      ).toEqual({ status: "failed", code: "effect_dead", retryable: false });
      expect(
        durableEffectToProjection({ id: "e7", state: "canceled", errorCode: null }),
      ).toEqual({ status: "failed", code: "effect_canceled", retryable: false });
    });
  });
});

describe("reviewCreativeWorkPersonFidelity (plan 03, T3)", () => {
  const HASH = "a".repeat(64);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function reviewInput(overrides: Record<string, unknown> = {}) {
    return {
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      userId: "user-1",
      referenceHash: HASH,
      accepted: true,
      ...overrides,
    };
  }

  it("records the bound review without executing selection effects", async () => {
    mockGet.mockResolvedValue({ work: workItem, outputs: [completedOutput] } as never);
    mockReviewPersonFidelity.mockResolvedValue({ ok: true, output: completedOutput } as never);

    const result = await reviewCreativeWorkPersonFidelity(reviewInput());

    expect(result).toEqual({ ok: true, value: { output: completedOutput } });
    expect(mockReviewPersonFidelity).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-1",
      actorId: "user-1",
      referenceHash: HASH,
      accepted: true,
    });
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockEnsure).not.toHaveBeenCalled();
    expect(mockRecordValueStrict).not.toHaveBeenCalled();
  });

  it("rejects unknown work, unknown output and stale hashes", async () => {
    mockGet.mockResolvedValue(null as never);
    await expect(reviewCreativeWorkPersonFidelity(reviewInput())).resolves.toEqual({
      ok: false,
      error: { code: "work_not_found" },
    });

    mockGet.mockResolvedValue({ work: workItem, outputs: [completedOutput] } as never);
    await expect(reviewCreativeWorkPersonFidelity(reviewInput({ outputId: "output-9" }))).resolves.toEqual({
      ok: false,
      error: { code: "output_not_found" },
    });

    mockReviewPersonFidelity.mockResolvedValue({ ok: false, error: { code: "stale_reference" } } as never);
    await expect(reviewCreativeWorkPersonFidelity(reviewInput())).resolves.toEqual({
      ok: false,
      error: { code: "stale_reference" },
    });
  });

  it("refuses generic selection of calibration examples (plan 01, T2)", async () => {
    mockGet.mockResolvedValue({
      work: { ...workItem, trainingSessionId: "session-1", trainingRound: 1, trainingSlot: 0 },
      outputs: [completedOutput],
    } as never);
    await expect(
      selectCreativeWorkOutputCommand({ workspaceId: "ws-1", workItemId: "work-1", outputId: "output-1" }),
    ).resolves.toEqual({ ok: false, error: { code: "calibration_managed" } });
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockEnsure).not.toHaveBeenCalled();
  });
});
