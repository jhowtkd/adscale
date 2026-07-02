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
  it("hides the Estilizar button when no onEstilizar handler is provided", () => {
    render(<WorkspaceActionBar onDerivar={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: /workspace\.actionBar\.estilizar/i })
    ).not.toBeInTheDocument();
  });

  it("still renders the Estilizar button when an onEstilizar handler is provided", () => {
    const onEstilizar = vi.fn();
    render(<WorkspaceActionBar onDerivar={vi.fn()} onEstilizar={onEstilizar} />);

    const estilizarButton = screen.getByRole("button", { name: /workspace\.actionBar\.estilizar/i });
    fireEvent.click(estilizarButton);

    expect(onEstilizar).toHaveBeenCalledTimes(1);
  });

  it("WorkspaceActionBar uses shell-backed sticky layering", () => {
    const { container } = render(<WorkspaceActionBar onDerivar={vi.fn()} />);

    expect(container.firstElementChild).toHaveClass("workspace-sticky-top", "layer-sticky");
    expect(container.firstElementChild).not.toHaveClass("top-14", "z-10");
  });
});

describe("WorkspaceStageStrip", () => {
  it("marks the pilot stage active in setup state", () => {
    render(<WorkspaceStageStrip workspaceState="setup" />);

    expect(screen.getByText("workspace.stages.pilot")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("workspace.stages.workspace")).not.toHaveAttribute("aria-current");
  });

  it("marks the workspace stage active after setup", () => {
    render(<WorkspaceStageStrip workspaceState="trabalho" />);

    expect(screen.getByText("workspace.stages.workspace")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("workspace.stages.pilot")).not.toHaveAttribute("aria-current");
  });
});
