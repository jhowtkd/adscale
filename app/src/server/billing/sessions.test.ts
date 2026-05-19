import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: {
    STRIPE_STARTER_PRICE_ID: "price_starter",
    STRIPE_GROWTH_PRICE_ID: "price_growth",
    STRIPE_SCALE_PRICE_ID: "price_scale",
    STRIPE_SUCCESS_URL: "https://app.example.com/billing/success",
    STRIPE_CANCEL_URL: "https://app.example.com/billing/cancel",
    STRIPE_SECRET_KEY: "sk_test_dummy",
  },
}));

vi.mock("@/server/repositories/billing", () => ({
  getBillingCustomerByWorkspace: vi.fn(),
  saveBillingCustomer: vi.fn(),
}));

const stripeMocks = vi.hoisted(() => ({
  customerCreate: vi.fn(),
  checkoutSessionCreate: vi.fn(),
  portalSessionCreate: vi.fn(),
}));

vi.mock("./stripe", () => ({
  stripe: {
    customers: { create: stripeMocks.customerCreate },
    checkout: { sessions: { create: stripeMocks.checkoutSessionCreate } },
    billingPortal: { sessions: { create: stripeMocks.portalSessionCreate } },
  },
}));

import {
  getBillingCustomerByWorkspace,
  saveBillingCustomer,
} from "@/server/repositories/billing";
import { createCheckoutSession, createPortalSession } from "./sessions";

const mockGetBillingCustomerByWorkspace = vi.mocked(getBillingCustomerByWorkspace);
const mockSaveBillingCustomer = vi.mocked(saveBillingCustomer);

describe("billing sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Stripe customer before checkout when workspace has none", async () => {
    mockGetBillingCustomerByWorkspace.mockResolvedValue(
      null as Awaited<ReturnType<typeof getBillingCustomerByWorkspace>>
    );
    stripeMocks.customerCreate.mockResolvedValue({ id: "cus_new" });
    mockSaveBillingCustomer.mockResolvedValue({
      id: "billing-customer-id",
      workspaceId: "workspace-1",
      stripeCustomerId: "cus_new",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    stripeMocks.checkoutSessionCreate.mockResolvedValue({
      id: "cs_test",
      url: "https://checkout.stripe.com/session",
    });

    const session = await createCheckoutSession({
      workspace: { id: "workspace-1", name: "Acme" },
      user: { id: "user-1", email: "user@example.com", name: "User" },
      planKey: "growth",
    });

    expect(stripeMocks.customerCreate).toHaveBeenCalledWith({
      email: "user@example.com",
      name: "Acme",
      metadata: { workspaceId: "workspace-1", userId: "user-1" },
    });
    expect(mockSaveBillingCustomer).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      stripeCustomerId: "cus_new",
    });
    expect(stripeMocks.checkoutSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_new",
        client_reference_id: "workspace-1",
        line_items: [{ price: "price_growth", quantity: 1 }],
      })
    );
    expect(session.url).toBe("https://checkout.stripe.com/session");
  });

  it("reuses an existing customer for checkout", async () => {
    mockGetBillingCustomerByWorkspace.mockResolvedValue({
      id: "billing-customer-id",
      workspaceId: "workspace-1",
      stripeCustomerId: "cus_existing",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    stripeMocks.checkoutSessionCreate.mockResolvedValue({ url: "https://checkout" });

    await createCheckoutSession({
      workspace: { id: "workspace-1" },
      user: { id: "user-1" },
      planKey: "starter",
    });

    expect(stripeMocks.customerCreate).not.toHaveBeenCalled();
    expect(mockSaveBillingCustomer).not.toHaveBeenCalled();
    expect(stripeMocks.checkoutSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing",
        line_items: [{ price: "price_starter", quantity: 1 }],
      })
    );
  });

  it("returns null for portal when no customer exists", async () => {
    mockGetBillingCustomerByWorkspace.mockResolvedValue(
      null as Awaited<ReturnType<typeof getBillingCustomerByWorkspace>>
    );

    await expect(
      createPortalSession({ workspace: { id: "workspace-1" } })
    ).resolves.toBeNull();
    expect(stripeMocks.portalSessionCreate).not.toHaveBeenCalled();
  });

  it("creates a portal session for an existing customer", async () => {
    mockGetBillingCustomerByWorkspace.mockResolvedValue({
      id: "billing-customer-id",
      workspaceId: "workspace-1",
      stripeCustomerId: "cus_existing",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    stripeMocks.portalSessionCreate.mockResolvedValue({
      url: "https://billing.stripe.com/session",
    });

    const session = await createPortalSession({
      workspace: { id: "workspace-1" },
    });

    expect(stripeMocks.portalSessionCreate).toHaveBeenCalledWith({
      customer: "cus_existing",
      return_url: "https://app.example.com/billing/success",
    });
    expect(session?.url).toBe("https://billing.stripe.com/session");
  });
});
