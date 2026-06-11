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

vi.mock("@/server/repositories/feedback", () => ({
  getLatestOpenFeedbackReportForDerivation: vi.fn(),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/server/billing/gates", () => ({
  spendCreditsOrApiError: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/memory/campaign-memory-context", () => ({
  recordCampaignMemoryEntry: vi.fn(() => Promise.resolve({ schemaVersion: 1, entries: [] })),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getDerivationById,
  createDerivation,
  getActiveChildrenByParent,
} from "@/server/repositories/derivation";
import { getLatestOpenFeedbackReportForDerivation } from "@/server/repositories/feedback";
import { updateCampaign } from "@/server/repositories/campaign";
import { inngest } from "@/server/jobs/client";
import { FACTUAL_SOURCE_RULES } from "@/server/ai/creative-contract";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockCreateDerivation = vi.mocked(createDerivation);
const mockGetActiveChildrenByParent = vi.mocked(getActiveChildrenByParent);
const mockGetLatestOpenFeedbackReportForDerivation = vi.mocked(
  getLatestOpenFeedbackReportForDerivation
);
const mockUpdateCampaign = vi.mocked(updateCampaign);
const mockInngestSend = vi.mocked(inngest.send);

const parentContract = {
  generationMode: "art_variation" as const,
  targetFormat: "4:5",
  ctaSemantics: { kind: "explicit" as const, text: "Shop Now" },
  baseAssetId: "asset-base",
  styleAssetId: null,
  client: "Acme Corp",
  product: "Premium Widget",
  offer: "20% off",
  constraints: null,
  sourcePackage: "campaign_asset" as const,
  factualSourceRules: FACTUAL_SOURCE_RULES,
};

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
    mockGetLatestOpenFeedbackReportForDerivation.mockResolvedValue(null);
    mockCreateDerivation.mockResolvedValue({
      id: "child-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      status: "queued",
    } as Awaited<ReturnType<typeof createDerivation>>);
    mockInngestSend.mockResolvedValue({ ids: ["event-id"] });
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
      hardFailures: [{ code: "cta_drift", message: "CTA missing" }],
      creativeContract: parentContract,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(requestWith({ feedback: "try a warmer style" }), {
      params: paramsWith("source-id"),
    });

    expect(res.status).toBe(201);
    expect(mockCreateDerivation).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "source-id",
        status: "queued",
        feedback: expect.stringContaining("Additional notes: try a warmer style"),
      })
    );
  });

  it("uses unified brief from parent quality fields when feedback is omitted", async () => {
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
      hardFailures: [{ code: "cta_drift", message: "CTA missing" }],
      scoreIssues: ["Low contrast on headline"],
      qaChecklist: {
        legibility: { status: "failed", note: "Text too small" },
        ctaOffer: { status: "passed", note: "OK" },
        informationPreservation: { status: "passed", note: "OK" },
        briefMatch: { status: "passed", note: "OK" },
        formatFit: { status: "passed", note: "OK" },
        creativeRisk: { status: "passed", note: "OK" },
      },
      regenerationSuggestion: "Legacy suggestion text",
      creativeContract: parentContract,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(requestWith({}), { params: paramsWith("source-id") });

    expect(res.status).toBe(201);
    expect(mockCreateDerivation).toHaveBeenCalledWith(
      expect.objectContaining({
        feedback: expect.stringMatching(/Hard failures:|Score issues:|QA issues:/),
      })
    );
  });

  it("reconstructs brief from hardFailures when suggestion empty", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      status: "completed",
      generationMode: "art_variation",
      ctaText: "Shop Now",
      format: "4:5",
      hardFailures: [{ code: "wrong_brand", message: "Logo mismatch." }],
      regenerationSuggestion: null,
      creativeContract: parentContract,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(requestWith({}), { params: paramsWith("source-id") });

    expect(res.status).toBe(201);
    expect(mockCreateDerivation).toHaveBeenCalledWith(
      expect.objectContaining({
        feedback: expect.stringMatching(/wrong_brand.*Preserve the exact CTA/s),
      })
    );
  });

  it("keeps explicit user feedback merged with machine brief", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      status: "completed",
      hardFailures: [{ code: "cta_drift", message: "CTA missing" }],
      generationMode: "art_variation",
      ctaText: "Shop now",
      format: "1:1",
      creativeContract: parentContract,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(requestWith({ feedback: "warmer palette only" }), {
      params: paramsWith("source-id"),
    });

    expect(res.status).toBe(201);
    const createArg = mockCreateDerivation.mock.calls[0]?.[0];
    expect(createArg?.feedback).toContain("Hard failures:");
    expect(createArg?.feedback).toContain("Additional notes: warmer palette only");
  });

  it("includes feedback category context when open report exists", async () => {
    mockGetLatestOpenFeedbackReportForDerivation.mockResolvedValue({
      category: "generation",
    });
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      status: "completed",
      hardFailures: [{ code: "cta_drift", message: "CTA missing" }],
      generationMode: "art_variation",
      ctaText: "Shop now",
      format: "1:1",
      creativeContract: parentContract,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    await POST(requestWith({}), { params: paramsWith("source-id") });

    const createArg = mockCreateDerivation.mock.calls[0]?.[0];
    expect(createArg?.feedback).toContain("Feedback context (generation)");
    expect(createArg?.feedback).not.toContain("secret user message");
  });

  it("persists regenerationCorrectionBrief on child", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      status: "completed",
      hardFailures: [{ code: "cta_drift", message: "CTA missing" }],
      generationMode: "art_variation",
      ctaText: "Shop now",
      format: "1:1",
      creativeContract: parentContract,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    await POST(requestWith({}), { params: paramsWith("source-id") });

    expect(mockCreateDerivation).toHaveBeenCalledWith(
      expect.objectContaining({
        regenerationCorrectionBrief: expect.objectContaining({
          sources: expect.arrayContaining(["hard_failures"]),
          contractSnapshot: parentContract,
          promptFeedback: expect.any(String),
        }),
      })
    );
  });

  it("inherits parent creativeContract on child", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      status: "completed",
      hardFailures: [{ code: "cta_drift", message: "CTA missing" }],
      generationMode: "art_variation",
      ctaText: "Shop now",
      format: "1:1",
      creativeContract: parentContract,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    await POST(requestWith({}), { params: paramsWith("source-id") });

    expect(mockCreateDerivation).toHaveBeenCalledWith(
      expect.objectContaining({
        creativeContract: parentContract,
      })
    );
    expect(mockUpdateCampaign).toHaveBeenCalledWith(
      "campaign-id",
      "workspace-1",
      { status: "generating" }
    );
  });
});
