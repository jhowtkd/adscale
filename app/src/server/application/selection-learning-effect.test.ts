import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewOutputDecisionEvent, NewCalibrationSignal } from "../db/schema";

const mocks = vi.hoisted(() => ({ rows: vi.fn(), insertEvent: vi.fn(), insertSignal: vi.fn(), findSignal: vi.fn() }));
vi.mock("../db", () => ({ db: { select: () => {
  const query = { from: () => query, innerJoin: () => query, where: () => query, limit: mocks.rows };
  return query;
} } }));
vi.mock("../repositories/output-decision-event", () => ({ insertOutputDecisionEvent: mocks.insertEvent }));
vi.mock("../repositories/calibration-signal", () => ({ insertCalibrationSignal: mocks.insertSignal, findCalibrationSignalByIdempotencyKey: mocks.findSignal }));
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
    mocks.rows.mockResolvedValue([{ ...decision, authorType: "agent", actorId: "mcp-token-prefix" }]);
    expect(await applyLearningSelectionEffect(input, async () => ({ allowed: true }))).toEqual({});
    expect(mocks.insertEvent).toHaveBeenCalledWith(expect.objectContaining({
      authorType: "agent", actorId: "mcp-token-prefix", userId: "selecting-user",
      action: "selected_for_delivery", direction: "positive", strength: "medium", source: "mcp",
      createdAt: decision.createdAt, idempotencyKey: "selection-decision:decision-1:selected_for_delivery",
    }));
    expect(mocks.insertSignal).not.toHaveBeenCalled();
    expect(mocks.findSignal).not.toHaveBeenCalled();
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
