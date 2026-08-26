import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let pathname = "/assistant";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({ home: "Studio", works: "Works" })[key] ?? key,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("./AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));
vi.mock("./V6ShellLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="v6-shell">{children}</div>,
}));
vi.mock("./TopBar", () => ({
  NotificationMenu: () => <div data-testid="notification-menu" />,
}));

import DashboardShellSwitcher from "./DashboardShellSwitcher";

describe("DashboardShellSwitcher", () => {
  it("keeps an assistant deep link usable on mobile without adding Assistant to primary chrome", () => {
    pathname = "/assistant";
    render(<DashboardShellSwitcher><p>Assistant content</p></DashboardShellSwitcher>);

    expect(screen.getByRole("link", { name: "Studio" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Works" })).toHaveAttribute("href", "/campaigns");
    expect(screen.getByTestId("notification-menu")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("assistant-shell-host");
  });

  it("uses the regular shell away from Assistant", () => {
    pathname = "/campaigns";
    render(<DashboardShellSwitcher><p>Campaign content</p></DashboardShellSwitcher>);

    expect(screen.getByTestId("app-shell")).toHaveTextContent("Campaign content");
    expect(screen.queryByRole("link", { name: "Studio" })).not.toBeInTheDocument();
  });
});
