import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InviteContent from "./InviteContent";

const mocks = vi.hoisted(() => ({
  token: "invite-token" as string | null,
  session: { user: { email: "person@example.com" } } as { user: { email: string } } | null,
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => ({ get: () => mocks.token }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: mocks.session, isPending: false }) },
}));

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function preview(matchesInvite = true) {
  return {
    invite: {
      workspaceName: "Studio ADScale",
      role: "member",
      senderName: "Ana",
      recipientEmail: "p••••@example.com",
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
    account: { email: "person@example.com", matchesInvite },
  };
}

function renderInvite() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><InviteContent /></QueryClientProvider>);
}

describe("InviteContent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.token = "invite-token";
    mocks.session = { user: { email: "person@example.com" } };
    mocks.push.mockReset();
  });

  it("shows progress, context and a successful acceptance", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(preview()))
      .mockResolvedValueOnce(response({ success: true, workspaceId: "workspace-2" }));

    renderInvite();
    expect(screen.getByRole("status")).toHaveTextContent("processingInvite");
    expect(await screen.findByText(/inviteWorkspaceLabel.*Studio ADScale/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "acceptInvite" }));
    expect(await screen.findByText("inviteSuccess")).toBeVisible();
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/workspace/invites/accept",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "invite-token" }) }),
    );
  });

  it("offers account switching when the signed-in account does not match", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(preview(false)));

    renderInvite();

    expect(await screen.findByRole("button", { name: "switchAccount" })).toBeVisible();
    expect(screen.getByText("inviteWrongAccount")).toBeVisible();
  });

  it("keeps distinct token failure states actionable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ error: "Expired", code: "inviteExpired" }, 410));

    renderInvite();

    expect(await screen.findByText("inviteExpired")).toBeVisible();
    expect(screen.getByRole("button", { name: "retry" })).toBeVisible();
  });

  it("rejects a missing token without a request", async () => {
    mocks.token = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderInvite();

    expect(await screen.findByText("invalidToken")).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
