import { beforeEach, describe, expect, it, vi } from "vitest";

const recordMock = vi.hoisted(() => vi.fn());
const findMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/beta-analytics/record", () => ({
  recordBetaAnalyticsEvent: (...args: unknown[]) => recordMock(...args),
}));

vi.mock("@/server/repositories/beta-analytics", () => ({
  findBetaAnalyticsEventByPiece: (...args: unknown[]) => findMock(...args),
}));

import { recordCreativeWorkValueEvent, valueEventFromCreativeWork } from "./record-value-event";

describe("recordCreativeWorkValueEvent", () => {
  beforeEach(() => {
    recordMock.mockReset();
    findMock.mockReset();
    recordMock.mockResolvedValue({});
    findMock.mockResolvedValue(null);
  });

  it("records approved selection with canonical studio origin", async () => {
    await recordCreativeWorkValueEvent({
      kind: "approved",
      userId: "user-1",
      workspaceId: "ws-1",
      creativeWorkId: "work-1",
      outputId: "output-1",
      outputKey: "creative-work/output-1/v1.png",
      protocol: "single",
      origin: "quick_tool",
      clientProfileId: "profile-1",
    });

    expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws-1",
      userId: "user-1",
      eventKey: "creative_work_approved",
      source: "server",
      properties: expect.objectContaining({
        outputId: "output-1",
        outputKey: "creative-work/output-1/v1.png",
        origin: "studio",
        protocol: "single",
        clientProfileId: "profile-1",
      }),
    }));
  });

  it("skips a reload or retry of the same output version", async () => {
    findMock.mockResolvedValue({ id: "existing" });
    await recordCreativeWorkValueEvent({
      kind: "delivered",
      userId: "user-1",
      workspaceId: "ws-1",
      creativeWorkId: "work-1",
      outputId: "output-1",
      outputKey: "creative-work/output-1/v1.png",
      protocol: "single",
    });
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("does not inflate delivery when the same version is exported twice", async () => {
    findMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "existing" });
    const payload = {
      kind: "delivered" as const,
      userId: "user-1",
      workspaceId: "ws-1",
      creativeWorkId: "work-1",
      outputId: "output-1",
      outputKey: "creative-work/output-1/v1.png",
      protocol: "single",
    };
    await recordCreativeWorkValueEvent(payload);
    await recordCreativeWorkValueEvent(payload);
    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it("records original download as delivered and swallows recorder failures", async () => {
    recordMock.mockRejectedValue(new Error("analytics down"));
    await expect(recordCreativeWorkValueEvent({
      kind: "delivered",
      userId: "user-1",
      workspaceId: "ws-1",
      creativeWorkId: "work-1",
      outputId: "output-1",
      outputKey: "k1",
      protocol: "restyle",
      origin: "campaign",
      campaignId: "camp-1",
    })).resolves.toBeUndefined();
    expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: "creative_work_delivered",
      campaignId: "camp-1",
      properties: expect.objectContaining({ origin: "campaign" }),
    }));
  });

  it("derives campaign origin from a linked campaign", () => {
    expect(valueEventFromCreativeWork({
      id: "work-1",
      workspaceId: "ws-1",
      createdByUserId: "user-1",
      clientProfileId: "profile-1",
      campaignId: "camp-1",
      toolKind: "single",
    }).origin).toBe("campaign");
  });
});
