import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useCreativeComposerMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({
    backToCampaign: "Back to campaign",
    works: "Works",
    newVariation: "New variation",
  })[key] ?? key,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("./useCreativeComposer", () => ({
  useCreativeComposer: (...args: unknown[]) => useCreativeComposerMock(...args),
}));
vi.mock("./CreativeComposer", () => ({
  CreativeComposer: ({ composer, layout }: { composer: { intent: string; outputs?: unknown[] }; layout?: string }) => (
    <div
      data-testid="creative-composer"
      data-layout={layout}
      data-intent={composer.intent}
      data-proposal-grid={composer.outputs && composer.outputs.length > 0 && composer.intent !== "carousel" ? "true" : "false"}
    />
  ),
}));

import { CreativeWorkResumeSurface } from "./CreativeWorkResumeSurface";

describe("CreativeWorkResumeSurface", () => {
  it("starts a fresh Studio variation instead of reopening the hydrated work", () => {
    useCreativeComposerMock.mockReturnValue({ composerRef: { current: null }, intent: "variations", outputs: [] });

    render(<CreativeWorkResumeSurface workId="work-1" campaignId="campaign-1" />);

    expect(useCreativeComposerMock).toHaveBeenCalledWith({ initialWorkId: "work-1", focusComposer: true });
    expect(screen.getByRole("link", { name: "Back to campaign" })).toHaveAttribute("href", "/campaigns/campaign-1");
    expect(screen.getByTestId("creative-composer")).toHaveAttribute("data-layout", "piece");
    expect(screen.getByRole("link", { name: "New variation" })).toHaveAttribute(
      "href",
      "/?mode=arte&compose=1&intent=variations&fresh=1",
    );
  });

  it("resumes a carousel work into the deck surface instead of the proposal grid", () => {
    useCreativeComposerMock.mockReturnValue({
      composerRef: { current: null },
      intent: "carousel",
      outputs: [{ id: "stray-output", status: "completed" }],
    });

    render(<CreativeWorkResumeSurface workId="carousel-1" />);

    const composer = screen.getByTestId("creative-composer");
    expect(composer).toHaveAttribute("data-intent", "carousel");
    expect(composer).toHaveAttribute("data-proposal-grid", "false");
    expect(composer).toHaveAttribute("data-layout", "piece");
  });
});
