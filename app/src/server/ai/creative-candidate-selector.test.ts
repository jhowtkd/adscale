import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResponsesCreate = vi.hoisted(() => vi.fn());
const controlledProviderEnabled = vi.hoisted(() => vi.fn(() => false));

vi.mock("./utils", () => ({
  getOpenAI: () => ({ responses: { create: mockResponsesCreate } }),
  extractOutputText: (response: { output_text?: string }) => response.output_text,
}));

vi.mock("@/server/validation/env", () => ({
  env: { OPENAI_TEXT_MODEL: "gpt-5.6" },
}));

vi.mock("./providers/e2e-controlled-provider", () => ({
  isE2EControlledProviderEnabled: controlledProviderEnabled,
}));

import {
  aggregateCandidateJudgments,
  selectCreativeCandidate,
} from "./creative-candidate-selector";

beforeEach(() => {
  vi.clearAllMocks();
  controlledProviderEnabled.mockReturnValue(false);
});

describe("aggregateCandidateJudgments", () => {
  it("selects the same winner when judge order is reversed", () => {
    const result = aggregateCandidateJudgments(
      ["route-1", "route-2", "route-3"],
      [
        { ranking: ["route-2", "route-1", "route-3"], invalid: [], reason: "strongest idea", repairInstruction: "reduce the synthetic glow" },
        { ranking: ["route-2", "route-3", "route-1"], invalid: [], reason: "best thumbnail", repairInstruction: "keep the product and simplify the background" },
      ]
    );

    expect(result.winnerId).toBe("route-2");
  });

  it("excludes a candidate only when a majority flags an objective failure", () => {
    const result = aggregateCandidateJudgments(
      ["route-1", "route-2", "route-3"],
      [
        { ranking: ["route-1", "route-2", "route-3"], invalid: ["route-1"], reason: "wrong offer", repairInstruction: "restore the exact offer" },
        { ranking: ["route-1", "route-2", "route-3"], invalid: ["route-1"], reason: "wrong offer", repairInstruction: "restore the exact offer" },
      ]
    );

    expect(result.winnerId).toBe("route-2");
    expect(result.invalidIds).toEqual(["route-1"]);
  });
});

describe("selectCreativeCandidate", () => {
  it("selects deterministically without external judging in controlled local E2E", async () => {
    controlledProviderEnabled.mockReturnValue(true);
    const result = await selectCreativeCandidate({
      candidates: ["route-1", "route-2"].map((routeId) => ({
        routeId,
        buffer: Buffer.from(routeId),
        mimeType: "image/png",
      })),
      brief: "A local E2E creative.",
      objective: "Exercise the real pipeline deterministically",
      brandConstraints: null,
      targetFormat: "4:5",
      referenceImages: [],
    });

    expect(result).toMatchObject({ winnerIndex: 0, invalidRouteIds: [] });
    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });

  it("judges anonymized candidates twice in reversed order", async () => {
    const judgment = {
      ranking: ["route-2", "route-1", "route-3"],
      invalid: [],
      reason: "route-2 has the clearest dominant idea",
      repairInstruction: "Remove the generic cyan glow while preserving the product.",
    };
    mockResponsesCreate
      .mockResolvedValueOnce({ output_text: JSON.stringify(judgment) })
      .mockResolvedValueOnce({ output_text: JSON.stringify(judgment) });

    const result = await selectCreativeCandidate({
      candidates: ["route-1", "route-2", "route-3"].map((routeId) => ({
        routeId,
        buffer: Buffer.from(routeId),
        mimeType: "image/png",
      })),
      brief: "A branded paid-social post for a free trial.",
      objective: "Increase qualified trial signups",
      brandConstraints: "Use the exact product and restrained blue palette.",
      targetFormat: "4:5",
      referenceImages: [],
    });

    expect(result.winnerIndex).toBe(1);
    expect(result.refinementPrompt).toContain("generic cyan glow");
    expect(mockResponsesCreate).toHaveBeenCalledTimes(2);
  });
});
