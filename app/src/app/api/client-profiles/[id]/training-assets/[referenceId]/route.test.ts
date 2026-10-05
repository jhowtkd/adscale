import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import { admitRaster, RasterImageRejected, RasterRetryError } from "@/server/equipe/handoff/raster-image";

import { PATCH } from "./route";

const PROFILE_ID = "profile-1";
const REFERENCE_ID = "ref-1";
const WORKSPACE_ID = "workspace-1";
const ASSET_KEY = "workspaces/workspace-1/brand-training/abc-logo.png";

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: WORKSPACE_ID },
    }),
  ),
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
  getClientProfile: vi.fn(),
  getTrainingReferences: vi.fn(),
  getWorkspaceAssetByKey: vi.fn(),
  reviewTrainingReference: vi.fn(),
  createBrandKnowledgeCandidates: vi.fn(),
  updateWorkspaceAsset: vi.fn(),
  objectGet: vi.fn(),
  retryTrainingAnalysis: vi.fn(),
  markTrainingAnalysisFailed: vi.fn(),
  inngestSend: vi.fn(),
  loggerError: vi.fn(),
  processRaster: vi.fn(),
}));

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logger")>();
  return { ...actual, logger: { ...actual.logger, info: vi.fn(), warn: vi.fn(), error: (...args: unknown[]) => mocks.loggerError(...args) } };
});

// The real raster child runs; the spy only proves the call (namespace, operation) and lets a test inject a failure.
vi.mock("@/server/equipe/handoff/raster-image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/equipe/handoff/raster-image")>();
  mocks.processRaster.mockImplementation(actual.processRaster);
  return { ...actual, processRaster: (...args: Parameters<typeof actual.processRaster>) => mocks.processRaster(...args) };
});

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: mocks.getTranslations,
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: (...args: unknown[]) => mocks.getClientProfile(...args),
  getTrainingReferences: (...args: unknown[]) => mocks.getTrainingReferences(...args),
  reviewTrainingReference: (...args: unknown[]) => mocks.reviewTrainingReference(...args),
  retryTrainingAnalysis: (...args: unknown[]) => mocks.retryTrainingAnalysis(...args),
  markTrainingAnalysisFailed: (...args: unknown[]) => mocks.markTrainingAnalysisFailed(...args),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => mocks.inngestSend(...args) },
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetByKey: (...args: unknown[]) => mocks.getWorkspaceAssetByKey(...args),
  updateWorkspaceAsset: (...args: unknown[]) => mocks.updateWorkspaceAsset(...args),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: { get: (...args: unknown[]) => mocks.objectGet(...args) },
}));

vi.mock("@/server/repositories/brand-knowledge", () => ({
  createBrandKnowledgeCandidates: (...args: unknown[]) => mocks.createBrandKnowledgeCandidates(...args),
}));

const getClientProfile = mocks.getClientProfile;
const getTrainingReferences = mocks.getTrainingReferences;
const getWorkspaceAssetByKey = mocks.getWorkspaceAssetByKey;
const reviewTrainingReference = mocks.reviewTrainingReference;

const validAnalysis = {
  description: "Ondas verdes usadas como moldura.",
  visualAttributes: ["green waves"],
  rules: ["Preserve aspect ratio"],
  constraints: ["Do not recolor"],
  confidence: 0.85,
};

