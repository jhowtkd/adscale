// The idempotency hole of the PR 626 review (F2): `auto-briefing`'s key is deterministic per campaign and image, and a
// repeated key used to mean "already charged, go on", so a workspace that is now on the free plan could run the vision
// model again with its old charge. Here the handler, the paywall and `recordUsage` are REAL; only the rule, the
// repositories, the storage and the model are doubles, and the usage repository holds the historical charge.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findFreePlan: vi.fn(),
  existingUsage: vi.fn(),
  trackUsage: vi.fn(),
  updateGrant: vi.fn(),
  access: vi.fn(),
  grants: vi.fn(),
  analyze: vi.fn(),
  storageGet: vi.fn(),
  getCampaign: vi.fn(),
  unlimited: vi.fn(),
}));

vi.mock("@/server/equipe/module/free-plan", () => ({ findFreePlanAccount: (...a: unknown[]) => m.findFreePlan(...a) }));
vi.mock("@/server/db", () => ({ db: { transaction: async (cb: (tx: unknown) => unknown) => cb({}) } }));
vi.mock("@/server/billing/access", () => ({ getWorkspaceBillingAccess: (...a: unknown[]) => m.access(...a) }));
vi.mock("@/server/billing/unlimited-access", () => ({
  workspaceHasUnlimitedBillingAccess: (...a: unknown[]) => m.unlimited(...a),
  UNLIMITED_CREDIT_BALANCE: 999_999,
}));
vi.mock("@/server/repositories/billing", () => ({
  getAvailableCreditGrants: (...a: unknown[]) => m.grants(...a),
  getRefundableCreditGrants: vi.fn(),
  pickRefundTargetGrant: vi.fn(),
  updateCreditGrantRemaining: (...a: unknown[]) => m.updateGrant(...a),
}));
vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: (...a: unknown[]) => m.existingUsage(...a),
  trackUsage: (...a: unknown[]) => m.trackUsage(...a),
}));
vi.mock("@/server/repositories/credit-transactions", () => ({ createCreditTransaction: vi.fn(async () => ({ id: "tx-1" })) }));
vi.mock("@/server/beta-analytics/record", () => ({ recordBetaAnalyticsEvent: vi.fn(async () => ({ id: "event-1" })) }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/with-rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(async () => ({ user: { id: "user-1" }, workspace: { id: "workspace-1" } })),
}));
vi.mock("@/server/repositories/campaign", () => ({ getCampaignById: (...a: unknown[]) => m.getCampaign(...a) }));
vi.mock("@/server/storage", () => ({ objectStorage: { get: (...a: unknown[]) => m.storageGet(...a) } }));
vi.mock("@/server/ai/image-analysis", () => ({ analyzeImageContent: (...a: unknown[]) => m.analyze(...a) }));

import { POST } from "./route";

const call = () =>
  POST(
    new Request("http://localhost/api/campaigns/camp-1/auto-briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageKey: "workspaces/workspace-1/img.png" }),
    }),
    { params: Promise.resolve({ id: "camp-1" }) },
  );

const grant = { id: "grant-1", workspaceId: "workspace-1", source: "trial", sourceId: null, amount: 500, remaining: 500, expiresAt: null };
const content = {
  product: "Café", offer: "2x1", cta: { text: "Peça", style: "bold" }, brandElements: [], keyVisual: "xícara",
  textContent: { headline: "h", bullets: [] }, format: "4:5",
};

describe("POST /api/campaigns/[id]/auto-briefing: a historical charge is not a permission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.findFreePlan.mockResolvedValue(null);
    m.unlimited.mockResolvedValue(false);
    m.access.mockResolvedValue({ kind: "paid", creditBalance: 200, remainingAds: 4, hasSpendAccess: true, subscriptionStatus: "active" });
    m.grants.mockResolvedValue([grant]);
    m.getCampaign.mockResolvedValue({ id: "camp-1", workspaceId: "workspace-1" });
    m.storageGet.mockResolvedValue(Buffer.from("png"));
    m.analyze.mockResolvedValue(content);
    // The same operation was charged before the workspace went to the free plan (the key is deterministic).
    m.existingUsage.mockResolvedValue({ id: "usage-0", idempotencyKey: "auto-briefing:camp-1:workspaces/workspace-1/img.png" });
  });

  it("on the free plan, with the historical charge for the same key: 402 free_plan, ZERO vision calls, nothing read from the storage or debited", async () => {
    m.findFreePlan.mockResolvedValue({ accountId: "acc-free" });

    const res = await call();

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("free_plan");
    expect(body.details).toMatchObject({ reason: "free_plan", recommendedAction: "plan_request", accountId: "acc-free" });
    expect(m.analyze).not.toHaveBeenCalled();
    expect(m.storageGet).not.toHaveBeenCalled();
    expect(m.trackUsage).not.toHaveBeenCalled();
    expect(m.updateGrant).not.toHaveBeenCalled();
  });

  it("the spend decision alone (entry guard saw a classic workspace: a race) also refuses it with the historical key: the idempotency is never read", async () => {
    m.findFreePlan.mockResolvedValueOnce(null).mockResolvedValue({ accountId: "acc-free" });

    const res = await call();

    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("free_plan");
    expect(m.existingUsage).not.toHaveBeenCalled();
    expect(m.analyze).not.toHaveBeenCalled();
  });

  it("with unlimited billing access too (a platform owner or tester on a free workspace): still refused, still zero vision calls", async () => {
    m.findFreePlan.mockResolvedValue({ accountId: "acc-free" });
    m.unlimited.mockResolvedValue(true);

    const res = await call();

    expect(res.status).toBe(402);
    expect(m.analyze).not.toHaveBeenCalled();
  });

  it("outside the free plan the previous financial semantics hold: the historical charge is a duplicate (no new debit) and the route goes on", async () => {
    const res = await call();

    expect(res.status).toBe(200);
    expect(m.existingUsage).toHaveBeenCalled();
    expect(m.trackUsage).not.toHaveBeenCalled();
    expect(m.updateGrant).not.toHaveBeenCalled();
    expect(m.analyze).toHaveBeenCalledTimes(1);
    expect((await res.json()).extracted).toMatchObject({ product: "Café", ctaText: "Peça" });
  });

  it("outside the free plan with no charge yet: it debits once and analyzes once, as before", async () => {
    m.existingUsage.mockResolvedValue(null);
    m.trackUsage.mockResolvedValue({ id: "usage-1" });

    const res = await call();

    expect(res.status).toBe(200);
    expect(m.trackUsage).toHaveBeenCalledTimes(1);
    expect(m.analyze).toHaveBeenCalledTimes(1);
  });
});
