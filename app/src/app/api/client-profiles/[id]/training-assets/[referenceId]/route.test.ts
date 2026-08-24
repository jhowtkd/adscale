import { beforeEach, describe, expect, it, vi } from "vitest";

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
}));

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
});
