import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

import { db } from "../db";
import {
  createFeedbackReport,
  getFeedbackReportById,
  updateFeedbackReportStatus,
} from "./feedback";

describe("feedback repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a feedback report with default status new", async () => {
    const createdAt = new Date();
    const returning = vi.fn().mockResolvedValue([
      {
        id: "report-1",
        workspaceId: "ws-1",
        userId: "user-1",
        status: "new",
        type: "bug",
        severity: "low",
        category: "ui",
        message: "Test",
        followUpAllowed: false,
        route: "/",
        contextKind: "global",
        campaignId: null,
        derivationId: null,
        assetRefs: [],
        diagnosticContext: {},
        sentryCorrelation: {},
        contextCompleteness: {},
        internalNotes: null,
        resolutionSummary: null,
        createdAt,
        updatedAt: createdAt,
      },
    ]);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn(() => ({ returning })),
    } as never);

    const report = await createFeedbackReport({
      workspaceId: "ws-1",
      userId: "user-1",
      type: "bug",
      severity: "low",
      category: "ui",
      message: "Test",
    });

    expect(report.id).toBe("report-1");
    expect(report.status).toBe("new");
    expect(db.insert).toHaveBeenCalled();
  });

  it("reads a report scoped to workspace", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "report-1" }]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    vi.mocked(db.select).mockReturnValue({ from } as never);

    const report = await getFeedbackReportById("ws-1", "report-1");
    expect(report).toEqual({ id: "report-1" });
  });

  it("updates report status", async () => {
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "report-1", status: "resolved" }]),
        })),
      })),
    } as never);

    const report = await updateFeedbackReportStatus("ws-1", "report-1", "resolved", {
      resolutionSummary: "Fixed",
    });

    expect(report?.status).toBe("resolved");
  });
});
