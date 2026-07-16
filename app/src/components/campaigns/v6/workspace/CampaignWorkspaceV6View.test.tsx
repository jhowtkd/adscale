import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CampaignWorkspaceV6Chrome } from "./CampaignWorkspaceV6View";
import type {
  CampaignWorkspaceV6Labels,
  CampaignWorkspaceV6ViewModel,
} from "./campaign-workspace-v6-types";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/feedback/ContextualFeedbackButton", () => ({
  __esModule: true,
  default: () => <div data-testid="contextual-feedback" />,
}));

const labels: CampaignWorkspaceV6Labels = {
  backToCampaigns: "Back to campaigns",
  deleteCampaign: "Delete campaign",
  stagesAria: "Stages",
  briefingTitle: "Briefing",
  briefingVersion: "v1",
  rulesTitle: "Rules",
};

const view: CampaignWorkspaceV6ViewModel = {
  name: "Holiday Sale",
  status: "Active",
  statusVariant: "success",
  meta: "Meta info",
  currentStage: 2,
  stages: ["Briefing", "Produce", "Review", "Deliver"],
  stageTabs: ["briefing", "generate", "review", "share"],
  briefingSliders: [],
  briefingRules: [],
};

describe("CampaignWorkspaceV6Chrome", () => {
  it("calls onStageSelect when a phase is clicked", () => {
    const onStageSelect = vi.fn();
    render(
      <CampaignWorkspaceV6Chrome
        view={view}
        labels={labels}
        onStageSelect={onStageSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Briefing/i }));
    expect(onStageSelect).toHaveBeenCalledWith("briefing");

    fireEvent.click(screen.getByRole("button", { name: /Review/i }));
    expect(onStageSelect).toHaveBeenCalledWith("review");

    fireEvent.click(screen.getByRole("button", { name: /Deliver/i }));
    expect(onStageSelect).toHaveBeenCalledWith("share");
  });
});
