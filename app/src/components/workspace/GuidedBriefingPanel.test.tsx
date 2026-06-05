import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GuidedBriefingPanel from "./GuidedBriefingPanel";

const acceptSuggestion = vi.fn().mockResolvedValue({
  product: "Coffee",
  offer: "2-for-1",
});
const skipStep = vi.fn().mockResolvedValue({
  product: "Coffee",
  offer: "2-for-1",
  audience: "",
  promise: "",
  objections: "",
  cta: "",
  platforms: "",
  constraints: "",
});
const startEditing = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, values?: Record<string, unknown>) => {
    if (values) return `${ns}.${key}:${JSON.stringify(values)}`;
    return `${ns}.${key}`;
  },
}));

vi.mock("@/lib/hooks/use-guided-briefing", () => ({
  useGuidedBriefing: () => ({
    answers: {},
    currentStep: "productOffer",
    suggestion: "Summer promo",
    isComplete: false,
    isEditing: false,
    editValue: "",
    setEditValue: vi.fn(),
    productEditValue: "",
    setProductEditValue: vi.fn(),
    offerEditValue: "",
    setOfferEditValue: vi.fn(),
    acceptSuggestion,
    acceptEditedValue: vi.fn(),
    skipStep,
    startEditing,
    setIsEditing: vi.fn(),
    isPersisting: false,
  }),
}));

describe("GuidedBriefingPanel", () => {
  beforeEach(() => {
    acceptSuggestion.mockClear();
    skipStep.mockClear();
  });

  it("renders one question with accept, edit, and skip actions", () => {
    render(
      <GuidedBriefingPanel
        campaignId="camp-1"
        onComplete={vi.fn()}
        onOpenFullForm={vi.fn()}
      />
    );

    expect(screen.getByText("guidedBriefing.steps.productOffer.title")).toBeInTheDocument();
    expect(screen.getByText("Summer promo")).toBeInTheDocument();
    expect(screen.getByText("guidedBriefing.accept")).toBeInTheDocument();
    expect(screen.getByText("guidedBriefing.edit")).toBeInTheDocument();
    expect(screen.getByText("guidedBriefing.skip")).toBeInTheDocument();
  });

  it("calls acceptSuggestion when accept is clicked", async () => {
    const onComplete = vi.fn();
    render(
      <GuidedBriefingPanel
        campaignId="camp-1"
        onComplete={onComplete}
        onOpenFullForm={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("guidedBriefing.accept"));

    await waitFor(() => {
      expect(acceptSuggestion).toHaveBeenCalled();
    });
  });

  it("opens full form link", () => {
    const onOpenFullForm = vi.fn();
    render(
      <GuidedBriefingPanel
        campaignId="camp-1"
        onComplete={vi.fn()}
        onOpenFullForm={onOpenFullForm}
      />
    );

    fireEvent.click(screen.getByText("guidedBriefing.editAllFields"));
    expect(onOpenFullForm).toHaveBeenCalled();
  });
});
