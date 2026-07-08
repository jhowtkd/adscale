import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WorkspaceActionBar from "./WorkspaceActionBar";
import WorkspaceStageStrip from "./WorkspaceStageStrip";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    if (values) {
      return `${namespace}.${key}:${JSON.stringify(values)}`;
    }
    return `${namespace}.${key}`;
  },
}));

describe("WorkspaceActionBar one-click generate", () => {
  it("calls onGenerate from the primary CTA", () => {
    const onGenerate = vi.fn();
    render(
      <WorkspaceActionBar
        onGenerate={onGenerate}
        onAdjustStrategy={vi.fn()}
        recommendedRecipeLabel="Safe Iteration"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /workspace\.actionBar\.generate/i })
    );
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("calls onAdjustStrategy from the secondary link", () => {
    const onAdjustStrategy = vi.fn();
    render(
      <WorkspaceActionBar
        onGenerate={vi.fn()}
        onAdjustStrategy={onAdjustStrategy}
      />
    );

    fireEvent.click(screen.getByText("workspace.actionBar.adjustStrategy"));
    expect(onAdjustStrategy).toHaveBeenCalledTimes(1);
  });

  it("shows recommended recipe chip when provided", () => {
    render(
      <WorkspaceActionBar
        onGenerate={vi.fn()}
        onAdjustStrategy={vi.fn()}
        recommendedRecipeLabel="Impulso de Performance"
      />
    );

    expect(screen.getByText("Impulso de Performance")).toBeInTheDocument();
    expect(screen.getByText("workspace.actionBar.recommended")).toBeInTheDocument();
  });

  it("hides the Estilizar button when no onEstilizar handler is provided", () => {
    render(
      <WorkspaceActionBar onGenerate={vi.fn()} onAdjustStrategy={vi.fn()} />
    );

    expect(
      screen.queryByRole("button", { name: /workspace\.actionBar\.estilizar/i })
    ).not.toBeInTheDocument();
  });

  it("still renders the Estilizar button when an onEstilizar handler is provided", () => {
    const onEstilizar = vi.fn();
    render(
      <WorkspaceActionBar
        onGenerate={vi.fn()}
        onAdjustStrategy={vi.fn()}
        onEstilizar={onEstilizar}
      />
    );

    const estilizarButton = screen.getByRole("button", {
      name: /workspace\.actionBar\.estilizar/i,
    });
    fireEvent.click(estilizarButton);

    expect(onEstilizar).toHaveBeenCalledTimes(1);
  });

  it("WorkspaceActionBar uses shell-backed sticky layering", () => {
    const { container } = render(
      <WorkspaceActionBar onGenerate={vi.fn()} onAdjustStrategy={vi.fn()} />
    );

    expect(container.firstElementChild).toHaveClass("workspace-sticky-top", "layer-sticky");
    expect(container.firstElementChild).not.toHaveClass("top-14", "z-10");
  });
});

describe("WorkspaceStageStrip", () => {
  it("marks prepare active in setup state", () => {
    render(<WorkspaceStageStrip workspaceState="setup" />);

    expect(screen.getByText("workspace.stages.prepare")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("workspace.stages.generate")).not.toHaveAttribute("aria-current");
  });

  it("marks generate active after setup", () => {
    render(<WorkspaceStageStrip workspaceState="trabalho" />);

    expect(screen.getByText("workspace.stages.generate")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("workspace.stages.prepare")).not.toHaveAttribute("aria-current");
  });

  it("marks deliver when currentPhase is deliver", () => {
    render(<WorkspaceStageStrip workspaceState="trabalho" currentPhase="deliver" />);

    expect(screen.getByText("workspace.stages.deliver")).toHaveAttribute("aria-current", "step");
  });

  it("calls onPhaseSelect when a phase is clicked", () => {
    const onPhaseSelect = vi.fn();
    render(
      <WorkspaceStageStrip
        workspaceState="trabalho"
        onPhaseSelect={onPhaseSelect}
      />
    );

    fireEvent.click(screen.getByText("workspace.stages.prepare"));
    expect(onPhaseSelect).toHaveBeenCalledWith("prepare");
  });
});
