import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { FeedbackValidationError } from "@/server/feedback/validate-refs";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/human-quality/service", () => ({
  HumanQualityServiceError: class HumanQualityServiceError extends Error {
    constructor(
      message: string,
      public code: string
    ) {
      super(message);
      this.name = "HumanQualityServiceError";
    }
  },
  MAX_CORPUS_BATCH_SIZE: 25,
  selectDerivationForCorpus: vi.fn(),
  batchSelectDerivationsForCorpus: vi.fn(),
  listPendingCorpusQueue: vi.fn(),
  getCorpusQueueProgress: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([
          { id: "550e8400-e29b-41d4-a716-446655440004", outputKey: "derivations/preview.png" },
        ]),
      })),
    })),
  },
}));

vi.mock("@/server/storage/r2", () => ({
  getPresignedDownloadUrl: vi.fn(() => Promise.resolve("https://signed.example/preview.png")),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  HumanQualityServiceError,
  batchSelectDerivationsForCorpus,
  getCorpusQueueProgress,
  listPendingCorpusQueue,
  selectDerivationForCorpus,
} from "@/server/human-quality/service";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440003";
const DERIVATION_ID = "550e8400-e29b-41d4-a716-446655440004";
const ITEM_ID = "550e8400-e29b-41d4-a716-446655440001";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockSelect = vi.mocked(selectDerivationForCorpus);
const mockBatchSelect = vi.mocked(batchSelectDerivationsForCorpus);
const mockList = vi.mocked(listPendingCorpusQueue);
const mockProgress = vi.mocked(getCorpusQueueProgress);

const baseItem = {
  id: ITEM_ID,
  workspaceId: WORKSPACE_ID,
  clientProfileId: "550e8400-e29b-41d4-a716-446655440010",
  campaignId: CAMPAIGN_ID,
  derivationId: DERIVATION_ID,
  generationMode: "art_variation",
  format: "1:1",
  cohort: "baseline",
  corpusVersion: 1,
  artifactRef: { derivationId: DERIVATION_ID },
  qualitySnapshot: { qualityScore: 72 },
  selectedByUserId: "owner-1",
  selectedAt: new Date(),
  status: "pending" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("/api/feedback/human-quality-corpus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "owner-1", email: "owner@test.com" },
    });
  });

  it("POST selects derivation into corpus for platform owner", async () => {
    mockSelect.mockResolvedValue(baseItem);

    const res = await POST(
      new Request("http://localhost/api/feedback/human-quality-corpus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: WORKSPACE_ID,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
          cohort: "baseline",
        }),
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.id).toBe(ITEM_ID);
    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        campaignId: CAMPAIGN_ID,
        derivationId: DERIVATION_ID,
        selectedByUserId: "owner-1",
      })
    );
  });

  it("GET lists pending corpus queue items", async () => {
    mockList.mockResolvedValue([baseItem]);

    const res = await GET(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus?workspaceId=${WORKSPACE_ID}&limit=20`
      )
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(mockList).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, limit: 20 });
    expect(body.progress).toBeUndefined();
  });

  it("GET includes queue progress when includeProgress=true", async () => {
    mockList.mockResolvedValue([baseItem]);
    mockProgress.mockResolvedValue({
      workspaceId: WORKSPACE_ID,
      totalPending: 1,
      totalEvaluated: 4,
      byCohort: { baseline: { pending: 1, evaluated: 4 } },
      byGenerationMode: { art_variation: { pending: 1, evaluated: 4 } },
      byFormat: { "1:1": { pending: 1, evaluated: 4 } },
      latestSelectedAt: "2026-06-17T10:00:00.000Z",
      latestEvaluatedAt: "2026-06-17T11:00:00.000Z",
    });

    const res = await GET(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus?workspaceId=${WORKSPACE_ID}&includeProgress=true`
      )
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.progress.totalPending).toBe(1);
    expect(body.progress.totalEvaluated).toBe(4);
    expect(mockProgress).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID });
  });

  it("GET requires workspaceId", async () => {
    const res = await GET(new Request("http://localhost/api/feedback/human-quality-corpus"));

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 403 when not platform owner", async () => {
    const { WorkspaceAuthError, AUTH_ERROR_CODES } = await import("@/server/auth/errors");
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await GET(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus?workspaceId=${WORKSPACE_ID}`
      )
    );

    expect(res.status).toBe(403);
  });

  it("rejects invalid selection payloads", async () => {
    const res = await POST(
      new Request("http://localhost/api/feedback/human-quality-corpus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: WORKSPACE_ID }),
      })
    );

    expect(res.status).toBe(400);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("rejects cross-workspace derivation references", async () => {
    mockSelect.mockRejectedValue(
      new FeedbackValidationError("Derivation not found in workspace", "invalid_derivation")
    );

    const res = await POST(
      new Request("http://localhost/api/feedback/human-quality-corpus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: WORKSPACE_ID,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
        }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate corpus item", async () => {
    mockSelect.mockRejectedValue(
      new HumanQualityServiceError(
        "Corpus item already exists for derivation version",
        "duplicate_corpus_item"
      )
    );

    const res = await POST(
      new Request("http://localhost/api/feedback/human-quality-corpus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: WORKSPACE_ID,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
        }),
      })
    );

    expect(res.status).toBe(409);
  });

  it("rejects forbidden raw payload fields", async () => {
    mockSelect.mockRejectedValue(
      new HumanQualityServiceError(
        "forbidden corpus payload keys: prompt",
        "forbidden_corpus_payload"
      )
    );

    const res = await POST(
      new Request("http://localhost/api/feedback/human-quality-corpus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: WORKSPACE_ID,
          campaignId: CAMPAIGN_ID,
          derivationId: DERIVATION_ID,
          qualitySnapshot: { prompt: "secret" },
        }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("POST accepts controlled batch selection payloads", async () => {
    mockBatchSelect.mockResolvedValue({
      results: [
        { derivationId: DERIVATION_ID, outcome: "selected", item: baseItem },
        { derivationId: "550e8400-e29b-41d4-a716-446655440099", outcome: "duplicate" },
      ],
      summary: {
        total: 2,
        selected: 1,
        duplicate: 1,
        invalid: 0,
        missingProfile: 0,
        unsafePayload: 0,
      },
    });

    const res = await POST(
      new Request("http://localhost/api/feedback/human-quality-corpus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: WORKSPACE_ID,
          campaignId: CAMPAIGN_ID,
          derivationIds: [DERIVATION_ID, "550e8400-e29b-41d4-a716-446655440099"],
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.selected).toBe(1);
    expect(mockBatchSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        campaignId: CAMPAIGN_ID,
        selectedByUserId: "owner-1",
      })
    );
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("rejects batch payloads above the size cap", async () => {
    const derivationIds = Array.from({ length: 26 }, (_, index) =>
      `550e8400-e29b-41d4-a716-44665544${String(index).padStart(4, "0")}`
    );

    const res = await POST(
      new Request("http://localhost/api/feedback/human-quality-corpus", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: WORKSPACE_ID,
          campaignId: CAMPAIGN_ID,
          derivationIds,
        }),
      })
    );

    expect(res.status).toBe(400);
    expect(mockBatchSelect).not.toHaveBeenCalled();
  });
});
