import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { CREDIT_COSTS, type CreditAction } from "@/lib/billing/credit-units";

const { recordUsage, extract, analyze, freePlan } = vi.hoisted(() => ({
  recordUsage: vi.fn(),
  extract: vi.fn(),
  analyze: vi.fn(),
  freePlan: vi.fn(),
}));

vi.mock("@/server/billing/credits", () => ({ recordUsage, canSpend: vi.fn() }));
vi.mock("@/server/billing/access", () => ({
  getWorkspaceBillingAccess: vi.fn(async () => ({
    kind: "paid", creditBalance: 0, remainingAds: 0,
    hasSpendAccess: true, subscriptionStatus: "active",
  })),
}));
vi.mock("@/server/equipe/module/free-plan", () => ({ findFreePlanAccount: freePlan }));
vi.mock("@/lib/api-response", () => ({
  apiError: async (code: string, status: number, details?: unknown) =>
    NextResponse.json({ code, details }, { status }),
  handleApiError: (error: unknown) => { throw error; },
}));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: async () => ({ workspace: { id: "workspace-1" } }),
}));
vi.mock("@/lib/with-rate-limit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/upload-config", () => ({
  isAllowedImageType: () => true,
  validateImageMagicBytes: async () => true,
}));
vi.mock("@/server/ai/brand-kit-extractor", () => ({ extractBrandKitFromImage: extract }));
vi.mock("@/server/ai/competitor-analyzer", () => ({ analyzeCompetitorCreative: analyze }));
vi.mock("@/server/repositories/campaign", () => ({ getCampaignById: async () => ({ id: "campaign-1" }) }));
vi.mock("@/server/equipe/handoff/raster-image", () => ({ RasterRetryError: class extends Error {} }));
vi.mock("@/server/brand-training/upload", () => ({
  normalizeTrainingUpload: async (file: File) => ({
    buffer: Buffer.from(await file.arrayBuffer()), type: "image/png", extension: "png", hasAlpha: false,
  }),
}));
vi.mock("@/server/storage", () => ({ objectStorage: { put: async () => {}, publicUrl: (key: string) => key } }));
vi.mock("@/server/repositories/client-reference", () => ({
  createClientReference: async () => ({ id: "ref-1" }),
  createTrainingReference: async () => ({ id: "ref-1" }),
  getTrainingReferenceByAssetKey: async () => null,
}));
vi.mock("@/server/repositories/workspace-asset", () => ({
  getWorkspaceAssetByKey: async () => null,
  createWorkspaceAsset: async () => ({ id: "asset-1" }),
}));
vi.mock("@/server/repositories/brand-kit", () => ({
  resolveBrandKitProfileId: async () => "profile-1", upsertBrandKit: async () => {},
}));
vi.mock("@/server/repositories/brand-knowledge", () => ({ createBrandKnowledgeCandidates: async () => [] }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send: async () => {} } }));

import { POST as extractOne } from "@/app/api/workspace/brand-kit/extract/route";
import { POST as extractMulti } from "@/app/api/workspace/brand-kit/extract-multi/route";
import { POST as analyzeCompetitor } from "@/app/api/campaigns/[id]/competitors/analyze/route";

function upload(kind: "single" | "multi" | "competitor", bytes = [1, 2, 3, 4], guides = 1) {
  const form = new FormData();
  const file = new File([new Uint8Array(bytes)], "same.png", { type: "image/png" });
  form.set(kind === "single" ? "file" : kind === "competitor" ? "files" : "guide", file);
  if (kind === "multi") {
    form.set("entries", JSON.stringify(Array.from({ length: guides }, () => ({ fileName: "guide", kind: "guide" }))));
  }
  return new Request("http://localhost/upload", { method: "POST", body: form });
}

describe("paid provider dispatch uses the real paywall adapter", () => {
  let balance: number;
  let reservations: Set<string>;

  beforeEach(() => {
    vi.resetAllMocks();
    balance = 20;
    reservations = new Set();
    freePlan.mockResolvedValue(null);
    recordUsage.mockImplementation(async ({ idempotencyKey, action, amount }: { idempotencyKey: string; action: CreditAction; amount?: number }) => {
      const required = amount ?? CREDIT_COSTS[action];
      if (reservations.has(idempotencyKey)) return { status: "duplicate", usage: {} };
      if (balance < required) {
        return { status: "blocked", check: { allowed: false, amount: required, balance, reason: "insufficient_credits" } };
      }
      reservations.add(idempotencyKey);
      balance -= required;
      return { status: "recorded", usage: {}, check: { allowed: true, amount: required, balance } };
    });
    extract.mockResolvedValue({ colors: ["#000000"], fonts: [], toneOfVoice: "", prohibitedElements: "", requiredElements: "", logoDescription: "" });
    analyze.mockResolvedValue({ strengths: [], weaknesses: [], differentiationOpportunities: [], visualPatterns: {}, messaging: {} });
  });

  it("charges each repeated extraction and stops provider work after credits run out", async () => {
    expect((await extractOne(upload("single"))).status).toBe(200);
    expect((await extractOne(upload("single"))).status).toBe(200);
    expect((await extractOne(upload("single"))).status).toBe(402);

    expect(extract).toHaveBeenCalledTimes(2);
    expect(reservations.size).toBe(2);
    expect(balance).toBe(0);
  });

  it("charges changed bytes with the same name and size as new work", async () => {
    expect((await extractOne(upload("single"))).status).toBe(200);
    expect((await extractOne(upload("single", [4, 3, 2, 1]))).status).toBe(200);

    expect(extract).toHaveBeenCalledTimes(2);
    expect(reservations.size).toBe(2);
  });

  it("charges concurrent competitor analyses separately before dispatch", async () => {
    balance = 100;
    const responses = await Promise.all([0, 1].map(() => analyzeCompetitor(upload("competitor"), {
      params: Promise.resolve({ id: "campaign-1" }),
    })));

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(reservations.size).toBe(2);
  });

  it("cannot reuse a mono extraction charge in the multi route", async () => {
    expect((await extractOne(upload("single"))).status).toBe(200);
    expect((await extractMulti(upload("multi"))).status).toBe(201);

    expect(extract).toHaveBeenCalledTimes(2);
    expect(reservations.size).toBe(2);
  });

  it("charges every guide even when entries reference the same file", async () => {
    expect((await extractMulti(upload("multi", [1, 2, 3, 4], 2))).status).toBe(201);

    expect(extract).toHaveBeenCalledTimes(2);
    expect(balance).toBe(0);
  });

  it("reserves all guides atomically so an insufficient-balance retry loses no credits", async () => {
    balance = 10;
    expect((await extractMulti(upload("multi", [1, 2, 3, 4], 2))).status).toBe(402);
    expect(balance).toBe(10);
    expect(reservations.size).toBe(0);
    expect(extract).not.toHaveBeenCalled();

    balance += 10;
    expect((await extractMulti(upload("multi", [1, 2, 3, 4], 2))).status).toBe(201);
    expect(balance).toBe(0);
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it("does not dispatch provider work for a duplicate reservation", async () => {
    recordUsage.mockResolvedValue({ status: "duplicate", usage: {} });

    expect((await extractOne(upload("single"))).status).toBe(409);
    expect(extract).not.toHaveBeenCalled();
  });

  it("retains the free-plan refusal before any reservation or provider work", async () => {
    freePlan.mockResolvedValue({ accountId: "account-free" });

    expect((await extractOne(upload("single"))).status).toBe(402);
    expect(recordUsage).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
  });
});
