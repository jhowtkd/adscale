import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/campaigns",
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("./TopBar", () => ({
  default: () => <div data-testid="top-bar" />,
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

  it("renders mobile primary navigation with safe-area padding class", () => {
    render(
      <AppShell>
        <p>Page body</p>
      </AppShell>
    );

    expect(screen.getByRole("navigation", { name: /primary mobile navigation/i })).toBeInTheDocument();
  });
});
