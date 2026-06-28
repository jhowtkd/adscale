import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/artifact-iteration-telemetry", () => ({
  listArtifactIterationTelemetryEventsForOwner: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { listArtifactIterationTelemetryEventsForOwner } from "@/server/repositories/artifact-iteration-telemetry";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockListEvents = vi.mocked(listArtifactIterationTelemetryEventsForOwner);

describe("GET /api/feedback/analytics/artifact-iteration-funnel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockListEvents.mockResolvedValue([]);
  });

  it("returns artifact iteration funnel summary for platform owner", async () => {
    const res = await GET(
      new Request(
        "http://localhost/api/feedback/analytics/artifact-iteration-funnel"
      )
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.implementationCoverage.telemetryEnabled).toBe(false);
    expect(body.implementationCoverage.generationEventsObserved).toEqual([]);
    expect(body.operationalEvidence.sampleSufficient).toBe(false);
    expect(body.pathFunnel).toHaveLength(3);
  });
});
