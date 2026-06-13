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

describe("Estilizar regression", () => {
  it("WorkspaceActionBar still exposes independent Estilizar entry", () => {
    const onEstilizar = vi.fn();
    render(<WorkspaceActionBar onDerivar={vi.fn()} onEstilizar={onEstilizar} />);

    const estilizarButton = screen.getByRole("button", { name: /workspace\.actionBar\.estilizar/i });
    fireEvent.click(estilizarButton);

    expect(onEstilizar).toHaveBeenCalledTimes(1);
  });

  it("WorkspaceActionBar uses shell-backed sticky layering", () => {
    const { container } = render(
      <WorkspaceActionBar onDerivar={vi.fn()} onEstilizar={vi.fn()} />,
    );

    expect(container.firstElementChild).toHaveClass("workspace-sticky-top", "layer-sticky");
    expect(container.firstElementChild).not.toHaveClass("top-14", "z-10");
  });
});

describe("WorkspaceStageStrip", () => {
  it("marks the pilot stage active in piloto state", () => {
    render(<WorkspaceStageStrip workspaceState="piloto" />);

    expect(screen.getByText("workspace.stages.pilot")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("workspace.stages.workspace")).not.toHaveAttribute("aria-current");
  });

  it("marks the workspace stage active after pilot", () => {
    render(<WorkspaceStageStrip workspaceState="acoes" />);

    expect(screen.getByText("workspace.stages.workspace")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("workspace.stages.pilot")).not.toHaveAttribute("aria-current");
  });
});
