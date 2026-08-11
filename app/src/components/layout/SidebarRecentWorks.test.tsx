"use client";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const useCanonicalWorksMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `navigation.${key}`,
  useLocale: () => "pt-BR",
}));

vi.mock("@/lib/hooks/use-canonical-works", () => ({
  useCanonicalWorks: (...args: unknown[]) => useCanonicalWorksMock(...args),
}));
vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: () => ({
    profiles: [
      { id: "client-a", name: "Marca A" },
      { id: "client-b", name: "Marca B" },
    ],
    activeClientProfileId: "client-a",
  }),
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
    useCanonicalWorksMock.mockReset();
  });

  it("groups recent work by client, including standalone pieces", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [
        {
          id: "creative_work:w1",
          originKind: "creative_work",
          originId: "w1",
          origin: "quick_tool",
          workspaceId: "ws",
          clientProfileId: "client-a",
          name: "Post social",
          state: "generating",
          updatedAt: "2026-07-01T12:00:00.000Z",
          resumable: true,
          resumeHref: "/?workId=w1",
        },
        {
          id: "campaign:c1",
          originKind: "campaign",
          originId: "c1",
          origin: "campaign",
          workspaceId: "ws",
          clientProfileId: "client-a",
          name: "Black Friday",
          state: "briefing",
          updatedAt: "2026-07-01T11:00:00.000Z",
          resumable: true,
          resumeHref: "/campaigns/c1",
        },
        {
          id: "campaign:c2",
          originKind: "campaign",
          originId: "c2",
          origin: "campaign",
          workspaceId: "ws",
          clientProfileId: "client-b",
          name: "Institucional",
          state: "briefing",
          updatedAt: "2026-07-01T10:00:00.000Z",
          resumable: true,
          resumeHref: "/campaigns/c2",
        },
      ],
      isLoading: false,
    });

    render(<SidebarRecentWorks />, { wrapper });

    expect(screen.getByTestId("sidebar-recent-works")).toBeInTheDocument();
    expect(screen.getByText("navigation.recentWorks")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Post social/i })).toHaveAttribute(
      "href",
      "/?workId=w1"
    );
    expect(screen.getByText("Marca A")).toBeInTheDocument();
    expect(screen.getByText("Marca B")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Black Friday/i })).toHaveAttribute(
      "href",
      "/campaigns/c1"
    );
    expect(screen.getByRole("link", { name: /Institucional/i })).toHaveAttribute(
      "href",
      "/campaigns/c2"
    );
  });

  it("shows empty state linking to home for new work", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [],
      isLoading: false,
    });

    render(<SidebarRecentWorks />, { wrapper });

    expect(screen.getByText("navigation.recentWorksEmpty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "navigation.recentWorksCreate" })).toHaveAttribute(
      "href",
      "/"
    );
  });
});
