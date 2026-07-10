import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DerivationPreviewGateFooter from "./DerivationPreviewGateFooter";

const recordEvent = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-record-beta-event", () => ({
  useRecordBetaEvent: () => ({ recordEvent }),
}));

const STAGE_PROPS = { stage: "preview", missionKey: "preview" } as const;

describe("DerivationPreviewGateFooter", () => {
  beforeEach(() => {
    recordEvent.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows continue and adjust actions when quality failed", () => {
    const onApproveBatch = vi.fn();
    const onAdjustStrategy = vi.fn();
    render(
      <DerivationPreviewGateFooter
        campaignId="camp-1"
        onApproveBatch={onApproveBatch}
        onAdjustStrategy={onAdjustStrategy}
      />
    );

    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("continueAnyway")).toBeEnabled();
    expect(screen.getByText("adjustStrategy")).toBeEnabled();
  });

  it("disables actions while approving", () => {
    render(
      <DerivationPreviewGateFooter
        campaignId="camp-1"
        isApproving
        onApproveBatch={vi.fn()}
        onAdjustStrategy={vi.fn()}
      />
    );

    expect(screen.getByText("continueAnyway")).toBeDisabled();
    expect(screen.getByText("adjustStrategy")).toBeDisabled();
  });

  it("emits cockpit_stage_entered on mount", () => {
    render(
      <DerivationPreviewGateFooter campaignId="camp-1" onApproveBatch={vi.fn()} />
    );

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_entered", STAGE_PROPS);
  });

  it("emits cockpit_stage_abandoned on unmount without approve", () => {
    const { unmount } = render(
      <DerivationPreviewGateFooter campaignId="camp-1" onApproveBatch={vi.fn()} />
    );

    recordEvent.mockClear();
    unmount();

    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_abandoned", STAGE_PROPS);
  });

  it("does not emit abandon after approve completes the stage", () => {
    const { unmount } = render(
      <DerivationPreviewGateFooter campaignId="camp-1" onApproveBatch={vi.fn()} />
    );

    fireEvent.click(screen.getByText("continueAnyway"));
    recordEvent.mockClear();
    unmount();

    expect(recordEvent).not.toHaveBeenCalledWith(
      "cockpit_stage_abandoned",
      expect.anything()
    );
  });

  it("emits completed and calls onApproveBatch", () => {
    const onApproveBatch = vi.fn();
    render(
      <DerivationPreviewGateFooter
        campaignId="camp-1"
        onApproveBatch={onApproveBatch}
      />
    );

    fireEvent.click(screen.getByText("continueAnyway"));
    expect(recordEvent).toHaveBeenCalledWith("cockpit_stage_completed", {
      stage: "preview",
      missionKey: "preview",
    });
    expect(onApproveBatch).toHaveBeenCalledTimes(1);
  });
});
