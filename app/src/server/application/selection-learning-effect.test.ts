import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewOutputDecisionEvent, NewCalibrationSignal } from "../db/schema";

const mocks = vi.hoisted(() => ({ rows: vi.fn(), insertEvent: vi.fn(), insertSignal: vi.fn(), findSignal: vi.fn(), previous: vi.fn() }));
vi.mock("../db", () => ({ db: { select: () => {
  const query = { from: () => query, innerJoin: () => query, where: () => query, limit: mocks.rows };
  return query;
} } }));
vi.mock("../repositories/output-decision-event", () => ({ insertOutputDecisionEvent: mocks.insertEvent }));
vi.mock("../repositories/calibration-signal", () => ({ insertCalibrationSignal: mocks.insertSignal, findCalibrationSignalByIdempotencyKey: mocks.findSignal }));
vi.mock("../repositories/selection-decisions", () => ({ findPreviousSelectionDecision: mocks.previous }));
vi.mock("../output-learning/dispatch", () => ({ dispatchOutputLearningRecomputeBestEffort: vi.fn() }));

import { applyLearningSelectionEffect } from "./selection-learning-effect";

const decision = {
  id: "decision-1", workspaceId: "workspace-1", workItemId: "work-1", outputId: "output-1",
  clientProfileId: "brand-1", campaignId: null, userId: "selecting-user", createdAt: new Date("2026-10-01T00:00:00Z"),
  contextSnapshot: { creativeLevel: "balanced", generationMode: "single", format: "4:5", qualityScore: 1 },
};
const input = { workspaceId: decision.workspaceId, workItemId: decision.workItemId, outputId: decision.outputId, selectionDecisionId: decision.id };

