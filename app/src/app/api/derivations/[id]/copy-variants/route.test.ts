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

vi.mock("@/server/db/repositories/brand-kit", () => ({
  getBrandKitByWorkspace: vi.fn(),
}));

vi.mock("@/server/repositories/copy-variant", () => ({
  createCopyVariant: vi.fn(),
  getCopyVariantsByDerivation: vi.fn(),
  deleteCopyVariantsByDerivation: vi.fn(),
}));

vi.mock("@/server/ai/copy-generator", () => ({
  generateCopyVariants: vi.fn(),
}));

vi.mock("@/server/billing/gates", () => ({
  spendCreditsOrApiError: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getDerivationById } from "@/server/repositories/derivation";
import { getCampaignById } from "@/server/repositories/campaign";
import { getBrandKitByWorkspace } from "@/server/db/repositories/brand-kit";
import {
  createCopyVariant,
  getCopyVariantsByDerivation,
  deleteCopyVariantsByDerivation,
} from "@/server/repositories/copy-variant";
import { generateCopyVariants } from "@/server/ai/copy-generator";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockGetCampaignById = vi.mocked(getCampaignById);
const mockGetBrandKitByWorkspace = vi.mocked(getBrandKitByWorkspace);
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
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetBrandKitByWorkspace.mockResolvedValue(null);
    mockGenerateCopyVariants.mockResolvedValue([
      { headline: "Oferta imperdível", ctaText: "Compre", toneLabel: "urgent", confidenceScore: 85, reasoning: "Urgência funciona" },
    ]);
    mockCreateCopyVariant.mockResolvedValue({ id: "cv-1", headline: "Oferta imperdível" } as Awaited<ReturnType<typeof createCopyVariant>>);
    mockDeleteCopyVariantsByDerivation.mockResolvedValue([]);

    const res = await POST(
      new Request("http://localhost/api/derivations/der-1/copy-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5 }),
      }),
      { params: makeParams("der-1") }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.variants).toHaveLength(1);
    expect(mockGenerateCopyVariants).toHaveBeenCalled();
  });

  it("returns 404 for missing derivation", async () => {
    mockGetDerivationById.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost/api/derivations/der-999/copy-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: makeParams("der-999") }
    );

    expect(res.status).toBe(404);
  });
});

describe("GET /api/derivations/[id]/copy-variants", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("returns copy variants for derivation", async () => {
    const variants = [{ id: "cv-1", headline: "Test" }];
    mockGetCopyVariantsByDerivation.mockResolvedValue(variants as Awaited<ReturnType<typeof getCopyVariantsByDerivation>>);

    const res = await GET(new Request("http://localhost/api/derivations/der-1/copy-variants"), { params: makeParams("der-1") });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.variants).toEqual(variants);
  });
});
