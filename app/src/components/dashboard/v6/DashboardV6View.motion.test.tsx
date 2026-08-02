import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardV6View from "./DashboardV6View";
import type { DashboardV6Labels, DashboardV6ViewModel } from "./dashboard-v6-types";

const labels = new Proxy({}, { get: (_, key) => String(key) }) as DashboardV6Labels;

const view: DashboardV6ViewModel = {
  firstName: "Ana",
  inReviewCount: 0,
  readyToApproveCount: 0,
  kpis: [{ label: "Aprovação", value: "60%", trend: "0%", trendDir: "neutral" }],
  hero: {
    id: "campaign-1",
    name: "Campanha",
    badge: "Ativa",
    badgeClass: "success",
    description: "Descrição",
    briefingProgress: 75,
    variationsDone: 3,
    variationsTotal: 4,
    approved: 2,
    credits: 8,
  },
  activity: [],
  recipes: [],
  briefingRows: [],
  activeBriefingCampaignId: null,
};

describe("DashboardV6View motion values", () => {
  it("renders the final KPI and progress values immediately", () => {
    render(<DashboardV6View view={view} labels={labels} summary="Resumo" />);

    expect(screen.getByText("60%").closest("[data-motion-value]")).toHaveAttribute("data-motion-value", "60%");
    expect(screen.getByText("● 75%").closest("[data-motion-value]")).toHaveAttribute("data-motion-value", "● 75%");
    expect(screen.getAllByTestId("motion-value")).toHaveLength(5);
  });
});