describe("selection learning evidence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rows.mockResolvedValue([decision]);
    mocks.insertEvent.mockImplementation(async (event: NewOutputDecisionEvent) => ({ ...event, id: "event-1" }));
    mocks.findSignal.mockResolvedValue(null);
    mocks.insertSignal.mockImplementation(async (signal: NewCalibrationSignal) => ({ ...signal, id: "signal-1" }));
  });

  it("keeps agent selection as medium operational evidence without a human signal", async () => {
    mocks.rows.mockResolvedValue([{ ...decision, authorType: "agent", actorId: "mcp-token-prefix", alternatives: [{ outputId: "sister-1", contextSnapshot: {} }] }]);
    expect(await applyLearningSelectionEffect(input, async () => ({ allowed: true }))).toEqual({});
    expect(mocks.insertEvent).toHaveBeenCalledWith(expect.objectContaining({
      authorType: "agent", actorId: "mcp-token-prefix", userId: "selecting-user",
      action: "selected_for_delivery", direction: "positive", strength: "medium", source: "mcp",
      createdAt: decision.createdAt, idempotencyKey: "selection-decision:decision-1:selected_for_delivery",
    }));
    expect(mocks.insertEvent).toHaveBeenCalledTimes(1);
    expect(mocks.insertSignal).not.toHaveBeenCalled();
    expect(mocks.findSignal).not.toHaveBeenCalled();
  });

  it("never fills an old frozen selection snapshot from a later generation record", async () => {
    mocks.rows.mockResolvedValueOnce([decision]).mockResolvedValueOnce([{ clientProfileId: "brand-1", campaignId: null }]);
    mocks.rows.mockResolvedValue([{ clientProfileId: "brand-1", campaignId: null, applications: [{ role: "art_direction", appliedRefs: [], setHash: null, fixedPromptVersion: "later-v9" }] }]);
    await applyLearningSelectionEffect(input, async () => ({ allowed: true }));
    expect(mocks.insertEvent.mock.calls[0][0].contextSnapshot.generationIdentity).toEqual({ state: "unknown", applications: [] });
    expect(mocks.rows).toHaveBeenCalledTimes(3);
  });

  it("projects attributed strong approval and entra without inventing system verdicts", async () => {
    const authorize = vi.fn(async () => ({ allowed: true as const }));
    expect(await applyLearningSelectionEffect(input, authorize)).toEqual({});
    expect(authorize).toHaveBeenCalledWith({ workspaceId: "workspace-1", clientProfileId: "brand-1" });
    expect(mocks.insertEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: "selecting-user", action: "approved", direction: "positive", strength: "strong", source: "composer",
      createdAt: decision.createdAt, creativeWorkOutputId: "output-1", campaignId: null, derivationId: null,
      idempotencyKey: "selection-decision:decision-1:approved", contextSnapshot: expect.objectContaining(decision.contextSnapshot),
    }));
    expect(mocks.insertSignal).toHaveBeenCalledWith(expect.objectContaining({
      humanVerdict: "entra", sourceLabel: "real_customer", reviewerId: "selecting-user", reviewedAt: decision.createdAt,
      systemOlharVerdict: null, systemExportStatus: null, outputDecisionEventId: "event-1",
      idempotencyKey: "selection-decision:decision-1:signal",
    }));
  });

  it("never fills an old frozen alternative snapshot from a later generation record", async () => {
    mocks.rows.mockResolvedValueOnce([{ ...decision, alternatives: [{ outputId: "sister-1", contextSnapshot: {} }] }]);
    mocks.rows.mockResolvedValue([{ clientProfileId: "brand-1", campaignId: null,
      applications: [{ role: "art_direction", appliedRefs: [], setHash: null, fixedPromptVersion: "later-v9" }] }]);
    await applyLearningSelectionEffect(input, async () => ({ allowed: true }));
    expect(mocks.insertEvent.mock.calls[1][0].contextSnapshot).toMatchObject({
      generationIdentity: { state: "unknown", applications: [] }, selectionDecisionId: decision.id, selectedOutputId: decision.outputId,
    });
    expect(mocks.rows).toHaveBeenCalledTimes(4);
  });

  it("projects each frozen alternative as weak implicit evidence linked to the human selection, without another signal", async () => {
    const alternatives = [{ outputId: "sister-1", contextSnapshot: { creativeLevel: "bold", format: "4:5", generationMode: "single" } }];
    mocks.rows.mockResolvedValue([{ ...decision, alternatives }]);
    await applyLearningSelectionEffect(input, async () => ({ allowed: true }));
    expect(mocks.insertEvent).toHaveBeenCalledTimes(2);
    expect(mocks.insertEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "alternative_not_selected", direction: "negative", strength: "weak", creativeWorkOutputId: "sister-1",
      userId: decision.userId, createdAt: decision.createdAt,
      idempotencyKey: "selection-decision:decision-1:alternative:sister-1",
      contextSnapshot: expect.objectContaining({ ...alternatives[0].contextSnapshot, selectionDecisionId: decision.id, selectedOutputId: decision.outputId }),
    }));
    expect(mocks.insertSignal).toHaveBeenCalledTimes(1);
  });

  it("keeps approval and projects the replaced selection as neutral weak evidence linked to both decisions", async () => {
    const previous = { ...decision, id: "decision-a", outputId: "output-a", campaignId: "previous-campaign", contextSnapshot: { creativeLevel: "bold", format: "4:5" } };
    mocks.rows.mockResolvedValue([{ ...decision, previousDecisionId: previous.id, previousOutputId: previous.outputId }]);
    mocks.previous.mockResolvedValue(previous);
    await applyLearningSelectionEffect(input, async () => ({ allowed: true }));
    expect(mocks.insertEvent).toHaveBeenCalledTimes(2);
    expect(mocks.insertEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "selection_replaced", direction: "neutral", strength: "weak", creativeWorkOutputId: previous.outputId, campaignId: decision.campaignId,
      userId: decision.userId, createdAt: decision.createdAt,
      idempotencyKey: "selection-decision:decision-1:replaced:decision-a",
      contextSnapshot: expect.objectContaining({ creativeLevel: "bold", selectionDecisionId: decision.id, previousSelectionDecisionId: previous.id, selectedOutputId: decision.outputId }),
    }));
    expect(mocks.insertSignal).toHaveBeenCalledTimes(1);
  });

  it.each(["local_learning_denied", "brand_out_of_scope", "missing_brand"] as const)("returns terminal denial %s without writing evidence", async (reason) => {
    expect(await applyLearningSelectionEffect(input, async () => ({ allowed: false, reason }))).toEqual({ code: reason });
    expect(mocks.insertEvent).not.toHaveBeenCalled();
    expect(mocks.insertSignal).not.toHaveBeenCalled();
  });

  it("does not acknowledge an unconfirmed signal after the event has persisted", async () => {
    mocks.insertSignal.mockRejectedValue(new Error("database unavailable"));
    await expect(applyLearningSelectionEffect(input, async () => ({ allowed: true }))).rejects.toThrow("database unavailable");
    expect(mocks.insertEvent).toHaveBeenCalled();
  });
});
