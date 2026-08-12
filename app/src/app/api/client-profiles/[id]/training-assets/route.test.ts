import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

const PROFILE_ID = "profile-1";
const WORKSPACE_ID = "workspace-1";

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: WORKSPACE_ID },
    }),
  ),
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
  getClientProfile: vi.fn(),
  createTrainingReference: vi.fn(),
  getTrainingReferences: vi.fn(),
  createWorkspaceAsset: vi.fn(),
  deleteWorkspaceAsset: vi.fn(),
  getWorkspaceAssetByKey: vi.fn(),
  normalizeTrainingUpload: vi.fn(),
  sanitizeStorageFilename: vi.fn((name: string) =>
    name.toLowerCase().replace(/[^a-z0-9._-]/g, ""),
  ),
  putObject: vi.fn(() => Promise.resolve()),
  deleteObject: vi.fn(() => Promise.resolve()),
  publicUrl: vi.fn((key: string) => `https://cdn.example/${key}`),
  inngestSend: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: mocks.getTranslations,
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: (...args: unknown[]) => mocks.getClientProfile(...args),
  createTrainingReference: (...args: unknown[]) => mocks.createTrainingReference(...args),
  getTrainingReferences: (...args: unknown[]) => mocks.getTrainingReferences(...args),
}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  createWorkspaceAsset: (...args: unknown[]) => mocks.createWorkspaceAsset(...args),
  deleteWorkspaceAsset: (...args: unknown[]) => mocks.deleteWorkspaceAsset(...args),
  getWorkspaceAssetByKey: (...args: unknown[]) => mocks.getWorkspaceAssetByKey(...args),
}));

vi.mock("@/server/brand-training/upload", () => ({
  normalizeTrainingUpload: (...args: unknown[]) => mocks.normalizeTrainingUpload(...args),
  sanitizeStorageFilename: (...args: unknown[]) => mocks.sanitizeStorageFilename(...args),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    put: (...args: unknown[]) => mocks.putObject(...args),
    delete: (...args: unknown[]) => mocks.deleteObject(...args),
    publicUrl: (...args: unknown[]) => mocks.publicUrl(...args),
  },
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: (...args: unknown[]) => mocks.inngestSend(...args) },
}));

import { objectStorage } from "@/server/storage";

const getClientProfile = mocks.getClientProfile;
const createTrainingReference = mocks.createTrainingReference;
const getTrainingReferences = mocks.getTrainingReferences;
const createWorkspaceAsset = mocks.createWorkspaceAsset;
const deleteWorkspaceAsset = mocks.deleteWorkspaceAsset;
const getWorkspaceAssetByKey = mocks.getWorkspaceAssetByKey;
const normalizeTrainingUpload = mocks.normalizeTrainingUpload;
const sanitizeStorageFilename = mocks.sanitizeStorageFilename;
const putObject = mocks.putObject;
const deleteObject = mocks.deleteObject;
const publicUrl = mocks.publicUrl;
const inngestSend = mocks.inngestSend;

function buildPngFile(): File {
  // Minimal valid 1x1 PNG buffer
  const bytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  return new File([bytes], "Logo.PNG", { type: "image/png" });
}

function formDataWithFile(): FormData {
  const fd = new FormData();
  fd.append("file", buildPngFile());
  return fd;
}

