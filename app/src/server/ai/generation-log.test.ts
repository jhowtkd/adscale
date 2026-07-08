import { describe, expect, it, vi } from "vitest";

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: mockLogger,
}));

import { recordDualEngineCandidates } from "./generation-log";

describe("recordDualEngineCandidates", () => {
  it("emits an image.generation.candidates event via logger.info", async () => {
    mockLogger.info.mockClear();

    await recordDualEngineCandidates({
      campaignId: "campaign-1",
      derivationId: "derivations/derivation-42",
      workspaceId: "workspace-1",
      jobType: "derivation",
      candidates: [
        {
          provider: "openai",
          model: "gpt-image-2",
          outputKey: "derivations/derivation-42/candidates/openai.png",
          durationMs: 1200,
          score: 0.91,
          quality: "acceptable",
          costCredits: 1,
        },
        {
          provider: "seedream",
          model: "seedream-5",
          outputKey: "derivations/derivation-42/candidates/seedream.png",
          durationMs: 1500,
          score: 0.88,
          quality: "acceptable",
          costCredits: 1,
        },
      ],
      winnerProvider: "openai",
      aggregateLatencyMs: 1500,
    });

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    const [tag, payload] = mockLogger.info.mock.calls[0];
    expect(tag).toBe("[dual-engine-candidates]");

    const event = JSON.parse(payload);
    expect(event.event).toBe("image.generation.candidates");
    expect(event.derivationId).toBe("derivations/derivation-42");
    expect(event.winnerProvider).toBe("openai");
    expect(event.aggregateLatencyMs).toBe(1500);
    expect(event.candidates).toHaveLength(2);
    expect(event.candidates[0].provider).toBe("openai");
    expect(event.candidates[0].durationMs).toBe(1200);
    expect(typeof event.timestamp).toBe("string");
    expect(new Date(event.timestamp).toString()).not.toBe("Invalid Date");
  });

  it("forwards additional dual-engine telemetry fields through to the event", async () => {
    mockLogger.info.mockClear();

    await recordDualEngineCandidates({
      campaignId: "campaign-2",
      derivationId: "creative-work/output-7",
      workspaceId: "workspace-2",
      jobType: "creative_work",
      candidates: [
        {
          provider: "seedream",
          model: "seedream-5",
          outputKey: "creative-work/output-7/candidates/seedream.png",
          durationMs: 800,
        },
      ],
      winnerProvider: "seedream",
      aggregateLatencyMs: 800,
    });

    const [, payload] = mockLogger.info.mock.calls[0];
    const event = JSON.parse(payload);
    expect(event.jobType).toBe("creative_work");
    expect(event.workspaceId).toBe("workspace-2");
    expect(event.candidates[0]).not.toHaveProperty("winner");
  });
});
