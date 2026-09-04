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
  default: ({ quiet }: { quiet?: boolean }) => (
    <button type="button" aria-label="Report" data-quiet={quiet ? "true" : "false"} />
  ),
}));

const labels: CampaignWorkspaceV6Labels = {
  sectionLabel: "Campaign",
  backToCampaigns: "Back to campaigns",
  deleteCampaign: "Delete campaign",
  stagesAria: "Stages",
  briefingTitle: "Briefing",
  briefingVersion: "v1",
  rulesTitle: "Rules",
  newPiece: "New piece",
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
  it("renders status as occupancy, not a colored badge", () => {
    const { rerender } = render(
      <CampaignWorkspaceV6Chrome
        view={{ ...view, status: "Failed", statusVariant: "danger" }}
        labels={labels}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Failed");
    expect(screen.getByRole("status")).not.toHaveClass("bg-[var(--danger-bg)]");

    rerender(
      <CampaignWorkspaceV6Chrome
        view={{ ...view, status: "Generating", statusVariant: "warning" }}
        labels={labels}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Generating");
    expect(screen.getByRole("status")).not.toHaveClass("bg-[var(--warning-bg)]");
  });

  it("does not render briefing/produce/review/deliver stage radios", () => {
    render(<CampaignWorkspaceV6Chrome view={view} labels={labels} />);

    expect(screen.getByText("Campaign")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Holiday Sale" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByText("Briefing")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Active");
  });

  it("creates a new piece on Palco from the campaign grouping", () => {
    render(<CampaignWorkspaceV6Chrome view={view} labels={labels} campaignId="camp-1" />);

    expect(screen.getByRole("link", { name: "New piece" })).toHaveAttribute(
      "href",
      "/?mode=arte&compose=1&campaignId=camp-1",
    );
    expect(screen.getByRole("button", { name: "Report" })).toHaveAttribute("data-quiet", "true");
  });

  it("keeps draft delete quiet instead of a danger fill", () => {
    const onDelete = vi.fn();
    render(
      <CampaignWorkspaceV6Chrome
        view={view}
        labels={labels}
        isDraft
        onDelete={onDelete}
      />,
    );

    const remove = screen.getByRole("button", { name: "Delete campaign" });
    expect(remove.className).toContain("rounded-full");
    expect(remove).not.toHaveClass("bg-[var(--danger-bg)]");
    fireEvent.click(remove);
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
