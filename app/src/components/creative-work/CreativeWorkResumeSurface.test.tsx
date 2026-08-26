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
  CreativeComposer: ({ layout }: { layout?: string }) => <div data-testid="creative-composer" data-layout={layout} />,
}));

import { CreativeWorkResumeSurface } from "./CreativeWorkResumeSurface";

describe("CreativeWorkResumeSurface", () => {
  it("starts a fresh Studio variation instead of reopening the hydrated work", () => {
    useCreativeComposerMock.mockReturnValue({ composerRef: { current: null }, intent: "variations" });

    render(<CreativeWorkResumeSurface workId="work-1" campaignId="campaign-1" />);

    expect(useCreativeComposerMock).toHaveBeenCalledWith({ initialWorkId: "work-1", focusComposer: true });
    expect(screen.getByRole("link", { name: "Back to campaign" })).toHaveAttribute("href", "/campaigns/campaign-1");
    expect(screen.getByTestId("creative-composer")).toHaveAttribute("data-layout", "piece");
    expect(screen.getByRole("link", { name: "New variation" })).toHaveAttribute(
      "href",
      "/?mode=arte&compose=1&intent=variations&fresh=1",
    );
  });
});
