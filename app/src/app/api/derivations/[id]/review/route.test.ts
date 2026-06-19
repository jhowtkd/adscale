import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PATCH } from "./route";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
  updateDerivationStatus: vi.fn(),
}));

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(() =>
    Promise.resolve({
      id: "campaign-id",
      name: "Campaign",
      clientProfileId: "profile-id",
    })
  ),
  refreshCampaignStatus: vi.fn(),
}));

vi.mock("@/server/memory/brand-memory-dispatch", () => ({
  recordBrandMemoryEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/server/memory/campaign-memory-context", () => ({
  recordCampaignMemoryEntry: vi.fn(() => Promise.resolve({ schemaVersion: 1, entries: [] })),
}));

vi.mock("@/server/beta-analytics/record", () => ({
  recordBetaAnalyticsEvent: vi.fn(() => Promise.resolve({ id: "event-1" })),
}));

vi.mock("@/server/output-learning/output-decision-recorder", () => ({
  recordOutputDecisionEvidenceBestEffort: vi.fn(() => Promise.resolve({ id: "evidence-1" })),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import {
  getDerivationById,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { recordOutputDecisionEvidenceBestEffort } from "@/server/output-learning/output-decision-recorder";

const mockGetDerivationById = vi.mocked(getDerivationById);
const mockUpdateDerivationStatus = vi.mocked(updateDerivationStatus);
const mockRecordBetaAnalyticsEvent = vi.mocked(recordBetaAnalyticsEvent);
const mockRecordOutputDecisionEvidenceBestEffort = vi.mocked(
  recordOutputDecisionEvidenceBestEffort
);

const VALID_SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

async function flushAnalytics() {
  await new Promise((resolve) => setImmediate(resolve));
}

function requestWith(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/derivations/derivation-id/review", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function paramsWith(id: string) {
  return Promise.resolve({ id });
}

describe("PATCH /api/derivations/[id]/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 409 when approving derivation with invalid qualityVerdict", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "completed",
      qualityVerdict: "invalid",
      hardFailures: [
        { code: "cta_drift", message: "CTA replaced" },
      ],
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await PATCH(requestWith({ status: "approved" }), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("derivationHardFailures");
    expect(body.details).toMatchObject({
      qualityVerdict: "invalid",
      hardFailures: [{ code: "cta_drift", message: "CTA replaced" }],
    });
    expect(mockUpdateDerivationStatus).not.toHaveBeenCalled();
  });

  it("approves derivation when qualityVerdict is improvable", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "completed",
      qualityVerdict: "improvable",
      hardFailures: [],
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockUpdateDerivationStatus.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      format: "4:5",
      generationMode: "art_variation",
      ctaText: "Buy",
      qualityScore: 75,
      scoreStatus: "analyzed",
      scoreIssues: null,
      regenerationSuggestion: null,
      qaStatus: "passed",
      qaIssues: null,
      feedback: null,
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof updateDerivationStatus>>);

    const res = await PATCH(requestWith({ status: "approved" }), {
      params: paramsWith("derivation-id"),
    });
    await flushAnalytics();

    expect(res.status).toBe(200);
    expect(mockUpdateDerivationStatus).toHaveBeenCalledWith(
      "derivation-id",
      "workspace-1",
      "approved"
    );
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "mission_completed",
        source: "server",
        userId: "user-1",
        workspaceId: "workspace-1",
        campaignId: "campaign-id",
        derivationId: "derivation-id",
        properties: expect.objectContaining({
          missionKey: "review",
          stage: "review",
        }),
      })
    );
    expect(mockRecordOutputDecisionEvidenceBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "approved",
        workspaceId: "workspace-1",
        userId: "user-1",
        campaignId: "campaign-id",
        derivationId: "derivation-id",
        source: "derivations.review.PATCH",
      })
    );
  });

  it("forwards sessionId from x-beta-session-id on approve", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "completed",
      qualityVerdict: "improvable",
      hardFailures: [],
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockUpdateDerivationStatus.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      format: "4:5",
      generationMode: "art_variation",
      ctaText: "Buy",
      qualityScore: 75,
      scoreStatus: "analyzed",
      scoreIssues: null,
      regenerationSuggestion: null,
      qaStatus: "passed",
      qaIssues: null,
      feedback: null,
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof updateDerivationStatus>>);

    const res = await PATCH(
      requestWith({ status: "approved" }, { "x-beta-session-id": VALID_SESSION_ID }),
      { params: paramsWith("derivation-id") }
    );
    await flushAnalytics();

    expect(res.status).toBe(200);
    expect(mockRecordBetaAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: VALID_SESSION_ID,
      })
    );
  });

  it("rejects without quality gate check", async () => {
    mockUpdateDerivationStatus.mockResolvedValue({
      id: "derivation-id",
      status: "rejected",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      format: "4:5",
      generationMode: "art_variation",
      ctaText: "Buy",
      qualityScore: 75,
      scoreStatus: "analyzed",
      scoreIssues: null,
      regenerationSuggestion: null,
      qaStatus: "passed",
      qaIssues: null,
      feedback: null,
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof updateDerivationStatus>>);

    const res = await PATCH(requestWith({ status: "rejected" }), {
      params: paramsWith("derivation-id"),
    });
    await flushAnalytics();

    expect(res.status).toBe(200);
    expect(mockGetDerivationById).not.toHaveBeenCalled();
    expect(mockRecordBetaAnalyticsEvent).not.toHaveBeenCalled();
    expect(mockRecordOutputDecisionEvidenceBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rejected",
        derivationId: "derivation-id",
      })
    );
  });

  it("still returns 200 when evidence recording fails", async () => {
    mockUpdateDerivationStatus.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      format: "4:5",
      generationMode: "art_variation",
      ctaText: "Buy",
      qualityScore: 75,
      scoreStatus: "analyzed",
      scoreIssues: null,
      regenerationSuggestion: null,
      qaStatus: "passed",
      qaIssues: null,
      feedback: null,
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof updateDerivationStatus>>);

    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "completed",
      qualityVerdict: "improvable",
      hardFailures: [],
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockRecordOutputDecisionEvidenceBestEffort.mockResolvedValue(null);

    const res = await PATCH(requestWith({ status: "approved" }), {
      params: paramsWith("derivation-id"),
    });

    expect(res.status).toBe(200);
  });

  it("returns 409 when approving derivation with exportStatus bloqueado", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "completed",
      qualityVerdict: "improvable",
      hardFailures: [],
      exportStatus: {
        value: "bloqueado",
        issues: [{ code: "wrong_brand", message: "Brand mismatch", severity: "blocker" }],
        setupIssues: [],
        evaluatedAt: "2026-06-19T12:00:00.000Z",
      },
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await PATCH(requestWith({ status: "approved" }), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.details).toMatchObject({
      qualityVerdict: "improvable",
      hardFailures: [],
      exportStatus: expect.objectContaining({ value: "bloqueado" }),
    });
    expect(mockUpdateDerivationStatus).not.toHaveBeenCalled();
  });

  it("returns 409 when approving derivation with olharVerdict confusa", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "completed",
      qualityVerdict: "improvable",
      hardFailures: [],
      olharVerdict: {
        value: "confusa",
        axes: { figura: 0, gestalt: 0, voz: 1, convite: 0 },
        whatWorks: [],
        whatBlocks: ["No focal point"],
        directionNote: "Composition lacks a dominant idea.",
        source: "quality_gate",
        evaluatedAt: "2026-06-19T12:00:00.000Z",
      },
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await PATCH(requestWith({ status: "approved" }), {
      params: paramsWith("derivation-id"),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.details).toMatchObject({
      olharVerdict: expect.objectContaining({ value: "confusa" }),
    });
    expect(mockUpdateDerivationStatus).not.toHaveBeenCalled();
  });

  it("returns 400 when blocked approval has missing override reason", async () => {
    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "completed",
      qualityVerdict: "improvable",
      hardFailures: [],
      olharVerdict: {
        value: "sem_opiniao",
        axes: { figura: 0, gestalt: 0, voz: 0, convite: 0 },
        whatWorks: [],
        whatBlocks: ["No opinion yet"],
        directionNote: "Needs direction.",
        source: "quality_gate",
        evaluatedAt: "2026-06-19T12:00:00.000Z",
      },
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    const res = await PATCH(
      requestWith({ status: "approved", overrideReason: "short" }),
      { params: paramsWith("derivation-id") }
    );

    expect(res.status).toBe(400);
    expect(mockUpdateDerivationStatus).not.toHaveBeenCalled();
  });

  it("records override audit context and keeps verdict payload on blocked approval", async () => {
    const olharVerdict = {
      value: "confusa",
      axes: { figura: 0, gestalt: 0, voz: 1, convite: 0 },
      whatWorks: [],
      whatBlocks: ["No focal point"],
      directionNote: "Composition lacks a dominant idea.",
      source: "quality_gate",
      evaluatedAt: "2026-06-19T12:00:00.000Z",
    };

    mockGetDerivationById.mockResolvedValue({
      id: "derivation-id",
      status: "completed",
      qualityVerdict: "improvable",
      hardFailures: [],
      olharVerdict,
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof getDerivationById>>);

    mockUpdateDerivationStatus.mockResolvedValue({
      id: "derivation-id",
      status: "approved",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      format: "4:5",
      generationMode: "art_variation",
      ctaText: "Buy",
      qualityScore: 75,
      scoreStatus: "analyzed",
      scoreIssues: null,
      regenerationSuggestion: null,
      qaStatus: "passed",
      qaIssues: null,
      feedback: null,
      olharVerdict,
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof updateDerivationStatus>>);

    const res = await PATCH(
      requestWith({
        status: "approved",
        overrideReason: "Client explicitly accepted weak composition for this test.",
      }),
      { params: paramsWith("derivation-id") }
    );
    await flushAnalytics();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.derivation.olharVerdict).toMatchObject({ value: "confusa" });
    expect(mockRecordOutputDecisionEvidenceBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "approved",
        snapshotExtras: expect.objectContaining({
          overrideApproved: true,
          olharVerdict: { value: "confusa" },
          reason: expect.objectContaining({
            code: "override_approval",
            source: "review_override",
            text: "Client explicitly accepted weak composition for this test.",
          }),
        }),
      })
    );
  });

  it("returns 400 when nao_entra decision lacks direction reason", async () => {
    mockUpdateDerivationStatus.mockResolvedValue({
      id: "derivation-id",
      status: "rejected",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      format: "4:5",
      generationMode: "art_variation",
      ctaText: "Buy",
      qualityScore: 75,
      scoreStatus: "analyzed",
      scoreIssues: null,
      regenerationSuggestion: null,
      qaStatus: "passed",
      qaIssues: null,
      feedback: null,
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof updateDerivationStatus>>);

    const res = await PATCH(
      requestWith({ decision: "nao_entra" }),
      { params: paramsWith("derivation-id") }
    );

    expect(res.status).toBe(400);
    expect(mockUpdateDerivationStatus).not.toHaveBeenCalled();
  });

  it("records direction reason for structured nao_entra rejection", async () => {
    mockUpdateDerivationStatus.mockResolvedValue({
      id: "derivation-id",
      status: "rejected",
      campaignId: "campaign-id",
      workspaceId: "workspace-1",
      format: "4:5",
      generationMode: "art_variation",
      ctaText: "Buy",
      qualityScore: 75,
      scoreStatus: "analyzed",
      scoreIssues: null,
      regenerationSuggestion: null,
      qaStatus: "passed",
      qaIssues: null,
      feedback: null,
      updatedAt: new Date(),
    } as Awaited<ReturnType<typeof updateDerivationStatus>>);

    const res = await PATCH(
      requestWith({
        decision: "nao_entra",
        directionReason: "Composition does not match campaign voice.",
      }),
      { params: paramsWith("derivation-id") }
    );

    expect(res.status).toBe(200);
    expect(mockRecordOutputDecisionEvidenceBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rejected",
        snapshotExtras: expect.objectContaining({
          reason: {
            code: "nao_entra",
            text: "Composition does not match campaign voice.",
            source: "direction_reason",
          },
        }),
      })
    );
  });
});
