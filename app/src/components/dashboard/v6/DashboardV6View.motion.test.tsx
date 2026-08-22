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
    href: "/campaigns/campaign-1",
    briefingHref: "/campaigns/campaign-1?tab=brief",
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
};

describe("DashboardV6View motion values", () => {
  it("keeps the greeting heading named while its visual skeleton loads", () => {
    render(
      <DashboardV6View
        view={view}
        labels={labels}
        summary="Resumo"
        isLoading
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "greeting" })).toBeInTheDocument();
  });

  it("offers a useful next action when there is no featured work", () => {
    render(
      <DashboardV6View
        view={{ ...view, hero: null }}
        labels={labels}
        summary="Resumo"
      />,
    );

    expect(screen.getByText("heroEmptyTitle")).toBeInTheDocument();
    expect(screen.getByText("heroEmptyDescription")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "heroEmptyAction" })).toHaveAttribute("href", "/?compose=1");
    expect(screen.getByRole("link", { name: "activityEmptyAction" })).toHaveAttribute("href", "/?compose=1");
    expect(screen.getByRole("link", { name: "briefingEmptyAction" })).toHaveAttribute("href", "/?compose=1");
  });

  it("does not announce an empty featured work while works are loading", () => {
    render(
      <DashboardV6View
        view={{ ...view, hero: null }}
        labels={labels}
        summary="Resumo"
        isHeroLoading
      />,
    );

    expect(screen.queryByText("heroEmptyTitle")).not.toBeInTheDocument();
  });

  it("renders the final KPI and progress values immediately", () => {
    render(<DashboardV6View view={view} labels={labels} summary="Resumo" />);

    expect(screen.getByText("60%").closest("[data-motion-value]")).toHaveAttribute("data-motion-value", "60%");
    expect(screen.getByText("● 75%").closest("[data-motion-value]")).toHaveAttribute("data-motion-value", "● 75%");
    expect(screen.getAllByTestId("motion-value")).toHaveLength(4);
  });

  it("omits unavailable featured-work metadata instead of rendering dashes", () => {
    render(
      <DashboardV6View
        view={{
          ...view,
          hero: { ...view.hero!, briefingProgress: null, approved: null },
        }}
        labels={labels}
        summary="Resumo"
      />,
    );

    expect(screen.queryByText("metaBriefing")).not.toBeInTheDocument();
    expect(screen.queryByText("metaApproved")).not.toBeInTheDocument();
    expect(screen.getByText("metaVariations")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it.each([
    ["warning", "bg-[var(--warning-bg)]", "bg-[var(--warning-dot)]"],
    ["danger", "bg-[var(--danger-bg)]", "bg-[var(--danger-dot)]"],
    ["success", "bg-[var(--success-bg)]", "bg-[var(--success-dot)]"],
    ["info", "bg-[var(--info-bg)]", "bg-[var(--info-dot)]"],
    ["neutral", "bg-[var(--neutral-bg)]", "bg-[var(--neutral-dot)]"],
  ] as const)("renders %s activity status with semantic tokens", (statusClass, backgroundClass, dotClass) => {
    render(
      <DashboardV6View
        view={{
          ...view,
          hero: { ...view.hero!, badge: `Hero ${statusClass}`, badgeClass: statusClass },
          activity: [{
            id: statusClass,
            href: "/campaigns/1",
            thumb: "✦",
            name: "Campaign",
            subtitle: "Now",
            status: statusClass,
            statusClass,
            platforms: "—",
            variations: "0 / 0",
            updated: "now",
          }],
        }}
        labels={labels}
        summary="Resumo"
      />,
    );

    const pill = screen.getByText(statusClass);
    expect(pill).toHaveClass(backgroundClass);
    expect(pill?.firstElementChild).toHaveClass(dotClass);

    const heroBadge = screen.getByText(`heroProduction · Hero ${statusClass}`);
    expect(heroBadge).toHaveClass(backgroundClass);
    expect(heroBadge.firstElementChild).toHaveClass(dotClass);
  });
});
