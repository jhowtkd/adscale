import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

import { db } from "../db";
import {
  insertBetaAnalyticsEvent,
  listBetaAnalyticsEvents,
  getBetaSessionById,
} from "./beta-analytics";

describe("beta-analytics repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("insertBetaAnalyticsEvent persists row with workspace_id from caller", async () => {
    const createdAt = new Date();
    const returning = vi.fn().mockResolvedValue([
      {
        id: "event-1",
        workspaceId: "ws-1",
        userId: "user-1",
        sessionId: null,
        eventKey: "mission_started",
        properties: { stage: "brief" },
        source: "client",
        campaignId: null,
        derivationId: null,
        createdAt,
      },
    ]);
    const values = vi.fn(() => ({ returning }));
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    const event = await insertBetaAnalyticsEvent({
      workspaceId: "ws-1",
      userId: "user-1",
      eventKey: "mission_started",
      properties: { stage: "brief" },
    });

    expect(event.id).toBe("event-1");
    expect(event.workspaceId).toBe("ws-1");
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        userId: "user-1",
        eventKey: "mission_started",
      })
    );
  });

  it("listBetaAnalyticsEvents scopes results to workspaceId", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    vi.mocked(db.select).mockReturnValue({ from } as never);

    await listBetaAnalyticsEvents({ workspaceId: "ws-1" });

    expect(where).toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith(100);
  });

  it("listBetaAnalyticsEvents applies sessionId, eventKey, and date range filters", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    vi.mocked(db.select).mockReturnValue({ from } as never);

    const fromDate = new Date("2026-01-01");
    const toDate = new Date("2026-01-31");

    await listBetaAnalyticsEvents({
      workspaceId: "ws-1",
      sessionId: "session-1",
      eventKey: "mission_started",
      from: fromDate,
      to: toDate,
      limit: 25,
    });

    expect(where).toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith(25);
  });

  it("getBetaSessionById returns session when id and workspace match", async () => {
    const session = {
      id: "session-1",
      workspaceId: "ws-1",
      cohortLabel: "cohort-a",
      assistanceLevel: "hands_on",
      startedAt: new Date(),
      endedAt: null,
      operatorNotes: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const limit = vi.fn().mockResolvedValue([session]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    vi.mocked(db.select).mockReturnValue({ from } as never);

    const result = await getBetaSessionById("ws-1", "session-1");

    expect(result).toEqual(session);
  });

  it("getBetaSessionById returns null for cross-workspace session lookup", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    vi.mocked(db.select).mockReturnValue({ from } as never);

    const result = await getBetaSessionById("ws-other", "session-1");

    expect(result).toBeNull();
  });
});
