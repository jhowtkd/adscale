import { describe, it, expect, vi, beforeEach } from "vitest";
import { InMemoryObjectStorage } from "../../src/server/storage/in-memory-object-storage";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  getPendingUpload: vi.fn(),
  createAsset: vi.fn(),
  markPendingUploadCompleted: vi.fn(),
}));

import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getPendingUpload, createAsset, markPendingUploadCompleted } from "@/server/repositories/asset";
import { createPostHandler } from "@/app/api/campaigns/[id]/assets/complete/handler";

describe("POST /api/campaigns/[id]/assets/complete", () => {
  const workspaceId = "ws-123";
  const campaignId = "camp-456";
  const key = "campaigns/camp-456/uuid-1.png";
  let storage: InMemoryObjectStorage;
  let POST: ReturnType<typeof createPostHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new InMemoryObjectStorage();
    POST = createPostHandler({ storage });
    (requireWorkspaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      workspace: { id: workspaceId },
    });
    (getCampaignById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: campaignId,
      workspaceId,
    });
  });

  it("deletes the object when Content-Type mismatches", async () => {
    (getPendingUpload as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "pending-1",
      workspaceId,
      campaignId,
      key,
      contentType: "image/png",
      contentLength: 1024,
      expiresAt: new Date(Date.now() + 10000),
    });

    // Seed storage with object having wrong content type
    await storage.put(key, Buffer.from("test"), "text/plain");

    const request = new Request("http://localhost/api/campaigns/camp-456/assets/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, type: "image/png", size: 1024 }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: campaignId }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("assetTypeMismatch");
    expect(storage.keys()).not.toContain(key);
    expect(createAsset).not.toHaveBeenCalled();
    expect(markPendingUploadCompleted).not.toHaveBeenCalled();
  });

  it("deletes the object when size mismatches", async () => {
    (getPendingUpload as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "pending-1",
      workspaceId,
      campaignId,
      key,
      contentType: "image/png",
      contentLength: 1024,
      expiresAt: new Date(Date.now() + 10000),
    });

    // Seed storage with object having wrong size (larger)
    await storage.put(key, Buffer.from("x".repeat(9999)), "image/png");

    const request = new Request("http://localhost/api/campaigns/camp-456/assets/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, type: "image/png", size: 1024 }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: campaignId }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("assetSizeMismatch");
    expect(storage.keys()).not.toContain(key);
    expect(createAsset).not.toHaveBeenCalled();
    expect(markPendingUploadCompleted).not.toHaveBeenCalled();
  });
});
