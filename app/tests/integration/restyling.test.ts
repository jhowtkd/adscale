import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/server/storage", () => ({
  objectStorage: {
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  createCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  createAsset: vi.fn(),
}));

vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: vi.fn(),
}));

vi.mock("@/server/billing/paywall", () => ({
  spendOrApiError: vi.fn(),
}));

import { inngest } from "@/server/jobs/client";
import { objectStorage } from "@/server/storage";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getUserLocale } from "@/server/repositories/user";
import { createCampaign, deleteCampaign } from "@/server/repositories/campaign";
import { createAsset } from "@/server/repositories/asset";
import { createDerivation } from "@/server/repositories/derivation";
import { spendOrApiError } from "@/server/billing/paywall";
import { POST } from "@/app/api/restyling/route";

function createMockFile(name: string, type: string, size: number): File {
  const pngMagic = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const buffer = new ArrayBuffer(Math.max(size, pngMagic.length));
  const view = new Uint8Array(buffer);
  view.set(pngMagic);
  return new File([new Blob([buffer])], name, { type });
}

function createMockFormData(entries: Record<string, string | File | null>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== null) {
      formData.append(key, value);
    }
  }
  return formData;
}

function createMockRequest(formData: FormData): Request {
  const request = new Request("http://localhost/api/restyling", {
    method: "POST",
  });
  vi.spyOn(request, "formData").mockResolvedValue(formData);
  return request;
}

describe("POST /api/restyling", () => {
  const workspaceId = "ws-123";
  const userId = "user-123";
  const campaignId = "camp-456";
  const derivationId = "deriv-789";

  const baseImage = createMockFile("base.png", "image/png", 1024 * 1024);
  const styleImage = createMockFile("style.png", "image/png", 1024 * 1024);

  beforeEach(() => {
    vi.clearAllMocks();
    (requireWorkspaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: userId },
      workspace: { id: workspaceId, name: "Test Workspace" },
    });
    (getUserLocale as ReturnType<typeof vi.fn>).mockResolvedValue("en");
    (spendOrApiError as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (createCampaign as ReturnType<typeof vi.fn>).mockResolvedValue({ id: campaignId });
    (objectStorage.put as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (createAsset as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "asset-1" });
    (createDerivation as ReturnType<typeof vi.fn>).mockResolvedValue({ id: derivationId });
    (inngest.send as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("creates campaign with restyling mode and dispatches Inngest event", async () => {
    const formData = createMockFormData({
      name: "My Campaign",
      client: "Acme Corp",
      offer: "50% off",
      baseImage,
      styleImage,
      styleIntensity: "medium",
    });

    const response = await POST(createMockRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.campaignId).toBe(campaignId);
    expect(body.derivationId).toBe(derivationId);
    expect(body.redirectUrl).toBe(`/campaigns/${campaignId}`);

    expect(createCampaign).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({
        name: "My Campaign",
        generationMode: "restyling",
        styleIntensity: "medium",
      })
    );

    expect(objectStorage.put).toHaveBeenCalledTimes(2);

    expect(createAsset).toHaveBeenCalledTimes(2);
    expect(createAsset).toHaveBeenCalledWith(
      workspaceId,
      campaignId,
      expect.objectContaining({ role: "base" })
    );
    expect(createAsset).toHaveBeenCalledWith(
      workspaceId,
      campaignId,
      expect.objectContaining({ role: "style_reference" })
    );

    expect(inngest.send).toHaveBeenCalledWith({
      name: "derivation.generate",
      data: expect.objectContaining({
        derivationId,
        campaignId,
        workspaceId,
        generationMode: "restyling",
      }),
    });
  });

  it("returns 400 when name is missing", async () => {
    const formData = createMockFormData({
      baseImage,
      styleImage,
      styleIntensity: "medium",
    });

    const response = await POST(createMockRequest(formData));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("invalidInput");
  });

  it("returns 400 when base image is missing", async () => {
    const formData = createMockFormData({
      name: "My Campaign",
      styleImage,
      styleIntensity: "medium",
    });

    const response = await POST(createMockRequest(formData));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("invalidInput");
  });

  it("returns 400 for invalid file type", async () => {
    const textFile = createMockFile("readme.txt", "text/plain", 1024);
    const formData = createMockFormData({
      name: "My Campaign",
      baseImage: textFile,
      styleImage,
      styleIntensity: "medium",
    });

    const response = await POST(createMockRequest(formData));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("invalidFileType");
  });

  it("returns 400 for file too large (>50MB)", async () => {
    const largeFile = createMockFile("large.png", "image/png", 51 * 1024 * 1024);
    const formData = createMockFormData({
      name: "My Campaign",
      baseImage: largeFile,
      styleImage,
      styleIntensity: "medium",
    });

    const response = await POST(createMockRequest(formData));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("fileTooLarge");
  });

  it("returns 402 when credits insufficient", async () => {
    (spendOrApiError as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: "insufficientCredits" }, { status: 402 })
    );

    const formData = createMockFormData({
      name: "My Campaign",
      baseImage,
      styleImage,
      styleIntensity: "medium",
    });

    const response = await POST(createMockRequest(formData));

    expect(response.status).toBe(402);
  });

  it("cleans up R2 objects and campaign on derivation creation failure", async () => {
    (createAsset as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("Asset creation failed"))
      .mockRejectedValueOnce(new Error("Asset creation failed"));

    const formData = createMockFormData({
      name: "My Campaign",
      baseImage,
      styleImage,
      styleIntensity: "medium",
    });

    await POST(createMockRequest(formData));

    expect(objectStorage.delete).toHaveBeenCalledTimes(2);
    expect(deleteCampaign).toHaveBeenCalledWith(campaignId, workspaceId);
  });
});