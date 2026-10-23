import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { GET, POST } from "./route";

vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

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

vi.mock("@/server/repositories/campaign", () => ({
  getCampaignById: vi.fn(),
  refreshCampaignStatus: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@/server/repositories/plan", () => ({
  getPlanByCampaign: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/server/repositories/derivation", () => ({
  createDerivation: vi.fn(),
  failStaleActiveDerivations: vi.fn(),
  getDerivationsByCampaign: vi.fn(),
  getCampaignDerivationPage: vi.fn(),
  getCampaignDerivationsByIds: vi.fn(),
  getCampaignDerivationSummaryRows: vi.fn(),
  deleteQueuedDerivation: vi.fn(),
  failQueuedDerivation: vi.fn(),
  touchQueuedDerivation: vi.fn(),
  getUsageByIdempotencyKey: vi.fn(),
}));

vi.mock("@/server/repositories/asset", () => ({
  getAssetsByCampaign: vi.fn(),
}));

vi.mock("@/server/storage", () => ({
  objectStorage: { signedDownloadUrl: vi.fn(async (key: string) => `https://signed.test/${key}`) },
}));

vi.mock("@/server/jobs/client", () => ({
  inngest: { send: vi.fn() },
}));

const freePlan = vi.hoisted(() => ({ find: vi.fn(async (): Promise<{ accountId: string } | null> => null) }));
vi.mock("@/server/equipe/module/free-plan", () => ({ findFreePlanAccount: (...args: unknown[]) => (freePlan.find as (...a: unknown[]) => unknown)(...args) }));
vi.mock("@/server/billing/credits", () => ({
  refundCredits: vi.fn(),
  canSpend: vi.fn(),
  recordUsage: vi.fn(),
}));

vi.mock("@/server/generation/settlement", () => ({
  startGenerationSettlement: vi.fn(),
}));

vi.mock("@/server/generation/canonical/charge", () => ({
  chargeForGenerationBatch: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { db } from "@/server/db";
import {
  getCampaignById,
  updateCampaign,
} from "@/server/repositories/campaign";
import {
  createDerivation,
  failStaleActiveDerivations,
} from "@/server/repositories/derivation";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { objectStorage } from "@/server/storage";
import {
  getCampaignDerivationPage,
  getCampaignDerivationsByIds,
  getCampaignDerivationSummaryRows,
  getDerivationsByCampaign,
} from "@/server/repositories/derivation";
import { refreshCampaignStatus } from "@/server/repositories/campaign";
import { decodeKeysetCursor, encodeKeysetCursor } from "@/lib/keyset-page";
import { inngest } from "@/server/jobs/client";
import { refundCredits } from "@/server/billing/credits";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { chargeForGenerationBatch } from "@/server/generation/canonical/charge";

const mockDbSelect = vi.mocked(db.select);
const mockGetCampaignById = vi.mocked(getCampaignById);
const mockUpdateCampaign = vi.mocked(updateCampaign);
const mockCreateDerivation = vi.mocked(createDerivation);
const mockFailStaleActiveDerivations = vi.mocked(failStaleActiveDerivations);
const mockGetAssetsByCampaign = vi.mocked(getAssetsByCampaign);
const mockInngestSend = vi.mocked(inngest.send);
const mockRefundCredits = vi.mocked(refundCredits);
const mockStartSettlement = vi.mocked(startGenerationSettlement);
const mockChargeForGenerationBatch = vi.mocked(chargeForGenerationBatch);

const validOutputLearningApplication = {
  schemaVersion: 1 as const,
  applied: true,
  resolution: "recorded" as const,
  traceId: "ol-trace-batch",
  recommendationId: "rec-batch",
  primaryVariableKey: "cta_tone",
  algorithmVersion: "1.0.0",
  safetyVersion: "1.0.0",
  learningsSource: "postgres" as const,
};

function makeParams(id: string) {
  return Promise.resolve({ id });
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/campaigns/camp-1/derivations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockDbNoQueued() {
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([]),
      }),
    }),
  } as unknown as ReturnType<typeof db.select>);
}

