import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getFunnel } from "./route";
import { GET as getCreditSignals } from "../credit-signals/route";
import { GET as getExport } from "../export.csv/route";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keys: string[]) =>
    keys[0] === "funnel-events"
      ? async (...args: unknown[]) => JSON.parse(JSON.stringify(await fn(...args)))
      : fn,
}));

vi.mock("@/server/auth/require-platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/beta-analytics", () => ({
  listBetaAnalyticsEventsForOwner: vi.fn(),
}));

vi.mock("@/server/repositories/beta-sessions", () => ({
  listBetaSessions: vi.fn(),
}));

vi.mock("@/server/repositories/usage", () => ({
  listStudioUsageEventsForWindows: vi.fn(),
}));

vi.mock("@/server/repositories/selected-piece-versions", () => ({
  listSelectedCreativeWorkPieceVersions: vi.fn(),
}));

vi.mock("@/server/feedback/mission-credit-signals", () => ({
  summarizeMissionCreditSignals: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { listBetaAnalyticsEventsForOwner } from "@/server/repositories/beta-analytics";
import { listBetaSessions } from "@/server/repositories/beta-sessions";
import { listStudioUsageEventsForWindows } from "@/server/repositories/usage";
import { listSelectedCreativeWorkPieceVersions } from "@/server/repositories/selected-piece-versions";
import { summarizeMissionCreditSignals } from "@/server/feedback/mission-credit-signals";
import { ANALYTICS_FIXTURE_EVENTS } from "@/server/beta-analytics/aggregate.fixture";
import { EXAMPLE_BETA_SESSION_FIXTURE } from "@/server/repositories/beta-sessions.fixture";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockListEvents = vi.mocked(listBetaAnalyticsEventsForOwner);
const mockListSessions = vi.mocked(listBetaSessions);
const mockListUsage = vi.mocked(listStudioUsageEventsForWindows);
const mockListSelected = vi.mocked(listSelectedCreativeWorkPieceVersions);
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
    mockListUsage.mockResolvedValue([]);
    mockListSelected.mockResolvedValue([]);
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
      expect(body.studioFunnel).toEqual(expect.arrayContaining([
        expect.objectContaining({ variant: "control" }),
        expect.objectContaining({ variant: "progressive" }),
      ]));
      expect(body).not.toHaveProperty("usageEvents");
      expect(body.dataComplete).toBe(true);
      expect(body.valueDelivered.reconcile).toEqual({
        selectedFromDatabase: 0,
        selectedFromEvents: 0,
        missingFromEvents: 0,
        orphanedFromEvents: 0,
      });
      expect(mockListSelected).toHaveBeenCalledWith(WORKSPACE_ID);
      expect(mockListUsage).toHaveBeenCalledWith(expect.any(Array));
      expect(mockListEvents).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        sessionId: undefined,
        from: undefined,
        to: undefined,
      });
    });

    it("marks the report incomplete when the owner event cap may truncate it", async () => {
      mockListEvents.mockResolvedValue(Array.from({ length: 5_000 }, (_, index) => ({
        ...ANALYTICS_FIXTURE_EVENTS[0]!,
        id: `cap-${index}`,
      })));

      const res = await getFunnel(new Request("http://localhost/api/feedback/analytics/funnel"));

      expect(res.status).toBe(200);
      expect((await res.json()).dataComplete).toBe(false);
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
    it("starts independent reads together before building the CSV", async () => {
      let release!: () => void;
      const hold = new Promise<void>((resolve) => { release = resolve; });
      mockListEvents.mockImplementation(async () => { await hold; return ANALYTICS_FIXTURE_EVENTS; });
      mockListSessions.mockImplementation(async () => { await hold; return [sessionRow()]; });
      mockListSelected.mockImplementation(async () => { await hold; return []; });

      const pending = getExport(new Request(
        `http://localhost/api/feedback/analytics/export.csv?workspaceId=${WORKSPACE_ID}`
      ));
      try {
        await vi.waitFor(() => {
          expect(mockListEvents).toHaveBeenCalledTimes(1);
          expect(mockListSessions).toHaveBeenCalledTimes(1);
          expect(mockListSelected).toHaveBeenCalledTimes(1);
        });
      } finally {
        release();
      }
      expect((await pending).status).toBe(200);
    });

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
      expect(body).toContain("# value_delivered");
      expect(body).toContain("selected_pieces,");
      expect(body).toContain("cockpit_stage_entered");
      expect(mockListSelected).toHaveBeenCalledWith(WORKSPACE_ID);
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
