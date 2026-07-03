import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DerivationPreviewGateFooter from "./DerivationPreviewGateFooter";

const recordEvent = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values) {
      return `${key}:${JSON.stringify(values)}`;
    }
    return key;
  },
}));

vi.mock("@/lib/hooks/use-record-beta-event", () => ({
  useRecordBetaEvent: () => ({ recordEvent }),
}));

const STAGE_PROPS = { stage: "preview", missionKey: "preview" };

describe("DerivationPreviewGateFooter", () => {
  beforeEach(() => {
    recordEvent.mockClear();
  });

  it("renders the approve action without cost breakdown", () => {
    const onApprove = vi.fn();

    render(
      <DerivationPreviewGateFooter
        campaignId="camp-1"
        onApproveBatch={onApprove}
      />
    );

    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("approveBatch")).toBeEnabled();

    // No preventive credit cost displays
    expect(screen.queryByText(/batchFormulaCta/)).not.toBeInTheDocument();
    expect(screen.queryByText(/batchFormulaFormat/)).not.toBeInTheDocument();
    expect(screen.queryByText(/balanceRemaining/)).not.toBeInTheDocument();
    expect(screen.queryByText(/previewSpent/)).not.toBeInTheDocument();
    expect(screen.queryByText(/insufficientCredits/)).not.toBeInTheDocument();
    expect(screen.queryByText(/créditos/i)).not.toBeInTheDocument();
    expect(screen.queryByText("reviseRecipe")).not.toBeInTheDocument();
  });

  it("disables approve while generating", () => {
    render(
      <DerivationPreviewGateFooter
        campaignId="camp-1"
        isGenerating
        onApproveBatch={vi.fn()}
      />
    );

    expect(screen.getByText("approveBatch")).toBeDisabled();
  });

  it("emits cockpit_stage_entered on mount and completed on approve", () => {
    const onApprove = vi.fn();
    render(
      <DerivationPreviewGateFooter
        campaignId="camp-1"
        onApproveBatch={onApprove}
      />
    );

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_entered", STAGE_PROPS);

    recordEvent.mockClear();
    fireEvent.click(screen.getByText("approveBatch"));

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_completed", STAGE_PROPS);
    expect(onApprove).toHaveBeenCalled();
  });

  it("emits cockpit_stage_abandoned on unmount without approve", () => {
    const { unmount } = render(
      <DerivationPreviewGateFooter
        campaignId="camp-1"
        onApproveBatch={vi.fn()}
      />
    );

    recordEvent.mockClear();
    unmount();

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_abandoned", STAGE_PROPS);
  });

  it("does not emit cockpit_stage_abandoned after approve", () => {
    const { unmount } = render(
      <DerivationPreviewGateFooter
        campaignId="camp-1"
        onApproveBatch={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("approveBatch"));
    recordEvent.mockClear();
    unmount();

    expect(recordEvent).not.toHaveBeenCalledWith(
      "cockpit_stage_abandoned",
      STAGE_PROPS
    );
  });
});
