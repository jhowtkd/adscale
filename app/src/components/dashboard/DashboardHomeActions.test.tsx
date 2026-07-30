"use client";

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useCanonicalWorksMock = vi.fn();
const useActiveProfileMock = vi.fn();
const useComposerMock = vi.fn();
const useCreativeWorkMock = vi.fn();
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
vi.mock("@/lib/hooks/use-creative-work", () => ({
  useCreativeWork: (...args: unknown[]) => useCreativeWorkMock(...args),
}));
vi.mock("@/components/creative-work/useCreativeComposer", () => ({
  useCreativeComposer: (...args: unknown[]) => useComposerMock(...args),
}));
vi.mock("@/components/creative-work/CreativeComposer", () => ({
  CreativeComposer: ({ composer, initialWorkId }: { composer?: { intent: string; quote: { credits: number } }; initialWorkId?: string }) => (
    <div data-testid="creative-composer">{composer ? `${composer.intent}:${composer.quote.credits}` : initialWorkId}</div>
  ),
}));
vi.mock("@/components/layout/ActiveBrandSwitcher", () => ({
  default: () => (
    <select aria-label="activeBrand" data-testid="active-client-switcher">
      <option>Marca A</option>
    </select>
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
    useCreativeWorkMock.mockReturnValue({ data: undefined, isLoading: false });
    useComposerMock.mockImplementation(({ initialWorkId }: { initialWorkId?: string }) => {
      const [intent, setIntent] = useState<"variations" | "single" | "format_adaptation" | "restyle">("single");
      const [workId, setWorkId] = useState<string | null>(initialWorkId ?? null);
      return {
        intent,
        workId,
        clientProfileId: "p1",
        quote: intent === "format_adaptation" ? { unitCount: 2, credits: 10 } : { unitCount: 1, credits: 5 },
        selectIntent: (next: typeof intent) => { selectIntentMock(next); setIntent(next); },
        addInspiration: (inspiration: { id: string }) => {
          addInspirationMock(inspiration);
          setWorkId("created-work");
        },
      };
    });
  });

  it("starts with the creation protocols and resumes the exact canonical href", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [{
        id: "creative_work:w1", originKind: "creative_work", originId: "w1", origin: "quick_tool",
        workspaceId: "ws", name: "Post social", state: "generating", updatedAt: "2026-07-13T12:00:00.000Z",
        resumable: true, resumeHref: "/creative-work/w1",
      }],
      isLoading: false, isError: false, refetch: vi.fn(),
    });

    render(<DashboardHomeActions workId="opened-work" />);

    const protocols = screen.getByRole("heading", { name: "dashboard.home.title" }).closest("section");
    const continueLink = screen.getByRole("link", { name: /Continue: Post social/i });

    expect(screen.getByTestId("creative-composer")).toBeInTheDocument();
    expect(screen.getByTestId("active-client-switcher")).toBeInTheDocument();
    expect(protocols?.compareDocumentPosition(continueLink)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(continueLink).toHaveAttribute("href", "/creative-work/w1");
    expect(screen.getAllByRole("button").filter((button) => button.hasAttribute("aria-pressed"))).toHaveLength(4);
    expect(screen.getByTestId("brand-inspirations-slot")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.home.chooseIntent")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses the composer anchor when continue already targets the open work", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [{
        id: "creative_work:w1", originKind: "creative_work", originId: "w1", origin: "quick_tool",
        workspaceId: "ws", name: "Post social", state: "reviewing", updatedAt: "2026-07-13T12:00:00.000Z",
        resumable: true, resumeHref: "/creative-work/w1",
      }],
      isLoading: false, isError: false, refetch: vi.fn(),
    });

    render(<DashboardHomeActions workId="w1" />);

    expect(screen.getByRole("link", { name: /Continue: Post social/i })).toHaveAttribute(
      "href",
      "#creative-composer",
    );
  });

  it("keeps a linked work's campaign destination instead of intercepting it with the home anchor", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [{
        id: "creative_work:w1", originKind: "creative_work", originId: "w1", origin: "quick_tool",
        workspaceId: "ws", name: "Post social", state: "reviewing", updatedAt: "2026-07-13T12:00:00.000Z",
        resumable: true, resumeHref: "/campaigns/c1?creativeWork=w1",
      }],
      isLoading: false, isError: false, refetch: vi.fn(),
    });

    render(<DashboardHomeActions workId="w1" />);

    expect(screen.getByRole("link", { name: /Continue: Post social/i })).toHaveAttribute(
      "href",
      "/campaigns/c1?creativeWork=w1",
    );
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
    expect(screen.getByTestId("creative-composer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /dashboard\.home\.restyle/i }));

    expect(selectIntentMock).toHaveBeenCalledWith("restyle");
    expect(screen.getByRole("button", { name: /dashboard\.home\.restyle/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("creative-composer")).toBeInTheDocument();
  });

  it("keeps the composer linked to every creation protocol before a draft exists", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(<DashboardHomeActions />);
    expect(screen.getByTestId("creative-composer")).toHaveTextContent("single:5");

    fireEvent.click(screen.getByRole("button", { name: /dashboard\.home\.variations/i }));
    expect(screen.getByTestId("creative-composer")).toHaveTextContent("variations:5");

    fireEvent.click(screen.getByRole("button", { name: /dashboard\.home\.format_adaptation/i }));
    expect(screen.getByTestId("creative-composer")).toHaveTextContent("format_adaptation:10");

    fireEvent.click(screen.getByRole("button", { name: /dashboard\.home\.restyle/i }));
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

    const firstCreationTitle = screen.getByText("dashboard.home.firstCreationTitle");
    expect(firstCreationTitle.nextElementSibling).toHaveTextContent("dashboard.home.firstCreationPrompt Marca A");
  });

  it("attaches brand inspirations through the same composer model", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    render(<DashboardHomeActions />);
    fireEvent.click(screen.getByRole("button", { name: "Inspirações p1" }));

    expect(addInspirationMock).toHaveBeenCalledWith({ id: "inspiration-1" });
    expect(screen.getByTestId("creative-composer")).toBeInTheDocument();
  });

  it("shows the latest completed productions from the resumable project", () => {
    useCanonicalWorksMock.mockReturnValue({
      data: [{
        id: "creative_work:w1", originKind: "creative_work", originId: "w1", origin: "quick_tool",
        workspaceId: "ws", name: "Post social", state: "reviewing", updatedAt: "2026-07-13T12:00:00.000Z",
        resumable: true, resumeHref: "/creative-work/w1",
      }],
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    useCreativeWorkMock.mockReturnValue({
      data: {
        outputs: [
          { id: "output-old", workItemId: "w1", status: "completed", outputKey: "old.png", createdAt: new Date("2026-07-13T10:00:00.000Z") },
          { id: "output-new", workItemId: "w1", status: "completed", outputKey: "new.png", createdAt: new Date("2026-07-13T11:00:00.000Z") },
          { id: "output-failed", workItemId: "w1", status: "failed", outputKey: null, createdAt: new Date("2026-07-13T12:00:00.000Z") },
        ],
      },
      isLoading: false,
    });

    render(<DashboardHomeActions />);

    expect(useCreativeWorkMock).toHaveBeenCalledWith("w1");
    const fan = screen.getByTestId("recent-production-fan");
    const previews = fan.querySelectorAll("img");
    expect(previews).toHaveLength(2);
    expect(previews[0]).toHaveAttribute("src", "/api/creative-work/w1/outputs/output-new/download");
  });

  it("scopes inspirations to the restored work brand instead of the global active brand", () => {
    useCanonicalWorksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    useComposerMock.mockReturnValue({
      intent: "single",
      clientProfileId: "p2",
      quote: { unitCount: 1, credits: 5 },
      selectIntent: selectIntentMock,
      addInspiration: addInspirationMock,
    });

    render(<DashboardHomeActions workId="work-from-p2" />);

    expect(screen.getByRole("button", { name: "Inspirações p2" })).toBeInTheDocument();
  });
});
