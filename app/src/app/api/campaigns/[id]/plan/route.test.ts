// A spend route end to end through the REAL paywall and credits (ticket 11, part 2): only the repositories, the AI and
// the free-plan rule are doubles. The free plan is refused with its own code and CTA, nothing is debited and the model is
// never called; a paid workspace is charged and gets its plan exactly as before.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findFreePlan: vi.fn(),
  create: vi.fn(),
  trackUsage: vi.fn(),
  updateGrant: vi.fn(),
  grants: vi.fn(),
  access: vi.fn(),
  getCampaign: vi.fn(),
  completion: vi.fn(),
}));

vi.mock("@/server/equipe/module/free-plan", () => ({ findFreePlanAccount: (...a: unknown[]) => m.findFreePlan(...a) }));
vi.mock("@/server/db", () => ({ db: { transaction: async (cb: (tx: unknown) => unknown) => cb({}) } }));
vi.mock("@/server/billing/access", () => ({ getWorkspaceBillingAccess: (...a: unknown[]) => m.access(...a) }));
vi.mock("@/server/billing/unlimited-access", () => ({
  workspaceHasUnlimitedBillingAccess: vi.fn(async () => false),
  UNLIMITED_CREDIT_BALANCE: 999_999,
}));
vi.mock("@/server/repositories/billing", () => ({
  getAvailableCreditGrants: (...a: unknown[]) => m.grants(...a),
  getRefundableCreditGrants: vi.fn(),
  pickRefundTargetGrant: vi.fn(),
  updateCreditGrantRemaining: (...a: unknown[]) => m.updateGrant(...a),
}));
vi.mock("@/server/repositories/usage", () => ({
  getUsageByIdempotencyKey: vi.fn(async () => null),
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
vi.mock("@/server/repositories/asset", () => ({ getAssetsByCampaign: vi.fn(async () => []) }));
vi.mock("@/server/repositories/plan", () => ({
  getPlanByCampaign: vi.fn(async () => null),
  createPlan: (...a: unknown[]) => m.create(...a),
  updatePlanStatus: vi.fn(),
}));
vi.mock("@/server/ai/prompt-builder", () => ({ buildPlanPrompt: vi.fn(() => "prompt") }));
vi.mock("@/server/ai/utils", () => ({ getOpenAI: () => ({ chat: { completions: { create: (...a: unknown[]) => m.completion(...a) } } }) }));
vi.mock("@/server/services/notifications", () => ({
  shouldSendToUser: vi.fn(async () => false),
  getUserLocale: vi.fn(async () => "pt-BR"),
  sendPlanReadyEmail: vi.fn(),
}));

import { POST } from "./route";

const call = () =>
  POST(new Request("http://localhost/api/campaigns/camp-1/plan", { method: "POST" }), {
    params: Promise.resolve({ id: "camp-1" }),
  });

const grant = { id: "grant-1", workspaceId: "workspace-1", source: "trial", sourceId: null, amount: 500, remaining: 500, expiresAt: null };
const betaAccess = { kind: "beta", creditBalance: 500, remainingAds: 10, hasSpendAccess: true, subscriptionStatus: "none" };

describe("POST /api/campaigns/[id]/plan (spendOrApiError, real canSpend)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.findFreePlan.mockResolvedValue(null);
    m.getCampaign.mockResolvedValue({ id: "camp-1", workspaceId: "workspace-1" });
    m.access.mockResolvedValue(betaAccess);
    m.grants.mockResolvedValue([grant]);
    m.trackUsage.mockResolvedValue({ id: "usage-1" });
    m.create.mockResolvedValue({ id: "plan-1" });
    m.completion.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ strategy: "s", angles: ["a"], hooks: ["h"], ctas: ["c"] }) } }],
    });
  });

  it("on the free plan: refused at the entry with 402 free_plan and the plan request; nothing is read, debited or called", async () => {
    m.findFreePlan.mockResolvedValue({ accountId: "acc-free" });

    const res = await call();

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("free_plan");
    expect(body.details).toMatchObject({ reason: "free_plan", recommendedAction: "plan_request", accountId: "acc-free" });
    expect(body.details).not.toHaveProperty("suggestedPlan");
    expect(m.getCampaign).not.toHaveBeenCalled();
    expect(m.grants).not.toHaveBeenCalled();
    expect(m.updateGrant).not.toHaveBeenCalled();
    expect(m.trackUsage).not.toHaveBeenCalled();
    expect(m.completion).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("a sign-up with no Equipe account yet (accountId null) is refused the same way, with the way to the conversation as CTA", async () => {
    m.findFreePlan.mockResolvedValue({ accountId: null });

    const res = await call();

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("free_plan");
    expect(body.details).toMatchObject({ reason: "free_plan", recommendedAction: "plan_request" });
    expect(body.details).not.toHaveProperty("accountId");
    expect(m.completion).not.toHaveBeenCalled();
  });

  it("the spend decision itself (real canSpend) refuses the free plan with the trial balance when the entry guard saw a classic workspace (race): nothing debited", async () => {
    m.findFreePlan.mockResolvedValueOnce(null).mockResolvedValue({ accountId: "acc-free" });

    const res = await call();

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("free_plan");
    expect(body.details).toMatchObject({ recommendedAction: "plan_request", accountId: "acc-free", balance: 500, analytics: { operation: "creative_plan" } });
    expect(m.updateGrant).not.toHaveBeenCalled();
    expect(m.trackUsage).not.toHaveBeenCalled();
    expect(m.completion).not.toHaveBeenCalled();
  });

  it("with the rule null (paid, classic or pilot off) the workspace is charged and gets its plan, as before", async () => {
    const res = await call();

    expect(res.status).toBeLessThan(300);
    expect(m.trackUsage).toHaveBeenCalledTimes(1);
    expect(m.updateGrant).toHaveBeenCalled();
    expect(m.completion).toHaveBeenCalledTimes(1);
    expect(m.create).toHaveBeenCalledTimes(1);
  });

  it("with the rule null and no credit left, the old reason and a checkout CTA (not the plan request)", async () => {
    m.grants.mockResolvedValue([{ ...grant, remaining: 0 }]);
    m.access.mockResolvedValue({ ...betaAccess, creditBalance: 0, remainingAds: 0 });

    const res = await call();

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("beta_exhausted");
    expect(body.details.recommendedAction).toBe("checkout");
    expect(body.details).not.toHaveProperty("accountId");
    expect(m.completion).not.toHaveBeenCalled();
  });
});
