import { describe, expect, it, vi } from "vitest";

const { limit, select, returning, set, update, transaction } = vi.hoisted(() => {
  const limit = vi.fn();
  const orderBy = vi.fn(() => ({ limit }));
  const selectWhere = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from }));
  const returning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));
  return { limit, select, returning, set, update, transaction: vi.fn() };
});

vi.mock("../db", () => ({ db: { select, update, transaction } }));

import { createCampaignShareLink, upsertShareLinkForCampaign } from "./share-link";

const shareInput = {
  token: "token", campaignId: "campaign-1", workspaceId: "workspace-1",
  derivationIds: ["derivation-1"], expiresAt: new Date("2026-08-17T12:00:00.000Z"),
};

describe("createCampaignShareLink database errors", () => {
  it.each(["55P03", "57014"])("reports PostgreSQL timeout %s as an unavailable selection", async (code) => {
    transaction.mockRejectedValueOnce({ cause: { code } });
    await expect(createCampaignShareLink(shareInput)).resolves.toEqual({ ok: false, error: "invalid_selection" });
  });

  it("preserves unrelated database errors", async () => {
    const error = Object.assign(new Error("duplicate token"), { code: "23505" });
    transaction.mockRejectedValueOnce(error);
    await expect(createCampaignShareLink(shareInput)).rejects.toBe(error);
  });
});

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