describe("POST /api/campaigns/[id]/derivations outputLearningApplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbNoQueued();
    mockFailStaleActiveDerivations.mockResolvedValue([]);
    mockGetCampaignById.mockResolvedValue({
      id: "camp-1",
      generationMode: "art_variation",
      ctaVariants: ["Buy now", "Shop today"],
      creativeLevel: "balanced",
    } as Awaited<ReturnType<typeof getCampaignById>>);
    mockGetAssetsByCampaign.mockResolvedValue([
      {
        id: "asset-1",
        width: 1024,
        height: 1024,
      },
    ] as Awaited<ReturnType<typeof getAssetsByCampaign>>);
    let derivationCounter = 0;
    mockCreateDerivation.mockImplementation(async () => {
      derivationCounter += 1;
      return {
        id: `derivation-${derivationCounter}`,
        campaignId: "camp-1",
        workspaceId: "workspace-1",
        status: "queued",
      } as Awaited<ReturnType<typeof createDerivation>>;
    });
    mockInngestSend.mockResolvedValue({ ids: ["event-id"] });
    mockUpdateCampaign.mockResolvedValue(undefined);
    mockRefundCredits.mockResolvedValue({ status: "refunded" });
    mockChargeForGenerationBatch.mockResolvedValue({
      ok: true,
      creditsSpent: 10,
    });
    mockStartSettlement.mockImplementation(async (adapter) => {
      const reservation = await adapter.reserve();
      const charge = await adapter.charge(reservation);
      if (!charge.ok) {
        return { ok: false, error: { code: "credit_blocked", reason: charge.reason } };
      }
      await adapter.dispatch(reservation);
      await adapter.completeDispatch(reservation);
      return { ok: true, value: reservation.value };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delegates batch charge, reservation, and dispatch to Generation Settlement", async () => {
    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(201);
    expect(mockStartSettlement).toHaveBeenCalledTimes(1);
    expect(mockChargeForGenerationBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "batch",
        origin: "campaign",
        surface: "campaign",
        unitCount: 2,
        unitChargeAmount: 50,
        chargeAmount: 100,
        parentId: "camp-1",
      }),
      expect.objectContaining({
        action: "image_derivation",
        metadata: expect.objectContaining({
          campaignId: "camp-1",
          operation_key: "batch",
          estimateCredits: 100,
        }),
      })
    );
  });

  it("persists identical outputLearningApplication on every batch job", async () => {
    const res = await POST(postRequest({ outputLearningApplication: validOutputLearningApplication }), {
      params: makeParams("camp-1"),
    });

    expect(res.status).toBe(201);
    expect(mockCreateDerivation).toHaveBeenCalledTimes(2);
    for (const call of mockCreateDerivation.mock.calls) {
      expect(call[0].outputLearningApplication).toEqual(validOutputLearningApplication);
    }
  });

  it("stores null outputLearningApplication when field is omitted", async () => {
    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(201);
    expect(mockCreateDerivation).toHaveBeenCalled();
    expect(mockCreateDerivation.mock.calls[0][0].outputLearningApplication).toBeNull();
  });

  it("queues an art variation from scratch when the campaign has no base asset", async () => {
    mockGetAssetsByCampaign.mockResolvedValue([]);

    const res = await POST(postRequest({ preview: true }), {
      params: makeParams("camp-1"),
    });

    expect(res.status).toBe(201);
    expect(mockCreateDerivation).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "camp-1",
        format: "1:1",
        isPreview: true,
      })
    );
    expect(mockInngestSend).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for invalid outputLearningApplication body", async () => {
    const res = await POST(
      postRequest({
        outputLearningApplication: {
          ...validOutputLearningApplication,
          traceId: "invalid-trace",
        },
      }),
      { params: makeParams("camp-1") }
    );

    expect(res.status).toBe(400);
    expect(mockCreateDerivation).not.toHaveBeenCalled();
  });

  it("rejects learningsSource other than postgres", async () => {
    const res = await POST(
      postRequest({
        outputLearningApplication: {
          ...validOutputLearningApplication,
          learningsSource: "mem0",
        },
      }),
      { params: makeParams("camp-1") }
    );

    expect(res.status).toBe(400);
    expect(mockCreateDerivation).not.toHaveBeenCalled();
  });

  it("returns 402 when settlement reports credit_blocked", async () => {
    mockStartSettlement.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "credit_blocked",
        reason: "insufficient_credits",
        details: { reason: "insufficient_credits" },
      },
    });

    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(402);
    const payload = await (res as NextResponse).json();
    expect(payload).toMatchObject({
      code: "creditBlocked",
      details: { reason: "insufficient_credits" },
    });
  });

  it("returns 201 with failed rows when settlement reports dispatch_failed", async () => {
    mockStartSettlement.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "dispatch_failed",
        value: {
          derivations: [
            { id: "derivation-1", campaignId: "camp-1", workspaceId: "workspace-1" },
          ],
        },
        compensated: true,
      },
    });

    const res = await POST(postRequest({}), { params: makeParams("camp-1") });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.derivations).toEqual([
      { id: "derivation-1", campaignId: "camp-1", workspaceId: "workspace-1" },
    ]);
    expect(mockUpdateCampaign).toHaveBeenCalledWith("camp-1", "workspace-1", {
      status: "failed",
    });
  });
});