function patchRequest(body: unknown): Request {
  return new Request(
    `http://localhost/api/client-profiles/${PROFILE_ID}/training-assets/${REFERENCE_ID}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("PATCH /api/client-profiles/[id]/training-assets/[referenceId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientProfile.mockResolvedValue({
      id: PROFILE_ID,
      workspaceId: WORKSPACE_ID,
      name: "Acme",
    });
    getTrainingReferences.mockResolvedValue([
      {
        id: REFERENCE_ID,
        workspaceId: WORKSPACE_ID,
        clientProfileId: PROFILE_ID,
        assetKey: ASSET_KEY,
        label: "Logo",
        reviewStatus: "pending_approval",
      },
    ]);
    reviewTrainingReference.mockResolvedValue({
      id: REFERENCE_ID,
      workspaceId: WORKSPACE_ID,
      clientProfileId: PROFILE_ID,
      assetKey: ASSET_KEY,
      reviewStatus: "approved",
      trainingCategory: "graphic",
      usageMode: "reference",
      trainingAnalysis: validAnalysis,
      reviewedByUserId: "user-1",
    });
    getWorkspaceAssetByKey.mockResolvedValue({
      key: ASSET_KEY,
      metadata: { hasAlpha: true, sha256: "a".repeat(64) },
    });
    mocks.createBrandKnowledgeCandidates.mockResolvedValue([]);
    mocks.updateWorkspaceAsset.mockResolvedValue({ id: "asset-1" });
    mocks.objectGet.mockResolvedValue(Buffer.from("legacy-asset"));
    mocks.inngestSend.mockResolvedValue(undefined);
    mocks.markTrainingAnalysisFailed.mockResolvedValue(null);
  });

  it("returns 400 for an invalid payload", async () => {
    const res = await PATCH(patchRequest({ bogus: true }), {
      params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }),
    });
    expect(res.status).toBe(400);
    expect(reviewTrainingReference).not.toHaveBeenCalled();
  });

  it("returns 404 when the profile is not in the workspace", async () => {
    getClientProfile.mockResolvedValue(null);

    const res = await PATCH(
      patchRequest({
        trainingCategory: "graphic",
        usageMode: "reference",
        analysis: validAnalysis,
        reviewStatus: "approved",
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(404);
    expect(getClientProfile).toHaveBeenCalledWith(WORKSPACE_ID, PROFILE_ID);
    expect(reviewTrainingReference).not.toHaveBeenCalled();
  });

  it("returns 400 when approving with analysis: null", async () => {
    const res = await PATCH(
      patchRequest({
        trainingCategory: "graphic",
        usageMode: "reference",
        analysis: null,
        reviewStatus: "approved",
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(400);
    expect(reviewTrainingReference).not.toHaveBeenCalled();
  });

  it("approves a reference and forwards the reviewer identity", async () => {
    const res = await PATCH(
      patchRequest({
        trainingCategory: "graphic",
        usageMode: "reference",
        analysis: validAnalysis,
        reviewStatus: "approved",
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(200);
    expect(getClientProfile).toHaveBeenCalledWith(WORKSPACE_ID, PROFILE_ID);
    expect(reviewTrainingReference).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE_ID, clientProfileId: PROFILE_ID, referenceId: REFERENCE_ID },
      expect.objectContaining({ reviewStatus: "approved", reviewedByUserId: "user-1" }),
    );
    const body = await res.json();
    expect(body.reference).toEqual(
      expect.objectContaining({ id: REFERENCE_ID, reviewStatus: "approved" }),
    );
    expect(mocks.createBrandKnowledgeCandidates).toHaveBeenCalledWith(
      WORKSPACE_ID,
      PROFILE_ID,
      expect.arrayContaining([
        expect.objectContaining({
          claimKey: "visual.required_elements",
          status: "candidate",
          evidenceRefs: [expect.objectContaining({ id: REFERENCE_ID, type: "training_asset" })],
        }),
      ]),
    );
  });

  it("confirms a legacy approved reference and records the reviewer identity", async () => {
    getTrainingReferences.mockResolvedValue([{
      id: REFERENCE_ID,
      workspaceId: WORKSPACE_ID,
      clientProfileId: PROFILE_ID,
      assetKey: ASSET_KEY,
      reviewStatus: "approved",
      reviewedAt: null,
      reviewedByUserId: null,
      trainingAnalysis: null,
    }]);

    const res = await PATCH(
      patchRequest({
        trainingCategory: "visual_reference",
        usageMode: "reference",
        analysis: null,
        reviewStatus: "approved",
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(200);
    expect(reviewTrainingReference).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        analysis: null,
        reviewStatus: "approved",
        reviewedByUserId: "user-1",
      }),
    );
  });

  it("does not reactivate an archived reference", async () => {
    getTrainingReferences.mockResolvedValue([
      {
        id: REFERENCE_ID,
        workspaceId: WORKSPACE_ID,
        clientProfileId: PROFILE_ID,
        assetKey: ASSET_KEY,
        reviewStatus: "archived",
      },
    ]);

    const res = await PATCH(
      patchRequest({
        trainingCategory: "graphic",
        usageMode: "reference",
        analysis: validAnalysis,
        reviewStatus: "approved",
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(404);
    expect(reviewTrainingReference).not.toHaveBeenCalled();
  });

  it("returns 404 when the scoped update returns null", async () => {
    reviewTrainingReference.mockResolvedValue(null);

    const res = await PATCH(
      patchRequest({
        trainingCategory: "graphic",
        usageMode: "reference",
        analysis: validAnalysis,
        reviewStatus: "approved",
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(404);
  });

  it("rejects usageMode: exact when the bound asset has no alpha channel", async () => {
    getWorkspaceAssetByKey.mockResolvedValue({
      id: "asset-1",
      workspaceId: WORKSPACE_ID,
      key: ASSET_KEY,
      metadata: { hasAlpha: false },
    });

    const res = await PATCH(
      patchRequest({
        trainingCategory: "logo",
        usageMode: "exact",
        analysis: validAnalysis,
        reviewStatus: "approved",
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(400);
    expect(getWorkspaceAssetByKey).toHaveBeenCalledWith(WORKSPACE_ID, ASSET_KEY);
    expect(reviewTrainingReference).not.toHaveBeenCalled();
  });

  it("accepts usageMode: exact when the bound asset has alpha channel", async () => {
    getWorkspaceAssetByKey.mockResolvedValue({
      id: "asset-1",
      workspaceId: WORKSPACE_ID,
      key: ASSET_KEY,
      metadata: { hasAlpha: true },
    });
    reviewTrainingReference.mockResolvedValue({
      id: REFERENCE_ID,
      workspaceId: WORKSPACE_ID,
      clientProfileId: PROFILE_ID,
      assetKey: ASSET_KEY,
      reviewStatus: "approved",
      trainingCategory: "logo",
      usageMode: "exact",
      trainingAnalysis: validAnalysis,
      reviewedByUserId: "user-1",
    });

    const res = await PATCH(
      patchRequest({
        trainingCategory: "logo",
        usageMode: "exact",
        analysis: validAnalysis,
        reviewStatus: "approved",
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(200);
    expect(getWorkspaceAssetByKey).toHaveBeenCalledWith(WORKSPACE_ID, ASSET_KEY);
    expect(reviewTrainingReference).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE_ID, clientProfileId: PROFILE_ID, referenceId: REFERENCE_ID },
      expect.objectContaining({ usageMode: "exact", reviewStatus: "approved" }),
    );
    expect(mocks.updateWorkspaceAsset).toHaveBeenCalledWith(
      "asset-1",
      WORKSPACE_ID,
      expect.objectContaining({ metadata: expect.objectContaining({ sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }) }),
    );
  });

  it("archives a reference (does not require exact-mode alpha check)", async () => {
    const res = await PATCH(
      patchRequest({
        trainingCategory: "graphic",
        usageMode: "reference",
        analysis: validAnalysis,
        reviewStatus: "archived",
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(200);
    expect(getWorkspaceAssetByKey).not.toHaveBeenCalled();
    expect(reviewTrainingReference).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reviewStatus: "archived" }),
    );
  });

  it("requires a structured reason when rejecting a reference", async () => {
    const res = await PATCH(
      patchRequest({
        trainingCategory: "graphic",
        usageMode: "reference",
        analysis: validAnalysis,
        reviewStatus: "rejected",
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(400);
    expect(reviewTrainingReference).not.toHaveBeenCalled();
  });

  it("rejects a reference with a structured reason and no positive side effects", async () => {
    reviewTrainingReference.mockResolvedValue({
      id: REFERENCE_ID,
      reviewStatus: "rejected",
      rejectionReason: { code: "brand_drift", note: "Fora da identidade" },
      trainingAnalysis: validAnalysis,
    });

    const res = await PATCH(
      patchRequest({
        trainingCategory: "visual_reference",
        usageMode: "reference",
        analysis: validAnalysis,
        reviewStatus: "rejected",
        rejectionReason: { code: "brand_drift", note: "Fora da identidade" },
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(200);
    expect(reviewTrainingReference).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reviewStatus: "rejected",
        rejectionReason: { code: "brand_drift", note: "Fora da identidade" },
      }),
    );
    expect(mocks.createBrandKnowledgeCandidates).not.toHaveBeenCalled();
  });

  it("allows an archived reference to be explicitly reclassified as rejected", async () => {
    getTrainingReferences.mockResolvedValue([
      {
        id: REFERENCE_ID,
        workspaceId: WORKSPACE_ID,
        clientProfileId: PROFILE_ID,
        assetKey: ASSET_KEY,
        reviewStatus: "archived",
        trainingAnalysis: validAnalysis,
      },
    ]);

    const res = await PATCH(
      patchRequest({
        trainingCategory: "visual_reference",
        usageMode: "reference",
        analysis: null,
        reviewStatus: "rejected",
        rejectionReason: { code: "weak_hierarchy" },
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(200);
    expect(reviewTrainingReference).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reviewStatus: "rejected",
        analysis: validAnalysis,
        rejectionReason: { code: "weak_hierarchy" },
      }),
    );
  });

  it("archives with analysis: null (legacy upload without AI analysis)", async () => {
    reviewTrainingReference.mockResolvedValue({
      id: REFERENCE_ID,
      workspaceId: WORKSPACE_ID,
      clientProfileId: PROFILE_ID,
      assetKey: ASSET_KEY,
      reviewStatus: "archived",
      trainingCategory: "visual_reference",
      usageMode: "reference",
      trainingAnalysis: null,
      reviewedByUserId: "user-1",
    });

    const res = await PATCH(
      patchRequest({
        trainingCategory: "visual_reference",
        usageMode: "reference",
        analysis: null,
        reviewStatus: "archived",
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(200);
    expect(reviewTrainingReference).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reviewStatus: "archived", analysis: null }),
    );
  });

  it("does not run alpha check when archiving exact-mode assets", async () => {
    getWorkspaceAssetByKey.mockResolvedValue({
      id: "asset-1",
      workspaceId: WORKSPACE_ID,
      key: ASSET_KEY,
      metadata: { hasAlpha: false },
    });
    reviewTrainingReference.mockResolvedValue({
      id: REFERENCE_ID,
      reviewStatus: "archived",
      usageMode: "exact",
    });

    const res = await PATCH(
      patchRequest({
        trainingCategory: "logo",
        usageMode: "exact",
        analysis: null,
        reviewStatus: "archived",
      }),
      { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) },
    );

    expect(res.status).toBe(200);
    expect(getWorkspaceAssetByKey).not.toHaveBeenCalled();
  });

  describe("analysis_failed recovery", () => {
    const params = { params: Promise.resolve({ id: PROFILE_ID, referenceId: REFERENCE_ID }) };
    const scope = { workspaceId: WORKSPACE_ID, clientProfileId: PROFILE_ID, referenceId: REFERENCE_ID };
    const failedRow = {
      id: REFERENCE_ID,
      workspaceId: WORKSPACE_ID,
      clientProfileId: PROFILE_ID,
      assetKey: ASSET_KEY,
      label: "Logo",
      reviewStatus: "analysis_failed",
    };

    beforeEach(() => {
      getTrainingReferences.mockResolvedValue([failedRow]);
      getWorkspaceAssetByKey.mockResolvedValue({
        key: ASSET_KEY,
        type: "image/png",
        metadata: { hasAlpha: true },
      });
      mocks.retryTrainingAnalysis.mockResolvedValue({ ...failedRow, reviewStatus: "pending_analysis" });
    });

    it("retries an analysis_failed reference: pending_analysis and exactly one analyze event", async () => {
      const res = await PATCH(patchRequest({ action: "retry_analysis" }), params);

      expect(res.status).toBe(200);
      expect((await res.json()).reference).toEqual(
        expect.objectContaining({ id: REFERENCE_ID, reviewStatus: "pending_analysis" }),
      );
      expect(mocks.retryTrainingAnalysis).toHaveBeenCalledTimes(1);
      expect(mocks.retryTrainingAnalysis).toHaveBeenCalledWith(scope);
      expect(mocks.inngestSend).toHaveBeenCalledTimes(1);
      expect(mocks.inngestSend).toHaveBeenCalledWith({
        name: heavyImageEventName("brand.training.analyze"),
        data: {
          workspaceId: WORKSPACE_ID,
          clientProfileId: PROFILE_ID,
          referenceId: REFERENCE_ID,
          assetKey: ASSET_KEY,
          mimeType: "image/png",
          hasAlpha: true,
        },
      });
      expect(reviewTrainingReference).not.toHaveBeenCalled();
    });

    it.each(["pending_analysis", "pending_approval", "approved", "archived", "rejected"])(
      "retry on %s answers 404 and neither transitions nor dispatches",
      async (reviewStatus) => {
        getTrainingReferences.mockResolvedValue([{ ...failedRow, reviewStatus }]);

        const res = await PATCH(patchRequest({ action: "retry_analysis" }), params);

        expect(res.status).toBe(404);
        expect(mocks.retryTrainingAnalysis).not.toHaveBeenCalled();
        expect(mocks.inngestSend).not.toHaveBeenCalled();
      },
    );

    it("retry answers 404 and does not dispatch when the CAS loses a race (null)", async () => {
      mocks.retryTrainingAnalysis.mockResolvedValue(null);

      const res = await PATCH(patchRequest({ action: "retry_analysis" }), params);

      expect(res.status).toBe(404);
      expect(mocks.inngestSend).not.toHaveBeenCalled();
    });

    it("retry rejects extra fields in the action payload (strict) without dispatching", async () => {
      const res = await PATCH(patchRequest({ action: "retry_analysis", reviewStatus: "approved" }), params);

      expect(res.status).toBe(400);
      expect(mocks.retryTrainingAnalysis).not.toHaveBeenCalled();
      expect(mocks.inngestSend).not.toHaveBeenCalled();
      expect(reviewTrainingReference).not.toHaveBeenCalled();
    });

    it("when the dispatch fails, puts the reference back to analysis_failed and surfaces the error", async () => {
      mocks.inngestSend.mockRejectedValue(new Error("inngest down"));

      const res = await PATCH(patchRequest({ action: "retry_analysis" }), params);

      expect(res.status).toBe(500);
      expect(res.headers.get("Retry-After")).toBeNull();
      expect(mocks.inngestSend).toHaveBeenCalledTimes(1);
      expect(mocks.markTrainingAnalysisFailed).toHaveBeenCalledTimes(1);
      expect(mocks.markTrainingAnalysisFailed).toHaveBeenCalledWith(scope);
    });

    it.each([true, false])("metadata.hasAlpha=%s is trusted: no decode, and the event carries it", async (hasAlpha) => {
      getWorkspaceAssetByKey.mockResolvedValue({ key: ASSET_KEY, type: "image/png", metadata: { hasAlpha } });

      const res = await PATCH(patchRequest({ action: "retry_analysis" }), params);

      expect(res.status).toBe(200);
      expect(mocks.processRaster).not.toHaveBeenCalled();
      expect(mocks.objectGet).not.toHaveBeenCalled();
      expect(mocks.inngestSend).toHaveBeenCalledTimes(1);
      expect(mocks.inngestSend.mock.calls[0]![0].data.hasAlpha).toBe(hasAlpha);
    });

    it.each([
      ["metadata without hasAlpha", { sha256: "a".repeat(64) }],
      ["null metadata", null],
      ["non-boolean hasAlpha", { hasAlpha: "true" }],
    ])("%s + a really transparent PNG: measures in the raster child under the workspace namespace and sends true", async (_name, metadata) => {
      const transparent = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 10, g: 120, b: 60, alpha: 0 } } }).png().toBuffer();
      getWorkspaceAssetByKey.mockResolvedValue({ key: ASSET_KEY, type: "image/png", metadata });
      mocks.objectGet.mockResolvedValue(transparent);

      const res = await PATCH(patchRequest({ action: "retry_analysis" }), params);

      expect(res.status).toBe(200);
      expect(mocks.objectGet).toHaveBeenCalledWith(ASSET_KEY);
      expect(mocks.processRaster).toHaveBeenCalledTimes(1);
      const [bytes, operation, options] = mocks.processRaster.mock.calls[0]!;
      expect(Buffer.from(bytes).equals(transparent)).toBe(true);
      expect(operation).toBe("transparency");
      expect(options.accountKey).toBe(`classic:${WORKSPACE_ID}`);
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(mocks.inngestSend).toHaveBeenCalledTimes(1);
      expect(mocks.inngestSend.mock.calls[0]![0].data.hasAlpha).toBe(true);
      // The measurement happens before the CAS.
      expect(mocks.processRaster.mock.invocationCallOrder[0]!).toBeLessThan(mocks.retryTrainingAnalysis.mock.invocationCallOrder[0]!);
    });

    it.each([3, 4] as const)("metadata without hasAlpha + an opaque %s-channel PNG sends false", async (channels) => {
      const opaque = await sharp({ create: { width: 8, height: 8, channels, background: { r: 10, g: 120, b: 60, alpha: 1 } } }).png().toBuffer();
      expect((await sharp(opaque).metadata()).hasAlpha).toBe(channels === 4);
      getWorkspaceAssetByKey.mockResolvedValue({ key: ASSET_KEY, type: "image/png", metadata: {} });
      mocks.objectGet.mockResolvedValue(opaque);

      const res = await PATCH(patchRequest({ action: "retry_analysis" }), params);

      expect(res.status).toBe(200);
      expect(res.headers.get("Retry-After")).toBeNull();
      expect(mocks.processRaster).toHaveBeenCalledTimes(1);
      expect(mocks.inngestSend).toHaveBeenCalledTimes(1);
      expect(mocks.inngestSend.mock.calls[0]![0].data.hasAlpha).toBe(false);
    });

    it("a truncated PNG with a readable header fails in the raster child: no CAS, no dispatch", async () => {
      const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 10, g: 120, b: 60, alpha: 0 } } }).png().toBuffer();
      const truncated = png.subarray(0, 50);
      expect(admitRaster(truncated)).toMatchObject({ width: 8, height: 8 });
      getWorkspaceAssetByKey.mockResolvedValue({ key: ASSET_KEY, type: "image/png", metadata: {} });
      mocks.objectGet.mockResolvedValue(truncated);

      const res = await PATCH(patchRequest({ action: "retry_analysis" }), params);

      expect(res.status).toBe(400);
      expect(res.headers.get("Retry-After")).toBeNull();
      expect((await res.json()).code).toBe("invalidFileType");
      expect(mocks.processRaster).toHaveBeenCalledTimes(1);
      expect(mocks.retryTrainingAnalysis).not.toHaveBeenCalled();
      expect(mocks.inngestSend).not.toHaveBeenCalled();
      expect(mocks.loggerError).not.toHaveBeenCalled();
    });

    it("a storage read failure keeps the CAS and the dispatch untouched", async () => {
      getWorkspaceAssetByKey.mockResolvedValue({ key: ASSET_KEY, type: "image/png", metadata: {} });
      mocks.objectGet.mockRejectedValue(new Error("r2 down"));

      const res = await PATCH(patchRequest({ action: "retry_analysis" }), params);

      expect(res.status).toBe(500);
      expect(res.headers.get("Retry-After")).toBeNull();
      expect(mocks.processRaster).not.toHaveBeenCalled();
      expect(mocks.retryTrainingAnalysis).not.toHaveBeenCalled();
      expect(mocks.inngestSend).not.toHaveBeenCalled();
    });

    it.each(["wait_timeout", "unavailable"] as const)("a raster %s keeps the upload's 500 policy without retry advice or state changes", async (reason) => {
      getWorkspaceAssetByKey.mockResolvedValue({ key: ASSET_KEY, type: "image/png", metadata: {} });
      mocks.processRaster.mockRejectedValueOnce(new RasterRetryError(reason));

      const res = await PATCH(patchRequest({ action: "retry_analysis" }), params);

      expect(res.status).toBe(500);
      expect(res.headers.get("Retry-After")).toBeNull();
      expect((await res.json()).code).toBe("internalError");
      expect(mocks.processRaster).toHaveBeenCalledTimes(1);
      expect(mocks.retryTrainingAnalysis).not.toHaveBeenCalled();
      expect(mocks.inngestSend).not.toHaveBeenCalled();
    });

    it("raster capacity answers 503 with Retry-After 1, just like upload, without a transition or dispatch", async () => {
      getWorkspaceAssetByKey.mockResolvedValue({ key: ASSET_KEY, type: "image/png", metadata: {} });
      mocks.processRaster.mockRejectedValueOnce(new RasterRetryError("capacity"));

      const res = await PATCH(patchRequest({ action: "retry_analysis" }), params);

      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("1");
      expect((await res.json()).code).toBe("internalError");
      expect(mocks.processRaster).toHaveBeenCalledTimes(1);
      expect(mocks.retryTrainingAnalysis).not.toHaveBeenCalled();
      expect(mocks.inngestSend).not.toHaveBeenCalled();
      expect(mocks.loggerError).not.toHaveBeenCalled();
    });

    it.each(["unreadable", "too_large"] as const)("raster rejection %s uses upload's invalidFileType 400, with no transition or dispatch", async (reason) => {
      getWorkspaceAssetByKey.mockResolvedValue({ key: ASSET_KEY, type: "image/png", metadata: {} });
      mocks.processRaster.mockRejectedValueOnce(new RasterImageRejected(reason));

      const res = await PATCH(patchRequest({ action: "retry_analysis" }), params);

      expect(res.status).toBe(400);
      expect(res.headers.get("Retry-After")).toBeNull();
      expect((await res.json()).code).toBe("invalidFileType");
      expect(mocks.processRaster).toHaveBeenCalledTimes(1);
      expect(mocks.retryTrainingAnalysis).not.toHaveBeenCalled();
      expect(mocks.inngestSend).not.toHaveBeenCalled();
      expect(mocks.loggerError).not.toHaveBeenCalled();
    });

    it("dispatch failure is logged with the referenceId and the original error", async () => {
      const sendError = new Error("inngest down");
      mocks.inngestSend.mockRejectedValue(sendError);

      await PATCH(patchRequest({ action: "retry_analysis" }), params);

      const call = mocks.loggerError.mock.calls.find((c) => String(c[0]).includes("DISPATCH_FAILED"));
      expect(call?.[0]).toContain(`referenceId=${REFERENCE_ID}`);
      expect(call?.[1]).toBe(sendError);
      expect(mocks.loggerError.mock.calls.some((c) => String(c[0]).includes("COMPENSATION_FAILED"))).toBe(false);
    });

    it("when the send AND the compensation both reject, logs both with the referenceId and still surfaces the ORIGINAL error", async () => {
      const sendError = new Error("inngest down");
      const compensationError = new Error("db down");
      mocks.inngestSend.mockRejectedValue(sendError);
      mocks.markTrainingAnalysisFailed.mockRejectedValue(compensationError);

      const res = await PATCH(patchRequest({ action: "retry_analysis" }), params);

      expect(res.status).toBe(500);
      expect(res.headers.get("Retry-After")).toBeNull();
      expect(mocks.markTrainingAnalysisFailed).toHaveBeenCalledTimes(1);
      const dispatch = mocks.loggerError.mock.calls.find((c) => String(c[0]).includes("DISPATCH_FAILED"));
      const compensation = mocks.loggerError.mock.calls.find((c) => String(c[0]).includes("COMPENSATION_FAILED"));
      expect(dispatch?.[0]).toContain(`referenceId=${REFERENCE_ID}`);
      expect(dispatch?.[1]).toBe(sendError);
      expect(compensation?.[0]).toContain(`referenceId=${REFERENCE_ID}`);
      expect(compensation?.[1]).toBe(compensationError);
      // The failure the route surfaces is the dispatch's, not the compensation's.
      expect(mocks.loggerError).toHaveBeenCalledWith("[api-error]", expect.objectContaining({
        context: "client-profiles.[id].training-assets.[referenceId].PATCH",
        error: expect.objectContaining({ message: sendError.message }),
      }));
      expect(JSON.stringify(await res.json())).not.toContain("db down");
    });

    it("archives an analysis_failed reference through the review path", async () => {
      reviewTrainingReference.mockResolvedValue({ ...failedRow, reviewStatus: "archived" });

      const res = await PATCH(
        patchRequest({
          trainingCategory: "visual_reference",
          usageMode: "reference",
          analysis: null,
          reviewStatus: "archived",
        }),
        params,
      );

      expect(res.status).toBe(200);
      expect(reviewTrainingReference).toHaveBeenCalledTimes(1);
      expect(reviewTrainingReference).toHaveBeenCalledWith(
        scope,
        expect.objectContaining({ reviewStatus: "archived", analysis: null }),
      );
      expect(mocks.inngestSend).not.toHaveBeenCalled();
    });

    it("does not approve an analysis_failed reference", async () => {
      const res = await PATCH(
        patchRequest({
          trainingCategory: "graphic",
          usageMode: "reference",
          analysis: validAnalysis,
          reviewStatus: "approved",
        }),
        params,
      );

      expect(res.status).toBe(404);
      expect(reviewTrainingReference).not.toHaveBeenCalled();
    });
  });
});
