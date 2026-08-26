import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("@/server/validation/env", () => ({
  env: {
    STRIPE_STARTER_PRICE_ID: "price_starter",
    STRIPE_GROWTH_PRICE_ID: "price_growth",
    STRIPE_SCALE_PRICE_ID: "price_scale",
  },
}));

vi.mock("@/server/repositories/billing", () => ({
  createCreditGrant: vi.fn(),
  getCreditGrantBySourceId: vi.fn(),
  getSubscriptionByStripeSubscriptionId: vi.fn(),
  hasProcessedStripeEvent: vi.fn(),
  recordProcessedStripeEvent: vi.fn(),
  saveBillingCustomer: vi.fn(),
  upsertSubscription: vi.fn(),
}));

vi.mock("./stripe", () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
}));

import {
  createCreditGrant,
  getCreditGrantBySourceId,
  getSubscriptionByStripeSubscriptionId,
  hasProcessedStripeEvent,
  recordProcessedStripeEvent,
  saveBillingCustomer,
  upsertSubscription,
} from "@/server/repositories/billing";
import { processStripeEvent } from "./events";
import { stripe } from "./stripe";

const mockCreateCreditGrant = vi.mocked(createCreditGrant);
const mockGetCreditGrantBySourceId = vi.mocked(getCreditGrantBySourceId);
const mockGetSubscription = vi.mocked(getSubscriptionByStripeSubscriptionId);
const mockHasProcessedStripeEvent = vi.mocked(hasProcessedStripeEvent);
const mockRecordProcessedStripeEvent = vi.mocked(recordProcessedStripeEvent);
const mockSaveBillingCustomer = vi.mocked(saveBillingCustomer);
const mockUpsertSubscription = vi.mocked(upsertSubscription);
const mockStripeSubscriptionRetrieve = vi.mocked(stripe.subscriptions.retrieve);

function stripeEvent(type: string, object: unknown): Stripe.Event {
  return {
    id: `evt_${type}`,
    type,
    data: { object },
  } as Stripe.Event;
}

