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
  recordCheckoutSubscription: vi.fn(),
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
  recordCheckoutSubscription,
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
const mockRecordCheckoutSubscription = vi.mocked(recordCheckoutSubscription);
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
    // Review R5: a checkout never writes a status or a period (it may arrive after the subscription's own events).
    expect(mockRecordCheckoutSubscription).toHaveBeenCalledTimes(1);
    expect(mockRecordCheckoutSubscription).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      planKey: "growth",
      priceId: "price_growth",
    });
    expect(mockUpsertSubscription).not.toHaveBeenCalled();
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

    expect(mockStripeSubscriptionRetrieve).not.toHaveBeenCalled();
    expect(mockCreateCreditGrant).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        source: "stripe_invoice",
        sourceId: "in_123",
        amount: 1200,
        expiresAt: periodEnd,
      }
    );
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
    expect(mockCreateCreditGrant).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        source: "stripe_invoice",
        sourceId: "in_123",
        amount: 1200,
        expiresAt: periodEnd,
      }
    );
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

  it("skips invoice.paid credit grants while Stripe says the subscription is past_due (a not-active local row is re-read from Stripe)", async () => {
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
    mockStripeSubscriptionRetrieve.mockResolvedValue({
      id: "sub_123", customer: "cus_123", status: "past_due", metadata: { workspaceId: "workspace-1", planKey: "starter" },
      cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_starter" }, current_period_start: 1_777_000_000, current_period_end: 1_779_600_000 }] },
    } as unknown as Stripe.Response<Stripe.Subscription>);
    mockUpsertSubscription.mockResolvedValue({
      workspaceId: "workspace-1", stripeSubscriptionId: "sub_123", stripeCustomerId: "cus_123", status: "past_due", planKey: "starter",
    } as never);
    const event = stripeEvent("invoice.paid", {
      id: "in_past_due",
      subscription: "sub_123",
    });

    const result = await processStripeEvent(event);

    expect(mockStripeSubscriptionRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mockCreateCreditGrant).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "processed", type: "invoice.paid" });
  });

  // Review R7/O1: Stripe does not order its events, so a local row that is not active may be behind the subscription.
  describe("a local row that is not active is re-read from Stripe before the grant", () => {
    const local = (status: string) => ({
      id: "local-sub-id", workspaceId: "workspace-1", billingCustomerId: null, stripeSubscriptionId: "sub_123", stripeCustomerId: "cus_123",
      status, planKey: "starter", priceId: "price_starter", currentPeriodStart: new Date("2026-05-01T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"), cancelAtPeriodEnd: false, createdAt: new Date(), updatedAt: new Date(),
    });
    const END = 1_781_827_200;
    const stripeState = (status: string) => ({
      id: "sub_123", customer: "cus_123", status, metadata: { workspaceId: "workspace-1", planKey: "starter" }, cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_starter" }, current_period_start: END - 2_592_000, current_period_end: END }] },
    }) as unknown as Stripe.Response<Stripe.Subscription>;
    const syncedAs = (status: string) => mockUpsertSubscription.mockResolvedValue({ ...local(status), currentPeriodEnd: new Date(END * 1000) } as never);

    it("local past_due, Stripe active (the payment just recovered it): synced, and the month's credits are granted once, expiring with the item's period", async () => {
      mockGetSubscription.mockResolvedValue(local("past_due") as never);
      mockStripeSubscriptionRetrieve.mockResolvedValue(stripeState("active"));
      syncedAs("active");

      const result = await processStripeEvent(stripeEvent("invoice.paid", { id: "in_recovered", subscription: "sub_123" }));

      expect(mockStripeSubscriptionRetrieve).toHaveBeenCalledWith("sub_123");
      expect(mockUpsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ status: "active", currentPeriodEnd: new Date(END * 1000) }));
      expect(mockCreateCreditGrant).toHaveBeenCalledTimes(1);
      expect(mockCreateCreditGrant).toHaveBeenCalledWith({
        workspaceId: "workspace-1", source: "stripe_invoice", sourceId: "in_recovered", amount: 300, expiresAt: new Date(END * 1000),
      });
      expect(result).toEqual({ status: "processed", type: "invoice.paid" });
    });

    it.each([
      ["incomplete", "active", true],
      ["canceled", "active", true],
      ["trialing", "trialing", true],
      ["incomplete", "incomplete", false],
      ["canceled", "canceled", false],
      ["past_due", "past_due", false],
      ["past_due", "canceled", false],
    ])("local %s, Stripe %s: grant = %s (Stripe's state decides, only active and trialing receive credit)", async (localStatus, stripeStatus, granted) => {
      mockGetSubscription.mockResolvedValue(local(localStatus) as never);
      mockStripeSubscriptionRetrieve.mockResolvedValue(stripeState(stripeStatus));
      syncedAs(stripeStatus);

      await processStripeEvent(stripeEvent("invoice.paid", { id: "in_x", subscription: "sub_123" }));

      expect(mockStripeSubscriptionRetrieve).toHaveBeenCalledTimes(1);
      expect(mockCreateCreditGrant).toHaveBeenCalledTimes(granted ? 1 : 0);
    });

    it("local active: Stripe is NOT asked, and the grant comes from the local row", async () => {
      mockGetSubscription.mockResolvedValue({ ...local("active"), currentPeriodEnd: new Date(END * 1000) } as never);

      await processStripeEvent(stripeEvent("invoice.paid", { id: "in_active", subscription: "sub_123" }));

      expect(mockStripeSubscriptionRetrieve).not.toHaveBeenCalled();
      expect(mockUpsertSubscription).not.toHaveBeenCalled();
      expect(mockCreateCreditGrant).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "in_active", amount: 300 }));
    });

    it("an invoice that already granted is skipped before any Stripe call, whatever the local state", async () => {
      mockGetCreditGrantBySourceId.mockResolvedValue({ id: "g" } as never);
      mockGetSubscription.mockResolvedValue(local("past_due") as never);

      await processStripeEvent(stripeEvent("invoice.paid", { id: "in_done", subscription: "sub_123" }));

      expect(mockStripeSubscriptionRetrieve).not.toHaveBeenCalled();
      expect(mockCreateCreditGrant).not.toHaveBeenCalled();
    });

    it("a failed Stripe read fails the event (nothing recorded, so the delivery is retried and the credits are not lost)", async () => {
      mockGetSubscription.mockResolvedValue(local("past_due") as never);
      mockStripeSubscriptionRetrieve.mockRejectedValue(new Error("stripe down"));

      await expect(processStripeEvent(stripeEvent("invoice.paid", { id: "in_retry", subscription: "sub_123" }))).rejects.toThrow("stripe down");

      expect(mockRecordProcessedStripeEvent).not.toHaveBeenCalled();
      expect(mockCreateCreditGrant).not.toHaveBeenCalled();
    });
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
    expect(mockCreateCreditGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        source: "stripe_invoice",
        sourceId: "in_123",
        amount: 1200,
        expiresAt: periodEnd,
      })
    );
    expect(result).toEqual({ status: "processed", type: "invoice.paid" });
  });

  it("syncs subscription from Stripe and grants credits when local subscription is in checkout_completed state", async () => {
    const periodEnd = new Date("2026-06-19T00:00:00.000Z");
    mockGetSubscription.mockResolvedValue({
      id: "local-sub-id",
      workspaceId: "workspace-1",
      billingCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "checkout_completed",
      planKey: "starter",
      priceId: "price_starter",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockStripeSubscriptionRetrieve.mockResolvedValue({
      id: "sub_123",
      customer: "cus_123",
      status: "active",
      metadata: {
        workspaceId: "workspace-1",
        planKey: "starter",
      },
      items: { data: [{ price: { id: "price_starter" } }] },
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
      planKey: "starter",
      priceId: "price_starter",
      currentPeriodStart: new Date("2026-05-19T00:00:00.000Z"),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const event = stripeEvent("invoice.paid", {
      id: "in_first_invoice",
      subscription: "sub_123",
    });

    const result = await processStripeEvent(event);

    expect(mockStripeSubscriptionRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mockUpsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        status: "active",
        planKey: "starter",
      })
    );
    expect(mockCreateCreditGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        source: "stripe_invoice",
        sourceId: "in_first_invoice",
        amount: 300,
      })
    );
    expect(result).toEqual({ status: "processed", type: "invoice.paid" });
  });

  // Review R4: since the Basil API the current period is on the subscription's ITEMS, not on the subscription.
  describe("the subscription period (Basil items and the legacy top level)", () => {
    const START = 1_779_148_800;
    const END = 1_781_827_200;
    const subscriptionEvent = (overrides: Record<string, unknown>) =>
      stripeEvent("customer.subscription.updated", {
        id: "sub_123", customer: "cus_123", status: "active", metadata: { workspaceId: "workspace-1" },
        cancel_at_period_end: false, ...overrides,
      });
    const item = (priceId: string, period: Record<string, unknown> = {}) => ({ price: { id: priceId }, ...period });
    const upsertArg = () => mockUpsertSubscription.mock.calls[0]![0];

    it("Basil: the period only on the item (nothing on top) is stored", async () => {
      await processStripeEvent(subscriptionEvent({ items: { data: [item("price_starter", { current_period_start: START, current_period_end: END })] } }));

      expect(upsertArg()).toMatchObject({ currentPeriodStart: new Date(START * 1000), currentPeriodEnd: new Date(END * 1000), priceId: "price_starter", planKey: "starter" });
    });

    it("legacy: the period only on top is stored (an older API version's payload)", async () => {
      await processStripeEvent(subscriptionEvent({ items: { data: [item("price_starter")] }, current_period_start: START, current_period_end: END }));

      expect(upsertArg()).toMatchObject({ currentPeriodStart: new Date(START * 1000), currentPeriodEnd: new Date(END * 1000) });
    });

    it("both: the item's period wins over the top level", async () => {
      await processStripeEvent(subscriptionEvent({
        items: { data: [item("price_starter", { current_period_start: START, current_period_end: END })] },
        current_period_start: 1_000, current_period_end: 2_000,
      }));

      expect(upsertArg()).toMatchObject({ currentPeriodStart: new Date(START * 1000), currentPeriodEnd: new Date(END * 1000) });
    });

    it("several items: the PLAN's item gives the price id, the plan and the period, even when it is not the first", async () => {
      await processStripeEvent(subscriptionEvent({
        metadata: { workspaceId: "workspace-1" },
        items: { data: [
          item("price_addon_seats", { current_period_start: 10, current_period_end: 20 }),
          item("price_growth", { current_period_start: START, current_period_end: END }),
        ] },
      }));

      expect(upsertArg()).toMatchObject({ priceId: "price_growth", planKey: "growth", currentPeriodStart: new Date(START * 1000), currentPeriodEnd: new Date(END * 1000) });
    });

    it("no item with a plan price: the first item counts (price id and period)", async () => {
      await processStripeEvent(subscriptionEvent({
        metadata: { workspaceId: "workspace-1", planKey: "starter" },
        items: { data: [item("price_other_a", { current_period_start: START, current_period_end: END }), item("price_other_b", { current_period_start: 1, current_period_end: 2 })] },
      }));

      expect(upsertArg()).toMatchObject({ priceId: "price_other_a", currentPeriodStart: new Date(START * 1000), currentPeriodEnd: new Date(END * 1000) });
    });

    it("an item without a period falls back to the top level, field by field", async () => {
      await processStripeEvent(subscriptionEvent({
        items: { data: [item("price_starter", { current_period_end: END })] },
        current_period_start: START, current_period_end: 5_000,
      }));

      expect(upsertArg()).toMatchObject({ currentPeriodStart: new Date(START * 1000), currentPeriodEnd: new Date(END * 1000) });
    });

    it("no period anywhere: both stay null (the past_due grace then refuses it)", async () => {
      await processStripeEvent(subscriptionEvent({ items: { data: [item("price_starter")] } }));

      expect(upsertArg()).toMatchObject({ currentPeriodStart: null, currentPeriodEnd: null });
    });

    it("the recovery path (invoice.paid with no local subscription) reads the period from the retrieved subscription's item", async () => {
      mockStripeSubscriptionRetrieve.mockResolvedValue({
        id: "sub_123", customer: "cus_123", status: "active", metadata: { workspaceId: "workspace-1", planKey: "starter" },
        cancel_at_period_end: false,
        items: { data: [item("price_starter", { current_period_start: START, current_period_end: END })] },
      } as unknown as Stripe.Response<Stripe.Subscription>);
      mockUpsertSubscription.mockResolvedValue({
        workspaceId: "workspace-1", stripeSubscriptionId: "sub_123", stripeCustomerId: "cus_123", status: "active", planKey: "starter",
        currentPeriodEnd: new Date(END * 1000),
      } as never);

      await processStripeEvent(stripeEvent("invoice.paid", { id: "in_basil", parent: { subscription_details: { subscription: "sub_123" } } }));

      expect(mockStripeSubscriptionRetrieve).toHaveBeenCalledWith("sub_123");
      expect(upsertArg()).toMatchObject({ status: "active", currentPeriodStart: new Date(START * 1000), currentPeriodEnd: new Date(END * 1000) });
      expect(mockCreateCreditGrant).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "in_basil", expiresAt: new Date(END * 1000) }));
    });

    it("the recovery path of invoice.payment_failed reads the item's period too", async () => {
      mockStripeSubscriptionRetrieve.mockResolvedValue({
        id: "sub_123", customer: "cus_123", status: "past_due", metadata: { workspaceId: "workspace-1", planKey: "starter" },
        cancel_at_period_end: false,
        items: { data: [item("price_starter", { current_period_start: START, current_period_end: END })] },
      } as unknown as Stripe.Response<Stripe.Subscription>);
      mockUpsertSubscription.mockResolvedValue({
        workspaceId: "workspace-1", stripeSubscriptionId: "sub_123", stripeCustomerId: "cus_123", status: "past_due", planKey: "starter",
      } as never);

      await processStripeEvent(stripeEvent("invoice.payment_failed", { id: "in_fail", subscription: "sub_123" }));

      expect(upsertArg()).toMatchObject({ status: "past_due", currentPeriodEnd: new Date(END * 1000) });
    });
  });

  // Review R5: Stripe does not order its events.
  describe("a checkout never takes a confirmed subscription back", () => {
    it("records the checkout through the dedicated statement only, with no status and no period", async () => {
      await processStripeEvent(stripeEvent("checkout.session.completed", {
        customer: "cus_123", subscription: "sub_123", metadata: { workspaceId: "workspace-1", planKey: "starter" },
      }));

      expect(mockRecordCheckoutSubscription.mock.calls[0]![0]).not.toHaveProperty("status");
      expect(mockRecordCheckoutSubscription.mock.calls[0]![0]).not.toHaveProperty("currentPeriodEnd");
      expect(mockUpsertSubscription).not.toHaveBeenCalled();
      expect(mockSaveBillingCustomer).toHaveBeenCalledTimes(1);
    });
  });

  // Review R6: a one-off invoice is a payment of the customer, not an error.
  describe("an invoice.paid with no subscription (a one-off invoice)", () => {
    const shapes: Array<[string, Record<string, unknown>]> = [
      ["no subscription field at all", { id: "in_one_off", customer: "cus_123", amount_paid: 4700 }],
      ["subscription null (legacy)", { id: "in_one_off", customer: "cus_123", amount_paid: 4700, subscription: null }],
      ["parent null (Basil)", { id: "in_one_off", customer: "cus_123", amount_paid: 4700, parent: null }],
      ["a quote parent (Basil, not a subscription)", { id: "in_one_off", customer: "cus_123", amount_paid: 4700, parent: { type: "quote_details", quote_details: { quote: "qt_1" } } }],
      ["lines without subscription_item_details", { id: "in_one_off", customer: "cus_123", amount_paid: 4700, lines: { data: [{ parent: null }, { parent: { type: "invoice_item_details" } }] } }],
      ["empty lines", { id: "in_one_off", customer: "cus_123", amount_paid: 4700, lines: { data: [] } }],
    ];

    it.each(shapes)("%s: processed, recorded with its payload, and no grant, no lookup, no retrieve", async (_name, invoice) => {
      const event = stripeEvent("invoice.paid", invoice);

      const result = await processStripeEvent(event);

      expect(result).toEqual({ status: "processed", type: "invoice.paid" });
      expect(mockRecordProcessedStripeEvent).toHaveBeenCalledWith({ stripeEventId: event.id, type: "invoice.paid", payload: event });
      expect(mockCreateCreditGrant).not.toHaveBeenCalled();
      expect(mockGetSubscription).not.toHaveBeenCalled();
      expect(mockStripeSubscriptionRetrieve).not.toHaveBeenCalled();
      expect(mockUpsertSubscription).not.toHaveBeenCalled();
    });

    it("an invoice without an id is still an error (nothing is recorded)", async () => {
      await expect(processStripeEvent(stripeEvent("invoice.paid", { customer: "cus_123", amount_paid: 4700 }))).rejects.toThrow("Missing invoice id");
      expect(mockRecordProcessedStripeEvent).not.toHaveBeenCalled();
    });

    it("invoice.payment_failed with no subscription is still an error (only the paid event changed)", async () => {
      await expect(processStripeEvent(stripeEvent("invoice.payment_failed", { id: "in_x", customer: "cus_123" }))).rejects.toThrow("Missing invoice subscription");
    });
  });
});
