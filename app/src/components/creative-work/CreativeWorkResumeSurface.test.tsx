import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useCreativeComposerMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    if (namespace === "dashboard.home.composer") {
      return (key: string, values?: Record<string, string | number>) => ({
        variationsTitle: "Generate variations from an artwork",
        variationsSubtitle: "Send artwork for the AI to read.",
        title: "Create a piece",
        subtitle: "Describe the piece.",
        restyleTitle: "Copy the reference style",
        restyleSubtitle: "Add the original artwork and the style reference.",
        formatAdaptationTitle: "Adapt an artwork to other formats",
        formatAdaptationSubtitle: "Send the original artwork and choose formats.",
        "carousel.title": "Create a carousel",
        "carousel.subtitle": "Turn an idea into a coherent sequence.",
        actionSaving: "Saving",
        actionPreparing: "Preparing",
        actionSubmitting: "Submitting",
        actionReconciling: "Reconciling",
        actionGenerating: "Generating",
        "proposal.progress": `${values?.ready} of ${values?.total} ready`,
      })[key] ?? key;
    }
    return (key: string) => ({
      backToCampaign: "Back to campaign",
      works: "Works",
      newVariation: "New variation",
      piece: "Piece",
    })[key] ?? key;
  },
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
    useCreativeComposerMock.mockReturnValue({
      composerRef: { current: null },
      intent: "variations",
      outputs: [],
      actionPhase: "idle",
      state: "empty",
      workTitle: null,
    });

    render(<CreativeWorkResumeSurface workId="work-1" campaignId="campaign-1" />);

    expect(useCreativeComposerMock).toHaveBeenCalledWith({ initialWorkId: "work-1", focusComposer: true });
    expect(screen.getByRole("heading", { name: "Piece" })).toHaveClass("sr-only");
    expect(screen.queryByText("Generate variations from an artwork")).not.toBeInTheDocument();
    expect(screen.queryByText("Send artwork for the AI to read.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to campaign" })).toHaveAttribute("href", "/campaigns/campaign-1");
    expect(screen.getByRole("link", { name: "Back to campaign" }).className).toContain("rounded-full");
    expect(screen.getByTestId("creative-composer")).toHaveAttribute("data-layout", "piece");
    const newVariation = screen.getByRole("link", { name: "New variation" });
    expect(newVariation).toHaveAttribute("href", "/?mode=arte&compose=1&intent=variations&fresh=1");
    expect(newVariation.className).toContain("rounded-full");
    expect(newVariation.className).toContain("border-white/15");
    expect(newVariation.className).not.toContain("underline");
  });

  it("shows generating occupancy beside the new-variation chip", () => {
    useCreativeComposerMock.mockReturnValue({
      composerRef: { current: null },
      intent: "variations",
      outputs: [],
      actionPhase: "idle",
      state: "generating",
      workTitle: null,
    });

    render(<CreativeWorkResumeSurface workId="work-1" />);

    expect(screen.getByRole("status")).toHaveTextContent("Generating");
  });

  it("shows ready occupancy from completed outputs", () => {
    useCreativeComposerMock.mockReturnValue({
      composerRef: { current: null },
      intent: "variations",
      outputs: [
        { id: "out-1", status: "completed", outputKey: "out/1.png" },
        { id: "out-2", status: "processing", outputKey: null },
      ],
      actionPhase: "idle",
      state: "results",
      workTitle: "Summer offer",
    });

    render(<CreativeWorkResumeSurface workId="work-1" />);

    expect(screen.getByRole("heading", { name: "Summer offer" })).toHaveClass("sr-only");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 ready");
  });

  it("resumes a carousel work into the deck surface instead of the proposal grid", () => {
    useCreativeComposerMock.mockReturnValue({
      composerRef: { current: null },
      intent: "carousel",
      outputs: [{ id: "stray-output", status: "completed" }],
      actionPhase: "idle",
      state: "results",
      workTitle: null,
    });

    render(<CreativeWorkResumeSurface workId="carousel-1" />);

    const composer = screen.getByTestId("creative-composer");
    expect(composer).toHaveAttribute("data-intent", "carousel");
    expect(composer).toHaveAttribute("data-proposal-grid", "false");
    expect(composer).toHaveAttribute("data-layout", "piece");
    expect(screen.getByRole("heading", { name: "Piece" })).toHaveClass("sr-only");
  });
});
