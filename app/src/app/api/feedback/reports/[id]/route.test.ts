import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "./route";

const dbMock = vi.hoisted(() => ({
  rowsByTable: new Map<unknown, unknown[]>(),
  select: vi.fn(),
}));

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

vi.mock("@/server/db", () => {
  dbMock.select.mockImplementation(() => {
    let rows: unknown[] = [];
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn((table: unknown) => {
      rows = dbMock.rowsByTable.get(table) ?? [];
      return chain;
    });
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(async () => rows);
    chain.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
    return chain;
  });
  return { db: { select: dbMock.select } };
});

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getFeedbackReportById,
  updateFeedbackReportStatus,
} from "@/server/repositories/feedback";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";
import { campaignAssets, workspaceAssets } from "@/server/db/schema";

const mockGet = vi.mocked(getFeedbackReportById);
const mockUpdate = vi.mocked(updateFeedbackReportStatus);

describe("owner feedback detail routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.rowsByTable.clear();
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

  it("resolves scoped assets in two queries while preserving reference order", async () => {
    mockGet.mockResolvedValue({
      id: "report-1",
      workspaceId: "ws-1",
      derivationId: null,
      assetRefs: [
        { kind: "campaign_asset", id: "c1" },
        { kind: "workspace_asset", id: "c1" },
        { kind: "campaign_asset", id: "missing" },
        { kind: "campaign_asset", id: "c2" },
        { kind: "campaign_asset", id: "c1" },
      ],
    } as Awaited<ReturnType<typeof getFeedbackReportById>>);
    dbMock.rowsByTable.set(campaignAssets, [{ id: "c1", key: "campaign/1" }, { id: "c2", key: "campaign/2" }]);
    dbMock.rowsByTable.set(workspaceAssets, [{ id: "c1", key: "workspace/1" }]);

    const res = await GET(
      new Request("http://localhost/api/feedback/reports/report-1?workspaceId=ws-1"),
      { params: Promise.resolve({ id: "report-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.assetLinks.map((link: { key: string }) => link.key)).toEqual([
      "campaign/1", "workspace/1", "campaign/2", "campaign/1",
    ]);
    expect(dbMock.select).toHaveBeenCalledTimes(2);
  });

  it("does not read the report or assets when owner access is denied", async () => {
    vi.mocked(requirePlatformOwner).mockRejectedValueOnce(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"),
    );

    const res = await GET(
      new Request("http://localhost/api/feedback/reports/report-1?workspaceId=ws-1"),
      { params: Promise.resolve({ id: "report-1" }) },
    );

    expect(res.status).toBe(403);
    expect(mockGet).not.toHaveBeenCalled();
    expect(dbMock.select).not.toHaveBeenCalled();
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
