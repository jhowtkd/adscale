import { describe, it, expect } from "vitest";
import {
  billingCustomers,
  subscriptions,
  creditGrants,
  processedStripeEvents,
} from "@/server/db/schema";

describe("billing schema exports", () => {
  it("exports billingCustomers table with expected columns", () => {
    expect(billingCustomers).toBeDefined();
    const columns = Object.keys(billingCustomers);
    expect(columns).toContain("workspaceId");
    expect(columns).toContain("stripeCustomerId");
    expect(columns).toContain("createdAt");
    expect(columns).toContain("updatedAt");
  });

  it("exports subscriptions table with expected columns", () => {
    expect(subscriptions).toBeDefined();
    const columns = Object.keys(subscriptions);
    expect(columns).toContain("workspaceId");
    expect(columns).toContain("stripeSubscriptionId");
    expect(columns).toContain("stripeCustomerId");
    expect(columns).toContain("status");
    expect(columns).toContain("priceId");
    expect(columns).toContain("planKey");
    expect(columns).toContain("currentPeriodStart");
    expect(columns).toContain("currentPeriodEnd");
    expect(columns).toContain("cancelAtPeriodEnd");
    expect(columns).toContain("createdAt");
    expect(columns).toContain("updatedAt");
  });

  it("exports creditGrants table with expected columns", () => {
    expect(creditGrants).toBeDefined();
    const columns = Object.keys(creditGrants);
    expect(columns).toContain("workspaceId");
    expect(columns).toContain("source");
    expect(columns).toContain("sourceId");
    expect(columns).toContain("amount");
    expect(columns).toContain("remaining");
    expect(columns).toContain("expiresAt");
    expect(columns).toContain("createdAt");
    expect(columns).toContain("updatedAt");
  });

  it("exports processedStripeEvents table with expected columns", () => {
    expect(processedStripeEvents).toBeDefined();
    const columns = Object.keys(processedStripeEvents);
    expect(columns).toContain("id");
    expect(columns).toContain("stripeEventId");
    expect(columns).toContain("type");
    expect(columns).toContain("payload");
    expect(columns).toContain("processedAt");
    expect(columns).toContain("createdAt");
  });
});
