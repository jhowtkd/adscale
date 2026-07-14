import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BrandTrainingCategory,
  BrandTrainingUsageMode,
  BrandTrainingAnalysis,
  BrandTrainingReviewStatus,
} from "../brand-training/contracts";
import type { SocialPostBrief } from "./contracts";

const mocks = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const queryChain = (() => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.offset = vi.fn(() => chain);
    chain.then = (resolve: (value: unknown) => void) =>
      Promise.resolve(selectResults.shift() ?? []).then(resolve);
    return chain;
  })();

  return {
    getApprovedTrainingReferencesMock: vi.fn(),
    getBrandKitMock: vi.fn(),
    selectResults,
    selectChain: queryChain,
    selectMock: vi.fn(() => queryChain),
  };
});

vi.mock("../db", () => ({
  db: {
    select: mocks.selectMock,
  },
}));

vi.mock("../repositories/client-reference", () => ({
  getApprovedTrainingReferences: mocks.getApprovedTrainingReferencesMock,
}));

vi.mock("../repositories/brand-kit", () => ({
  getBrandKit: mocks.getBrandKitMock,
}));

import {
  buildIdentityOptions,
  createIdentitySnapshot,
  DEFAULT_EXACT_PLACEMENT,
} from "./identity";

const socialBrief: SocialPostBrief = {
  theme: "Novo produto",
  objective: "Gerar interesse",
  audience: "Empreendedores digitais",
  offer: "Teste gratuito",
};

function approvedReference(overrides: {
  id?: string;
  trainingCategory: BrandTrainingCategory;
  usageMode: BrandTrainingUsageMode;
  assetKey?: string;
  label?: string;
  analysis?: BrandTrainingAnalysis;
}) {
  return {
    id: overrides.id ?? "ref-1",
    workspaceId: "ws-1",
    clientProfileId: "profile-1",
    assetKey: overrides.assetKey ?? `workspaces/ws-1/assets/${overrides.id ?? "ref-1"}.png`,
    label: overrides.label ?? "Asset",
    kind: "other" as const,
    trainingCategory: overrides.trainingCategory,
    usageMode: overrides.usageMode,
    trainingAnalysis: overrides.analysis ?? {
      description: "An asset",
      visualAttributes: ["modern"],
      rules: [],
      constraints: [],
      confidence: 0.9,
    },
    reviewStatus: "approved" as BrandTrainingReviewStatus,
    reviewedAt: null,
    reviewedByUserId: null,
    notes: null,
    sourceDerivationId: null,
    createdAt: new Date(),
  };
}

