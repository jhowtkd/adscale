import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBrandMemoryPromptBlock } from "./brand-memory-context";

const { getMem0Client, ensureBrandMemoryScope, getBrandMemoryUserId } = vi.hoisted(() => ({
  getMem0Client: vi.fn(),
  ensureBrandMemoryScope: vi.fn(),
  getBrandMemoryUserId: vi.fn(),
}));

vi.mock("./mem0-client", () => ({
  getMem0Client,
  ensureBrandMemoryScope,
  getBrandMemoryUserId,
}));

import { getBrandMemoryContext } from "./brand-memory-context";

describe("brand memory context", () => {
  it("formats learned memory as auxiliary prompt context", () => {
    const block = buildBrandMemoryPromptBlock([
      { source: "fact", text: "Acme favors direct CTA buttons." },
      { source: "episode", text: "Rejected variants were too abstract." },
    ]);

    expect(block).toContain("BRAND MEMORY / LEARNED CONTEXT");
    expect(block).toContain("- Acme favors direct CTA buttons.");
    expect(block).toContain("auxiliary context only");
    expect(block).toContain("must not override the literal CTA");
  });

  it("returns an empty string when no useful items exist", () => {
    expect(buildBrandMemoryPromptBlock([])).toBe("");
  });
});

describe("getBrandMemoryContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureBrandMemoryScope.mockResolvedValue("scoped-user");
    getBrandMemoryUserId.mockReturnValue("fallback-user");
  });

  it("searches with profile-scoped user id and metadata filter", async () => {
    const search = vi.fn().mockResolvedValue([
      { memory: "Profile A prefers bold headlines.", metadata: { clientProfileId: "profile-a" } },
    ]);
    getMem0Client.mockReturnValue({ search });

    const result = await getBrandMemoryContext({
      workspaceId: "ws-1",
      clientProfileId: "profile-a",
      clientProfileName: "Acme",
      limit: 4,
    });

    expect(ensureBrandMemoryScope).toHaveBeenCalledWith("ws-1", "profile-a");
    expect(search).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        user_id: "scoped-user",
        filters: { AND: [{ metadata: { clientProfileId: "profile-a" } }] },
      })
    );
    expect(result.items[0]?.text).toContain("Profile A");
  });

  it("does not return profile B memories when searching for profile A", async () => {
    const search = vi.fn().mockResolvedValue([]);
    getMem0Client.mockReturnValue({ search });

    const result = await getBrandMemoryContext({
      workspaceId: "ws-1",
      clientProfileId: "profile-a",
      clientProfileName: "Acme",
    });

    expect(search).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        filters: { AND: [{ metadata: { clientProfileId: "profile-a" } }] },
      })
    );
    expect(result.items).toEqual([]);
  });
});

