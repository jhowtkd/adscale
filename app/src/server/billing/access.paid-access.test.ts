// `workspaceHasActivePaidAccess` (ticket 11, part 2) with the repositories mocked: what keeps a workspace on the classic
// product while the pilot is on. `active`, a tester entitlement and a platform owner count; a `past_due` subscription
// counts only while the customer already paid real money AND the current period ended at most 7 days ago. The SQL of the
// paid-invoice lookup is in module/free-plan.pg.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  latest: vi.fn(),
  tester: vi.fn(),
  paidInvoice: vi.fn(),
  platformOwner: vi.fn(),
}));

vi.mock("@/server/repositories/billing", () => ({
  getActiveSubscriptionByWorkspace: vi.fn(),
  getAvailableCreditGrants: vi.fn(),
  getLatestSubscriptionByWorkspace: (...a: unknown[]) => m.latest(...a),
  hasPaidStripeInvoiceForCustomer: (...a: unknown[]) => m.paidInvoice(...a),
}));
vi.mock("@/server/repositories/entitlements", () => ({
  getActiveBetaEntitlementByWorkspace: vi.fn(async () => null),
  getActiveTesterEntitlementByWorkspace: (...a: unknown[]) => m.tester(...a),
}));
vi.mock("@/server/auth/platform-owner", () => ({ workspaceHasPlatformOwnerMember: (...a: unknown[]) => m.platformOwner(...a) }));
vi.mock("@/server/db", () => ({ db: {} }));

import { PAST_DUE_PAID_ACCESS_GRACE_MS, workspaceHasActivePaidAccess } from "./access";

const NOW = new Date("2026-10-06T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const pastDue = (periodEnd: Date | null, customer = "cus_1") => ({ status: "past_due", stripeCustomerId: customer, currentPeriodEnd: periodEnd });

describe("workspaceHasActivePaidAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.latest.mockResolvedValue(null);
    m.tester.mockResolvedValue(null);
    m.paidInvoice.mockResolvedValue(false);
    m.platformOwner.mockResolvedValue(false);
  });

  it("the grace is 7 days", () => {
    expect(PAST_DUE_PAID_ACCESS_GRACE_MS).toBe(7 * DAY);
  });

  it("nothing at all: false", async () => {
    expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(false);
  });

  it("an active subscription counts, without asking for an invoice", async () => {
    m.latest.mockResolvedValue({ status: "active", stripeCustomerId: "cus_1", currentPeriodEnd: null });

    expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(true);
    expect(m.paidInvoice).not.toHaveBeenCalled();
  });

  describe("past_due", () => {
    it("with a paid invoice and a period that ended 6 days ago: counts, asking about that customer's invoice", async () => {
      m.latest.mockResolvedValue(pastDue(new Date(NOW.getTime() - 6 * DAY), "cus_paying"));
      m.paidInvoice.mockResolvedValue(true);

      expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(true);
      expect(m.paidInvoice).toHaveBeenCalledWith("cus_paying");
    });

    it("on the 7th day exactly: counts; one millisecond later: does not", async () => {
      m.paidInvoice.mockResolvedValue(true);
      m.latest.mockResolvedValue(pastDue(new Date(NOW.getTime() - 7 * DAY)));
      expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(true);

      m.latest.mockResolvedValue(pastDue(new Date(NOW.getTime() - 7 * DAY - 1)));
      expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(false);
    });

    it("8 days after the period: does not count, and the invoice is not even looked up", async () => {
      m.latest.mockResolvedValue(pastDue(new Date(NOW.getTime() - 8 * DAY)));
      m.paidInvoice.mockResolvedValue(true);

      expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(false);
      expect(m.paidInvoice).not.toHaveBeenCalled();
    });

    it("within the grace but with no paid invoice (a trialing subscription whose first invoice failed): does not count", async () => {
      m.latest.mockResolvedValue(pastDue(new Date(NOW.getTime() - DAY)));
      m.paidInvoice.mockResolvedValue(false);

      expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(false);
    });

    it("with a null currentPeriodEnd: does not count, even with a paid invoice", async () => {
      m.latest.mockResolvedValue(pastDue(null));
      m.paidInvoice.mockResolvedValue(true);

      expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(false);
    });

    it("a period still in the future counts with a paid invoice", async () => {
      m.latest.mockResolvedValue(pastDue(new Date(NOW.getTime() + 3 * DAY)));
      m.paidInvoice.mockResolvedValue(true);

      expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(true);
    });

    it("the default clock is the real one: a period that ended 30 years ago never counts", async () => {
      m.latest.mockResolvedValue(pastDue(new Date("1996-01-01T00:00:00Z")));
      m.paidInvoice.mockResolvedValue(true);

      expect(await workspaceHasActivePaidAccess("ws-1")).toBe(false);
    });

    it("a failed past_due still falls through to the platform owner and to the tester entitlement", async () => {
      m.latest.mockResolvedValue(pastDue(new Date(NOW.getTime() - 30 * DAY)));
      m.platformOwner.mockResolvedValue(true);
      expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(true);

      m.platformOwner.mockResolvedValue(false);
      m.tester.mockResolvedValue({ id: "t" });
      expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(true);
    });
  });

  it.each(["trialing", "canceled", "checkout_completed", "incomplete", "unpaid"])("a %s subscription never counts, whatever the invoices say", async (status) => {
    m.latest.mockResolvedValue({ status, stripeCustomerId: "cus_1", currentPeriodEnd: new Date(NOW.getTime() + DAY) });
    m.paidInvoice.mockResolvedValue(true);

    expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(false);
    expect(m.paidInvoice).not.toHaveBeenCalled();
  });

  it("a platform owner among the members and a tester entitlement count with no subscription", async () => {
    m.platformOwner.mockResolvedValue(true);
    expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(true);

    m.platformOwner.mockResolvedValue(false);
    m.tester.mockResolvedValue({ id: "t" });
    expect(await workspaceHasActivePaidAccess("ws-1", NOW)).toBe(true);
  });

  it("fails closed: a failing reader propagates instead of answering false", async () => {
    m.latest.mockRejectedValue(new Error("db down"));

    await expect(workspaceHasActivePaidAccess("ws-1", NOW)).rejects.toThrow("db down");
  });
});
