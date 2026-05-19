import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1", name: "Workspace" },
    })
  ),
}));

vi.mock("@/server/billing/sessions", () => ({
  createPortalSession: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { createPortalSession } from "@/server/billing/sessions";
import { POST } from "./route";

const mockCreatePortalSession = vi.mocked(createPortalSession);

describe("POST /api/billing/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when workspace has no Stripe customer yet", async () => {
    mockCreatePortalSession.mockResolvedValue(null);

    const res = await POST(new Request("http://localhost/api/billing/portal", {
      method: "POST",
    }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("billingCustomerNotFound");
  });

  it("creates a portal session for the current workspace", async () => {
    mockCreatePortalSession.mockResolvedValue({
      url: "https://billing.stripe.com/session",
    } as Awaited<ReturnType<typeof createPortalSession>>);

    const res = await POST(new Request("http://localhost/api/billing/portal", {
      method: "POST",
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ url: "https://billing.stripe.com/session" });
    expect(mockCreatePortalSession).toHaveBeenCalledWith({
      workspace: { id: "workspace-1", name: "Workspace" },
    });
  });

  it("returns an error when Stripe does not return a portal URL", async () => {
    mockCreatePortalSession.mockResolvedValue({
      url: null,
    } as Awaited<ReturnType<typeof createPortalSession>>);

    const res = await POST(new Request("http://localhost/api/billing/portal", {
      method: "POST",
    }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("portalSessionFailed");
  });
});
