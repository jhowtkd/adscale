"use client";

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useCanonicalWorksMock = vi.fn();
const useActiveProfileMock = vi.fn();
const useComposerMock = vi.fn();
const selectIntentMock = vi.fn();
const addInspirationMock = vi.fn();

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
vi.mock("@/components/creative-work/useCreativeComposer", () => ({
  useCreativeComposer: (...args: unknown[]) => useComposerMock(...args),
}));
vi.mock("@/components/creative-work/CreativeComposer", () => ({
  CreativeComposer: ({ composer, initialWorkId }: { composer?: { intent: string; quote: { credits: number } }; initialWorkId?: string }) => (
    <div data-testid="creative-composer">{composer ? `${composer.intent}:${composer.quote.credits}` : initialWorkId}</div>
  ),
}));
vi.mock("@/components/creative-work/BrandInspirations", () => ({
  BrandInspirations: ({ clientProfileId, onAttach }: { clientProfileId: string | null; onAttach: (value: { id: string }) => void }) => (
    <button type="button" onClick={() => onAttach({ id: "inspiration-1" })}>Inspirações {clientProfileId}</button>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

import DashboardHomeActions from "./DashboardHomeActions";

describe("DashboardHomeActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActiveProfileMock.mockReturnValue({ activeProfile: { id: "p1", name: "Marca A" } });
    useComposerMock.mockImplementation(() => {
      const [intent, setIntent] = useState<"variations" | "single" | "format_adaptation" | "restyle">("single");
      return {
        intent,
        quote: intent === "format_adaptation" ? { unitCount: 2, credits: 10 } : { unitCount: 1, credits: 5 },
        selectIntent: (next: typeof intent) => { selectIntentMock(next); setIntent(next); },
        addInspiration: addInspirationMock,
      };
    });
  });

  it("renders the approved hierarchy and resumes the exact canonical href", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [{
        id: "creative_work:w1", originKind: "creative_work", originId: "w1", origin: "quick_tool",
        workspaceId: "ws", name: "Post social", state: "generating", updatedAt: "2026-07-13T12:00:00.000Z",
        resumable: true, resumeHref: "/?workId=w1",
      }],
      isLoading: false, isError: false, refetch: vi.fn(),
    });

    render(<DashboardHomeActions workId="opened-work" />);

    expect(screen.getByTestId("creative-composer")).toHaveTextContent("single:5");
    expect(screen.getByRole("link", { name: /Continue: Post social/i })).toHaveAttribute("href", "/?workId=w1");
    expect(screen.getAllByRole("button").filter((button) => button.hasAttribute("aria-pressed"))).toHaveLength(4);
    expect(screen.getByTestId("brand-inspirations-slot")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.home.chooseIntent")).not.toBeInTheDocument();
  });

  it("uses the restored composer intent as the cards' single source of truth", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(<DashboardHomeActions workId="opened-work" />);

    expect(useComposerMock).toHaveBeenCalledWith({
      initialWorkId: "opened-work",
      initialIntent: undefined,
      focusComposer: false,
      initialTemplateId: undefined,
    });
    expect(screen.getByRole("button", { name: /dashboard\.home\.single/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("creative-composer")).toHaveTextContent("single:5");

    fireEvent.click(screen.getByRole("button", { name: /dashboard\.home\.restyle/i }));

    expect(selectIntentMock).toHaveBeenCalledWith("restyle");
    expect(screen.getByRole("button", { name: /dashboard\.home\.restyle/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("creative-composer")).toHaveTextContent("restyle:5");
  });

  it("passes safe route presets to the same composer instance", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(
      <DashboardHomeActions
        initialIntent="restyle"
        focusComposer
        templateId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      />
    );

    expect(useComposerMock).toHaveBeenCalledWith({
      initialWorkId: undefined,
      initialIntent: "restyle",
      focusComposer: true,
      initialTemplateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  it("shows a brand-aware first-creation prompt when nothing is actionable", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(<DashboardHomeActions />);

    expect(screen.getByText(/Marca A/)).toBeInTheDocument();
    expect(screen.getByText(/dashboard\.home\.firstCreationPrompt/)).toBeInTheDocument();
  });

  it("attaches brand inspirations through the same composer model", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(<DashboardHomeActions />);
    fireEvent.click(screen.getByRole("button", { name: "Inspirações p1" }));

    expect(addInspirationMock).toHaveBeenCalledWith({ id: "inspiration-1" });
  });
});
