"use client";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const useDashboardStatsMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `navigation.${key}`,
  useLocale: () => "pt-BR",
}));

vi.mock("@/lib/hooks/use-dashboard-stats", () => ({
  useDashboardStats: (...args: unknown[]) => useDashboardStatsMock(...args),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <img alt={alt ?? ""} />,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import SidebarRecentWorks from "./SidebarRecentWorks";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("SidebarRecentWorks", () => {
  beforeEach(() => {
    useDashboardStatsMock.mockReset();
  });

  it("lists recent campaigns as trabalhos recentes", () => {
    useDashboardStatsMock.mockReturnValue({
      data: {
        recentCampaigns: [
          {
            id: "camp-1",
            name: "Black Friday",
            thumbnailUrl: null,
            pieceCount: 3,
            approvedCount: 1,
            status: "active",
            updatedAt: new Date("2026-07-01T12:00:00Z"),
          },
        ],
      },
      isLoading: false,
    });

    render(<SidebarRecentWorks />, { wrapper });

    expect(screen.getByTestId("sidebar-recent-works")).toBeInTheDocument();
    expect(screen.getByText("navigation.recentWorks")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Black Friday/i })).toHaveAttribute(
      "href",
      "/campaigns/camp-1"
    );
  });

  it("shows empty state when there are no campaigns", () => {
    useDashboardStatsMock.mockReturnValue({
      data: { recentCampaigns: [] },
      isLoading: false,
    });

    render(<SidebarRecentWorks />, { wrapper });

    expect(screen.getByText("navigation.recentWorksEmpty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "navigation.recentWorksCreate" })).toHaveAttribute(
      "href",
      "/campaigns?new=1"
    );
  });
});
