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
vi.mock("@/components/layout/rail/RailShell", () => ({
  default: ({ children, activeBrand }: { children: ReactNode; activeBrand: { id: string } | null }) => (
    <main data-active-brand={activeBrand?.id ?? ""}>{children}</main>
  ),
}));
vi.mock("@/server/brands/active-brand", () => ({ resolveActiveBrand: vi.fn(async () => ({ id: "brand-1", name: "Café Aurora" })) }));
vi.mock("@/components/admin/AdminAgentation", () => ({
  default: () => <div data-testid="agentation" />,
}));

import { getSession } from "@/server/auth/session";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { resolveActiveBrand } from "@/server/brands/active-brand";
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

describe("dashboard rail shell", () => {
  beforeEach(() => {
    vi.mocked(requireWorkspaceAccess).mockReset();
    vi.mocked(resolveActiveBrand).mockClear();
  });

  it("hands the rail the workspace's active brand when signed in", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { email: "member@example.com" } } as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(requireWorkspaceAccess).mockResolvedValue({
      user: { id: "user-1" },
      workspace: { id: "ws-1" },
    } as Awaited<ReturnType<typeof requireWorkspaceAccess>>);

    render(await DashboardLayout({ children: "Dashboard content" }));

    expect(resolveActiveBrand).toHaveBeenCalledWith("ws-1");
    expect(screen.getByText("Dashboard content").closest("main")).toHaveAttribute("data-active-brand", "brand-1");
  });

  it("renders the rail with no brand, without throwing, when the user has no workspace yet", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { email: "member@example.com" } } as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(requireWorkspaceAccess).mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.noWorkspace, "No workspace"),
    );

    render(await DashboardLayout({ children: "Dashboard content" }));

    expect(resolveActiveBrand).not.toHaveBeenCalled();
    expect(screen.getByText("Dashboard content").closest("main")).toHaveAttribute("data-active-brand", "");
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
    expect(screen.getByText("Dashboard content").closest("main")).toHaveAttribute("data-active-brand", "");
  });
});
