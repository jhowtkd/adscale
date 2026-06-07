import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getFunnel } from "./route";
import { GET as getCreditSignals } from "../credit-signals/route";
import { GET as getExport } from "../export.csv/route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/beta-analytics", () => ({
  listBetaAnalyticsEventsForOwner: vi.fn(),
}));

vi.mock("@/server/repositories/beta-sessions", () => ({
  listBetaSessions: vi.fn(),
}));

vi.mock("@/server/feedback/mission-credit-signals", () => ({
  summarizeMissionCreditSignals: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { listBetaAnalyticsEventsForOwner } from "@/server/repositories/beta-analytics";
import { listBetaSessions } from "@/server/repositories/beta-sessions";
import { summarizeMissionCreditSignals } from "@/server/feedback/mission-credit-signals";
import { ANALYTICS_FIXTURE_EVENTS } from "@/server/beta-analytics/aggregate.fixture";
import { EXAMPLE_BETA_SESSION_FIXTURE } from "@/server/repositories/beta-sessions.fixture";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockListEvents = vi.mocked(listBetaAnalyticsEventsForOwner);
const mockListSessions = vi.mocked(listBetaSessions);
const mockCreditSummary = vi.mocked(summarizeMissionCreditSignals);

const WORKSPACE_ID = EXAMPLE_BETA_SESSION_FIXTURE.workspaceId;
const SESSION_ID = EXAMPLE_BETA_SESSION_FIXTURE.sessionId;

function sessionRow() {
  return {
    id: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    cohortLabel: EXAMPLE_BETA_SESSION_FIXTURE.cohortLabel,
    assistanceLevel: EXAMPLE_BETA_SESSION_FIXTURE.assistanceLevel,
    startedAt: new Date(EXAMPLE_BETA_SESSION_FIXTURE.startedAt),
    endedAt: new Date(EXAMPLE_BETA_SESSION_FIXTURE.endedAt!),
    operatorNotes: EXAMPLE_BETA_SESSION_FIXTURE.operatorNotes,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("owner analytics routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
    mockListEvents.mockResolvedValue(ANALYTICS_FIXTURE_EVENTS);
    mockListSessions.mockResolvedValue([sessionRow()]);
    mockCreditSummary.mockResolvedValue({
      healthyCount: 2,
      frustrationCount: 1,
      creditFrictionCount: 1,
      skippedCreditMissionCount: 0,
      positiveAfterSpendCount: 1,
      recentExamples: [],
    });
  });

  describe("GET /api/feedback/analytics/funnel", () => {
    it("returns funnel summary for platform owner", async () => {
      const res = await getFunnel(
        new Request(
          `http://localhost/api/feedback/analytics/funnel?workspaceId=${WORKSPACE_ID}`
        )
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.missionFunnel.length).toBeGreaterThan(0);
      expect(body.cockpitStageFunnel.length).toBeGreaterThan(0);
      expect(body.readinessOverrides.length).toBeGreaterThan(0);
    });

    it("returns 403 for non-platform-owner", async () => {
      mockRequireOwner.mockRejectedValue(
        new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
      );

      const res = await getFunnel(
        new Request("http://localhost/api/feedback/analytics/funnel")
      );

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/feedback/analytics/credit-signals", () => {
    it("merges feedback and event-based credit signals", async () => {
      const res = await getCreditSignals(
        new Request(
          `http://localhost/api/feedback/analytics/credit-signals?sessionId=${SESSION_ID}`
        )
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.healthyCount).toBe(2);
      expect(body.eventSignals.creditBlockedCount).toBe(1);
      expect(body.eventSignals.surpriseCount).toBeGreaterThan(0);
    });

    it("returns 403 for non-platform-owner", async () => {
      mockRequireOwner.mockRejectedValue(
        new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
      );

      const res = await getCreditSignals(
        new Request("http://localhost/api/feedback/analytics/credit-signals")
      );

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/feedback/analytics/export.csv", () => {
    it("returns CSV with funnel summary and event rows", async () => {
      const res = await getExport(
        new Request(
          `http://localhost/api/feedback/analytics/export.csv?workspaceId=${WORKSPACE_ID}`
        )
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      const body = await res.text();
      expect(body).toContain("# mission_funnel");
      expect(body).toContain("cockpit_stage_entered");
    });

    it("returns 403 for non-platform-owner", async () => {
      mockRequireOwner.mockRejectedValue(
        new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
      );

      const res = await getExport(
        new Request("http://localhost/api/feedback/analytics/export.csv")
      );

      expect(res.status).toBe(403);
    });
  });
});
