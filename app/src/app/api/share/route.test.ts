import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, DELETE } from "./route";

const VALID_SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440001";
const DERIVATION_ID = "550e8400-e29b-41d4-a716-446655440002";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/lib/share-token", () => ({
  createShareToken: vi.fn(() =>
    Promise.resolve({
      shareUrl: "https://example.com/share/abc",
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    })
  ),
  revokeShareToken: vi.fn(() => Promise.resolve(1)),
}));

vi.mock("@/server/beta-analytics/record", () => ({
  recordBetaAnalyticsEvent: vi.fn(() => Promise.resolve({ id: "event-1" })),
}));

import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";

const mockRecordBetaAnalyticsEvent = vi.mocked(recordBetaAnalyticsEvent);

async function flushAnalytics() {
  await new Promise((resolve) => setImmediate(resolve));
}

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits mission_completed with missionKey share on success", async () => {
    const res = await POST(
      postRequest({
        campaignId: CAMPAIGN_ID,
        derivationIds: [DERIVATION_ID],
      })
    );
    await flushAnalytics();

    expect(res.status).toBe(200);
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "mission_completed",
        source: "server",
        userId: "user-1",
        workspaceId: "workspace-1",
        campaignId: CAMPAIGN_ID,
        properties: expect.objectContaining({
          missionKey: "share",
          stage: "share",
        }),
      })
    );
  });

  it("forwards sessionId from x-beta-session-id header", async () => {
    const res = await POST(
      postRequest(
        {
          campaignId: CAMPAIGN_ID,
          derivationIds: [DERIVATION_ID],
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

describe("DELETE /api/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes the share link for the campaign", async () => {
    const req = new Request("http://localhost/api/share", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revoked).toBe(1);
  });

  it("rejects an invalid body", async () => {
    const req = new Request("http://localhost/api/share", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: "not-a-uuid" }),
    });

    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });
});
