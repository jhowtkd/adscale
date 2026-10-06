// The sign-up that never opened the home (PR 626 review, F1). With the pilot on, a verified sign-up has a workspace and
// the trial's 500 credits but NO Equipe account yet (the free account opens when `/` renders). It used to be classic: a
// URL or the API reached the checkout and the classic AI. Here the rule, the paid-access reader, `canSpend`, the checkout
// handler and one AI route are REAL; only the database reads, Stripe and the model are doubles.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  pilot: vi.fn(),
  accounts: vi.fn(),
  subscription: vi.fn(),
  tester: vi.fn(),
  platformOwner: vi.fn(),
  access: vi.fn(),
  grants: vi.fn(),
  unlimited: vi.fn(),
  checkoutSession: vi.fn(),
  dictation: vi.fn(),
  accountsRead: vi.fn(),
  paidInvoice: vi.fn(),
}));

vi.mock("@/server/equipe/module/equipe-enabled", () => ({ isEquipeEnabledForWorkspace: (...a: unknown[]) => m.pilot(...a) }));
vi.mock("@/server/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => { m.accountsRead(); return m.accounts(); } }) }) }) },
}));
vi.mock("@/server/repositories/billing", () => ({
  getLatestSubscriptionByWorkspace: (...a: unknown[]) => m.subscription(...a),
  getAvailableCreditGrants: (...a: unknown[]) => m.grants(...a),
  getRefundableCreditGrants: vi.fn(),
  pickRefundTargetGrant: vi.fn(),
  updateCreditGrantRemaining: vi.fn(),
  getBillingCustomerByWorkspace: vi.fn(),
  getCreditGrantBySourceId: vi.fn(),
  hasPaidStripeInvoiceForCustomer: (...a: unknown[]) => m.paidInvoice(...a),
}));
vi.mock("@/server/repositories/entitlements", () => ({
  getActiveTesterEntitlementByWorkspace: (...a: unknown[]) => m.tester(...a),
  getActiveBetaEntitlementByWorkspace: vi.fn(async () => null),
}));
vi.mock("@/server/auth/platform-owner", () => ({ workspaceHasPlatformOwnerMember: (...a: unknown[]) => m.platformOwner(...a) }));
vi.mock("@/server/billing/unlimited-access", () => ({
  workspaceHasUnlimitedBillingAccess: (...a: unknown[]) => m.unlimited(...a),
  UNLIMITED_CREDIT_BALANCE: 999_999,
}));
vi.mock("@/server/billing/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/billing/access")>();
  return { ...actual, getWorkspaceBillingAccess: (...a: unknown[]) => m.access(...a) };
});
vi.mock("@/server/repositories/usage", () => ({ getUsageByIdempotencyKey: vi.fn(async () => null), trackUsage: vi.fn() }));
vi.mock("@/server/repositories/credit-transactions", () => ({ createCreditTransaction: vi.fn() }));
vi.mock("@/server/beta-analytics/record", () => ({ recordBetaAnalyticsEvent: vi.fn(async () => ({ id: "e" })) }));
vi.mock("@/server/billing/sessions", () => ({ createCheckoutSession: (...a: unknown[]) => m.checkoutSession(...a) }));
vi.mock("@/server/billing/plans", () => ({ billingPlanKeys: ["starter", "growth", "scale"] }));
vi.mock("@/server/dictation/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/dictation/service")>()),
  processDictation: (...a: unknown[]) => m.dictation(...a),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(async () => ({ user: { id: "user-1", email: "u@example.com" }, workspace: { id: "workspace-1", name: "W" } })),
}));

import { canSpend } from "./credits";
import { POST as checkout } from "@/app/api/billing/checkout/route";
import { POST as dictate } from "@/app/api/creative-work/dictation/route";

const trialGrant = { id: "g", workspaceId: "workspace-1", source: "trial", sourceId: null, amount: 500, remaining: 500, expiresAt: null };

const checkoutRequest = () =>
  new Request("http://localhost/api/billing/checkout", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planKey: "starter" }),
  });
const dictationRequest = () => {
  const req = new Request("http://localhost/api/creative-work/dictation", { method: "POST" });
  vi.spyOn(req, "formData").mockResolvedValue({
    get: (name: string) => (name === "audio" ? new File([new Uint8Array([1, 2, 3])], "a.webm", { type: "audio/webm" }) : name === "durationSeconds" ? "5" : null),
  } as unknown as FormData);
  return req;
};

/** A verified sign-up of the pilot: no Equipe account, the trial's credits, nothing paid. */
function signUp() {
  m.pilot.mockReturnValue(true);
  m.accounts.mockResolvedValue([]);
  m.subscription.mockResolvedValue(null);
  m.tester.mockResolvedValue(null);
  m.platformOwner.mockResolvedValue(false);
  m.paidInvoice.mockResolvedValue(false);
}

