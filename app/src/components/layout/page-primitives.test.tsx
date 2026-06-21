import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PageHeader from "@/components/layout/PageHeader";
import PageSection from "@/components/layout/PageSection";
import Panel from "@/components/layout/Panel";
import ResponsiveTabs from "@/components/layout/ResponsiveTabs";
import Toolbar from "@/components/layout/Toolbar";

describe("page primitives", () => {
  it("PageHeader renders title, description, meta, and actions with product typography", () => {
    render(
      <PageHeader
        title="Campaigns"
        description="Manage campaigns"
        meta={<span data-testid="meta">12</span>}
        actions={<button type="button">New</button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Campaigns" })).toHaveClass(
      "product-page-title",
    );
    expect(screen.getByText("Manage campaigns")).toBeInTheDocument();
    expect(screen.getByTestId("meta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("PageSection renders section title with product typography", () => {
    render(
      <PageSection title="Filters">
        <p>Body</p>
      </PageSection>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Filters" })).toHaveClass(
      "product-section-title",
    );
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("Panel applies shared surface border and radius tokens", () => {
    const { container } = render(
      <Panel padding="sm">
        Content
      </Panel>,
    );

    const panel = container.firstElementChild;
    expect(panel).toHaveClass("border", "rounded-[var(--radius-object)]", "p-3");
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("Toolbar lays out children in a responsive flex stack", () => {
    const { container } = render(
      <Toolbar>
        <span>Left</span>
        <span>Right</span>
      </Toolbar>,
    );

    expect(container.firstElementChild).toHaveClass("flex", "flex-col", "lg:flex-row");
  });

  it("ResponsiveTabs scrolls horizontally and marks the active tab", () => {
    let active = "profile";

    const { rerender } = render(
      <ResponsiveTabs
        ariaLabel="Settings"
        activeId={active}
        onSelect={(id) => {
          active = id;
        }}
        items={[
          { id: "profile", label: "Profile" },
          { id: "billing", label: "Billing" },
        ]}
      />,
    );

    const profile = screen.getByRole("button", { name: "Profile" });
    expect(profile).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "Billing" }));
    expect(active).toBe("billing");

    rerender(
      <ResponsiveTabs
        ariaLabel="Settings"
        activeId={active}
        onSelect={() => {}}
        items={[
          { id: "profile", label: "Profile" },
          { id: "billing", label: "Billing" },
        ]}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Settings" })).toHaveClass("overflow-x-auto");
    expect(screen.getByRole("button", { name: "Billing" })).toHaveAttribute("aria-current", "page");
  });

  it("ResponsiveTabs disables tabs and blocks selection", () => {
    let active = "profile";

    render(
      <ResponsiveTabs
        ariaLabel="Settings"
        activeId={active}
        onSelect={(id) => {
          active = id;
        }}
        items={[
          { id: "profile", label: "Profile", disabled: true, badge: <span>Em breve</span> },
          { id: "billing", label: "Billing" },
        ]}
      />,
    );

    const disabledTab = screen.getByRole("button", { name: /Profile/i });
    expect(disabledTab).toBeDisabled();
    expect(disabledTab).toHaveAttribute("aria-disabled", "true");
    expect(disabledTab).toHaveClass("opacity-50");

    fireEvent.click(disabledTab);
    expect(active).toBe("profile");

    fireEvent.click(screen.getByRole("button", { name: "Billing" }));
    expect(active).toBe("billing");
  });
});
