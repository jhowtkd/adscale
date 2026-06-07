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
const recordEvent = vi.fn();
const useGuidedBriefingMock = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, values?: Record<string, unknown>) => {
    if (values) return `${ns}.${key}:${JSON.stringify(values)}`;
    return `${ns}.${key}`;
  },
}));

vi.mock("@/lib/hooks/use-guided-briefing", () => ({
  useGuidedBriefing: (...args: unknown[]) => useGuidedBriefingMock(...args),
}));

vi.mock("@/lib/hooks/use-record-beta-event", () => ({
  useRecordBetaEvent: () => ({ recordEvent }),
}));

const STAGE_PROPS = { stage: "guided_briefing", missionKey: "guided_briefing" };

const defaultGuidedState = {
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
};

describe("GuidedBriefingPanel", () => {
  beforeEach(() => {
    acceptSuggestion.mockClear();
    skipStep.mockClear();
    recordEvent.mockClear();
    useGuidedBriefingMock.mockReturnValue(defaultGuidedState);
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

  it("emits cockpit_stage_entered on mount", () => {
    render(
      <GuidedBriefingPanel
        campaignId="camp-1"
        onComplete={vi.fn()}
        onOpenFullForm={vi.fn()}
      />
    );

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_entered", STAGE_PROPS);
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

  it("emits cockpit_stage_abandoned when opening full form", () => {
    const onOpenFullForm = vi.fn();
    render(
      <GuidedBriefingPanel
        campaignId="camp-1"
        onComplete={vi.fn()}
        onOpenFullForm={onOpenFullForm}
      />
    );

    recordEvent.mockClear();
    fireEvent.click(screen.getByText("guidedBriefing.editAllFields"));

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_abandoned", STAGE_PROPS);
    expect(onOpenFullForm).toHaveBeenCalled();
  });

  it("emits cockpit_stage_completed before onComplete on finish", () => {
    useGuidedBriefingMock.mockReturnValue({
      ...defaultGuidedState,
      isComplete: true,
      answers: { product: "Coffee" },
    });

    const onComplete = vi.fn();
    render(
      <GuidedBriefingPanel
        campaignId="camp-1"
        onComplete={onComplete}
        onOpenFullForm={vi.fn()}
      />
    );

    recordEvent.mockClear();
    fireEvent.click(screen.getByText("guidedBriefing.continue"));

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_completed", STAGE_PROPS);
    expect(onComplete).toHaveBeenCalled();
    expect(recordEvent.mock.invocationCallOrder[0]).toBeLessThan(
      onComplete.mock.invocationCallOrder[0]!
    );
  });

  it("emits cockpit_stage_abandoned on unmount without complete", () => {
    const { unmount } = render(
      <GuidedBriefingPanel
        campaignId="camp-1"
        onComplete={vi.fn()}
        onOpenFullForm={vi.fn()}
      />
    );

    recordEvent.mockClear();
    unmount();

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_abandoned", STAGE_PROPS);
  });
});
