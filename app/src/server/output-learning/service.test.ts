import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("../repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
}));

vi.mock("../repositories/client-output-learning", () => ({
  listOutputLearningsByClientProfile: vi.fn(),
  syncOutputLearningsForClient: vi.fn(),
}));

vi.mock("../repositories/output-decision-event", () => ({
  listOutputDecisionEventsForClient: vi.fn(),
}));

vi.mock("../memory/output-learning-projection", () => ({
  projectOutputLearnings: vi.fn(),
}));

import { getClientProfile } from "../repositories/client-reference";
import { syncOutputLearningsForClient } from "../repositories/client-output-learning";
import { listOutputDecisionEventsForClient } from "../repositories/output-decision-event";
import { projectOutputLearnings } from "../memory/output-learning-projection";
import { recomputeClientOutputLearnings } from "./service";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const input = { workspaceId: "ws-1", clientProfileId: "client-1" };

describe("recomputeClientOutputLearnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClientProfile).mockResolvedValue({ id: "client-1" } as never);
    vi.mocked(syncOutputLearningsForClient).mockResolvedValue({
      upserted: [],
      removed: [],
    });
    vi.mocked(projectOutputLearnings).mockResolvedValue(undefined as never);
  });

  it("collapses a burst of recomputes for one client into one in-flight pass plus one follow-up", async () => {
    const gate = deferred<never[]>();
    vi.mocked(listOutputDecisionEventsForClient)
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValue([]);

    const first = recomputeClientOutputLearnings(input);
    await Promise.resolve();
    const second = recomputeClientOutputLearnings(input);
    const third = recomputeClientOutputLearnings(input);
    const fourth = recomputeClientOutputLearnings(input);

    expect(second).toBe(third);
    expect(third).toBe(fourth);
    expect(listOutputDecisionEventsForClient).toHaveBeenCalledTimes(1);

    gate.resolve([]);
    await Promise.all([first, second, third, fourth]);

    expect(listOutputDecisionEventsForClient).toHaveBeenCalledTimes(2);
    expect(syncOutputLearningsForClient).toHaveBeenCalledTimes(2);
  });

  it("keeps recomputes for different clients independent", async () => {
    const gate = deferred<never[]>();
    vi.mocked(listOutputDecisionEventsForClient)
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValue([]);

    const first = recomputeClientOutputLearnings(input);
    await Promise.resolve();
    const other = recomputeClientOutputLearnings({
      workspaceId: "ws-1",
      clientProfileId: "client-2",
    });

    await other;
    expect(listOutputDecisionEventsForClient).toHaveBeenCalledTimes(2);

    gate.resolve([]);
    await first;
  });

  it("runs the follow-up pass even when the in-flight pass fails", async () => {
    const gate = deferred<never[]>();
    vi.mocked(listOutputDecisionEventsForClient)
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValue([]);

    const first = recomputeClientOutputLearnings(input);
    await Promise.resolve();
    const second = recomputeClientOutputLearnings(input);

    gate.reject(new Error("db down"));
    await expect(first).rejects.toThrow("db down");
    await expect(second).resolves.toEqual({
      upsertedCount: 0,
      removedCount: 0,
      learnings: [],
    });
    expect(listOutputDecisionEventsForClient).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh pass once the previous one has settled", async () => {
    vi.mocked(listOutputDecisionEventsForClient).mockResolvedValue([]);

    await recomputeClientOutputLearnings(input);
    await recomputeClientOutputLearnings(input);

    expect(listOutputDecisionEventsForClient).toHaveBeenCalledTimes(2);
  });
});
