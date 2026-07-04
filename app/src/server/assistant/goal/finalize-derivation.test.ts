import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  action: vi.fn(), thread: vi.fn(), goal: vi.fn(), adopt: vi.fn(), sync: vi.fn(),
  derivations: vi.fn(), update: vi.fn(), notify: vi.fn(), addressed: vi.fn(),
}));
vi.mock("@/server/repositories/assistant-action", () => ({ getAssistantActionById: mocks.action }));
vi.mock("@/server/repositories/assistant-thread", () => ({ getAssistantThreadById: mocks.thread }));
vi.mock("@/server/repositories/assistant-goal", () => ({
  getGoalRunScoped: mocks.goal,
  updateGoalRun: mocks.update,
  markAnnotationsAddressed: mocks.addressed,
  AssistantGoalConflictError: class AssistantGoalConflictError extends Error {},
}));
vi.mock("@/server/assistant/artifact-version/service", () => ({ adoptArtifactForThread: mocks.adopt }));
vi.mock("@/server/repositories/assistant-job-sync", () => ({ syncAssistantActionFromJob: mocks.sync }));
vi.mock("@/server/repositories/derivation", () => ({ getDerivationsByCampaign: mocks.derivations }));
vi.mock("@/server/repositories/notification", () => ({ createNotification: mocks.notify }));

import { finalizeGoalDerivation } from "./finalize-derivation";

describe("finalizeGoalDerivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.action.mockResolvedValue({ id: "action-1", threadId: "thread-1", inputSnapshot: {} });
    mocks.thread.mockResolvedValue({ id: "thread-1", clientProfileId: "client-1" });
    mocks.goal.mockResolvedValue({ id: "goal-1", campaignId: "campaign-1", revision: 4, stage: "generating_variants" });
    mocks.adopt.mockResolvedValue({ working: { id: "version-1" } });
    mocks.update.mockResolvedValue({ revision: 5 });
  });

  it("adopts the final output and advances only after all triplet slots are terminal", async () => {
    mocks.derivations.mockResolvedValue([
      { format: "1:1", creativeLevel: "conservative", status: "completed" },
      { format: "1:1", creativeLevel: "balanced", status: "failed" },
      { format: "1:1", creativeLevel: "bold", status: "completed" },
    ]);

    await finalizeGoalDerivation({
      workspaceId: "ws-1", actionId: "action-1", goalRunId: "goal-1",
      derivationId: "derivation-1", generationMode: "art_variation", userId: "user-1",
    });

    expect(mocks.adopt).toHaveBeenCalledWith(expect.objectContaining({ artifactId: "derivation-1" }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ patch: { stage: "choosing_base" } }));
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });
});
