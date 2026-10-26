import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/share-link", () => ({
  createCampaignShareLink: vi.fn(),
  getShareLinkByToken: vi.fn(),
  revokeShareLinkForCampaign: vi.fn(),
  revokeShareLinkForOutput: vi.fn(),
}));

import { createShareToken, resolveShareToken } from "./share-token";
import { createCampaignShareLink, getShareLinkByToken } from "@/server/repositories/share-link";

const getShareLink = vi.mocked(getShareLinkByToken);
const createCampaignLink = vi.mocked(createCampaignShareLink);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("createShareToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test/");
    createCampaignLink.mockReset();
  });

  it.each(["campaign_not_found", "invalid_selection", "selection_unavailable"] as const)("preserves the repository's %s rejection", async (error) => {
    createCampaignLink.mockResolvedValue({ ok: false, error });
    await expect(createShareToken("campaign-1", "workspace-1", ["derivation-1"])).resolves.toEqual({ ok: false, error });
  });

  it("returns a public URL and seven-day expiry after atomic creation succeeds", async () => {
    createCampaignLink.mockResolvedValue({ ok: true });
    await expect(createShareToken("campaign-1", "workspace-1", ["derivation-1"])).resolves.toEqual({
      ok: true,
      value: {
        token: expect.any(String),
        shareUrl: expect.stringMatching(/^https:\/\/example\.test\/share\/[0-9a-f-]+$/),
        expiresAt: new Date("2026-08-17T12:00:00.000Z"),
      },
    });
  });
});

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
