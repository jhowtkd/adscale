import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1", email: "user@example.com" },
      workspace: { id: "workspace-1", name: "Workspace" },
    })
  ),
}));

vi.mock("@/server/billing/sessions", () => ({
  createCheckoutSession: vi.fn(),
}));

vi.mock("@/server/billing/plans", () => ({
  billingPlanKeys: ["starter", "growth", "scale"],
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { createCheckoutSession } from "@/server/billing/sessions";
import { POST } from "./route";

const mockCreateCheckoutSession = vi.mocked(createCheckoutSession);

function requestWith(body: unknown) {
  return new Request("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an invalid plan key", async () => {
    const res = await POST(requestWith({ planKey: "enterprise" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("invalidRequestBody");
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it("creates a checkout session for the selected plan", async () => {
    mockCreateCheckoutSession.mockResolvedValue({
      url: "https://checkout.stripe.com/session",
    } as Awaited<ReturnType<typeof createCheckoutSession>>);

    const res = await POST(requestWith({ planKey: "growth" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ url: "https://checkout.stripe.com/session" });
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
      user: { id: "user-1", email: "user@example.com" },
      workspace: { id: "workspace-1", name: "Workspace" },
      planKey: "growth",
    });
  });

  it("returns an error when Stripe does not return a checkout URL", async () => {
    mockCreateCheckoutSession.mockResolvedValue({
      url: null,
    } as Awaited<ReturnType<typeof createCheckoutSession>>);

    const res = await POST(requestWith({ planKey: "starter" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("checkoutSessionFailed");
  });
});
