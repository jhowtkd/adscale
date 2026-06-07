import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PreviewGatePanel from "./PreviewGatePanel";

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

describe("PreviewGatePanel", () => {
  beforeEach(() => {
    recordEvent.mockClear();
  });

  it("shows batch credit cost and actions", () => {
    const onApprove = vi.fn();
    const onRevise = vi.fn();

    render(
      <PreviewGatePanel
        campaignId="camp-1"
        preview={previewFixture}
        previewCreditsSpent={5}
        batchCredits={15}
        onApproveBatch={onApprove}
        onReviseRecipe={onRevise}
      />
    );

    expect(screen.getByText(/batchCost/)).toBeInTheDocument();
    expect(screen.getByText(/previewSpent/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("approveBatch"));
    fireEvent.click(screen.getByText("reviseRecipe"));

    expect(onApprove).toHaveBeenCalled();
    expect(onRevise).toHaveBeenCalled();
  });

  it("emits cockpit_stage_entered on mount", () => {
    render(
      <PreviewGatePanel
        campaignId="camp-1"
        preview={previewFixture}
        previewCreditsSpent={5}
        batchCredits={15}
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
        batchCredits={15}
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
        batchCredits={15}
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
