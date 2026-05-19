import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/validation/env", () => ({
  env: { STRIPE_WEBHOOK_SECRET: "whsec_test" },
}));

const stripeMocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
}));

vi.mock("@/server/billing/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: stripeMocks.constructEvent },
  },
}));

vi.mock("@/server/billing/events", () => ({
  processStripeEvent: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { processStripeEvent } from "@/server/billing/events";
import { POST } from "./route";

const mockProcessStripeEvent = vi.mocked(processStripeEvent);

function request(signature?: string) {
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : undefined,
    body: JSON.stringify({ id: "evt_123" }),
  });
}

describe("POST /api/billing/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing Stripe signature", async () => {
    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("stripeSignatureMissing");
  });

  it("rejects an invalid Stripe signature", async () => {
    stripeMocks.constructEvent.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const res = await POST(request("bad-signature"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("stripeSignatureInvalid");
  });

  it("verifies and processes a signed event", async () => {
    const event = { id: "evt_123", type: "checkout.session.completed" };
    stripeMocks.constructEvent.mockReturnValue(event);
    mockProcessStripeEvent.mockResolvedValue({
      status: "processed",
      type: "checkout.session.completed",
    });

    const res = await POST(request("valid-signature"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(stripeMocks.constructEvent).toHaveBeenCalledWith(
      JSON.stringify({ id: "evt_123" }),
      "valid-signature",
      "whsec_test"
    );
    expect(mockProcessStripeEvent).toHaveBeenCalledWith(event);
    expect(body).toEqual({
      received: true,
      result: { status: "processed", type: "checkout.session.completed" },
    });
  });
});

