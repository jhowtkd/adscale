import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  selectCreativeWorkOutput: vi.fn(),
}));

vi.mock("@/server/application/ensure-creative-work-output-library", () => ({
  ensureCreativeWorkOutputInLibrary: vi.fn(),
}));

vi.mock("@/server/application/save-visual-recipe", () => ({
  saveVisualRecipeFromOutput: vi.fn(),
}));

vi.mock("@/server/creative-work/record-value-event", () => ({
  recordCreativeWorkValueEvent: vi.fn(),
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

import {
  getCreativeWork,
  selectCreativeWorkOutput,
} from "@/server/repositories/creative-work";
import { ensureCreativeWorkOutputInLibrary } from "@/server/application/ensure-creative-work-output-library";
import { saveVisualRecipeFromOutput } from "@/server/application/save-visual-recipe";
import { selectCreativeWorkOutputCommand } from "./select-creative-work-output";
import { recordCreativeWorkValueEvent } from "@/server/creative-work/record-value-event";

const mockGet = vi.mocked(getCreativeWork);
const mockSelect = vi.mocked(selectCreativeWorkOutput);
const mockEnsure = vi.mocked(ensureCreativeWorkOutputInLibrary);
const mockSaveRecipe = vi.mocked(saveVisualRecipeFromOutput);
const mockRecordValue = vi.mocked(recordCreativeWorkValueEvent);

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

describe("selectCreativeWorkOutputCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue({
      ...completedOutput,
      isSelected: true,
    } as never);
    mockEnsure.mockResolvedValue({
      asset: { id: "asset-1" } as never,
      created: true,
    });
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
    });
    expect(mockEnsure).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      outputKey: completedOutput.outputKey,
      theme: "Tema do Post",
      creativeLevel: "balanced",
    });
    expect(mockRecordValue).toHaveBeenCalledWith(expect.objectContaining({
      kind: "approved",
      outputId: "output-1",
      outputKey: completedOutput.outputKey,
      protocol: "social_post",
      origin: "studio",
    }));
  });

  it("skips library ensure when saveToLibrary=false", async () => {
    mockGet.mockResolvedValue({
      work: workItem,
      outputs: [completedOutput],
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
      .mockResolvedValueOnce({ ...completedOutput, isSelected: true })
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
    mockSelect.mockResolvedValue({ ...completedOutput, id: "output-2", isSelected: true } as never);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: "ws-1",
      workItemId: "work-1",
      outputId: "output-2",
      confirmObjective: true,
    });

    expect(result).toMatchObject({ ok: true, value: { output: { id: "output-2", isSelected: true } } });
    expect(mockSelect).toHaveBeenCalledWith("ws-1", "work-1", "output-2", { confirmObjective: true });
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
});
