import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CreativeReadinessPanel from "./CreativeReadinessPanel";

const mockMutateAsync = vi.fn();
const mockUsePreflightScore = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-preflight", () => ({
  usePreflightScore: (...args: unknown[]) => mockUsePreflightScore(...args),
  useAnalyzePreflight: vi.fn(() => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  })),
}));

describe("CreativeReadinessPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePreflightScore.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });
  });

  it("shows missing creative state when assetId is absent", () => {
    render(<CreativeReadinessPanel campaignId="camp-1" assetId={null} />);
    expect(screen.getByText("missingCreative")).toBeInTheDocument();
  });

  it("shows analyzing state while loading", () => {
    mockUsePreflightScore.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
    });

    render(<CreativeReadinessPanel campaignId="camp-1" assetId="asset-1" />);
    expect(screen.getByText("analyzing")).toBeInTheDocument();
  });

  it("renders blocking issues before suggestions", () => {
    mockUsePreflightScore.mockReturnValue({
      data: {
        readiness: {
          overallScore: 42,
          status: "blocked",
          canGenerate: false,
          dimensions: [
            { id: "offerClarity", score: 30, suggestion: "Add offer" },
            { id: "textLegibility", score: 40, suggestion: "Fix text" },
            { id: "visualHierarchy", score: 50, suggestion: "Improve hierarchy" },
            { id: "ctaProminence", score: 45, suggestion: "Improve CTA" },
            { id: "brandFit", score: 55, suggestion: "Brand tweak" },
            { id: "platformFit", score: 60, suggestion: "Platform tweak" },
          ],
          blockingIssues: ["Blocking issue A"],
          suggestions: ["Suggestion B"],
        },
        status: "completed",
      },
      isLoading: false,
      isError: false,
    });

    render(<CreativeReadinessPanel campaignId="camp-1" assetId="asset-1" />);

    expect(screen.getByText("Blocking issue A")).toBeInTheDocument();
    expect(screen.getByText("Suggestion B")).toBeInTheDocument();
    expect(screen.getByText("status.blocked")).toBeInTheDocument();

    const blockingHeading = screen.getByText("blockingIssues");
    const suggestionsHeading = screen.getByText("suggestions");
    expect(
      blockingHeading.compareDocumentPosition(suggestionsHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("calls rerun with force when button clicked", () => {
    mockUsePreflightScore.mockReturnValue({
      data: {
        readiness: {
          overallScore: 82,
          status: "ready",
          canGenerate: true,
          dimensions: [],
          blockingIssues: [],
          suggestions: [],
        },
        status: "completed",
      },
      isLoading: false,
      isError: false,
    });

    render(<CreativeReadinessPanel campaignId="camp-1" assetId="asset-1" />);
    fireEvent.click(screen.getByRole("button", { name: "rerun" }));

    expect(mockMutateAsync).toHaveBeenCalledWith({
      campaignId: "camp-1",
      assetId: "asset-1",
      force: true,
    });
  });
});
