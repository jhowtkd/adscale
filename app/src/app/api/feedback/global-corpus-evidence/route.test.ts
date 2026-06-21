import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/human-quality/global-evidence-service", () => ({
  runGlobalCorpusEvidence: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { runGlobalCorpusEvidence } from "@/server/human-quality/global-evidence-service";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockRunEvidence = vi.mocked(runGlobalCorpusEvidence);

describe("GET /api/feedback/global-corpus-evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@example.com" },
    } as never);
  });

  it("returns global evidence for platform owner", async () => {
    mockRunEvidence.mockResolvedValue({
      report: {
        schemaVersion: 1,
        capturedAt: "2026-06-20T00:00:00.000Z",
        evaluatedItemCount: 3,
        pendingItemCount: 2,
        sourceComposition: {
          synthetic_fixture: 3,
          operator_imported: 0,
          real_customer: 0,
        },
        fixtureOnly: true,
        operationalStatus: "insufficient_sample",
        claimsAllowed: ["global_corpus_evaluations_recorded"],
        claimsBlocked: ["commercial_quality_claim"],
        withheldClaims: [],
        dependsOnOperator: [],
        brandTasteClientScopes: [],
        sampleCoverage: {
          schemaVersion: 1,
          capturedAt: "2026-06-20T00:00:00.000Z",
          evaluatedItemCount: 3,
          gates: [],
          sliceGaps: [],
          nextGate: "calibration",
          nextOperatorAction: "Need more evaluations",
        },
      },
    });

    const res = await GET(new Request("http://localhost/api/feedback/global-corpus-evidence"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.evaluatedItemCount).toBe(3);
    expect(mockRunEvidence).toHaveBeenCalled();
  });

  it("rejects non-owner callers", async () => {
    const { WorkspaceAuthError } = await import("@/server/auth/workspace");
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError("forbidden", "Forbidden")
    );

    const res = await GET(new Request("http://localhost/api/feedback/global-corpus-evidence"));
    expect(res.status).toBe(403);
  });
});