describe("POST /api/campaigns/[id]/derivations: the free plan's refusal (ticket 11, part 2)", () => {
  const FREE_PAYLOAD = {
    reason: "free_plan",
    recommendedAction: "plan_request",
    accountId: "acc-free",
    amount: 10,
    balance: 500,
    analytics: { reasonCode: "free_plan", estimateCredits: 10 },
  };

  beforeEach(() => {
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
  });

  it("settlement's free_plan payload: 402 free_plan with the plan request and the account (not creditBlocked)", async () => {
    mockStartSettlement.mockResolvedValueOnce({
      ok: false,
      error: { code: "credit_blocked", details: FREE_PAYLOAD },
    } as never);

    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(402);
    const body = await (res as NextResponse).json();
    expect(body.code).toBe("free_plan");
    expect(body.details).toMatchObject({ reason: "free_plan", recommendedAction: "plan_request", accountId: "acc-free" });
    // Only the route's entry guard asked the rule (it said classic): the payload itself is not re-derived.
    expect(freePlan.find).toHaveBeenCalledTimes(1);
  });

  it("on the free plan the entry guard refuses first: 402 free_plan, nothing reserved, charged or dispatched", async () => {
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });
    mockStartSettlement.mockClear();
    mockCreateDerivation.mockClear();
    mockInngestSend.mockClear();

    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(402);
    const body = await (res as NextResponse).json();
    expect(body.code).toBe("free_plan");
    expect(body.details).toMatchObject({ recommendedAction: "plan_request", accountId: "acc-free" });
    expect(mockStartSettlement).not.toHaveBeenCalled();
    expect(mockCreateDerivation).not.toHaveBeenCalled();
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("a spend result wrapping the payload is the same", async () => {
    mockStartSettlement.mockResolvedValueOnce({
      ok: false,
      error: { code: "credit_blocked", details: { ok: false, status: 402, conversionPayload: FREE_PAYLOAD } },
    } as never);

    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(402);
    expect((await (res as NextResponse).json()).code).toBe("free_plan");
  });

  it("paid or classic: creditBlocked with the details as they were", async () => {
    const details = { reason: "insufficient_credits" };
    mockStartSettlement.mockResolvedValueOnce({ ok: false, error: { code: "credit_blocked", details } } as never);

    const res = await POST(postRequest({}), { params: makeParams("camp-1") });

    expect(res.status).toBe(402);
    const body = await (res as NextResponse).json();
    expect(body.code).toBe("creditBlocked");
    expect(body.details).toEqual(details);
  });
});

