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
    getRejectedTrainingReferencesMock: vi.fn(),
    getBrandKitMock: vi.fn(),
    getActiveBrandKnowledgeVersionMock: vi.fn(),
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
  getRejectedTrainingReferences: mocks.getRejectedTrainingReferencesMock,
}));

vi.mock("../repositories/brand-kit", () => ({
  getBrandKit: mocks.getBrandKitMock,
}));

vi.mock("../repositories/brand-knowledge", () => ({
  getActiveBrandKnowledgeVersion: mocks.getActiveBrandKnowledgeVersionMock,
}));

import {
  buildIdentityOptions,
  createIdentitySnapshot,
  DEFAULT_EXACT_PLACEMENT,
  getPersonReferenceAssets,
  IdentitySnapshotMissingReferenceError,
  matchPersonPhotoBuffers,
  resolveSnapshotPersonSlots,
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

function analyzedLayout(input: {
  mediaType: "photo" | "device";
  centralMessages?: number;
}): BrandTrainingAnalysis {
  return {
    description: `${input.mediaType} layout`,
    visualAttributes: [],
    rules: [],
    constraints: [],
    confidence: 0.9,
    structure: {
      version: 1,
      source: "vision",
      inferredAt: "2026-01-01T00:00:00.000Z",
      zones: null,
      archetype: { id: "modular_card", confidence: 0.9 },
      typography: null,
      grid: null,
      media: { type: input.mediaType, treatment: null, confidence: 0.9 },
      contentPattern: {
        centralMessages: input.centralMessages ?? 1,
        listItems: null,
        ctaStyle: null,
        hasLegalDisclaimer: null,
        confidence: 0.9,
      },
      accentPlacement: null,
      authenticityRisk: null,
      overallConfidence: 0.9,
    },
  };
}

describe("creative-work identity module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectResults.length = 0;
    mocks.getRejectedTrainingReferencesMock.mockResolvedValue([]);
    mocks.getActiveBrandKnowledgeVersionMock.mockResolvedValue(null);
  });

  describe("getPersonReferenceAssets", () => {
    it("resolves approved reference-mode photos and skips unapproved ids", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({
          id: "photo-ana",
          trainingCategory: "person",
          usageMode: "reference",
          assetKey: "workspaces/ws-1/assets/ana.png",
          label: "Ana",
        }),
      ]);
      mocks.selectResults.push([
        { key: "workspaces/ws-1/assets/ana.png", type: "image/png", metadata: { hasAlpha: false } },
      ]);
      const resolved = await getPersonReferenceAssets("ws-1", "profile-1", ["photo-ana", "photo-missing"]);
      expect([...resolved.entries()]).toEqual([
        ["photo-ana", { assetKey: "workspaces/ws-1/assets/ana.png", mimeType: "image/png", label: "Ana" }],
      ]);
    });

    it("never resolves exact-mode photos as identity proofs", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({ id: "photo-ana", trainingCategory: "person", usageMode: "exact" }),
      ]);
      const resolved = await getPersonReferenceAssets("ws-1", "profile-1", ["photo-ana"]);
      expect(resolved.size).toBe(0);
    });
  });

  describe("resolveSnapshotPersonSlots", () => {
    const snapshotPerson = {
      personId: "11111111-1111-4111-8111-111111111111",
      name: "Ana",
      referenceIds: ["photo-ana"],
      primaryReferenceId: "photo-ana",
      preserve: ["formato do rosto"],
    };

    it("builds mandatory slots from confirmed identity assets without extra reads", async () => {
      const { slots, secondaryAssets } = await resolveSnapshotPersonSlots({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        people: [snapshotPerson],
        identityAssets: [{
          referenceId: "photo-ana",
          assetKey: "workspaces/ws-1/assets/ana.png",
          mimeType: "image/png",
          label: "Ana",
        }],
      });
      expect(slots).toHaveLength(1);
      expect(slots[0]).toMatchObject({
        role: "piece_required",
        required: true,
        label: "Ana",
        pieceReference: { category: "person_or_character", treatment: "identity_preservation" },
      });
      expect(secondaryAssets).toEqual([]);
      expect(mocks.getApprovedTrainingReferencesMock).not.toHaveBeenCalled();
    });

    it("falls back to approved training references and fails missing photos as reference_failure", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({
          id: "photo-ana",
          trainingCategory: "person",
          usageMode: "reference",
          assetKey: "workspaces/ws-1/assets/ana.png",
          label: "Ana",
        }),
      ]);
      mocks.selectResults.push([
        { key: "workspaces/ws-1/assets/ana.png", type: "image/png", metadata: { hasAlpha: false } },
      ]);
      const { slots } = await resolveSnapshotPersonSlots({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        people: [snapshotPerson],
        identityAssets: [],
      });
      expect(slots).toHaveLength(1);
      await expect(resolveSnapshotPersonSlots({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        people: [{ ...snapshotPerson, referenceIds: ["photo-gone"], primaryReferenceId: "photo-gone" }],
        identityAssets: [],
      })).rejects.toMatchObject({ code: "reference_failure" });
    });
  });

  describe("matchPersonPhotoBuffers (plan 03, T3)", () => {
    const snapshotPerson = {
      personId: "11111111-1111-4111-8111-111111111111",
      name: "Ana",
      referenceIds: ["photo-ana"],
      primaryReferenceId: "photo-ana",
      preserve: ["formato do rosto"],
    };
    const slot = (assetKey: string) => ({
      assetKey,
      mimeType: "image/png",
      label: "Ana",
      role: "piece_required",
      required: true,
    }) as never;

    it("binds each person to their loaded primary photo by assetKey", () => {
      const photo = Buffer.from("foto");
      const matched = matchPersonPhotoBuffers({
        people: [snapshotPerson],
        personSlots: [slot("workspaces/ws-1/assets/ana.png")],
        loaded: [{
          slot: slot("workspaces/ws-1/assets/ana.png"),
          buffer: photo,
          mimeType: "image/png",
        }],
      });
      expect(matched).toEqual([{
        personId: snapshotPerson.personId,
        name: "Ana",
        primaryReferenceId: "photo-ana",
        preserve: ["formato do rosto"],
        reference: { buffer: photo, mimeType: "image/png" },
      }]);
    });

    it("keeps a null reference when the photo did not load", () => {
      const matched = matchPersonPhotoBuffers({
        people: [snapshotPerson],
        personSlots: [],
        loaded: [],
      });
      expect(matched).toEqual([{
        personId: snapshotPerson.personId,
        name: "Ana",
        primaryReferenceId: "photo-ana",
        preserve: ["formato do rosto"],
        reference: null,
      }]);
    });
  });

  describe("DEFAULT_EXACT_PLACEMENT", () => {
    it("exposes the documented default placements per category", () => {
      expect(DEFAULT_EXACT_PLACEMENT).toEqual({
        logo: { gravity: "southeast", widthRatio: 0.18 },
        graphic: { gravity: "northwest", widthRatio: 0.35 },
        character: { gravity: "southeast", widthRatio: 0.42 },
        person: null,
        visual_reference: null,
      });
    });
  });

  describe("buildIdentityOptions", () => {
    it("orders operator options with the same request signals as automatic selection", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({
          id: "device",
          trainingCategory: "visual_reference",
          usageMode: "reference",
          analysis: analyzedLayout({ mediaType: "device" }),
        }),
        approvedReference({
          id: "photo",
          trainingCategory: "visual_reference",
          usageMode: "reference",
          analysis: analyzedLayout({ mediaType: "photo" }),
        }),
      ]);
      mocks.selectResults.push(
        [
          { key: "workspaces/ws-1/assets/device.png", type: "image/png", metadata: { hasAlpha: false } },
          { key: "workspaces/ws-1/assets/photo.png", type: "image/png", metadata: { hasAlpha: false } },
        ],
        [
          { key: "workspaces/ws-1/assets/device.png", type: "image/png", metadata: { hasAlpha: false } },
          { key: "workspaces/ws-1/assets/photo.png", type: "image/png", metadata: { hasAlpha: false } },
        ],
      );

      const device = await buildIdentityOptions(
        "ws-1",
        "profile-1",
        { ...socialBrief, objective: "Demonstração da plataforma na tela" },
        "1:1",
      );
      const photo = await buildIdentityOptions(
        "ws-1",
        "profile-1",
        { ...socialBrief, objective: "Retrato com foto da equipe" },
        "1:1",
      );

      expect(device[0]?.referenceId).toBe("device");
      expect(photo[0]?.referenceId).toBe("photo");
    });

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
    it("freezes only applicable claims from the active published version", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([]);
      mocks.getBrandKitMock.mockResolvedValue(null);
      mocks.getActiveBrandKnowledgeVersionMock.mockResolvedValue({
        id: "version-1",
        versionNumber: 3,
        hash: "a".repeat(64),
        snapshot: {
          compiledAt: "2026-08-13T12:00:00.000Z",
          claims: [
            { id: "global", claimKey: "palette.colors", value: ["#D71F2B"], scope: { level: "global" }, evidenceRefs: [] },
            { id: "portrait", claimKey: "layout.density", value: "sparse", scope: { level: "global", format: "4:5" }, evidenceRefs: [] },
            { id: "story", claimKey: "layout.density", value: "dense", scope: { level: "global", format: "9:16" }, evidenceRefs: [] },
            { id: "channel", claimKey: "layout.hierarchy", value: "feed only", scope: { level: "global", channel: "instagram" }, evidenceRefs: [] },
          ],
        },
      });

      const snapshot = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: [],
        brief: socialBrief,
        format: "4:5",
        includePublishedBrandKnowledge: true,
      });

      expect(snapshot.brandKnowledge).toMatchObject({
        mode: "published",
        versionId: "version-1",
        versionNumber: 3,
        versionHash: "a".repeat(64),
        compiledAt: "2026-08-13T12:00:00.000Z",
      });
      expect(snapshot.brandKnowledge?.claims.map((claim) => claim.id)).toEqual(["global", "portrait"]);
    });

    it("records an explicit legacy fallback when no published version exists", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([]);
      mocks.getBrandKitMock.mockResolvedValue(null);

      const snapshot = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: [],
        format: "1:1",
        includePublishedBrandKnowledge: true,
      });

      expect(snapshot.brandKnowledge).toEqual({
        mode: "legacy_fallback",
        versionId: null,
        versionNumber: null,
        versionHash: null,
        compiledAt: null,
        claims: [],
      });
    });

    it("uses the validated v2 identity as the frozen base for new works (plan 01, T4)", async () => {
      // Live tables moved on after validation: a new approval and a new kit.
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({ id: "live-new", trainingCategory: "visual_reference", usageMode: "reference" }),
      ]);
      mocks.getRejectedTrainingReferencesMock.mockResolvedValue([
        { id: "live-rejected", label: "Live", trainingAnalysis: null, rejectionReason: { code: "other" } },
      ]);
      mocks.getBrandKitMock.mockResolvedValue({
        brandColors: ["#LIVE00"],
        brandFonts: ["Live Sans"],
        toneOfVoice: "Tom ao vivo",
        prohibitedElements: "live-no",
        requiredElements: "live-yes",
      });
      mocks.getActiveBrandKnowledgeVersionMock.mockResolvedValue({
        id: "version-2",
        versionNumber: 2,
        hash: "c".repeat(64),
        snapshot: {
          schemaVersion: 2,
          profileId: "profile-1",
          compiledAt: "2026-09-13T12:00:00.000Z",
          claims: [],
          excluded: [],
          identity: {
            clientProfileId: "profile-1",
            confirmedAt: "2026-09-13T12:00:00.000Z",
            assets: [
              {
                referenceId: "frozen-logo",
                assetKey: "workspaces/ws-1/assets/frozen-logo.png",
                label: "Frozen logo",
                category: "logo",
                usageMode: "reference",
                analysis: { description: "frozen", visualAttributes: [], rules: [], constraints: [], confidence: 1 },
                mimeType: "image/png",
                hasAlpha: false,
                placement: null,
              },
            ],
            negativePatterns: [{ referenceId: "rej-1", label: "Old", description: "frozen rejection" }],
            brandKit: {
              colors: ["#FROZEN"],
              fonts: ["Frozen Sans"],
              toneOfVoice: "Frozen voice",
              prohibitedElements: "frozen-no",
              requiredElements: "frozen-yes",
            },
          },
          evidenceHashes: {},
          calibration: { sessionId: "session-1", round: 1, candidateHash: "c".repeat(64) },
        },
      });
      mocks.selectResults.push([
        { key: "workspaces/ws-1/assets/frozen-logo.png", type: "image/png", metadata: { hasAlpha: false } },
      ]);

      const snapshot = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: [],
        brief: socialBrief,
        format: "4:5",
      });

      expect(snapshot.assets.map((asset) => asset.referenceId)).toEqual(["frozen-logo"]);
      expect(snapshot.brandKit).toMatchObject({
        colors: ["#FROZEN"],
        fonts: ["Frozen Sans"],
        toneOfVoice: "Frozen voice",
        prohibitedElements: "frozen-no",
        requiredElements: "frozen-yes",
      });
      expect(snapshot.negativePatterns).toEqual([
        { referenceId: "rej-1", label: "Old", description: "frozen rejection" },
      ]);
    });

    it("fails v2 selection when a frozen asset is no longer reachable", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([]);
      mocks.getBrandKitMock.mockResolvedValue(null);
      mocks.getActiveBrandKnowledgeVersionMock.mockResolvedValue({
        id: "version-2",
        versionNumber: 2,
        hash: "c".repeat(64),
        snapshot: {
          schemaVersion: 2,
          profileId: "profile-1",
          compiledAt: "2026-09-13T12:00:00.000Z",
          claims: [],
          excluded: [],
          identity: {
            clientProfileId: "profile-1",
            confirmedAt: "2026-09-13T12:00:00.000Z",
            assets: [
              {
                referenceId: "frozen-logo",
                assetKey: "workspaces/ws-1/assets/revoked.png",
                label: "Revoked",
                category: "logo",
                usageMode: "reference",
                analysis: { description: "", visualAttributes: [], rules: [], constraints: [], confidence: 1 },
                mimeType: "image/png",
                hasAlpha: false,
                placement: null,
              },
            ],
            brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null },
          },
          evidenceHashes: {},
          calibration: { sessionId: "session-1", round: 1, candidateHash: "c".repeat(64) },
        },
      });
      mocks.selectResults.push([]);

      await expect(
        createIdentitySnapshot({
          workspaceId: "ws-1",
          clientProfileId: "profile-1",
          selectedReferenceIds: [],
          brief: socialBrief,
          format: "4:5",
        }),
      ).rejects.toBeInstanceOf(IdentitySnapshotMissingReferenceError);
    });

    it("keeps the live fallback for v1 active versions", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({ id: "live-logo", trainingCategory: "logo", usageMode: "reference" }),
      ]);
      mocks.getRejectedTrainingReferencesMock.mockResolvedValue([]);
      mocks.getBrandKitMock.mockResolvedValue({ brandColors: ["#LIVE00"], brandFonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null });
      mocks.getActiveBrandKnowledgeVersionMock.mockResolvedValue({
        id: "version-1",
        versionNumber: 1,
        hash: "a".repeat(64),
        snapshot: { schemaVersion: 1, profileId: "profile-1", compiledAt: "2026-08-13T12:00:00.000Z", claims: [], excluded: [] },
      });
      mocks.selectResults.push([
        { key: "workspaces/ws-1/assets/live-logo.png", type: "image/png", metadata: { hasAlpha: false } },
      ]);

      const snapshot = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: [],
        brief: socialBrief,
        format: "4:5",
      });

      expect(snapshot.assets.map((asset) => asset.referenceId)).toEqual(["live-logo"]);
      expect(snapshot.brandKit.colors).toEqual(["#LIVE00"]);
    });

    it("persists a manual override as selection provenance", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({
          id: "device",
          trainingCategory: "visual_reference",
          usageMode: "reference",
          analysis: analyzedLayout({ mediaType: "device" }),
        }),
        approvedReference({
          id: "photo",
          trainingCategory: "visual_reference",
          usageMode: "reference",
          analysis: analyzedLayout({ mediaType: "photo" }),
        }),
        approvedReference({ id: "logo", trainingCategory: "logo", usageMode: "exact" }),
        approvedReference({ id: "rule", trainingCategory: "graphic", usageMode: "rule" }),
      ]);
      mocks.selectResults.push([
        { key: "workspaces/ws-1/assets/logo.png", type: "image/png", metadata: { hasAlpha: true } },
        { key: "workspaces/ws-1/assets/photo.png", type: "image/png", metadata: { hasAlpha: false } },
        { key: "workspaces/ws-1/assets/rule.png", type: "image/png", metadata: { hasAlpha: false } },
      ]);
      mocks.getBrandKitMock.mockResolvedValue(null);

      const snapshot = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: ["photo"],
        brief: { ...socialBrief, objective: "Demonstração da plataforma na tela" },
        format: "1:1",
      });

      expect(snapshot.assets.map((asset) => asset.referenceId)).toEqual([
        "logo",
        "photo",
        "rule",
      ]);
      expect(snapshot.referenceSelection).toMatchObject({
        strategy: "manual",
        format: "1:1",
        operatorSelectedReferenceIds: ["photo"],
      });
    });

    it("uses the brief media request in the ranked fallback", async () => {
      const references = [
        approvedReference({
          id: "device",
          trainingCategory: "visual_reference",
          usageMode: "reference",
          analysis: analyzedLayout({ mediaType: "device" }),
        }),
        approvedReference({
          id: "photo",
          trainingCategory: "visual_reference",
          usageMode: "reference",
          analysis: analyzedLayout({ mediaType: "photo" }),
        }),
      ];
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue(references);
      mocks.selectResults.push(
        [
          { key: "workspaces/ws-1/assets/device.png", type: "image/png", metadata: { hasAlpha: false } },
          { key: "workspaces/ws-1/assets/photo.png", type: "image/png", metadata: { hasAlpha: false } },
        ],
        [
          { key: "workspaces/ws-1/assets/device.png", type: "image/png", metadata: { hasAlpha: false } },
          { key: "workspaces/ws-1/assets/photo.png", type: "image/png", metadata: { hasAlpha: false } },
        ],
      );
      mocks.getBrandKitMock.mockResolvedValue(null);

      const device = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: [],
        brief: { ...socialBrief, objective: "Demonstração da plataforma na tela" },
        format: "1:1",
      });
      const photo = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: [],
        brief: { ...socialBrief, objective: "Retrato com foto da equipe" },
        format: "1:1",
      });

      expect(device.assets[0]?.referenceId).toBe("device");
      expect(photo.assets[0]?.referenceId).toBe("photo");
    });

    it("keeps rejected creatives as text-only negative patterns", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([]);
      mocks.getRejectedTrainingReferencesMock.mockResolvedValue([
        {
          ...approvedReference({
            id: "rejected",
            trainingCategory: "visual_reference",
            usageMode: "reference",
            analysis: {
              description: "Layout crowded with duplicated badges",
              visualAttributes: ["dense badge wall"],
              rules: [],
              constraints: ["illegible footer"],
              confidence: 0.9,
            },
          }),
          reviewStatus: "rejected",
          rejectionReason: { code: "brand_drift", note: "Fora da identidade" },
        },
      ]);
      mocks.getBrandKitMock.mockResolvedValue(null);

      const snapshot = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: [],
        brief: socialBrief,
        format: "1:1",
      });

      expect(snapshot.assets).toEqual([]);
      expect(snapshot.negativePatterns).toEqual([
        {
          referenceId: "rejected",
          label: "Asset",
          description: "Layout crowded with duplicated badges dense badge wall illegible footer rejection_reason=brand_drift: Fora da identidade",
        },
      ]);
    });

    it("does not turn archived creatives into negative evidence", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([]);
      mocks.getRejectedTrainingReferencesMock.mockResolvedValue([]);

      const snapshot = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: [],
        brief: socialBrief,
        format: "1:1",
      });

      expect(snapshot.negativePatterns).toEqual([]);
    });

    it("keeps approved rule-mode assets as textual guidance in the ranked fallback", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([
        approvedReference({ id: "rule", trainingCategory: "graphic", usageMode: "rule" }),
        approvedReference({ id: "visual", trainingCategory: "visual_reference", usageMode: "reference" }),
      ]);
      mocks.selectResults.push([
        { key: "workspaces/ws-1/assets/rule.png", type: "image/png", metadata: { hasAlpha: false } },
        { key: "workspaces/ws-1/assets/visual.png", type: "image/png", metadata: { hasAlpha: false } },
      ]);
      mocks.getBrandKitMock.mockResolvedValue(null);

      const snapshot = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: [],
        brief: socialBrief,
        format: "1:1",
      });

      expect(snapshot.assets.map((asset) => [asset.referenceId, asset.usageMode])).toEqual([
        ["visual", "reference"],
        ["rule", "rule"],
      ]);
    });

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
        fontAssets: [],
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
        fontAssets: [],
        toneOfVoice: "Warm",
        prohibitedElements: null,
        requiredElements: null,
      });
    });

    it("freezes only approved font files in the identity snapshot", async () => {
      mocks.getApprovedTrainingReferencesMock.mockResolvedValue([]);
      mocks.getBrandKitMock.mockResolvedValue({
        id: "profile-1",
        workspaceId: "ws-1",
        name: "Acme",
        brandColors: [],
        brandFonts: ["Acme Sans", "Fallback Sans"],
        brandFontAssets: [
          {
            assetKey: "workspaces/ws-1/brand-fonts/acme.ttf",
            family: "Acme Sans",
            source: "Contrato da agência",
            weight: 700,
            style: "normal",
            sha256: "abc123",
            approvedAt: "2026-08-12T12:00:00.000Z",
            approvedByUserId: "user-1",
          },
          {
            assetKey: "workspaces/ws-1/brand-fonts/pending.ttf",
            family: "Pending Sans",
            source: "Upload",
            weight: 400,
            style: "normal",
            sha256: "pending123",
            reviewStatus: "pending_approval",
            uploadedAt: "2026-08-12T13:00:00.000Z",
            uploadedByUserId: "user-1",
            approvedAt: null,
            approvedByUserId: null,
          },
          {
            assetKey: "workspaces/ws-1/brand-fonts/approved.otf",
            family: "Approved Serif",
            source: "Brand book",
            weight: 500,
            style: "italic",
            sha256: "approved123",
            reviewStatus: "approved",
            uploadedAt: "2026-08-12T13:00:00.000Z",
            uploadedByUserId: "user-1",
            approvedAt: "2026-08-12T14:00:00.000Z",
            approvedByUserId: "reviewer-1",
          },
          {
            assetKey: "workspaces/ws-1/brand-fonts/archived.ttf",
            family: "Archived Sans",
            source: "Upload",
            weight: 400,
            style: "normal",
            sha256: "archived123",
            reviewStatus: "archived",
            uploadedAt: "2026-08-12T13:00:00.000Z",
            uploadedByUserId: "user-1",
            approvedAt: null,
            approvedByUserId: null,
            archivedAt: "2026-08-12T14:00:00.000Z",
            archivedByUserId: "reviewer-1",
          },
        ],
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
        selectedReferenceIds: [],
      });

      expect(snapshot.brandKit.fontAssets).toEqual([
        {
          assetKey: "workspaces/ws-1/brand-fonts/acme.ttf",
          family: "Acme Sans",
          source: "Contrato da agência",
          weight: 700,
          style: "normal",
          sha256: "abc123",
          approvedAt: "2026-08-12T12:00:00.000Z",
          approvedByUserId: "user-1",
        },
        expect.objectContaining({
          assetKey: "workspaces/ws-1/brand-fonts/approved.otf",
          reviewStatus: "approved",
        }),
      ]);
    });

    it("creates a carousel snapshot with published Brand Cortex enabled and no SocialPostBrief", async () => {
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
        brandColors: ["#112233"],
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
      mocks.getActiveBrandKnowledgeVersionMock.mockResolvedValue({
        id: "version-1",
        versionNumber: 2,
        hash: "b".repeat(64),
        snapshot: {
          compiledAt: "2026-08-20T12:00:00.000Z",
          claims: [
            { id: "global", claimKey: "palette.colors", value: ["#112233"], scope: { level: "global" }, evidenceRefs: [] },
            { id: "story", claimKey: "layout.density", value: "dense", scope: { level: "global", format: "9:16" }, evidenceRefs: [] },
          ],
        },
      });

      const snapshot = await createIdentitySnapshot({
        workspaceId: "ws-1",
        clientProfileId: "profile-1",
        selectedReferenceIds: [],
        brief: null,
        format: "4:5",
        includePublishedBrandKnowledge: true,
      });

      expect(snapshot.brandKnowledge).toMatchObject({
        mode: "published",
        versionId: "version-1",
        versionNumber: 2,
      });
      // Exact brand assets are carried for the carousel compositing contract
      // even without an operator selection and without a SocialPostBrief.
      expect(snapshot.assets.map((asset) => asset.referenceId)).toEqual(["logo"]);
      expect(snapshot.brandKnowledge?.claims.map((claim) => claim.id)).toEqual(["global"]);
    });
  });
});