describe("processStripeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasProcessedStripeEvent.mockResolvedValue(false);
    mockGetCreditGrantBySourceId.mockResolvedValue(null);
    mockGetSubscription.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getSubscriptionByStripeSubscriptionId>>
    );
    mockStripeSubscriptionRetrieve.mockReset();
  });

  it("skips already processed events", async () => {
    mockHasProcessedStripeEvent.mockResolvedValue(true);

    const result = await processStripeEvent(stripeEvent("checkout.session.completed", {}));

    expect(result).toEqual({ status: "skipped", reason: "already_processed" });
    expect(mockUpsertSubscription).not.toHaveBeenCalled();
    expect(mockRecordProcessedStripeEvent).not.toHaveBeenCalled();
  });

  it("links checkout completion to workspace customer and subscription", async () => {
    const event = stripeEvent("checkout.session.completed", {
      customer: "cus_123",
      subscription: "sub_123",
      metadata: {
        workspaceId: "workspace-1",
        planKey: "growth",
      },
    });

    const result = await processStripeEvent(event);

    expect(mockSaveBillingCustomer).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      stripeCustomerId: "cus_123",
    });
    expect(mockUpsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        status: "checkout_completed",
        planKey: "growth",
        priceId: "price_growth",
      })
    );
    expect(mockCreateCreditGrant).not.toHaveBeenCalled();
    expect(mockRecordProcessedStripeEvent).toHaveBeenCalledWith({
      stripeEventId: event.id,
      type: "checkout.session.completed",
      payload: event,
    });
    expect(result).toEqual({ status: "processed", type: "checkout.session.completed" });
  });

  it("updates subscription state from Stripe subscription events", async () => {
    const event = stripeEvent("customer.subscription.updated", {
      id: "sub_123",
      customer: "cus_123",
      status: "active",
      metadata: { workspaceId: "workspace-1" },
      items: { data: [{ price: { id: "price_starter" } }] },
      current_period_start: 1_700_000_000,
      current_period_end: 1_702_592_000,
      cancel_at_period_end: false,
    });

    const result = await processStripeEvent(event);

    expect(mockUpsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        status: "active",
        planKey: "starter",
        priceId: "price_starter",
        cancelAtPeriodEnd: false,
      })
    );
    expect(result).toEqual({ status: "processed", type: "customer.subscription.updated" });
  });

  it("uses existing subscription workspace when deleted event lacks metadata", async () => {
    mockGetSubscription.mockResolvedValue({
      id: "local-sub-id",
      workspaceId: "workspace-1",
      billingCustomerId: null,
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "active",
      planKey: "scale",
      priceId: "price_scale",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const event = stripeEvent("customer.subscription.deleted", {
      id: "sub_123",
      customer: "cus_123",
      status: "canceled",
      metadata: {},
      items: { data: [{ price: { id: "price_scale" } }] },
      cancel_at_period_end: false,
    });

    await processStripeEvent(event);

    expect(mockUpsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        status: "canceled",
        planKey: "scale",
      })
    );
  });

  it("skips duplicate invoice grants when sourceId already exists", async () => {
    mockGetCreditGrantBySourceId.mockResolvedValue({
      id: "grant-existing",
      workspaceId: "workspace-1",
      source: "stripe_invoice",
      sourceId: "in_123",
      amount: 1200,
      remaining: 1200,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const event = stripeEvent("invoice.paid", {
      id: "in_123",
      subscription: "sub_123",
    });

    const result = await processStripeEvent(event);

    expect(mockGetCreditGrantBySourceId).toHaveBeenCalledWith("stripe_invoice", "in_123");
    expect(mockCreateCreditGrant).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "processed", type: "invoice.paid" });
  });

  it("grants plan credits from paid invoices", async () => {
    const periodEnd = new Date("2026-06-19T00:00:00.000Z");
    mockGetSubscription.mockResolvedValue({
      id: "local-sub-id",
      workspaceId: "workspace-1",
      billingCustomerId: null,
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "active",
      planKey: "growth",
      priceId: "price_growth",
      currentPeriodStart: new Date("2026-05-19T00:00:00.000Z"),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const event = stripeEvent("invoice.paid", {
      id: "in_123",
      subscription: "sub_123",
    });

    const result = await processStripeEvent(event);

    expect(mockCreateCreditGrant).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      source: "stripe_invoice",
      sourceId: "in_123",
      amount: 1200,
      expiresAt: periodEnd,
    });
    expect(result).toEqual({ status: "processed", type: "invoice.paid" });
  });

  it("syncs subscription before granting credits when invoice arrives first", async () => {
    const periodEnd = new Date("2026-06-19T00:00:00.000Z");
    mockGetSubscription.mockResolvedValueOnce(null as never);
    mockStripeSubscriptionRetrieve.mockResolvedValue({
      id: "sub_123",
      customer: "cus_123",
      status: "active",
      metadata: {
        workspaceId: "workspace-1",
        planKey: "growth",
      },
      items: { data: [{ price: { id: "price_growth" } }] },
      current_period_start: 1779148800,
      current_period_end: 1781827200,
      cancel_at_period_end: false,
    } as unknown as Stripe.Response<Stripe.Subscription>);
    mockUpsertSubscription.mockResolvedValue({
      id: "local-sub-id",
      workspaceId: "workspace-1",
      billingCustomerId: null,
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "active",
      planKey: "growth",
      priceId: "price_growth",
      currentPeriodStart: new Date("2026-05-19T00:00:00.000Z"),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const event = stripeEvent("invoice.paid", {
      id: "in_123",
      subscription: "sub_123",
    });

    const result = await processStripeEvent(event);

    expect(mockStripeSubscriptionRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mockSaveBillingCustomer).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      stripeCustomerId: "cus_123",
    });
    expect(mockCreateCreditGrant).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      source: "stripe_invoice",
      sourceId: "in_123",
      amount: 1200,
      expiresAt: periodEnd,
    });
    expect(result).toEqual({ status: "processed", type: "invoice.paid" });
  });

  it("rejects checkout completion when billing metadata is missing", async () => {
    const event = stripeEvent("checkout.session.completed", {
      customer: "cus_123",
      subscription: "sub_123",
      metadata: {},
    });

    await expect(processStripeEvent(event)).rejects.toThrow(
      "Missing checkout session billing metadata"
    );
    expect(mockRecordProcessedStripeEvent).not.toHaveBeenCalled();
  });

  it("skips invoice.paid credit grants while subscription is past_due", async () => {
    mockGetSubscription.mockResolvedValue({
      id: "local-sub-id",
      workspaceId: "workspace-1",
      billingCustomerId: null,
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "past_due",
      planKey: "starter",
      priceId: "price_starter",
      currentPeriodStart: new Date("2026-05-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const event = stripeEvent("invoice.paid", {
      id: "in_past_due",
      subscription: "sub_123",
    });

    const result = await processStripeEvent(event);

    expect(mockCreateCreditGrant).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "processed", type: "invoice.paid" });
  });

  it("marks active subscriptions as past_due on payment failure", async () => {
    mockGetSubscription.mockResolvedValue({
      id: "local-sub-id",
      workspaceId: "workspace-1",
      billingCustomerId: null,
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "active",
      planKey: "starter",
      priceId: "price_starter",
      currentPeriodStart: new Date("2026-05-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const event = stripeEvent("invoice.payment_failed", {
      id: "in_failed",
      subscription: "sub_123",
    });

    const result = await processStripeEvent(event);

    expect(mockUpsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        status: "past_due",
      })
    );
    expect(mockCreateCreditGrant).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "processed", type: "invoice.payment_failed" });
  });

  it("reads subscription ids from current Stripe invoice parent details", async () => {
    const periodEnd = new Date("2026-06-19T00:00:00.000Z");
    mockGetSubscription.mockResolvedValue({
      id: "local-sub-id",
      workspaceId: "workspace-1",
      billingCustomerId: null,
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "active",
      planKey: "growth",
      priceId: "price_growth",
      currentPeriodStart: new Date("2026-05-19T00:00:00.000Z"),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const event = stripeEvent("invoice.paid", {
      id: "in_123",
      parent: {
        subscription_details: {
          subscription: "sub_123",
        },
      },
    });

    const result = await processStripeEvent(event);

    expect(mockGetSubscription).toHaveBeenCalledWith("sub_123");
    expect(mockCreateCreditGrant).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      source: "stripe_invoice",
      sourceId: "in_123",
      amount: 1200,
      expiresAt: periodEnd,
    });
    expect(result).toEqual({ status: "processed", type: "invoice.paid" });
  });
});
