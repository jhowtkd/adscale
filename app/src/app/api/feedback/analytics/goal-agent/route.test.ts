import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/assistant/goal/analytics", () => ({
  computeGraduationReport: vi.fn(() => ({
    startedObjectives: 25,
    completedObjectives: 16,
    distinctClients: 4,
    completionRate: 0.64,
    criticalCreditFailures: 0,
    criticalScopeFailures: 0,
    stageDropoff: {},
    graduation: {
      enoughObjectives: true,
      enoughClients: true,
      enoughCompletion: true,
      noCriticalFailures: true,
      passed: true,
    },
  })),
}));

vi.mock("@/server/db", () => {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    then(resolve: (value: unknown) => void) {
      resolve([{ count: 25 }]);
    },
  };
  return { db: { select: vi.fn(() => chain) } };
});

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { computeGraduationReport } from "@/server/assistant/goal/analytics";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockCompute = vi.mocked(computeGraduationReport);

describe("GET /api/feedback/analytics/goal-agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({ id: "user-1", email: "owner@adscale.com" } as never);
  });

  it("returns the graduation report for a platform owner", async () => {
    const response = await GET(new Request("http://localhost/api/feedback/analytics/goal-agent"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.graduation.passed).toBe(true);
    expect(mockCompute).toHaveBeenCalled();
  });

  it("rejects non-platform owners", async () => {
    mockRequireOwner.mockRejectedValue(new Error("forbidden"));

    const response = await GET(new Request("http://localhost/api/feedback/analytics/goal-agent"));
    expect(response.status).toBe(403);
  });
});
