import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PreviewGatePanel from "./PreviewGatePanel";
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

const previewFixture = {
  id: "d1",
  name: "Preview 1",
  imageUrl: "https://example.com/preview.png",
  status: "completed",
  qualityScore: 82,
  qualityVerdict: "pass",
};

const ctaBreakdown: BatchCreditBreakdown = {
  jobCount: 3,
  unitCost: 5,
  totalCredits: 15,
  generationMode: "art_variation",
};

describe("PreviewGatePanel", () => {
  beforeEach(() => {
    recordEvent.mockClear();
  });

  it("uses preview.creditCost when present and shows estimate note", () => {
    render(
      <PreviewGatePanel
        campaignId="camp-1"
        preview={{ ...previewFixture, creditCost: 8 }}
        previewCreditsSpent={5}
        batchBreakdown={ctaBreakdown}
        creditBalance={100}
        onApproveBatch={vi.fn()}
        onReviseRecipe={vi.fn()}
      />
    );

    expect(screen.getByText(/previewSpent.*"credits":8/)).toBeInTheDocument();
    expect(screen.getByText("creditEstimateNote")).toBeInTheDocument();
  });

  it("shows batch formula, balance, and actions", () => {
    const onApprove = vi.fn();
    const onRevise = vi.fn();

    render(
      <PreviewGatePanel
        campaignId="camp-1"
        preview={previewFixture}
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

    fireEvent.click(screen.getByText("approveBatch"));
    fireEvent.click(screen.getByText("reviseRecipe"));

    expect(onApprove).toHaveBeenCalled();
    expect(onRevise).toHaveBeenCalled();
  });

  it("shows format formula for format_adaptation mode", () => {
    render(
      <PreviewGatePanel
        campaignId="camp-1"
        preview={previewFixture}
        previewCreditsSpent={5}
        batchBreakdown={{
          jobCount: 2,
          unitCost: 5,
          totalCredits: 10,
          generationMode: "format_adaptation",
        }}
        creditBalance={50}
        onApproveBatch={vi.fn()}
        onReviseRecipe={vi.fn()}
      />
    );

    expect(screen.getByText(/batchFormulaFormat/)).toBeInTheDocument();
  });

  it("disables approve when balance is insufficient", () => {
    render(
      <PreviewGatePanel
        campaignId="camp-1"
        preview={previewFixture}
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

  it("disables approve while balance is loading", () => {
    render(
      <PreviewGatePanel
        campaignId="camp-1"
        preview={previewFixture}
        previewCreditsSpent={5}
        batchBreakdown={ctaBreakdown}
        onApproveBatch={vi.fn()}
        onReviseRecipe={vi.fn()}
      />
    );

    expect(screen.getByText("balanceLoading")).toBeInTheDocument();
    expect(screen.getByText("approveBatch")).toBeDisabled();
  });

  it("disables approve when jobCount is zero", () => {
    render(
      <PreviewGatePanel
        campaignId="camp-1"
        preview={previewFixture}
        previewCreditsSpent={5}
        batchBreakdown={{
          jobCount: 0,
          unitCost: 5,
          totalCredits: 0,
          generationMode: "format_adaptation",
        }}
        creditBalance={100}
        onApproveBatch={vi.fn()}
        onReviseRecipe={vi.fn()}
      />
    );

    expect(screen.getByText("batchCostPending")).toBeInTheDocument();
    expect(screen.getByText("approveBatch")).toBeDisabled();
  });

  it("emits cockpit_stage_entered on mount", () => {
    render(
      <PreviewGatePanel
        campaignId="camp-1"
        preview={previewFixture}
        previewCreditsSpent={5}
        batchBreakdown={ctaBreakdown}
        creditBalance={100}
        onApproveBatch={vi.fn()}
        onReviseRecipe={vi.fn()}
      />
    );

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_entered", STAGE_PROPS);
  });

  it("emits cockpit_stage_completed before onApproveBatch", () => {
    const onApprove = vi.fn();
    render(
      <PreviewGatePanel
        campaignId="camp-1"
        preview={previewFixture}
        previewCreditsSpent={5}
        batchBreakdown={ctaBreakdown}
        creditBalance={100}
        onApproveBatch={onApprove}
        onReviseRecipe={vi.fn()}
      />
    );

    recordEvent.mockClear();
    fireEvent.click(screen.getByText("approveBatch"));

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_completed", STAGE_PROPS);
    expect(onApprove).toHaveBeenCalled();
    expect(recordEvent.mock.invocationCallOrder[0]).toBeLessThan(
      onApprove.mock.invocationCallOrder[0]!
    );
  });

  it("emits cockpit_stage_abandoned on revise without approve", () => {
    const onRevise = vi.fn();
    render(
      <PreviewGatePanel
        campaignId="camp-1"
        preview={previewFixture}
        previewCreditsSpent={5}
        batchBreakdown={ctaBreakdown}
        creditBalance={100}
        onApproveBatch={vi.fn()}
        onReviseRecipe={onRevise}
      />
    );

    recordEvent.mockClear();
    fireEvent.click(screen.getByText("reviseRecipe"));

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_abandoned", STAGE_PROPS);
    expect(onRevise).toHaveBeenCalled();
  });
});