describe("POST /api/client-profiles/[id]/training-assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sanitizeStorageFilename.mockImplementation(
      (name: string) => name.toLowerCase().replace(/[^a-z0-9._-]/g, ""),
    );
    putObject.mockResolvedValue(undefined);
    deleteObject.mockResolvedValue(undefined);
    deleteWorkspaceAsset.mockResolvedValue(null);
    publicUrl.mockImplementation((key: string) => `https://cdn.example/${key}`);
    inngestSend.mockResolvedValue(undefined);
  });

  it("returns 404 when the profile does not belong to the workspace", async () => {
    getClientProfile.mockResolvedValue(null);

    const req = new Request(
      `http://localhost/api/client-profiles/${PROFILE_ID}/training-assets`,
      { method: "POST", body: formDataWithFile() },
    );

    const res = await POST(req, {
      params: Promise.resolve({ id: PROFILE_ID }),
    });

    expect(res.status).toBe(404);
    expect(getClientProfile).toHaveBeenCalledWith(WORKSPACE_ID, PROFILE_ID);
    expect(createWorkspaceAsset).not.toHaveBeenCalled();
  });

  it("uploads the file, creates an asset + reference, and dispatches the analyze event", async () => {
    getClientProfile.mockResolvedValue({
      id: PROFILE_ID,
      workspaceId: WORKSPACE_ID,
      name: "Acme",
    });
    normalizeTrainingUpload.mockResolvedValue({
      buffer: Buffer.from("png-bytes"),
      type: "image/png",
      extension: "png",
      hasAlpha: true,
    });
    const reference = {
      id: "ref-1",
      workspaceId: WORKSPACE_ID,
      clientProfileId: PROFILE_ID,
      assetKey: "asset-key",
      label: "Logo.PNG",
      kind: "other",
      trainingCategory: "visual_reference",
      usageMode: "reference",
      reviewStatus: "pending_analysis",
    };
    createTrainingReference.mockResolvedValue(reference);
    createWorkspaceAsset.mockResolvedValue({
      id: "asset-1",
      workspaceId: WORKSPACE_ID,
      key: "asset-key",
      name: "Logo.PNG",
      type: "image/png",
      size: 9,
      source: "brand_training",
      metadata: { hasAlpha: true, originalMimeType: "image/png" },
    });

    const req = new Request(
      `http://localhost/api/client-profiles/${PROFILE_ID}/training-assets`,
      { method: "POST", body: formDataWithFile() },
    );

    const res = await POST(req, {
      params: Promise.resolve({ id: PROFILE_ID }),
    });

    expect(res.status).toBe(201);
    expect(normalizeTrainingUpload).toHaveBeenCalled();
    expect(getClientProfile).toHaveBeenCalledWith(WORKSPACE_ID, PROFILE_ID);
    expect(createWorkspaceAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        source: "brand_training",
        metadata: { hasAlpha: true, originalMimeType: "image/png" },
      }),
    );
    expect(createTrainingReference).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({ clientProfileId: PROFILE_ID }),
    );
    expect(inngestSend).toHaveBeenCalledWith({
      name: "brand.training.analyze",
      data: {
        workspaceId: WORKSPACE_ID,
        clientProfileId: PROFILE_ID,
        referenceId: "ref-1",
        assetKey: expect.any(String),
        mimeType: "image/png",
        hasAlpha: true,
      },
    });

    const body = await res.json();
    expect(body.reference).toEqual(
      expect.objectContaining({
        id: "ref-1",
        asset: expect.objectContaining({ id: "asset-1" }),
        url: expect.stringMatching(/^https:\/\/cdn\.example\/workspaces\/workspace-1\/brand-training\//),
      }),
    );
  });

  it("rolls back the uploaded object when asset creation fails", async () => {
    getClientProfile.mockResolvedValue({
      id: PROFILE_ID,
      workspaceId: WORKSPACE_ID,
      name: "Acme",
    });
    normalizeTrainingUpload.mockResolvedValue({
      buffer: Buffer.from("png-bytes"),
      type: "image/png",
      extension: "png",
      hasAlpha: false,
    });
    createWorkspaceAsset.mockRejectedValue(new Error("db down"));

    const req = new Request(
      `http://localhost/api/client-profiles/${PROFILE_ID}/training-assets`,
      { method: "POST", body: formDataWithFile() },
    );

    const res = await POST(req, {
      params: Promise.resolve({ id: PROFILE_ID }),
    });

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(putObject).toHaveBeenCalled();
    expect(createWorkspaceAsset).toHaveBeenCalled();
    expect(deleteObject).toHaveBeenCalledWith(
      expect.stringContaining(`workspaces/${WORKSPACE_ID}/brand-training/`),
    );
    expect(createTrainingReference).not.toHaveBeenCalled();
  });

  it("rolls back asset + object when reference creation fails", async () => {
    getClientProfile.mockResolvedValue({
      id: PROFILE_ID,
      workspaceId: WORKSPACE_ID,
      name: "Acme",
    });
    normalizeTrainingUpload.mockResolvedValue({
      buffer: Buffer.from("png-bytes"),
      type: "image/png",
      extension: "png",
      hasAlpha: false,
    });
    createWorkspaceAsset.mockResolvedValue({
      id: "asset-2",
      workspaceId: WORKSPACE_ID,
      key: `workspaces/${WORKSPACE_ID}/brand-training/zzz-logo.png`,
    });
    createTrainingReference.mockRejectedValue(new Error("ref down"));

    const req = new Request(
      `http://localhost/api/client-profiles/${PROFILE_ID}/training-assets`,
      { method: "POST", body: formDataWithFile() },
    );

    const res = await POST(req, {
      params: Promise.resolve({ id: PROFILE_ID }),
    });

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(deleteWorkspaceAsset).toHaveBeenCalledWith("asset-2", WORKSPACE_ID);
    // The route uses the locally generated key for the actual object — it
    // must delete the same key that was uploaded, not the mocked asset.key.
    const deleteCalls = deleteObject.mock.calls.map((c) => c[0]);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]).toMatch(
      /^workspaces\/workspace-1\/brand-training\/[a-f0-9-]+-logo\.png$/,
    );
  });
});

