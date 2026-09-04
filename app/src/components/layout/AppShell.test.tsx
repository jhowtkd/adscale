import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";

let pathname = "/campaigns";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("./TopBar", () => ({
  default: () => <div data-testid="top-bar" />,
  NotificationMenu: () => <div data-testid="notification-menu" />,
}));

vi.mock("./AppSidebar", () => ({
  default: () => <aside data-testid="app-sidebar" />,
}));

vi.mock("./V6ShellLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="v6-shell">{children}</div>,
}));

vi.mock("./Footer", () => ({
  default: () => <footer data-testid="footer" />,
}));

vi.mock("@/components/feedback/FeedbackProvider", () => ({
  FeedbackProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/mission-insights/MissionInsightProvider", () => ({
  MissionInsightProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/feedback/FeedbackBreadcrumbTracker", () => ({
  default: () => null,
}));

vi.mock("./DeploymentVersionGuard", () => ({
  default: () => null,
}));

describe("AppShell", () => {
  beforeEach(() => {
    pathname = "/campaigns";
  });
  it("exposes a single primary main landmark for page content", () => {
    render(
      <AppShell>
        <p>Page body</p>
      </AppShell>
    );

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveTextContent("Page body");
    expect(screen.queryAllByRole("main")).toHaveLength(1);
  });

  it("renders Home · Trabalhos · Biblioteca · Marcas · Mais (Config not primary)", () => {
    render(
      <AppShell>
        <p>Page body</p>
      </AppShell>
    );

    const nav = screen.getByRole("navigation", { name: /primary mobile navigation/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^home$/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /^works$/i })).toHaveAttribute("href", "/campaigns");
    expect(screen.getByRole("link", { name: /^title$/i })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: /^brands$/i })).toHaveAttribute("href", "/brand-kit");
    expect(screen.queryByRole("link", { name: /^settings$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /config/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /templates/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more/i })).toBeInTheDocument();
  });

  it("does not apply the dotted background on the main shell", () => {
    render(
      <AppShell>
        <p>Page body</p>
      </AppShell>
    );

    expect(screen.getByRole("main").className).not.toContain("dot-grid");
  });

  it("mounts one notification control outside the sidebar", () => {
    render(
      <AppShell>
        <p>Page body</p>
      </AppShell>
    );

    expect(screen.getAllByTestId("notification-menu")).toHaveLength(1);
    expect(screen.getByRole("banner")).toHaveClass("md:right-[var(--shell-v6-gap)]", "md:bg-transparent");
  });

  it("marks More active for Docs, which lives in that mobile sheet", () => {
    pathname = "/docs";
    render(
      <AppShell>
        <p>Docs body</p>
      </AppShell>
    );

    expect(screen.getByRole("button", { name: /more/i })).toHaveClass("bg-[var(--active-navigation-bg)]");
  });
});
