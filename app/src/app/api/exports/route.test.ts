import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const VALID_SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440001";
const DERIVATION_ID = "550e8400-e29b-41d4-a716-446655440002";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/services/export", () => ({
  exportIndividual: vi.fn(() => Promise.resolve({ url: "https://example.com/file.png" })),
  exportAllApproved: vi.fn(() => Promise.resolve({ url: "https://example.com/batch.zip" })),
}));

vi.mock("@/server/beta-analytics/record", () => ({
  recordBetaAnalyticsEvent: vi.fn(() => Promise.resolve({ id: "event-1" })),
}));

import { exportIndividual, exportAllApproved } from "@/server/services/export";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";

const mockExportIndividual = vi.mocked(exportIndividual);
const mockExportAllApproved = vi.mocked(exportAllApproved);
const mockRecordBetaAnalyticsEvent = vi.mocked(recordBetaAnalyticsEvent);

async function flushAnalytics() {
  await new Promise((resolve) => setImmediate(resolve));
}

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/exports", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits mission_completed with missionKey export on individual success", async () => {
    const res = await POST(
      postRequest({
        type: "individual",
        derivationId: DERIVATION_ID,
        campaignId: CAMPAIGN_ID,
        format: "png",
      })
    );
    await flushAnalytics();

    expect(res.status).toBe(200);
    expect(mockExportIndividual).toHaveBeenCalled();
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "mission_completed",
        source: "server",
        userId: "user-1",
        workspaceId: "workspace-1",
        campaignId: CAMPAIGN_ID,
        derivationId: DERIVATION_ID,
        properties: expect.objectContaining({
          missionKey: "export",
          stage: "export",
          operation: "individual",
        }),
      })
    );
  });

  it("emits mission_completed on batch export success", async () => {
    const res = await POST(
      postRequest({
        type: "batch",
        campaignId: CAMPAIGN_ID,
        format: "png",
      })
    );
    await flushAnalytics();

    expect(res.status).toBe(200);
    expect(mockExportAllApproved).toHaveBeenCalled();
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "mission_completed",
        campaignId: CAMPAIGN_ID,
        properties: expect.objectContaining({
          missionKey: "export",
          operation: "batch",
        }),
      })
    );
  });

  it("forwards sessionId from x-beta-session-id header", async () => {
    const res = await POST(
      postRequest(
        {
          type: "individual",
          derivationId: DERIVATION_ID,
          format: "png",
        },
        { "x-beta-session-id": VALID_SESSION_ID }
      )
    );
    await flushAnalytics();

    expect(res.status).toBe(200);
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: VALID_SESSION_ID,
      })
    );
  });
});
