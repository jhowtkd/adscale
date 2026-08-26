import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  setCreativeWorkCopy: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: vi.fn(),
}));

vi.mock("@/server/repositories/brand-kit", () => ({
  getBrandKit: vi.fn(),
}));

vi.mock("@/server/billing/paywall", () => ({
  spend: vi.fn(),
}));

vi.mock("@/server/creative-work/copy", () => ({
  generateSocialPostCopy: vi.fn(),
}));

import { spend } from "@/server/billing/paywall";
import { generateSocialPostCopy as generateCopy } from "@/server/creative-work/copy";
import { getBrandKit } from "@/server/repositories/brand-kit";
import { getClientProfile } from "@/server/repositories/client-reference";
import {
  getCreativeWork,
  setCreativeWorkCopy,
} from "@/server/repositories/creative-work";
import { generateSocialPostCopy } from "./generate-social-post-copy";

const mockGet = vi.mocked(getCreativeWork);
const mockSetCopy = vi.mocked(setCreativeWorkCopy);
const mockProfile = vi.mocked(getClientProfile);
const mockBrandKit = vi.mocked(getBrandKit);
const mockSpend = vi.mocked(spend);
const mockGenerate = vi.mocked(generateCopy);

const profileId = "00000000-0000-4000-8000-000000000001";
const brief = {
  theme: "Tema",
  objective: "Objetivo",
  audience: "Publico",
  offer: "Oferta",
};
const generatedCopy = {
  headline: "Headline gerada",
  body: "Body gerado",
  cta: "CTA gerada",
};

const workItem = {
  id: "work-1",
  workspaceId: "ws-1",
  clientProfileId: profileId,
  createdByUserId: "u-1",
  toolKind: "social_post",
  status: "draft",
  brief,
  format: "4:5" as const,
  copy: null as typeof generatedCopy | null,
  identitySnapshot: null,
  createdAt: new Date("2026-07-13T12:00:00.000Z"),
  updatedAt: new Date("2026-07-13T12:00:00.000Z"),
};

describe("generateSocialPostCopy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpend.mockResolvedValue({ ok: true, creditsSpent: 2 });
    mockProfile.mockResolvedValue({ id: profileId, name: "Acme" } as never);
    mockBrandKit.mockResolvedValue(null);
    mockGenerate.mockResolvedValue(generatedCopy);
    mockGet.mockResolvedValue({ work: workItem, outputs: [] } as never);
    mockSetCopy.mockResolvedValue({
      ...workItem,
      copy: generatedCopy,
    } as never);
  });

  it("returns work_not_found without spend", async () => {
    mockGet.mockResolvedValue(null);
    const result = await generateSocialPostCopy({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "u-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("work_not_found");
    expect(mockSpend).not.toHaveBeenCalled();
  });

  it("returns work_not_prepared without spend when brief is absent", async () => {
    mockGet.mockResolvedValue({ work: { ...workItem, brief: null }, outputs: [], sources: [] } as never);
    const result = await generateSocialPostCopy({ workspaceId: "ws-1", workItemId: "work-1", userId: "u-1" });
    expect(result).toEqual({ ok: false, error: { code: "work_not_prepared" } });
    expect(mockSpend).not.toHaveBeenCalled();
  });

  it("short-circuits when copy already exists", async () => {
    mockGet.mockResolvedValue({
      work: { ...workItem, copy: generatedCopy },
      outputs: [],
    } as never);

    const result = await generateSocialPostCopy({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "u-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.copy).toEqual(generatedCopy);
    expect(result.value.canonical.briefing.headline).toBe(generatedCopy.headline);
    expect(mockSpend).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockSetCopy).not.toHaveBeenCalled();
  });

  it("spends copy_generation credits, generates, persists, returns canonical", async () => {
    const result = await generateSocialPostCopy({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "u-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(mockSpend).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        action: "copy_generation",
        idempotencyKey: "creative-work:work-1:copy",
      })
    );
    expect(mockGenerate).toHaveBeenCalled();
    expect(mockSetCopy).toHaveBeenCalledWith("ws-1", "work-1", generatedCopy);
    expect(result.value.copy).toEqual(generatedCopy);
    expect(result.value.canonical.id).toBe("creative_work:work-1");
    expect(result.value.canonical.intent.kind).toBe("social_post");
    expect(result.value.canonical.briefing.headline).toBe(generatedCopy.headline);
  });

  it("returns credit_blocked without calling provider", async () => {
    mockSpend.mockResolvedValue({
      ok: false,
      status: 402,
      conversionPayload: { reason: "noCredits" },
    } as never);

    const result = await generateSocialPostCopy({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "u-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("credit_blocked");
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockSetCopy).not.toHaveBeenCalled();
  });

  it("returns provider_unavailable when OpenAI fails after spend", async () => {
    mockGenerate.mockRejectedValue(new Error("openai blew up"));

    const result = await generateSocialPostCopy({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "u-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("provider_unavailable");
    expect(mockSetCopy).not.toHaveBeenCalled();
  });
});