describe("a sign-up with no Equipe account yet, on a pilot workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signUp();
    m.unlimited.mockResolvedValue(false);
    m.access.mockResolvedValue({ kind: "beta", creditBalance: 500, remainingAds: 10, hasSpendAccess: true, subscriptionStatus: "none" });
    m.grants.mockResolvedValue([trialGrant]);
    m.checkoutSession.mockResolvedValue({ url: "https://checkout.stripe.com/s" });
    m.dictation.mockResolvedValue({ ok: true, text: "oi", cleaned: true, detectedLanguage: "pt", rawLength: 2, cleanLength: 2 });
  });

  it("the trial's 500 credits cannot be spent: free_plan with no account id", async () => {
    expect(await canSpend("workspace-1", "image_derivation")).toEqual({
      allowed: false, amount: 50, balance: 500, reason: "free_plan", accountId: null,
    });
  });

  it("the checkout is refused with 402 free_plan and ZERO Stripe sessions, with no visit to the home", async () => {
    const res = await checkout(checkoutRequest());

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("free_plan");
    expect(body.details).toMatchObject({ reason: "free_plan", recommendedAction: "plan_request" });
    expect(body.details).not.toHaveProperty("accountId");
    expect(m.checkoutSession).not.toHaveBeenCalled();
  });

  it("a classic AI route (dictation) is refused with ZERO model calls", async () => {
    const res = await dictate(dictationRequest());

    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("free_plan");
    expect(m.dictation).not.toHaveBeenCalled();
  });

  it.each([
    ["no paid invoice (a trial whose first invoice failed)", new Date(Date.now() - 24 * 60 * 60 * 1000), false],
    ["a paid invoice but the grace is over (period ended 8 days ago)", new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), true],
    ["a paid invoice but no period end", null, true],
  ])("a past_due subscription with %s is not a customer: still refused, zero Stripe sessions", async (_name, periodEnd, invoice) => {
    m.subscription.mockResolvedValue({ status: "past_due", stripeCustomerId: "cus_1", currentPeriodEnd: periodEnd });
    m.paidInvoice.mockResolvedValue(invoice);

    expect((await checkout(checkoutRequest())).status).toBe(402);
    expect(await canSpend("workspace-1", "image_derivation")).toMatchObject({ allowed: false, reason: "free_plan" });
    expect(m.checkoutSession).not.toHaveBeenCalled();
  });

  it.each([["trialing"], ["canceled"], ["checkout_completed"]])("a Stripe subscription %s does not make it a customer: still refused", async (status) => {
    m.subscription.mockResolvedValue({ status });

    expect((await checkout(checkoutRequest())).status).toBe(402);
    expect(await canSpend("workspace-1", "image_derivation")).toMatchObject({ allowed: false, reason: "free_plan" });
    expect(m.checkoutSession).not.toHaveBeenCalled();
  });

  it("only closed Equipe accounts: the same as no account", async () => {
    m.accounts.mockResolvedValue([{ id: "a", status: "closed", createdAt: new Date() }]);

    expect((await checkout(checkoutRequest())).status).toBe(402);
    expect(await canSpend("workspace-1", "image_derivation")).toMatchObject({ allowed: false, accountId: null });
  });

  it.each([
    ["an active Stripe subscription", () => m.subscription.mockResolvedValue({ status: "active" })],
    ["a past_due subscription with a paid invoice, inside the 7-day grace", () => {
      m.subscription.mockResolvedValue({ status: "past_due", stripeCustomerId: "cus_1", currentPeriodEnd: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
      m.paidInvoice.mockResolvedValue(true);
    }],
    ["a tester entitlement", () => m.tester.mockResolvedValue({ id: "t" })],
    ["a platform owner among the members", () => m.platformOwner.mockResolvedValue(true)],
  ])("with %s it is a classic customer: checkout and the AI work as before", async (_name, arrange) => {
    arrange();
    m.access.mockResolvedValue({ kind: "paid", creditBalance: 200, remainingAds: 4, hasSpendAccess: true, subscriptionStatus: "active" });
    m.grants.mockResolvedValue([{ ...trialGrant, remaining: 200 }]);

    expect((await checkout(checkoutRequest())).status).toBe(200);
    expect(m.checkoutSession).toHaveBeenCalledTimes(1);
    expect((await dictate(dictationRequest())).status).toBe(200);
    expect(m.dictation).toHaveBeenCalledTimes(1);
    expect(await canSpend("workspace-1", "image_derivation")).toEqual({ allowed: true, amount: 50, balance: 200 });
  });

  it("a paid Equipe account makes it a customer even with no classic billing at all", async () => {
    m.accounts.mockResolvedValue([{ id: "a", status: "active", createdAt: new Date() }]);

    expect((await checkout(checkoutRequest())).status).toBe(200);
    expect(m.subscription).not.toHaveBeenCalled();
  });
});

describe("pilot off (a classic workspace)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signUp();
    m.pilot.mockReturnValue(false);
    m.unlimited.mockResolvedValue(false);
    m.access.mockResolvedValue({ kind: "beta", creditBalance: 500, remainingAds: 10, hasSpendAccess: true, subscriptionStatus: "none" });
    m.grants.mockResolvedValue([trialGrant]);
    m.checkoutSession.mockResolvedValue({ url: "https://checkout.stripe.com/s" });
    m.dictation.mockResolvedValue({ ok: true, text: "oi", cleaned: true, detectedLanguage: "pt", rawLength: 2, cleanLength: 2 });
  });

  it("is exactly as before: the same sign-up spends its trial, checks out and dictates, and NOTHING was read for the rule", async () => {
    expect(await canSpend("workspace-1", "image_derivation")).toEqual({ allowed: true, amount: 50, balance: 500 });
    expect((await checkout(checkoutRequest())).status).toBe(200);
    expect((await dictate(dictationRequest())).status).toBe(200);

    expect(m.accountsRead).not.toHaveBeenCalled();
    expect(m.subscription).not.toHaveBeenCalled();
    expect(m.tester).not.toHaveBeenCalled();
    expect(m.platformOwner).not.toHaveBeenCalled();
  });
});
