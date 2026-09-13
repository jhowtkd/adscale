import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@/server/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/server/auth/platform-owner", () => ({
  isPlatformOwnerEmail: (email: string) => email === "admin@example.com",
}));
vi.mock("@/components/layout/DashboardShellSwitcher", () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/admin/AdminAgentation", () => ({
  default: () => <div data-testid="agentation" />,
}));

import { getSession } from "@/server/auth/session";
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

    render(await DashboardLayout({ children: "Dashboard content" }));

    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    expect(screen.queryByTestId("agentation") !== null).toBe(allowed);
  });
});
