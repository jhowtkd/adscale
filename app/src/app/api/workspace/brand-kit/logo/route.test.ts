import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  createClientReference: vi.fn(),
  getClientProfiles: vi.fn(),
}));

vi.mock("@/server/repositories/brand-kit", () => ({
  BrandKitAmbiguityError: class BrandKitAmbiguityError extends Error {
    name = "BrandKitAmbiguityError";
  },
  BrandKitProfileNotFoundError: class BrandKitProfileNotFoundError extends Error {
    name = "BrandKitProfileNotFoundError";
  },
  getBrandKit: vi.fn(),
  getBrandKitByWorkspace: vi.fn(),
  upsertBrandKit: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    put: vi.fn(),
    delete: vi.fn(),
    publicUrl: vi.fn((key: string) => `https://cdn.example/${key}`),
  },}));

vi.mock("@/server/repositories/workspace-asset", () => ({
  createWorkspaceAsset: vi.fn(),
}));

vi.mock("@/lib/upload-config", () => ({
  isAllowedImageType: vi.fn(() => true),
  validateImageMagicBytes: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getClientProfiles } from "@/server/repositories/client-reference";
import {
  getBrandKit,
  getBrandKitByWorkspace,
  upsertBrandKit,
} from "@/server/repositories/brand-kit";
import { createClientReference } from "@/server/repositories/client-reference";
import { createWorkspaceAsset } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";

const PROFILE_A = "00000000-0000-4000-8000-000000000001";
const PROFILE_B = "00000000-0000-4000-8000-000000000002";

const mockGetClientProfiles = vi.mocked(getClientProfiles);
const mockGetBrandKit = vi.mocked(getBrandKit);
const mockGetBrandKitByWorkspace = vi.mocked(getBrandKitByWorkspace);
const mockUpsertBrandKit = vi.mocked(upsertBrandKit);
const mockCreateClientReference = vi.mocked(createClientReference);
const mockCreateWorkspaceAsset = vi.mocked(createWorkspaceAsset);

function logoRequest(clientProfileId?: string, file?: File | null) {
  const url = clientProfileId
    ? `http://localhost/api/workspace/brand-kit/logo?clientProfileId=${clientProfileId}`
    : "http://localhost/api/workspace/brand-kit/logo";
  const req = new Request(url, { method: "POST" });
  const uploadFile =
    file ??
    new File([new Uint8Array([137, 80, 78, 71])], "logo.png", {
      type: "image/png",
    });

  vi.spyOn(req, "formData").mockResolvedValue({
    get: (name: string) => (name === "file" ? uploadFile : null),
  } as unknown as FormData);

  return req;
}

describe("POST /api/workspace/brand-kit/logo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBrandKit.mockResolvedValue({
      id: PROFILE_A,
      logoAssetKey: null,
    } as Awaited<ReturnType<typeof getBrandKit>>);
    mockCreateClientReference.mockResolvedValue({
      id: "ref-1",
      assetKey: "logo.png",
      label: "logo.png",
      kind: "logo",
    } as Awaited<ReturnType<typeof createClientReference>>);
    mockUpsertBrandKit.mockResolvedValue({
      id: PROFILE_A,
      logoAssetKey: "logo.png",
    } as Awaited<ReturnType<typeof upsertBrandKit>>);
    mockCreateWorkspaceAsset.mockResolvedValue({ id: "asset-1", key: "logo.png" } as Awaited<ReturnType<typeof createWorkspaceAsset>>);
  });

  it("uploads logo for an explicit profile", async () => {
    const res = await POST(logoRequest(PROFILE_A));
    expect(res.status).toBe(201);
    expect(mockGetBrandKit).toHaveBeenCalledWith("workspace-1", PROFILE_A);
    expect(mockUpsertBrandKit).toHaveBeenLastCalledWith(
      "workspace-1",
      expect.objectContaining({ logoAssetKey: expect.any(String) }),
      PROFILE_A
    );
    // Ticket 07 (review R4): the logo producer materializes a real workspace_asset,
    // branded to the profile, with source/kind matching the Library's classification.
    expect(mockCreateWorkspaceAsset).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1", clientProfileId: PROFILE_A,
      key: expect.stringContaining("workspaces/workspace-1/brand-kit/"),
      name: "logo.png", type: "image/png", source: "brand_upload",
      metadata: { kind: "brand_logo" },
    }));
  });

  it("uploads logo for a second, distinct profile (B), branding the asset to B — never to A", async () => {
    mockGetBrandKit.mockResolvedValue({ id: PROFILE_B, logoAssetKey: null } as Awaited<ReturnType<typeof getBrandKit>>);
    mockUpsertBrandKit.mockResolvedValue({ id: PROFILE_B, logoAssetKey: "logo.png" } as Awaited<ReturnType<typeof upsertBrandKit>>);

    const res = await POST(logoRequest(PROFILE_B));

    expect(res.status).toBe(201);
    expect(mockGetBrandKit).toHaveBeenCalledWith("workspace-1", PROFILE_B);
    expect(mockCreateWorkspaceAsset).toHaveBeenCalledWith(expect.objectContaining({ clientProfileId: PROFILE_B }));
  });

  it("returns 409 when multiple profiles exist without clientProfileId, and never writes anything", async () => {
    mockGetBrandKitByWorkspace.mockResolvedValue(null);
    mockGetClientProfiles.mockResolvedValue([
      { id: PROFILE_A, name: "Acme" },
      { id: PROFILE_B, name: "Beta" },
    ] as Awaited<ReturnType<typeof getClientProfiles>>);

    const res = await POST(logoRequest());

    expect(res.status).toBe(409);
    // Ambiguity is caught before any side effect — no orphaned R2 object or asset row.
    expect(vi.mocked(objectStorage.put)).not.toHaveBeenCalled();
    expect(mockCreateWorkspaceAsset).not.toHaveBeenCalled();
    expect(mockCreateClientReference).not.toHaveBeenCalled();
  });

  it("compensates the R2 object when creating the workspace asset fails, and never registers the client reference", async () => {
    mockCreateWorkspaceAsset.mockRejectedValue(new Error("db down"));

    const res = await POST(logoRequest(PROFILE_A));

    expect(res.status).toBe(500);
    expect(vi.mocked(objectStorage.put)).toHaveBeenCalledTimes(1);
    const [putKey] = vi.mocked(objectStorage.put).mock.calls[0]!;
    expect(vi.mocked(objectStorage.delete)).toHaveBeenCalledWith(putKey);
    expect(mockCreateClientReference).not.toHaveBeenCalled();
    expect(mockUpsertBrandKit).toHaveBeenCalledTimes(0);
  });
});
