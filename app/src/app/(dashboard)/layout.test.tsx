import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";

vi.mock("@/server/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/server/auth/platform-owner", () => ({
  isPlatformOwnerEmail: (email: string) => email === "admin@example.com",
}));
vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(),
  isWorkspaceAuthError: (error: unknown) => error instanceof WorkspaceAuthError,
  AUTH_ERROR_CODES,
}));
vi.mock("@/server/equipe/module/equipe-enabled", () => ({
  isEquipeEnabledForWorkspace: vi.fn(() => false),
}));
vi.mock("@/components/layout/DashboardShellSwitcher", () => ({
  default: ({ children, homeConversationEnabled }: { children: ReactNode; homeConversationEnabled?: boolean }) => (
    <main data-home-conversation-enabled={String(!!homeConversationEnabled)}>{children}</main>
  ),
}));
vi.mock("@/components/admin/AdminAgentation", () => ({
  default: () => <div data-testid="agentation" />,
}));

import { getSession } from "@/server/auth/session";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { isEquipeEnabledForWorkspace } from "@/server/equipe/module/equipe-enabled";
import DashboardLayout from "./layout";

describe("dashboard annotation access", () => {
  it.each([
    ["platform admin", { user: { email: "admin@example.com" } }, true],
    ["workspace admin", { user: { email: "client@example.com", role: "admin" } }, false],
    ["member", { user: { email: "member@example.com" } }, false],
    ["missing email", { user: {} }, false],
    ["signed out", null, false],
  ])("limits Agentation for %s while preserving the page", async (_, session, allowed) => {
    vi.mocked(getSession).mockResolvedValue(session as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(requireWorkspaceAccess).mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.noWorkspace, "No workspace"),
    );

    render(await DashboardLayout({ children: "Dashboard content" }));

    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    expect(screen.queryByTestId("agentation") !== null).toBe(allowed);
  });
});

describe("dashboard home conversation gate", () => {
  beforeEach(() => {
    vi.mocked(requireWorkspaceAccess).mockReset();
    vi.mocked(isEquipeEnabledForWorkspace).mockReset();
  });

  it("passes the workspace gate through to the shell switcher when signed in", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { email: "member@example.com" } } as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(requireWorkspaceAccess).mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "ws-1" },
    } as Awaited<ReturnType<typeof requireWorkspaceAccess>>);
    vi.mocked(isEquipeEnabledForWorkspace).mockReturnValue(true);

    render(await DashboardLayout({ children: "Dashboard content" }));

    expect(isEquipeEnabledForWorkspace).toHaveBeenCalledWith("ws-1");
    expect(screen.getByText("Dashboard content").closest("main")).toHaveAttribute(
      "data-home-conversation-enabled",
      "true",
    );
  });

  it("keeps the gate off without throwing when the user has no workspace yet", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { email: "member@example.com" } } as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(requireWorkspaceAccess).mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.noWorkspace, "No workspace"),
    );

    render(await DashboardLayout({ children: "Dashboard content" }));

    expect(screen.getByText("Dashboard content").closest("main")).toHaveAttribute(
      "data-home-conversation-enabled",
      "false",
    );
  });

  it("rethrows workspace errors other than noWorkspace", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { email: "member@example.com" } } as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(requireWorkspaceAccess).mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"),
    );

    await expect(DashboardLayout({ children: "Dashboard content" })).rejects.toThrow();
  });

  it("skips the workspace lookup entirely when signed out", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    render(await DashboardLayout({ children: "Dashboard content" }));

    expect(requireWorkspaceAccess).not.toHaveBeenCalled();
    expect(screen.getByText("Dashboard content").closest("main")).toHaveAttribute(
      "data-home-conversation-enabled",
      "false",
    );
  });
});
