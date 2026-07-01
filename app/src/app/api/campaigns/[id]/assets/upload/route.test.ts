import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  createAsset: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    put: vi.fn(),
  },}));

vi.mock("@/lib/upload-config", () => ({
  isAllowedImageType: vi.fn((type: string) => type === "image/png"),
  validateImageMagicBytes: vi.fn(() => Promise.resolve(true)),
  sanitizeStorageFilename: vi.fn((name: string) => name),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { getCampaignById } from "@/server/repositories/campaign";
import { createAsset } from "@/server/repositories/asset";
import { objectStorage } from "@/server/storage";

const mockGetCampaignById = vi.mocked(getCampaignById);
const mockCreateAsset = vi.mocked(createAsset);
const mockUploadBuffer = vi.mocked(objectStorage.put);

const CAMP_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeParams(id: string) {
  return Promise.resolve({ id });
}

function makeRequest(opts: {
  file?: File;
  width?: string;
  height?: string;
  role?: string;
}): Request {
  const req = new Request(`http://localhost/api/campaigns/${CAMP_ID}/assets/upload`, {
    method: "POST",
  });

  const entries: Record<string, string | File | null> = {
    file: opts.file ?? null,
    width: opts.width ?? null,
    height: opts.height ?? null,
    role: opts.role ?? null,
  };

  vi.spyOn(req, "formData").mockResolvedValue({
    get: (name: string) => entries[name] ?? null,
  } as unknown as FormData);

  return req;
}

describe("POST /api/campaigns/[id]/assets/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCampaignById.mockResolvedValue({
      id: CAMP_ID,
      name: "Test Campaign",
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockUploadBuffer.mockResolvedValue(undefined);
    mockCreateAsset.mockResolvedValue({
      id: "asset-1",
      campaignId: CAMP_ID,
      workspaceId: "workspace-1",
      key: "campaigns/camp-1/uuid-test.png",
      type: "image/png",
      size: 1024,
      width: null,
      height: null,
      role: null,
    } as Awaited<ReturnType<typeof createAsset>>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 when campaign is missing", async () => {
    mockGetCampaignById.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ file: new File(["x"], "test.png", { type: "image/png" }) }),
      { params: makeParams(CAMP_ID) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 when file is missing", async () => {
    const res = await POST(makeRequest({}), { params: makeParams(CAMP_ID) });

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid file type", async () => {
    const { isAllowedImageType } = await import("@/lib/upload-config");
    vi.mocked(isAllowedImageType).mockReturnValueOnce(false);

    const res = await POST(
      makeRequest({ file: new File(["x"], "test.exe", { type: "application/exe" }) }),
      { params: makeParams(CAMP_ID) }
    );

    expect(res.status).toBe(400);
  });

  it("creates asset with width, height, and role from form data", async () => {
    mockCreateAsset.mockResolvedValue({
      id: "asset-2",
      campaignId: CAMP_ID,
      workspaceId: "workspace-1",
      key: "campaigns/camp-1/uuid-test.png",
      type: "image/png",
      size: 2048,
      width: 1024,
      height: 768,
      role: "base",
    } as Awaited<ReturnType<typeof createAsset>>);

    const res = await POST(
      makeRequest({
        file: new File(["x"], "test.png", { type: "image/png" }),
        width: "1024",
        height: "768",
        role: "base",
      }),
      { params: makeParams(CAMP_ID) }
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.asset.role).toBe("base");
    expect(mockCreateAsset).toHaveBeenCalledWith(
      "workspace-1",
      CAMP_ID,
      expect.objectContaining({
        width: 1024,
        height: 768,
        role: "base",
        type: "image/png",
      })
    );
  });

  it("creates asset without optional fields when omitted", async () => {
    const res = await POST(
      makeRequest({ file: new File(["x"], "test.png", { type: "image/png" }) }),
      { params: makeParams(CAMP_ID) }
    );
    expect(res.status).toBe(201);
    expect(mockCreateAsset).toHaveBeenCalledWith(
      "workspace-1",
      CAMP_ID,
      expect.objectContaining({
        width: undefined,
        height: undefined,
        role: undefined,
      })
    );
  });

  it("rejects non-numeric width/height with 400", async () => {
    const res = await POST(
      makeRequest({
        file: new File(["x"], "test.png", { type: "image/png" }),
        width: "abc",
      }),
      { params: makeParams(CAMP_ID) }
    );

    expect(res.status).toBe(400);
  });
});
