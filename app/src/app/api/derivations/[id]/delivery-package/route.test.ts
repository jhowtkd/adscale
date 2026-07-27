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
  createPackageChildIfAbsent: vi.fn(),
  getActivePackageChildren: vi.fn(),
  updateDerivationStatus: vi.fn(),
  deleteQueuedDerivation: vi.fn(),
  failQueuedDerivation: vi.fn(),
  touchQueuedDerivation: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  updateCampaign: vi.fn(),
  refreshCampaignStatus: vi.fn(),
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/server/billing/paywall", () => ({
  spend: vi.fn(() => Promise.resolve({ ok: true, creditsSpent: 5 })),
  spendOrApiError: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/billing/credits", () => ({
  refundCredits: vi.fn(() => Promise.resolve({ status: "refunded" })),
}));

vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: vi.fn(),
  trackUsage: vi.fn(),
}));

vi.mock("@/server/memory/brand-memory-dispatch", () => ({
  recordBrandMemoryEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() =>
    Promise.resolve((key: string) => key)
  ),
}));

import {
  getDerivationById,
  createPackageChildIfAbsent,
  failQueuedDerivation,
  getActivePackageChildren,
} from "@/server/repositories/derivation";
import { updateCampaign } from "@/server/repositories/campaign";
import { inngest } from "@/server/jobs/client";
import { refundCredits } from "@/server/billing/credits";
const mockGetDerivationById = vi.mocked(getDerivationById);
const mockCreatePackageChildIfAbsent = vi.mocked(createPackageChildIfAbsent);
const mockGetActivePackageChildren = vi.mocked(getActivePackageChildren);
const mockFailQueuedDerivation = vi.mocked(failQueuedDerivation);
const mockUpdateCampaign = vi.mocked(updateCampaign);
const mockInngestSend = vi.mocked(inngest.send);
const mockRefundCredits = vi.mocked(refundCredits);


