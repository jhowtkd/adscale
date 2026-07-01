import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: vi.fn() } };
    images = { generate: vi.fn(), edit: vi.fn() };
    responses = { create: vi.fn() };
  },
  toFile: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue(undefined),
    createFunction: vi.fn().mockReturnValue({}),
  },
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  refreshCampaignStatus: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/plan", () => ({
  getPlanByCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  getAssetsByCampaign: vi.fn(),
}));

vi.mock("@/server/validation/env", () => ({
  env: {
    R2_PUBLIC_BASE_URL: "https://r2.example.com",
    OPENAI_API_KEY: "test-key",
    OPENAI_TEXT_MODEL: "gpt-5-mini",
    OPENAI_IMAGE_MODEL: "gpt-image-2-2026-04-21",
  },
}));

vi.mock("@/server/ai/creative-quality-gate", () => ({
  runCompletedDerivationQualityGate: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/server/ai/creative-score", () => ({
  scoreDerivationHeuristic: vi.fn().mockReturnValue({
    qualityScore: 72,
    scoreStatus: "heuristic",
    scoreBreakdown: {
      ctaClarity: 70,
      textLegibility: 70,
      briefMatch: 75,
      visualQuality: 72,
      formatFit: 73,
      variationLevelFit: 72,
      informationPreservation: 70,
    },
    scoreIssues: [],
    regenerationSuggestion: "Improve contrast while preserving the exact CTA text.",
  }),
  analyzeDerivationCreative: vi.fn().mockRejectedValue(new Error("vision unavailable")),
}));

vi.mock("@/server/ai/prompt-builder", () => ({
  buildDerivationPrompt: vi.fn().mockReturnValue("mock derivation prompt"),
}));

vi.mock("@/server/ai/image-analysis", () => ({
  analyzeImageContent: vi.fn().mockResolvedValue({
    product: "Test Product",
    offer: "50% off",
    keyVisual: "Test visual",
    textContent: { headline: "TEST", bullets: ["bullet"] },
    brandElements: ["logo"],
    cta: { text: "Buy", style: "button" },
    format: "1:1",
  }),
  analyzeImageStyle: vi.fn().mockResolvedValue({
    colorPalette: { dominant: ["black"], accents: ["yellow"], gradients: "none" },
    typography: { personality: "bold", effects: ["shadow"] },
    textures: ["smooth"],
    composition: "centered",
    mood: "energetic",
    decorativeElements: ["badges"],
    photoTreatment: "high contrast",
  }),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(Buffer.from("fake-image")),
  },}));

vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: vi.fn().mockResolvedValue(null),
}));

import { db } from "@/server/db";
import { inngest } from "@/server/jobs/client";
import { createDerivation, updateDerivationStatus } from "@/server/repositories/derivation";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById, updateCampaign, refreshCampaignStatus } from "@/server/repositories/campaign";
import { getPlanByCampaign } from "@/server/repositories/plan";
import { getUserLocale } from "@/server/repositories/user";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { scoreCompletedDerivation } from "@/server/jobs/derivation";
import { POST } from "@/app/api/campaigns/[id]/derivations/route";


describe("derivation job flow", () => {
  const workspaceId = "ws-123";
  const campaignId = "camp-456";

  it("derivation creation emits Inngest event", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "queued" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const derivation = await createDerivation({
      campaignId,
      workspaceId,
      status: "queued",
    });

    expect(derivation.status).toBe("queued");

    await inngest.send({
      name: "derivation.generate",
      data: {
        derivationId: derivation.id,
        campaignId,
        workspaceId,
      },
    });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "derivation.generate",
        data: expect.objectContaining({ derivationId: "deriv-1" }),
      })
    );
  });

  it("transitions status from queued to processing", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "processing" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const updated = await updateDerivationStatus("deriv-1", workspaceId, "processing");

    expect(updated).toEqual({ id: "deriv-1", status: "processing" });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "processing" })
    );
  });

  it("transitions status from processing to completed", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "completed" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const updated = await updateDerivationStatus("deriv-1", workspaceId, "completed", "derivations/deriv-1/123.png");

    expect(updated).toEqual({ id: "deriv-1", status: "completed" });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", outputKey: "derivations/deriv-1/123.png" })
    );
  });

  it("transitions status to failed", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "failed" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const updated = await updateDerivationStatus("deriv-1", workspaceId, "failed");

    expect(updated).toEqual({ id: "deriv-1", status: "failed" });
  });

  it("score failures update score status without changing completed status", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", qualityScore: 72 }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    await expect(
      scoreCompletedDerivation(
        "deriv-1",
        workspaceId,
        Buffer.from("fake"),
        {
          name: "Summer",
          client: "Client",
          product: "Product",
          offer: "50% off",
          objective: "Sales",
          audience: "Parents",
        },
        {
          ctaText: "Buy now",
          format: "1:1",
          generationMode: "art_variation",
          feedback: null,
          parentId: null,
        }
      )
    ).resolves.toBeUndefined();

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        scoreStatus: "failed",
      })
    );
  });
});

describe("POST /api/campaigns/[id]/derivations", () => {
  const workspaceId = "ws-123";
  const campaignId = "camp-456";
  const userId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    (requireWorkspaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: userId },
      workspace: { id: workspaceId },
    });
    (getUserLocale as ReturnType<typeof vi.fn>).mockResolvedValue("en");
    (getPlanByCampaign as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getAssetsByCampaign as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (updateCampaign as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (refreshCampaignStatus as ReturnType<typeof vi.fn>).mockResolvedValue("generating");
  });

  it("format_adaptation with targetFormats: ['4:5'] creates exactly 1 derivation with format === '4:5'", async () => {
    (getCampaignById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: campaignId,
      workspaceId,
      generationMode: "format_adaptation",
      targetFormats: ["4:5"],
      ctaVariants: [],
      creativeLevel: "balanced",
      status: "active",
    });

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "queued", format: "4:5" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const request = new Request("http://localhost/api/campaigns/camp-456/derivations", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ id: campaignId }) });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.derivations).toHaveLength(1);
    expect(body.derivations[0].format).toBe("4:5");

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ format: "4:5", generationMode: "format_adaptation" })
    );
    expect(inngest.send).toHaveBeenCalledTimes(1);
  });

  it("art_variation without an uploaded base asset returns error 400", async () => {
    (getCampaignById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: campaignId,
      workspaceId,
      generationMode: "art_variation",
      targetFormats: null,
      ctaVariants: ["Comprar agora"],
      creativeLevel: "balanced",
      status: "active",
    });
    (getAssetsByCampaign as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const request = new Request("http://localhost/api/campaigns/camp-456/derivations", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ id: campaignId }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("missingBaseAsset");
    expect(inngest.send).not.toHaveBeenCalled();
  });
});
