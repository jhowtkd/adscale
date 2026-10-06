import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1", email: "user@example.com" },
      workspace: { id: "workspace-1", name: "Workspace" },
    })
  ),
}));

const freePlan = vi.hoisted(() => ({ find: vi.fn(async (): Promise<{ accountId: string } | null> => null) }));
vi.mock("@/server/equipe/module/free-plan", () => ({ findFreePlanAccount: (...args: unknown[]) => (freePlan.find as (...a: unknown[]) => unknown)(...args) }));

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
      returnPath: undefined,
    });
  });

  it("forwards returnPath to checkout session creation", async () => {
    mockCreateCheckoutSession.mockResolvedValue({
      url: "https://checkout.stripe.com/session",
    } as Awaited<ReturnType<typeof createCheckoutSession>>);

    const res = await POST(
      requestWith({ planKey: "starter", returnPath: "/campaigns/c1?tab=generate" })
    );

    expect(res.status).toBe(200);
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
      user: { id: "user-1", email: "user@example.com" },
      workspace: { id: "workspace-1", name: "Workspace" },
      planKey: "starter",
      returnPath: "/campaigns/c1?tab=generate",
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

// Ticket 11, part 2: paying would not lift the free plan, so the classic checkout is not sold to it.
describe("POST /api/billing/checkout: the free plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
    mockCreateCheckoutSession.mockResolvedValue({ url: "https://checkout.stripe.com/session" } as Awaited<ReturnType<typeof createCheckoutSession>>);
  });

  it("refuses with 402 free_plan and the plan request; no checkout session is created", async () => {
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });

    const res = await POST(requestWith({ planKey: "growth" }));
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.code).toBe("free_plan");
    expect(body.details).toMatchObject({ reason: "free_plan", recommendedAction: "plan_request", accountId: "acc-free" });
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it("refuses at the entry: even an invalid plan key or a body that is not JSON gets the free plan's answer", async () => {
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });

    const invalid = await POST(requestWith({ planKey: "enterprise" }));
    const notJson = await POST(new Request("http://localhost/api/billing/checkout", { method: "POST", body: "not json" }));

    expect(invalid.status).toBe(402);
    expect(notJson.status).toBe(402);
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it("a paid or classic workspace (rule null) gets its session exactly as before", async () => {
    const res = await POST(requestWith({ planKey: "growth" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/session" });
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it("a paid or classic workspace still gets 400 for an invalid plan key", async () => {
    const res = await POST(requestWith({ planKey: "enterprise" }));

    expect(res.status).toBe(400);
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
  });
});
