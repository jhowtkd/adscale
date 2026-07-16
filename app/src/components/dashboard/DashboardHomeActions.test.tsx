"use client";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useCanonicalWorksMock = vi.fn();
const useActiveProfileMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    key === "continueCampaignHint" && values?.name ? `Continue: ${values.name}` : `dashboard.home.${key}`,
}));
vi.mock("@/lib/hooks/use-canonical-works", () => ({
  useCanonicalWorks: (...args: unknown[]) => useCanonicalWorksMock(...args),
}));
vi.mock("@/lib/hooks/use-active-client-profile", () => ({
  useActiveClientProfile: () => useActiveProfileMock(),
}));
vi.mock("@/components/creative-work/CreativeComposer", () => ({
  CreativeComposer: ({ initialWorkId }: { initialWorkId?: string }) => <div data-testid="creative-composer">{initialWorkId}</div>,
}));
vi.mock("@/components/creative-work/CreativeToolCards", () => ({
  CreativeToolCards: () => <div data-testid="creative-tool-cards" />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

import DashboardHomeActions from "./DashboardHomeActions";

describe("DashboardHomeActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActiveProfileMock.mockReturnValue({ activeProfile: { id: "p1", name: "Marca A" } });
  });

  it("renders the approved hierarchy and resumes the exact canonical href", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [{
        id: "creative_work:w1", originKind: "creative_work", originId: "w1", origin: "quick_tool",
        workspaceId: "ws", name: "Post social", state: "generating", updatedAt: "2026-07-13T12:00:00.000Z",
        resumable: true, resumeHref: "/quick-tools/create-post?workId=w1",
      }],
      isLoading: false, isError: false, refetch: vi.fn(),
    });

    render(<DashboardHomeActions workId="opened-work" />);

    expect(screen.getByTestId("creative-composer")).toHaveTextContent("opened-work");
    expect(screen.getByRole("link", { name: /Continue: Post social/i })).toHaveAttribute("href", "/quick-tools/create-post?workId=w1");
    expect(screen.getByTestId("creative-tool-cards")).toBeInTheDocument();
    expect(screen.getByTestId("brand-inspirations-slot")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.home.chooseIntent")).not.toBeInTheDocument();
  });

  it("shows a brand-aware first-creation prompt when nothing is actionable", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(<DashboardHomeActions />);

    expect(screen.getByText(/Marca A/)).toBeInTheDocument();
    expect(screen.getByText(/dashboard\.home\.firstCreationPrompt/)).toBeInTheDocument();
  });
});
