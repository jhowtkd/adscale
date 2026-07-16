"use client";

import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const useCanonicalWorksMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === "continueCampaignHint" && values?.name) {
      return `Continue: ${values.name}`;
    }
    return `dashboard.home.${key}`;
  },
}));

vi.mock("@/lib/hooks/use-canonical-works", () => ({
  useCanonicalWorks: (...args: unknown[]) => useCanonicalWorksMock(...args),
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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("DashboardHomeActions", () => {
  beforeEach(() => {
    useCanonicalWorksMock.mockReset();
  });

  it("asks for intent before choosing a surface, then continue uses resumeHref", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [
        {
          id: "creative_work:w1",
          originKind: "creative_work",
          originId: "w1",
          origin: "quick_tool",
          workspaceId: "ws",
          name: "Post social",
          state: "generating",
          updatedAt: "2026-07-13T12:00:00.000Z",
          resumable: true,
          resumeHref: "/quick-tools/create-post?workId=w1",
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<DashboardHomeActions />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: /newWork/i }));
    expect(screen.getByRole("link", { name: /intentCampaign/i })).toHaveAttribute(
      "href",
      "/campaigns?new=1"
    );
    expect(screen.getByRole("link", { name: /intentSocialPost/i })).toHaveAttribute(
      "href",
      "/quick-tools/create-post"
    );
    expect(screen.getByRole("link", { name: /intentAssistant/i })).toHaveAttribute(
      "href",
      "/assistant"
    );

    expect(screen.getByRole("link", { name: /Continue: Post social/i })).toHaveAttribute(
      "href",
      "/quick-tools/create-post?workId=w1"
    );
  });

  it("shows empty continue when no resumable works", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<DashboardHomeActions />, { wrapper });

    expect(screen.getByText("dashboard.home.continueEmpty")).toBeInTheDocument();
  });
});
