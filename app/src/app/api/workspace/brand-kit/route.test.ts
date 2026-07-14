import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, DELETE } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfiles: vi.fn(),
}));

vi.mock("@/server/repositories/brand-kit", () => ({
  BrandKitAmbiguityError: class BrandKitAmbiguityError extends Error {
    name = "BrandKitAmbiguityError";
    availableWorkspaces: { id: string; name: string }[] = [];
    constructor(
      message = "Multiple client profiles exist",
      availableWorkspaces: { id: string; name: string }[] = []
    ) {
      super(message);
      this.availableWorkspaces = availableWorkspaces;
    }
  },
  BrandKitProfileNotFoundError: class BrandKitProfileNotFoundError extends Error {
    name = "BrandKitProfileNotFoundError";
  },
  getBrandKit: vi.fn(),
  getBrandKitByWorkspace: vi.fn(),
  upsertBrandKit: vi.fn(),
  deleteBrandKit: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    publicUrl: vi.fn((key: string) => `https://cdn.example/${key}`),
    delete: vi.fn(),
  },}));

vi.mock("@/server/repositories/asset", () => ({
  isWorkspaceAssetKey: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

const PROFILE_A = "00000000-0000-4000-8000-000000000001";
const PROFILE_B = "00000000-0000-4000-8000-000000000002";
import {
  getBrandKit,
  getBrandKitByWorkspace,
  upsertBrandKit,
  deleteBrandKit,
} from "@/server/repositories/brand-kit";

import { getClientProfiles } from "@/server/repositories/client-reference";

const mockGetClientProfiles = vi.mocked(getClientProfiles);
const mockGetBrandKit = vi.mocked(getBrandKit);
const mockGetBrandKitByWorkspace = vi.mocked(getBrandKitByWorkspace);
const mockUpsertBrandKit = vi.mocked(upsertBrandKit);
const mockDeleteBrandKit = vi.mocked(deleteBrandKit);

describe("GET /api/workspace/brand-kit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns brand kit for an explicit clientProfileId", async () => {
    mockGetBrandKit.mockResolvedValue({
      id: PROFILE_A,
      logoAssetKey: "logo.png",
    } as Awaited<ReturnType<typeof getBrandKit>>);

    const res = await GET(
      new Request(`http://localhost/api/workspace/brand-kit?clientProfileId=${PROFILE_A}`)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.brandKit.id).toBe(PROFILE_A);
    expect(mockGetBrandKit).toHaveBeenCalledWith("workspace-1", PROFILE_A);
  });

  it("returns 409 with availableWorkspaces when multiple profiles exist without clientProfileId", async () => {
    mockGetBrandKitByWorkspace.mockResolvedValue(null);
    mockGetClientProfiles.mockResolvedValue([
      { id: PROFILE_A, name: "Acme" },
      { id: PROFILE_B, name: "Beta" },
    ] as Awaited<ReturnType<typeof getClientProfiles>>);

    const res = await GET(new Request("http://localhost/api/workspace/brand-kit"));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("workspace_ambiguous");
    expect(body.details.availableWorkspaces).toEqual([
      { id: PROFILE_A, name: "Acme" },
      { id: PROFILE_B, name: "Beta" },
    ]);
    expect(body.message).toBe("brandKitAmbiguous");
  });
});

describe("POST /api/workspace/brand-kit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes to the requested profile", async () => {
    mockUpsertBrandKit.mockResolvedValue({
      id: PROFILE_A,
      toneOfVoice: "Direct",
      logoAssetKey: null,
    } as Awaited<ReturnType<typeof upsertBrandKit>>);

    const res = await POST(
      new Request("http://localhost/api/workspace/brand-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientProfileId: PROFILE_A,
          toneOfVoice: "Direct",
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(mockUpsertBrandKit).toHaveBeenCalledWith(
      "workspace-1",
      { toneOfVoice: "Direct" },
      PROFILE_A
    );
  });
});

describe("DELETE /api/workspace/brand-kit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes brand kit for an explicit profile", async () => {
    mockGetBrandKit.mockResolvedValue({
      id: PROFILE_A,
      logoAssetKey: null,
    } as Awaited<ReturnType<typeof getBrandKit>>);
    mockDeleteBrandKit.mockResolvedValue({
      id: PROFILE_A,
      logoAssetKey: null,
    } as Awaited<ReturnType<typeof deleteBrandKit>>);

    const res = await DELETE(
      new Request(`http://localhost/api/workspace/brand-kit?clientProfileId=${PROFILE_A}`)
    );

    expect(res.status).toBe(200);
    expect(mockDeleteBrandKit).toHaveBeenCalledWith("workspace-1", PROFILE_A);
  });
});