describe("GET /api/campaigns/[id]/derivations (#503)", () => {
  const ID_A = "11111111-1111-4111-8111-111111111111";
  const ID_B = "22222222-2222-4222-8222-222222222222";
  const mockPage = vi.mocked(getCampaignDerivationPage);
  const mockByIds = vi.mocked(getCampaignDerivationsByIds);
  const mockSummaryRows = vi.mocked(getCampaignDerivationSummaryRows);
  const mockFullList = vi.mocked(getDerivationsByCampaign);
  const mockSign = vi.mocked(objectStorage.signedDownloadUrl);
  const CURSOR = encodeKeysetCursor({ at: "2026-10-01T12:00:00.123456Z", id: ID_B });

  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    campaignId: "camp-1",
    workspaceId: "workspace-1",
    status: "completed",
    outputKey: `out/${id}.png`,
    isPreview: false,
    scoreStatus: "analyzed",
    createdAt: new Date("2026-10-01T12:00:00Z"),
    updatedAt: new Date("2026-10-01T12:00:00Z"),
    ...over,
  });
  const summaryRow = (id: string, status = "completed") => ({
    id,
    status,
    isPreview: false,
    outputKey: `out/${id}.png`,
    qualityVerdict: null,
    hardFailures: null,
    scoreStatus: "analyzed",
    qualityGatedAt: null,
  });
  const get = (query = "") =>
    GET(new Request(`http://localhost/api/campaigns/camp-1/derivations${query ? `?${query}` : ""}`), {
      params: makeParams("camp-1"),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCampaignById.mockResolvedValue({
      id: "camp-1",
      generationMode: "art_variation",
      creativeLevel: "balanced",
      ctaVariants: ["Compre"],
      targetFormats: ["1:1"],
    } as never);
    mockFailStaleActiveDerivations.mockResolvedValue([] as never);
    mockPage.mockResolvedValue({ items: [row(ID_A)], nextCursor: CURSOR } as never);
    mockByIds.mockResolvedValue([row(ID_A), row(ID_B)] as never);
    mockSummaryRows.mockResolvedValue([summaryRow(ID_A), summaryRow(ID_B, "approved")] as never);
  });

  it("first page: derivations, nextCursor, produceSurface and summary over every Peça; the stale cleanup runs", async () => {
    const res = await get("limit=1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["derivations", "nextCursor", "produceSurface", "summary"]);
    expect(body.derivations.map((d: { id: string }) => d.id)).toEqual([ID_A]);
    expect(body.derivations[0].imageUrl).toBe(`https://signed.test/out/${ID_A}.png`);
    expect(body.nextCursor).toBe(CURSOR);
    expect(body.summary).toMatchObject({ total: 2, approvedCount: 1, approvedIds: [ID_B] });
    expect(mockPage).toHaveBeenCalledWith("camp-1", "workspace-1", { limit: 1, cursor: null });
    expect(mockSummaryRows).toHaveBeenCalledWith("camp-1", "workspace-1");
    expect(mockFailStaleActiveDerivations).toHaveBeenCalledTimes(1);
  });

  it("default limit is 24 and max is 48", async () => {
    await get();
    expect(mockPage).toHaveBeenLastCalledWith("camp-1", "workspace-1", { limit: 24, cursor: null });
    await get("limit=48");
    expect(mockPage).toHaveBeenLastCalledWith("camp-1", "workspace-1", { limit: 48, cursor: null });
  });

  it("refreshes the Campanha status only when the stale cleanup failed something", async () => {
    await get();
    expect(vi.mocked(refreshCampaignStatus)).not.toHaveBeenCalled();
    mockFailStaleActiveDerivations.mockResolvedValueOnce([{ id: ID_A }] as never);
    await get();
    expect(vi.mocked(refreshCampaignStatus)).toHaveBeenCalledWith("camp-1", "workspace-1");
  });

  it("next page: only derivations and nextCursor, no summary query, no write, cursor reaches the repository decoded", async () => {
    const res = await get(`cursor=${CURSOR}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["derivations", "nextCursor"]);
    expect(mockPage).toHaveBeenCalledWith("camp-1", "workspace-1", {
      limit: 24,
      cursor: { at: "2026-10-01T12:00:00.123456Z", id: ID_B },
    });
    expect(mockSummaryRows).not.toHaveBeenCalled();
    expect(mockFailStaleActiveDerivations).not.toHaveBeenCalled();
    expect(vi.mocked(refreshCampaignStatus)).not.toHaveBeenCalled();
  });

  it("ids=: only derivations, ids de-duplicated, no write, no page or summary query", async () => {
    const res = await get(`ids=${ID_A},${ID_B},${ID_A}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["derivations"]);
    expect(body.derivations.map((d: { id: string }) => d.id)).toEqual([ID_A, ID_B]);
    expect(mockByIds).toHaveBeenCalledWith("camp-1", "workspace-1", [ID_A, ID_B]);
    expect(mockFailStaleActiveDerivations).not.toHaveBeenCalled();
    expect(mockPage).not.toHaveBeenCalled();
    expect(mockSummaryRows).not.toHaveBeenCalled();
  });

  it("signs a URL only for the items of the page or of ids=", async () => {
    mockPage.mockResolvedValueOnce({ items: [row(ID_A), row(ID_B, { outputKey: null })], nextCursor: null } as never);
    const first = await (await get("limit=2")).json();
    expect(mockSign).toHaveBeenCalledTimes(1);
    expect(mockSign).toHaveBeenCalledWith(`out/${ID_A}.png`);
    expect(first.derivations[1].imageUrl).toBeNull();

    mockSign.mockClear();
    await get(`ids=${ID_A},${ID_B}`);
    expect(mockSign.mock.calls.map((c) => c[0]).sort()).toEqual([`out/${ID_A}.png`, `out/${ID_B}.png`]);

    // The summary rows (every Peça) never get a URL: a next page signs only its own items.
    mockSign.mockClear();
    mockPage.mockResolvedValueOnce({ items: [row(ID_B)], nextCursor: null } as never);
    await get(`cursor=${CURSOR}`);
    expect(mockSign.mock.calls.map((c) => c[0])).toEqual([`out/${ID_B}.png`]);
  });

  it("the cursor it returns holds only a position: no key and no URL", async () => {
    const res = await get("limit=1");
    const { nextCursor } = await res.json();
    const decoded = JSON.parse(Buffer.from(nextCursor, "base64url").toString("utf8"));
    expect(Object.keys(decoded).sort()).toEqual(["at", "id", "v"]);
    expect(JSON.stringify(decoded)).not.toMatch(/out\/|signed\.test|https?:/);
    expect(decodeKeysetCursor(nextCursor)).toEqual({ at: "2026-10-01T12:00:00.123456Z", id: ID_B });
  });

  it("never loads the complete list", async () => {
    await get();
    await get(`cursor=${CURSOR}`);
    await get(`ids=${ID_A}`);
    expect(mockFullList).not.toHaveBeenCalled();
  });

  it("a Campanha outside the workspace answers 404 for every variant, without reading rows", async () => {
    mockGetCampaignById.mockResolvedValue(null as never);
    for (const q of ["", `cursor=${CURSOR}`, `ids=${ID_A}`]) {
      expect((await get(q)).status, q).toBe(404);
    }
    expect(mockPage).not.toHaveBeenCalled();
    expect(mockByIds).not.toHaveBeenCalled();
    expect(mockSummaryRows).not.toHaveBeenCalled();
  });

  it("invalid input is 400 before any read or write", async () => {
    const yearZero = encodeKeysetCursor({ at: "0000-01-01T00:00:00.000000Z", id: ID_A });
    const ids49 = Array.from({ length: 49 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`).join(",");
    for (const q of [
      "limit=0", "limit=49", "limit=abc", "cursor=%%corrupt", `cursor=${yearZero}`,
      `ids=${ID_A}&cursor=${CURSOR}`, `ids=${ids49}`, "ids=not-a-uuid", "ids=",
    ]) {
      expect((await get(q)).status, q).toBe(400);
    }
    expect(mockFailStaleActiveDerivations).not.toHaveBeenCalled();
    expect(mockGetCampaignById).not.toHaveBeenCalled();
    expect(mockPage).not.toHaveBeenCalled();
    expect(mockByIds).not.toHaveBeenCalled();
  });
});