function requestWith(body: unknown): Request {
  return new Request("http://localhost/api/derivations/source-id/delivery-package", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function paramsWith(id: string) {
  return Promise.resolve({ id });
}

describe("POST /api/derivations/[id]/delivery-package", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActivePackageChildren.mockResolvedValue([]);
    mockFailQueuedDerivation.mockImplementation(
      async (id) => ({ id, status: "failed" }) as never,
    );
    mockCreatePackageChildIfAbsent.mockImplementation(async (input) => ({
      created: true as const,
      child: {
        id: `child-${input.format}`,
        campaignId: input.campaignId,
        workspaceId: input.workspaceId,
        planId: input.planId ?? null,
        parentId: input.parentId ?? null,
        status: input.status ?? "queued",
        prompt: null,
        outputKey: null,
        format: input.format ?? null,
        generationMode: input.generationMode ?? null,
        variantIndex: input.variantIndex ?? null,
        ctaText: input.ctaText ?? null,
        cost: null,
        feedback: input.feedback ?? null,
        qualityScore: null,
        scoreStatus: "pending",
        scoreBreakdown: null,
        scoreIssues: null,
        regenerationSuggestion: null,
        isPreview: input.isPreview ?? false,
        scoredAt: null,
        qaStatus: "pending",
        qaChecklist: null,
        qaIssues: null,
        qaSuggestions: null,
        qaAnalyzedAt: null,
        inputPrompt: null,
        createdAt: new Date(),
        updatedAt: new Date("2026-07-27T12:00:00.000Z"),
      },
    }));
    mockInngestSend.mockResolvedValue({ ids: ["event-id"] } as never);
    mockRefundCredits.mockResolvedValue({ status: "refunded" } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects source without outputKey", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      status: "approved",
      outputKey: null,
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(requestWith({ formats: ["4:5"] }), {
      params: paramsWith("source-id"),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 when approved source has contamination hard failure", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      status: "approved",
      outputKey: "derivations/source.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      qualityVerdict: "acceptable",
      hardFailures: [
        {
          code: "copied_style_reference_facts",
          message: "Style reference facts copied into output",
        },
      ],
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(requestWith({ formats: ["4:5"] }), {
      params: paramsWith("source-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("derivationHardFailures");
    expect(mockCreatePackageChildIfAbsent).not.toHaveBeenCalled();
  });

  it("returns 409 when approved source has invalid qualityVerdict", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      status: "approved",
      outputKey: "derivations/source.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      qualityVerdict: "invalid",
      hardFailures: [{ code: "cta_drift", message: "CTA missing" }],
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(requestWith({ formats: ["4:5"] }), {
      params: paramsWith("source-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("derivationHardFailures");
    expect(mockCreatePackageChildIfAbsent).not.toHaveBeenCalled();
  });

  it("rejects unapproved source", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      status: "completed",
      outputKey: "derivations/source.png",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(requestWith({ formats: ["4:5"] }), {
      params: paramsWith("source-id"),
    });
    expect(res.status).toBe(409);
  });

  it("creates child derivations for selected generatable formats", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      planId: "plan-id",
      status: "approved",
      outputKey: "derivations/source.png",
      format: "1:1",
      ctaText: "Comprar agora",
      variantIndex: 0,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockCreatePackageChildIfAbsent.mockImplementation(async (input) => ({
      created: true as const,
      child: {
      id: `child-${input.format}`,
      campaignId: input.campaignId,
      workspaceId: input.workspaceId,
      planId: input.planId ?? null,
      parentId: input.parentId ?? null,
      status: input.status ?? "queued",
      prompt: null,
      outputKey: null,
      format: input.format ?? null,
      generationMode: input.generationMode ?? null,
      variantIndex: input.variantIndex ?? null,
      ctaText: input.ctaText ?? null,
      cost: null,
      feedback: input.feedback ?? null,
      qualityScore: null,
      scoreStatus: "pending",
      scoreBreakdown: null,
      scoreIssues: null,
      regenerationSuggestion: null,
      isPreview: input.isPreview ?? false,
      scoredAt: null,
      qaStatus: "pending",
      qaChecklist: null,
      qaIssues: null,
      qaSuggestions: null,
      qaAnalyzedAt: null,
      inputPrompt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      },
    }));

    const res = await POST(
      requestWith({ formats: ["1:1", "4:5", "9:16"] }),
      { params: paramsWith("source-id") }
    );
    const body = await res.json();

    expect(mockCreatePackageChildIfAbsent).toHaveBeenCalledTimes(2);
    expect(body.readyFormats).toEqual(["1:1"]);
    expect(body.queued).toEqual([
      expect.objectContaining({ format: "4:5" }),
      expect.objectContaining({ format: "9:16" }),
    ]);
  });

  it("skips active formats already queued or processing", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      planId: "plan-id",
      status: "approved",
      outputKey: "derivations/source.png",
      format: "1:1",
      ctaText: "Comprar agora",
      variantIndex: 0,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockGetActivePackageChildren.mockResolvedValue([
      { id: "existing-4:5", format: "4:5", status: "queued" },
    ] as Awaited<ReturnType<typeof getActivePackageChildren>>);

    const res = await POST(
      requestWith({ formats: ["1:1", "4:5", "9:16"] }),
      { params: paramsWith("source-id") }
    );
    const body = await res.json();

    expect(mockCreatePackageChildIfAbsent).toHaveBeenCalledTimes(1);
    expect(body.queued).toEqual([expect.objectContaining({ format: "9:16" })]);
    expect(body.skipped).toEqual(["4:5"]);
  });

  it("updates campaign status when children are queued", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      planId: "plan-id",
      status: "approved",
      outputKey: "derivations/source.png",
      format: "1:1",
      ctaText: "Comprar agora",
      variantIndex: 0,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockCreatePackageChildIfAbsent.mockImplementation(async (input) => ({
      created: true as const,
      child: {
      id: `child-${input.format}`,
      campaignId: input.campaignId,
      workspaceId: input.workspaceId,
      planId: input.planId ?? null,
      parentId: input.parentId ?? null,
      status: input.status ?? "queued",
      prompt: null,
      outputKey: null,
      format: input.format ?? null,
      generationMode: input.generationMode ?? null,
      variantIndex: input.variantIndex ?? null,
      ctaText: input.ctaText ?? null,
      cost: null,
      feedback: input.feedback ?? null,
      qualityScore: null,
      scoreStatus: "pending",
      scoreBreakdown: null,
      scoreIssues: null,
      regenerationSuggestion: null,
      isPreview: input.isPreview ?? false,
      scoredAt: null,
      qaStatus: "pending",
      qaChecklist: null,
      qaIssues: null,
      qaSuggestions: null,
      qaAnalyzedAt: null,
      inputPrompt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      },
    }));

    const res = await POST(
      requestWith({ formats: ["4:5", "9:16"] }),
      { params: paramsWith("source-id") }
    );

    expect(res.status).toBe(200);
    expect(mockUpdateCampaign).toHaveBeenCalledWith(
      "campaign-id",
      "workspace-1",
      { status: "generating" }
    );
  });

  it("does not update campaign status when all formats are ready", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      planId: "plan-id",
      status: "approved",
      outputKey: "derivations/source.png",
      format: "1:1",
      ctaText: "Comprar agora",
      variantIndex: 0,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await POST(
      requestWith({ formats: ["1:1"] }),
      { params: paramsWith("source-id") }
    );

    expect(res.status).toBe(200);
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
  });

  it("marks every dispatched child failed and refunds when batch dispatch fails", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "source-id",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      planId: "plan-id",
      status: "approved",
      outputKey: "derivations/source.png",
      format: "1:1",
      ctaText: "Comprar agora",
      variantIndex: 0,
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockInngestSend.mockRejectedValue(new Error("worker unavailable"));

    const res = await POST(
      requestWith({ formats: ["4:5", "9:16"] }),
      { params: paramsWith("source-id") }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockFailQueuedDerivation).toHaveBeenCalledTimes(2);
    expect(body.failed.map((item: { format: string }) => item.format).sort()).toEqual([
      "4:5",
      "9:16",
    ]);
    expect(body.queued).toEqual([]);
    expect(mockRefundCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        action: "delivery_package_child",
        amount: 10,
        idempotencyKey: expect.stringMatching(
          /^delivery-package:source-id:4:5,9:16:dispatch-refund$/,
        ),
      }),
    );
    expect(mockUpdateCampaign).not.toHaveBeenCalledWith(
      "campaign-id",
      "workspace-1",
      { status: "generating" },
    );
  });
});
