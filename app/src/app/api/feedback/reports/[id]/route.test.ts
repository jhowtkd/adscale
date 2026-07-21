import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(() =>
    Promise.resolve({ user: { id: "owner-1", email: "owner@example.com" } })
  ),
}));

vi.mock("@/server/repositories/feedback", () => ({
  getFeedbackReportById: vi.fn(),
  updateFeedbackReportStatus: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    signedDownloadUrl: vi.fn(() => Promise.resolve("https://signed.example/asset")),
  },}));

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getFeedbackReportById,
  updateFeedbackReportStatus,
} from "@/server/repositories/feedback";

const mockGet = vi.mocked(getFeedbackReportById);
const mockUpdate = vi.mocked(updateFeedbackReportStatus);

describe("owner feedback detail routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns report detail for platform owner", async () => {
    mockGet.mockResolvedValue({
      id: "report-1",
      workspaceId: "ws-1",
      userId: "user-1",
      status: "new",
      type: "bug",
      severity: "high",
      category: "generation",
      message: "Broken output",
      followUpAllowed: false,
      route: "/campaigns/x",
      contextKind: "derivation",
      campaignId: "camp-1",
      derivationId: "deriv-1",
      assetRefs: [],
      diagnosticContext: {},
      sentryCorrelation: { traceId: "trace-1" },
      contextCompleteness: { page: true },
      internalNotes: null,
      resolutionSummary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await GET(
      new Request("http://localhost/api/feedback/reports/report-1?workspaceId=ws-1"),
      { params: Promise.resolve({ id: "report-1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.report.id).toBe("report-1");
  });

  it("updates report status and notes", async () => {
    mockGet.mockResolvedValue({
      id: "report-1",
      workspaceId: "ws-1",
      userId: "user-1",
      status: "new",
      type: "bug",
      severity: "high",
      category: "generation",
      message: "Broken output",
      followUpAllowed: false,
      route: "/campaigns/x",
      contextKind: "derivation",
      campaignId: null,
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
    mockUpdate.mockResolvedValue({
      id: "report-1",
      status: "resolved",
    } as never);

    const res = await PATCH(
      new Request("http://localhost/api/feedback/reports/report-1?workspaceId=ws-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "resolved",
          internalNotes: "Reproduced",
          resolutionSummary: "Fixed in deploy",
        }),
      }),
      { params: Promise.resolve({ id: "report-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