describe("creative-work identity module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectResults.length = 0;
  });

  describe("DEFAULT_EXACT_PLACEMENT", () => {
    it("exposes the documented default placements per category", () => {
      expect(DEFAULT_EXACT_PLACEMENT).toEqual({
        logo: { gravity: "southeast", widthRatio: 0.18 },
        graphic: { gravity: "northwest", widthRatio: 0.35 },
        character: { gravity: "southeast", widthRatio: 0.42 },
        visual_reference: null,
      });
    });
  });

  describe("buildIdentityOptions", () => {
    it("recommends only approved references and preserves all approved rules", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({ id: "logo", trainingCategory: "logo", usageMode: "exact" }),
        approvedReference({ id: "rule", trainingCategory: "graphic", usageMode: "rule" }),
      ]);
      mocks.selectResults.push([
        { key: "workspaces/ws-1/assets/logo.png", type: "image/png", metadata: { hasAlpha: true } },
        { key: "workspaces/ws-1/assets/rule.png", type: "image/png", metadata: { hasAlpha: false } },
      ]);

      const result = await buildIdentityOptions("ws-1", "profile-1", socialBrief);

      expect(result.map((item) => item.referenceId)).toEqual(["logo", "rule"]);
    });

    it("surfaces approved logo/graphic/character assets in reference mode as visual guidance", async () => {
      // Regression: opaque PNGs are approved as usageMode=reference by the
      // training analyzer. Trained-status counts them, but Create Post used to
      // drop them in classifyGroup — leaving the identity step empty.
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({ id: "logo-ref", trainingCategory: "logo", usageMode: "reference" }),
        approvedReference({ id: "graphic-ref", trainingCategory: "graphic", usageMode: "reference" }),
        approvedReference({ id: "char-ref", trainingCategory: "character", usageMode: "reference" }),
      ]);
      mocks.selectResults.push([
        { key: "k1", type: "image/png", metadata: { hasAlpha: false } },
        { key: "k2", type: "image/png", metadata: { hasAlpha: false } },
        { key: "k3", type: "image/png", metadata: { hasAlpha: false } },
      ]);

      const result = await buildIdentityOptions("ws-1", "profile-1", socialBrief);

      expect(result.map((item) => item.referenceId)).toEqual([
        "char-ref",
        "graphic-ref",
        "logo-ref",
      ]);
      expect(result.every((item) => item.usageMode === "reference")).toBe(true);
    });

    it("orders by category priority: logo exact, then character/graphic exact, then visual reference, then rules", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({ id: "rule-1", trainingCategory: "graphic", usageMode: "rule" }),
        approvedReference({ id: "rule-2", trainingCategory: "character", usageMode: "rule" }),
        approvedReference({ id: "vr-1", trainingCategory: "visual_reference", usageMode: "reference" }),
        approvedReference({ id: "char-1", trainingCategory: "character", usageMode: "exact" }),
        approvedReference({ id: "graphic-1", trainingCategory: "graphic", usageMode: "exact" }),
        approvedReference({ id: "logo-1", trainingCategory: "logo", usageMode: "exact" }),
      ]);
      mocks.selectResults.push([
        { key: "k1", type: "image/png", metadata: { hasAlpha: true } },
        { key: "k2", type: "image/png", metadata: { hasAlpha: true } },
        { key: "k3", type: "image/png", metadata: { hasAlpha: false } },
        { key: "k4", type: "image/png", metadata: { hasAlpha: true } },
        { key: "k5", type: "image/png", metadata: { hasAlpha: true } },
        { key: "k6", type: "image/png", metadata: { hasAlpha: true } },
      ]);

      const result = await buildIdentityOptions("ws-1", "profile-1", socialBrief);

      expect(result.map((item) => item.referenceId)).toEqual([
        "logo-1",
        "char-1",
        "graphic-1",
        "vr-1",
        "rule-1",
        "rule-2",
      ]);
    });

    it("uses brief token overlap only as a tie-breaker inside each category group", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({
          id: "logo-a",
          trainingCategory: "logo",
          usageMode: "exact",
          analysis: {
            description: "Generic logo",
            visualAttributes: ["blue"],
            rules: [],
            constraints: [],
            confidence: 0.9,
          },
        }),
        approvedReference({
          id: "logo-b",
          trainingCategory: "logo",
          usageMode: "exact",
          analysis: {
            description: "Empreendedores digitais blue logo",
            visualAttributes: ["blue"],
            rules: [],
            constraints: [],
            confidence: 0.9,
          },
        }),
      ]);
      mocks.selectResults.push([
        { key: "k1", type: "image/png", metadata: { hasAlpha: true } },
        { key: "k2", type: "image/png", metadata: { hasAlpha: true } },
      ]);

      const result = await buildIdentityOptions("ws-1", "profile-1", socialBrief);

      expect(result.map((item) => item.referenceId)).toEqual(["logo-b", "logo-a"]);
    });

    it("attaches a human-readable reason per recommendation", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({ id: "logo", trainingCategory: "logo", usageMode: "exact" }),
        approvedReference({ id: "rule", trainingCategory: "graphic", usageMode: "rule" }),
      ]);
      mocks.selectResults.push([
        { key: "k1", type: "image/png", metadata: { hasAlpha: true } },
        { key: "k2", type: "image/png", metadata: { hasAlpha: false } },
      ]);

      const result = await buildIdentityOptions("ws-1", "profile-1", socialBrief);

      expect(result[0].reason.length).toBeGreaterThan(0);
      expect(result[1].reason.length).toBeGreaterThan(0);
    });
  });

  describe("createIdentitySnapshot", () => {
    it("rejects selected IDs that are not present in approved references", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({ id: "logo", trainingCategory: "logo", usageMode: "exact" }),
      ]);
      mocks.selectResults.push([
        { key: "k1", type: "image/png", metadata: { hasAlpha: true } },
      ]);
      mocks.getBrandKitMock.mockResolvedValue({
        id: "profile-1",
        workspaceId: "ws-1",
        name: "Acme",
        brandColors: [],
        brandFonts: [],
        logoAssetKey: null,
        toneOfVoice: null,
        prohibitedElements: null,
        requiredElements: null,
        description: null,
        visualNotes: null,
        toneNotes: null,
        constraints: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        createIdentitySnapshot({
          workspaceId: "ws-1",
          clientProfileId: "profile-1",
          selectedReferenceIds: ["logo", "missing"],
        })
      ).rejects.toThrow(/missing|not approved|not found/i);
    });

    it("rejects exact-mode rows without alpha metadata", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({ id: "logo", trainingCategory: "logo", usageMode: "exact" }),
      ]);
      mocks.selectResults.push([
        { key: "k1", type: "image/jpeg", metadata: { hasAlpha: false } },
      ]);
      mocks.getBrandKitMock.mockResolvedValue({
        id: "profile-1",
        workspaceId: "ws-1",
        name: "Acme",
        brandColors: [],
        brandFonts: [],
        logoAssetKey: null,
        toneOfVoice: null,
        prohibitedElements: null,
        requiredElements: null,
        description: null,
        visualNotes: null,
        toneNotes: null,
        constraints: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        createIdentitySnapshot({
          workspaceId: "ws-1",
          clientProfileId: "profile-1",
          selectedReferenceIds: ["logo"],
        })
      ).rejects.toThrow(/alpha|transparency/i);
    });

    it("applies DEFAULT_EXACT_PLACEMENT for exact categories and null for visual_reference", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({ id: "logo", trainingCategory: "logo", usageMode: "exact" }),
        approvedReference({ id: "graphic", trainingCategory: "graphic", usageMode: "exact" }),
        approvedReference({ id: "character", trainingCategory: "character", usageMode: "exact" }),
        approvedReference({ id: "vr", trainingCategory: "visual_reference", usageMode: "reference" }),
      ]);
      mocks.selectResults.push([
        { key: "workspaces/ws-1/assets/logo.png", type: "image/png", metadata: { hasAlpha: true } },
        { key: "workspaces/ws-1/assets/graphic.png", type: "image/png", metadata: { hasAlpha: true } },
        { key: "workspaces/ws-1/assets/character.png", type: "image/png", metadata: { hasAlpha: true } },
        { key: "workspaces/ws-1/assets/vr.png", type: "image/png", metadata: { hasAlpha: false } },
      ]);
      mocks.getBrandKitMock.mockResolvedValue({
        id: "profile-1",
        workspaceId: "ws-1",
        name: "Acme",
        brandColors: [],
        brandFonts: [],
        logoAssetKey: null,
        toneOfVoice: null,
        prohibitedElements: null,
        requiredElements: null,
        description: null,
        visualNotes: null,
        toneNotes: null,
        constraints: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const snapshot = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: ["logo", "graphic", "character", "vr"],
      });

      const byRef = Object.fromEntries(
        snapshot.assets.map((asset) => [asset.referenceId, asset.placement])
      );

      expect(byRef.logo).toEqual(DEFAULT_EXACT_PLACEMENT.logo);
      expect(byRef.graphic).toEqual(DEFAULT_EXACT_PLACEMENT.graphic);
      expect(byRef.character).toEqual(DEFAULT_EXACT_PLACEMENT.character);
      expect(byRef.vr).toBeNull();
      expect(typeof snapshot.confirmedAt).toBe("string");
      expect(snapshot.clientProfileId).toBe("profile-1");
      expect(snapshot.brandKit).toBeDefined();
    });

    it("snapshots only the fields needed for reproducibility", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({ id: "logo", trainingCategory: "logo", usageMode: "exact" }),
      ]);
      mocks.selectResults.push([
        { key: "workspaces/ws-1/assets/logo.png", type: "image/png", metadata: { hasAlpha: true } },
      ]);
      mocks.getBrandKitMock.mockResolvedValue({
        id: "profile-1",
        workspaceId: "ws-1",
        name: "Acme",
        brandColors: ["#000000"],
        brandFonts: ["Inter"],
        logoAssetKey: null,
        toneOfVoice: "Direct",
        prohibitedElements: "no clipart",
        requiredElements: "logo",
        description: null,
        visualNotes: null,
        toneNotes: null,
        constraints: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const snapshot = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: ["logo"],
      });

      const asset = snapshot.assets[0];
      expect(asset.referenceId).toBe("logo");
      expect(asset.assetKey).toBeTruthy();
      expect(asset.label).toBeTruthy();
      expect(asset.category).toBe("logo");
      expect(asset.usageMode).toBe("exact");
      expect(asset.mimeType).toBe("image/png");
      expect(asset.hasAlpha).toBe(true);
      expect(asset.analysis).toBeDefined();
      expect(asset.placement).toEqual(DEFAULT_EXACT_PLACEMENT.logo);

      expect(snapshot.brandKit).toEqual({
        colors: ["#000000"],
        fonts: ["Inter"],
        toneOfVoice: "Direct",
        prohibitedElements: "no clipart",
        requiredElements: "logo",
      });
    });

    it("builds a Brand-Kit-only snapshot when no references are selected", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([]);
      mocks.getBrandKitMock.mockResolvedValue({
        id: "profile-1",
        workspaceId: "ws-1",
        name: "Acme",
        brandColors: ["#112233"],
        brandFonts: ["Geist"],
        logoAssetKey: "logo.png",
        toneOfVoice: "Warm",
        prohibitedElements: null,
        requiredElements: null,
        description: null,
        visualNotes: null,
        toneNotes: null,
        constraints: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const snapshot = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: [],
      });

      expect(snapshot.assets).toEqual([]);
      expect(snapshot.brandKit).toEqual({
        colors: ["#112233"],
        fonts: ["Geist"],
        toneOfVoice: "Warm",
        prohibitedElements: null,
        requiredElements: null,
      });
    });
  });
});
