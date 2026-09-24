import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { FeedbackValidationError } from "@/server/feedback/validate-refs";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/feedback/validate-refs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/feedback/validate-refs")>();
  return {
    ...actual,
    validateCampaignOwnership: vi.fn(),
    validateDerivationOwnership: vi.fn(),
    validateAssetRefs: vi.fn((_, refs: unknown[]) => Promise.resolve(refs)),
  };
});

vi.mock("@/server/repositories/feedback", () => ({
  createFeedbackReport: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { createFeedbackReport } from "@/server/repositories/feedback";
import {
  validateCampaignOwnership,
  validateDerivationOwnership,
} from "@/server/feedback/validate-refs";

const mockCreateFeedbackReport = vi.mocked(createFeedbackReport);
const mockValidateCampaignOwnership = vi.mocked(validateCampaignOwnership);
const mockValidateDerivationOwnership = vi.mocked(validateDerivationOwnership);

describe("POST /api/feedback/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a feedback report", async () => {
    mockCreateFeedbackReport.mockResolvedValue({
      id: "report-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      status: "new",
      type: "bug",
      severity: "high",
      category: "generation",
      message: "Generation failed",
      followUpAllowed: true,
      route: "/campaigns/abc",
      contextKind: "campaign",
      campaignId: "camp-1",
      derivationId: null,
      assetRefs: [],
      diagnosticContext: {},
      sentryCorrelation: {},
      contextCompleteness: {},
      internalNotes: null,
      resolutionSummary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await POST(
      new Request("http://localhost/api/feedback/reports", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-1",
        },
        body: JSON.stringify({
          type: "bug",
          severity: "high",
          category: "generation",
          message: "Generation failed",
          followUpAllowed: true,
          route: "/campaigns/abc",
          contextKind: "campaign",
          campaignId: "550e8400-e29b-41d4-a716-446655440000",
        }),
      })
    );

    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.report.id).toBe("report-1");
    expect(mockValidateCampaignOwnership).toHaveBeenCalledWith(
      "workspace-1",
      "550e8400-e29b-41d4-a716-446655440000"
    );
    expect(mockCreateFeedbackReport).toHaveBeenCalled();
  });

  it("rejects invalid payloads", async () => {
    const res = await POST(
      new Request("http://localhost/api/feedback/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "" }),
      })
    );

    expect(res.status).toBe(400);
    expect(mockCreateFeedbackReport).not.toHaveBeenCalled();
  });

  it("rejects cross-workspace campaign references", async () => {
    mockValidateCampaignOwnership.mockRejectedValue(
      new FeedbackValidationError("Campaign not found in workspace", "invalid_campaign")
    );

    const res = await POST(
      new Request("http://localhost/api/feedback/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "bug",
          severity: "medium",
          category: "ui",
          message: "Broken page",
          campaignId: "550e8400-e29b-41d4-a716-446655440001",
        }),
      })
    );

    expect(res.status).toBe(400);
    expect(mockValidateDerivationOwnership).not.toHaveBeenCalled();
    expect(mockCreateFeedbackReport).not.toHaveBeenCalled();
  });

  it("validates independent references concurrently and keeps campaign error precedence", async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    mockValidateCampaignOwnership.mockImplementation(async () => {
      await hold;
      throw new FeedbackValidationError("Invalid campaign", "invalid_campaign");
    });
    mockValidateDerivationOwnership.mockImplementation(async () => {
      await hold;
      throw new FeedbackValidationError("Invalid derivation", "invalid_derivation");
    });

    const pending = POST(new Request("http://localhost/api/feedback/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "bug",
        severity: "medium",
        category: "ui",
        message: "Broken page",
        campaignId: "550e8400-e29b-41d4-a716-446655440001",
        derivationId: "550e8400-e29b-41d4-a716-446655440002",
      }),
    }));
    try {
      await vi.waitFor(() => {
        expect(mockValidateCampaignOwnership).toHaveBeenCalledTimes(1);
        expect(mockValidateDerivationOwnership).toHaveBeenCalledTimes(1);
      });
    } finally {
      release();
    }
    const response = await pending;
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_campaign");
    expect(mockCreateFeedbackReport).not.toHaveBeenCalled();
  });
});
