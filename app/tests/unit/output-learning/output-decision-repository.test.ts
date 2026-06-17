import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

import { db } from "@/server/db";
import {
  insertOutputDecisionEvent,
  listOutputDecisionEvents,
} from "@/server/repositories/output-decision-event";

describe("output-decision-event repository", () => {
  const workspaceId = "ws-1";
  const baseEvent = {
    workspaceId,
    userId: "user-1",
    clientProfileId: "profile-1",
    campaignId: "camp-1",
    derivationId: "deriv-1",
    action: "approved",
    direction: "positive",
    strength: "strong",
    source: "derivations.review.PATCH",
    contextSnapshot: { generationMode: "art_variation", format: "1:1" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("insertOutputDecisionEvent persists append-only row", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "event-1", ...baseEvent }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const result = await insertOutputDecisionEvent(baseEvent);

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        campaignId: "camp-1",
        derivationId: "deriv-1",
        action: "approved",
        direction: "positive",
        strength: "strong",
      })
    );
    expect(result.id).toBe("event-1");
  });

  it("listOutputDecisionEvents scopes by workspace and campaign", async () => {
    const mockLimit = vi.fn().mockResolvedValue([{ id: "event-1" }]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const rows = await listOutputDecisionEvents({
      workspaceId,
      campaignId: "camp-1",
      limit: 10,
    });

    expect(rows).toHaveLength(1);
    expect(mockLimit).toHaveBeenCalledWith(10);
  });
});
