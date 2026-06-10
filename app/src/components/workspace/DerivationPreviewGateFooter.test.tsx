import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DerivationPreviewGateFooter from "./DerivationPreviewGateFooter";
import type { BatchCreditBreakdown } from "@/server/ai/strategy-recipes";

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

const ctaBreakdown: BatchCreditBreakdown = {
  jobCount: 3,
  unitCost: 5,
  totalCredits: 15,
  generationMode: "art_variation",
};

describe("DerivationPreviewGateFooter", () => {
  beforeEach(() => {
    recordEvent.mockClear();
  });

  it("shows batch formula, balance, and actions", () => {
    const onApprove = vi.fn();
    const onRevise = vi.fn();

    render(
      <DerivationPreviewGateFooter
        campaignId="camp-1"
        previewCreditsSpent={5}
        batchBreakdown={ctaBreakdown}
        creditBalance={100}
        onApproveBatch={onApprove}
        onReviseRecipe={onRevise}
      />
    );

    expect(screen.getByText(/batchFormulaCta/)).toBeInTheDocument();
    expect(screen.getByText(/balanceRemaining/)).toBeInTheDocument();
    expect(screen.getByText(/previewSpent/)).toBeInTheDocument();
    expect(screen.getByText("creditEstimateNote")).toBeInTheDocument();

    fireEvent.click(screen.getByText("approveBatch"));
    fireEvent.click(screen.getByText("reviseRecipe"));

    expect(onApprove).toHaveBeenCalled();
    expect(onRevise).toHaveBeenCalled();
  });

  it("disables approve when balance is insufficient", () => {
    render(
      <DerivationPreviewGateFooter
        campaignId="camp-1"
        previewCreditsSpent={5}
        batchBreakdown={ctaBreakdown}
        creditBalance={10}
        onApproveBatch={vi.fn()}
        onReviseRecipe={vi.fn()}
      />
    );

    expect(screen.getByText(/insufficientCredits/)).toBeInTheDocument();
    expect(screen.getByText("approveBatch")).toBeDisabled();
  });

  it("emits cockpit_stage_entered on mount and completed on approve", () => {
    const onApprove = vi.fn();
    render(
      <DerivationPreviewGateFooter
        campaignId="camp-1"
        previewCreditsSpent={5}
        batchBreakdown={ctaBreakdown}
        creditBalance={100}
        onApproveBatch={onApprove}
        onReviseRecipe={vi.fn()}
      />
    );

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_entered", STAGE_PROPS);

    recordEvent.mockClear();
    fireEvent.click(screen.getByText("approveBatch"));

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_completed", STAGE_PROPS);
    expect(onApprove).toHaveBeenCalled();
  });
});
