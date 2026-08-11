import { describe, expect, it, vi } from "vitest";

const { limit, select, returning, set, update } = vi.hoisted(() => {
  const limit = vi.fn();
  const orderBy = vi.fn(() => ({ limit }));
  const selectWhere = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from }));
  const returning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));
  return { limit, select, returning, set, update };
});

vi.mock("../db", () => ({ db: { select, update } }));

import { upsertShareLinkForCampaign } from "./share-link";

describe("upsertShareLinkForCampaign", () => {
  it("reactivates a revoked link while refreshing its package", async () => {
    limit.mockResolvedValueOnce([{ id: "link-1", revokedAt: new Date() }]);
    returning.mockResolvedValueOnce([{ id: "link-1", revokedAt: null }]);

    await upsertShareLinkForCampaign({
      campaignId: "campaign-1",
      workspaceId: "workspace-1",
      derivationIds: ["derivation-1"],
      expiresAt: new Date("2026-08-17T12:00:00.000Z"),
    });

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: null }));
  });
});
