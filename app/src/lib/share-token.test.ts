import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/share-link", () => ({
  createShareLink: vi.fn(),
  getShareLinkByToken: vi.fn(),
  revokeShareLinkForCampaign: vi.fn(),
  revokeShareLinkForOutput: vi.fn(),
}));

import { resolveShareToken } from "./share-token";
import { getShareLinkByToken } from "@/server/repositories/share-link";

const getShareLink = vi.mocked(getShareLinkByToken);
const activeLink = {
  id: "link-1",
  campaignId: "campaign-1",
  workspaceId: "workspace-1",
  derivationIds: ["derivation-1"],
  creativeWorkId: null,
  outputId: null,
  outputVersion: null,
  expiresAt: new Date("2026-08-17T12:00:00.000Z"),
  revokedAt: null,
};

describe("resolveShareToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
    getShareLink.mockReset();
  });

  it.each([
    [null, "invalid"],
    [{ ...activeLink, expiresAt: new Date("2026-08-09T12:00:00.000Z") }, "expired"],
    [{ ...activeLink, revokedAt: new Date("2026-08-10T11:00:00.000Z") }, "removed"],
  ] as const)("resolves unavailable link records as %s", async (record, status) => {
    getShareLink.mockResolvedValue(record as Awaited<ReturnType<typeof getShareLinkByToken>>);
    await expect(resolveShareToken("token")).resolves.toEqual({ status });
  });

  it("returns scoped data only for an active link", async () => {
    getShareLink.mockResolvedValue(activeLink as Awaited<ReturnType<typeof getShareLinkByToken>>);

    await expect(resolveShareToken("token")).resolves.toEqual({
      status: "valid",
      link: expect.objectContaining({ campaignId: "campaign-1", derivationIds: ["derivation-1"] }),
    });
  });
});
