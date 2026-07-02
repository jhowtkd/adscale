import { render, screen } from "@testing-library/react";
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
  sendFeedback: "Send feedback",
  deleteCampaign: "Delete campaign",
  stagesAria: "Stages",
  briefingTitle: "Briefing",
  briefingVersion: "v1",
  rulesTitle: "Rules",
  derivationsTitle: "Derivations",
  viewAllDerivations: "View all",
  openDerivation: "Open",
  moreOptionsFor: (title) => `More options for ${title}`,
};

const view: CampaignWorkspaceV6ViewModel = {
  name: "Holiday Sale",
  status: "Active",
  statusVariant: "success",
  meta: "Meta info",
  currentStage: 2,
  stages: ["Setup", "Derive", "Review", "Publish"],
  briefingSliders: [],
  briefingRules: [],
  derivations: [],
};

describe("CampaignWorkspaceV6Chrome", () => {
  it("shows Send feedback button in non-interactive (preview) mode", () => {
    render(
      <CampaignWorkspaceV6Chrome
        view={view}
        labels={labels}
        interactive={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Send feedback" }),
    ).toBeInTheDocument();
  });

  it("hides Send feedback button in interactive (production) mode", () => {
    render(
      <CampaignWorkspaceV6Chrome
        view={view}
        labels={labels}
        interactive={true}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Send feedback" }),
    ).not.toBeInTheDocument();
  });
});
