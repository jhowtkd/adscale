import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  resolveCampaignClientProfileId: vi.fn(),
}));

vi.mock("@/server/db/repositories/brand-kit", () => ({
  getBrandKit: vi.fn(),
}));

vi.mock("@/server/repositories/copy-variant", () => ({
  createCopyVariant: vi.fn(),
  getCopyVariantsByDerivation: vi.fn(),
  deleteCopyVariantsByDerivation: vi.fn(),
}));

vi.mock("@/server/ai/copy-generator", () => ({
  generateCopyVariants: vi.fn(),
}));

vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getDerivationById } from "@/server/repositories/derivation";
import { getCampaignById } from "@/server/repositories/campaign";
import { resolveCampaignClientProfileId } from "@/server/repositories/client-reference";
import { getBrandKit } from "@/server/db/repositories/brand-kit";
import {
  createCopyVariant,
  getCopyVariantsByDerivation,
  deleteCopyVariantsByDerivation,
} from "@/server/repositories/copy-variant";
import { generateCopyVariants } from "@/server/ai/copy-generator";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockGetCampaignById = vi.mocked(getCampaignById);
const mockResolveCampaignClientProfileId = vi.mocked(resolveCampaignClientProfileId);
const mockGetBrandKit = vi.mocked(getBrandKit);
const mockGenerateCopyVariants = vi.mocked(generateCopyVariants);
const mockCreateCopyVariant = vi.mocked(createCopyVariant);
const mockGetCopyVariantsByDerivation = vi.mocked(getCopyVariantsByDerivation);
const mockDeleteCopyVariantsByDerivation = vi.mocked(deleteCopyVariantsByDerivation);

function makeParams(id: string) {
  return Promise.resolve({ id });
}

describe("POST /api/derivations/[id]/copy-variants", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("generates and saves copy variants", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "der-1",
      campaignId: "camp-1",
      ctaText: "Compre Agora",
    } as Awaited<ReturnType<typeof getDerivationById>>);
    mockGetCampaignById.mockResolvedValue({
      id: "camp-1",
      client: "Nike",
      offer: "50% off",
      clientProfileId: "profile-1",
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockResolveCampaignClientProfileId.mockResolvedValue("profile-1");
    mockGetBrandKit.mockResolvedValue(null);
    mockGenerateCopyVariants.mockResolvedValue([
      { headline: "Headline", body: "Body", cta: "CTA", tone: "direct" },
    ]);
    mockCreateCopyVariant.mockResolvedValue({
      id: "cv-1",
      headline: "Headline",
    } as Awaited<ReturnType<typeof createCopyVariant>>);

    const res = await POST(
      new Request("http://localhost/api/derivations/der-1/copy-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 3 }),
      }),
      { params: makeParams("der-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.variants).toHaveLength(1);
    expect(mockResolveCampaignClientProfileId).toHaveBeenCalledWith("workspace-1", {
      clientProfileId: "profile-1",
      client: "Nike",
    });
    expect(mockGetBrandKit).toHaveBeenCalledWith("workspace-1", "profile-1");
    expect(mockGenerateCopyVariants).toHaveBeenCalled();
  });
});

describe("GET /api/derivations/[id]/copy-variants", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns saved variants", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "der-1",
      campaignId: "camp-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);
    mockGetCopyVariantsByDerivation.mockResolvedValue([
      { id: "cv-1", headline: "Headline" },
    ] as Awaited<ReturnType<typeof getCopyVariantsByDerivation>>);

    const res = await GET(new Request("http://localhost"), {
      params: makeParams("der-1"),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.variants).toHaveLength(1);
  });
});
