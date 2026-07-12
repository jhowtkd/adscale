"use client";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const useDashboardStatsMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string, values?: Record<string, string>) => {
    if (ns === "dashboard.v6") {
      return `dashboard.v6.${key}`;
    }
    if (key === "continueCampaignHint" && values?.name) {
      return `Continue: ${values.name}`;
    }
    return `dashboard.home.${key}`;
  },
}));

vi.mock("@/lib/hooks/use-dashboard-stats", () => ({
  useDashboardStats: (...args: unknown[]) => useDashboardStatsMock(...args),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import DashboardHomeActions from "./DashboardHomeActions";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("DashboardHomeActions", () => {
  beforeEach(() => {
    useDashboardStatsMock.mockReset();
  });

  it("renders create campaign and continue when a campaign exists", () => {
    useDashboardStatsMock.mockReturnValue({
      data: {
        recentCampaigns: [
          { id: "camp-1", name: "Black Friday", status: "active", updatedAt: new Date() },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<DashboardHomeActions />, { wrapper });

    expect(screen.getByRole("link", { name: /createCampaign/i })).toHaveAttribute(
      "href",
      "/campaigns?new=1"
    );
    expect(screen.getByRole("link", { name: /Continue: Black Friday/i })).toHaveAttribute(
      "href",
      "/campaigns/camp-1"
    );
    expect(screen.getByRole("link", { name: /createPostName/i })).toHaveAttribute(
      "href",
      "/quick-tools/create-post"
    );
  });

  it("shows empty continue state when there are no campaigns", () => {
    useDashboardStatsMock.mockReturnValue({
      data: { recentCampaigns: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<DashboardHomeActions />, { wrapper });

    expect(screen.getByText("dashboard.home.continueEmpty")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /continueWhereLeftOff/i })).not.toBeInTheDocument();
  });
});
