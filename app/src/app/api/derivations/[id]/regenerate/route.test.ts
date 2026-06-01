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

vi.mock("@/server/repositories/user", () => ({
  getUserLocale: vi.fn(() => Promise.resolve("pt-BR")),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  createDerivation: vi.fn(),
  getActiveChildrenByParent: vi.fn(),
  updateDerivationStatus: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  updateCampaign: vi.fn(),
  refreshCampaignStatus: vi.fn(),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/server/billing/gates", () => ({
  spendCreditsOrApiError: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getDerivationById,
  createDerivation,
  getActiveChildrenByParent,
} from "@/server/repositories/derivation";
import { updateCampaign } from "@/server/repositories/campaign";
import { inngest } from "@/server/jobs/client";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockCreateDerivation = vi.mocked(createDerivation);
const mockGetActiveChildrenByParent = vi.mocked(getActiveChildrenByParent);
const mockUpdateCampaign = vi.mocked(updateCampaign);
const mockInngestSend = vi.mocked(inngest.send);

function requestWith(body: unknown): Request {
  return new Request("http://localhost/api/derivations/source-id/regenerate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function paramsWith(id: string) {
  return Promise.resolve({ id });
}

describe("POST /api/derivations/[id]/regenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveChildrenByParent.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects feedback over the bounded size", async () => {
    const res = await POST(requestWith({ feedback: "x".repeat(2001) }), {
      params: paramsWith("source-id"),
    });

    expect(res.status).toBe(400);
    expect(mockGetDerivationById).not.toHaveBeenCalled();
  });

  it("rejects regeneration while a child is already active", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      status: "approved",
    } as Awaited<ReturnType<typeof getDerivationById>>);
    mockGetActiveChildrenByParent.mockResolvedValue([
      { id: "active-child", status: "queued" },
    ] as Awaited<ReturnType<typeof getActiveChildrenByParent>>);

    const res = await POST(requestWith({ feedback: "try a warmer style" }), {
      params: paramsWith("source-id"),
    });

    expect(res.status).toBe(429);
    expect(mockCreateDerivation).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("creates one queued child when no active regeneration exists", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      status: "approved",
      planId: "plan-id",
      generationMode: "art_variation",
      variantIndex: 0,
      ctaText: "Shop now",
      format: "1:1",
    } as Awaited<ReturnType<typeof getDerivationById>>);
    mockCreateDerivation.mockResolvedValue({
      id: "child-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      status: "queued",
    } as Awaited<ReturnType<typeof createDerivation>>);
    mockInngestSend.mockResolvedValue({ ids: ["event-id"] });

    const res = await POST(requestWith({ feedback: "try a warmer style" }), {
      params: paramsWith("source-id"),
    });

    expect(res.status).toBe(201);
    expect(mockGetActiveChildrenByParent).toHaveBeenCalledWith("source-id", "workspace-1");
    expect(mockCreateDerivation).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "source-id",
        feedback: "try a warmer style",
        status: "queued",
      })
    );
    expect(mockUpdateCampaign).toHaveBeenCalledWith(
      "campaign-id",
      "workspace-1",
      { status: "generating" }
    );
  });

  it("uses parent regenerationSuggestion when feedback is omitted", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      status: "completed",
      planId: "plan-id",
      generationMode: "art_variation",
      variantIndex: 0,
      ctaText: "Shop now",
      format: "1:1",
      regenerationSuggestion:
        "Hard failures: [cta_drift]. Fix cta_drift: CTA missing. Preserve the exact CTA \"Shop now\".",
    } as Awaited<ReturnType<typeof getDerivationById>>);
    mockCreateDerivation.mockResolvedValue({
      id: "child-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      status: "queued",
    } as Awaited<ReturnType<typeof createDerivation>>);
    mockInngestSend.mockResolvedValue({ ids: ["event-id"] });

    const res = await POST(requestWith({}), { params: paramsWith("source-id") });

    expect(res.status).toBe(201);
    expect(mockCreateDerivation).toHaveBeenCalledWith(
      expect.objectContaining({
        feedback: expect.stringContaining("Hard failures: [cta_drift]"),
      })
    );
  });

  it("keeps explicit user feedback when provided", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      status: "completed",
      regenerationSuggestion: "Hard failures: [cta_drift]. Fix cta_drift: CTA missing.",
      generationMode: "art_variation",
      variantIndex: 0,
      ctaText: "Shop now",
      format: "1:1",
    } as Awaited<ReturnType<typeof getDerivationById>>);
    mockCreateDerivation.mockResolvedValue({
      id: "child-id",
      status: "queued",
    } as Awaited<ReturnType<typeof createDerivation>>);
    mockInngestSend.mockResolvedValue({ ids: ["event-id"] });

    const res = await POST(requestWith({ feedback: "warmer palette only" }), {
      params: paramsWith("source-id"),
    });

    expect(res.status).toBe(201);
    expect(mockCreateDerivation).toHaveBeenCalledWith(
      expect.objectContaining({ feedback: "warmer palette only" })
    );
  });
});
