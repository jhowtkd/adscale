import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@/server/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  refreshCampaignStatus: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/plan", () => ({
  getPlanByCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  getAssetsByCampaign: vi.fn(),
}));

vi.mock("@/server/validation/env", () => ({
  env: {
    R2_PUBLIC_BASE_URL: "https://r2.example.com",
  },
}));

import { db } from "@/server/db";
import { inngest } from "@/server/jobs/client";
import { createDerivation, updateDerivationStatus } from "@/server/repositories/derivation";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById, updateCampaign, refreshCampaignStatus } from "@/server/repositories/campaign";
import { getPlanByCampaign } from "@/server/repositories/plan";
import { getUserLocale } from "@/server/repositories/user";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { POST } from "@/app/api/campaigns/[id]/derivations/route";

describe("derivation job flow", () => {
  const workspaceId = "ws-123";
  const campaignId = "camp-456";

  it("derivation creation emits Inngest event", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "queued" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const derivation = await createDerivation({
      campaignId,
      workspaceId,
      status: "queued",
    });

    expect(derivation.status).toBe("queued");

    await inngest.send({
      name: "derivation.generate",
      data: {
        derivationId: derivation.id,
        campaignId,
        workspaceId,
      },
    });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "derivation.generate",
        data: expect.objectContaining({ derivationId: "deriv-1" }),
      })
    );
  });

  it("transitions status from queued to processing", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "processing" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const updated = await updateDerivationStatus("deriv-1", workspaceId, "processing");

    expect(updated).toEqual({ id: "deriv-1", status: "processing" });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "processing" })
    );
  });

  it("transitions status from processing to completed", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "completed" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const updated = await updateDerivationStatus("deriv-1", workspaceId, "completed", "derivations/deriv-1/123.png");

    expect(updated).toEqual({ id: "deriv-1", status: "completed" });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", outputKey: "derivations/deriv-1/123.png" })
    );
  });

  it("transitions status to failed", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "failed" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const updated = await updateDerivationStatus("deriv-1", workspaceId, "failed");

    expect(updated).toEqual({ id: "deriv-1", status: "failed" });
  });
});

describe("POST /api/campaigns/[id]/derivations", () => {
  const workspaceId = "ws-123";
  const campaignId = "camp-456";
  const userId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    (requireWorkspaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: userId },
      workspace: { id: workspaceId },
    });
    (getUserLocale as ReturnType<typeof vi.fn>).mockResolvedValue("en");
    (getPlanByCampaign as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getAssetsByCampaign as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (updateCampaign as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (refreshCampaignStatus as ReturnType<typeof vi.fn>).mockResolvedValue("generating");
  });

  it("format_adaptation with targetFormats: ['4:5'] creates exactly 1 derivation with format === '4:5'", async () => {
    (getCampaignById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: campaignId,
      workspaceId,
      generationMode: "format_adaptation",
      targetFormats: ["4:5"],
      ctaVariants: [],
      creativeLevel: "balanced",
      status: "active",
    });

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const mockReturning = vi.fn().mockResolvedValue([{ id: "deriv-1", status: "queued", format: "4:5" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const request = new Request("http://localhost/api/campaigns/camp-456/derivations", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ id: campaignId }) });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.derivations).toHaveLength(1);
    expect(body.derivations[0].format).toBe("4:5");

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ format: "4:5", generationMode: "format_adaptation" })
    );
    expect(inngest.send).toHaveBeenCalledTimes(1);
  });

  it("targetFormats with > 1 item returns error 400", async () => {
    (getCampaignById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: campaignId,
      workspaceId,
      generationMode: "format_adaptation",
      targetFormats: ["1:1", "4:5"],
      ctaVariants: [],
      creativeLevel: "balanced",
      status: "active",
    });

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const request = new Request("http://localhost/api/campaigns/camp-456/derivations", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ id: campaignId }) });

    expect(response.status).toBe(400);
  });
});