describe("GET /api/client-profiles/[id]/training-assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientProfile.mockResolvedValue({
      id: PROFILE_ID,
      workspaceId: WORKSPACE_ID,
      name: "Acme",
    });
  });

  it("returns 404 when the profile does not belong to the workspace", async () => {
    getClientProfile.mockResolvedValue(null);

    const res = await GET(
      new Request(`http://localhost/api/client-profiles/${PROFILE_ID}/training-assets`),
      { params: Promise.resolve({ id: PROFILE_ID }) },
    );

    expect(res.status).toBe(404);
    expect(getTrainingReferences).not.toHaveBeenCalled();
  });

  it("lists training references with their workspace assets and urls", async () => {
    getTrainingReferences.mockResolvedValue([
      {
        id: "ref-1",
        workspaceId: WORKSPACE_ID,
        clientProfileId: PROFILE_ID,
        assetKey: "workspaces/workspace-1/brand-training/abc-logo.png",
        label: "Logo",
        kind: "other",
      },
    ]);
    getWorkspaceAssetByKey.mockResolvedValue({
      id: "asset-1",
      workspaceId: WORKSPACE_ID,
      key: "workspaces/workspace-1/brand-training/abc-logo.png",
      name: "logo.png",
      type: "image/png",
      size: 123,
    });

    const req = new Request(
      `http://localhost/api/client-profiles/${PROFILE_ID}/training-assets`,
    );

    const res = await GET(req, {
      params: Promise.resolve({ id: PROFILE_ID }),
    });

    expect(res.status).toBe(200);
    expect(getTrainingReferences).toHaveBeenCalledWith(WORKSPACE_ID, PROFILE_ID);
    const body = await res.json();
    expect(body.references).toHaveLength(1);
    expect(body.references[0]).toEqual(
      expect.objectContaining({
        id: "ref-1",
        asset: expect.objectContaining({ id: "asset-1" }),
        url: "https://cdn.example/workspaces/workspace-1/brand-training/abc-logo.png",
      }),
    );
  });

  it("skips references whose workspace asset binding is missing", async () => {
    getTrainingReferences.mockResolvedValue([
      {
        id: "ref-ok",
        workspaceId: WORKSPACE_ID,
        clientProfileId: PROFILE_ID,
        assetKey: "workspaces/workspace-1/brand-training/abc.png",
      },
      {
        id: "ref-broken",
        workspaceId: WORKSPACE_ID,
        clientProfileId: PROFILE_ID,
        assetKey: "workspaces/workspace-1/brand-training/missing.png",
      },
    ]);
    getWorkspaceAssetByKey.mockImplementation(async (_ws, key) =>
      key.endsWith("abc.png") ? { id: "asset-ok", key, workspaceId: WORKSPACE_ID } : null,
    );

    const req = new Request(
      `http://localhost/api/client-profiles/${PROFILE_ID}/training-assets`,
    );

    const res = await GET(req, {
      params: Promise.resolve({ id: PROFILE_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.references.map((r: { id: string }) => r.id)).toEqual(["ref-ok"]);
  });

  it("does not accept a workspace id from query parameters", async () => {
    getTrainingReferences.mockResolvedValue([]);

    const req = new Request(
      `http://localhost/api/client-profiles/${PROFILE_ID}/training-assets?workspaceId=other-workspace`,
    );

    const res = await GET(req, {
      params: Promise.resolve({ id: PROFILE_ID }),
    });

    expect(res.status).toBe(200);
    expect(getTrainingReferences).toHaveBeenCalledWith(WORKSPACE_ID, PROFILE_ID);
    expect(getTrainingReferences).not.toHaveBeenCalledWith(
      "other-workspace",
      expect.anything(),
    );
  });
});
