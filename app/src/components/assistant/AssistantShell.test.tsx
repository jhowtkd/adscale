import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantShell from "./AssistantShell";
import { AssistantSurfaceProvider } from "./AssistantSurfaceContext";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockUseIsMobile = vi.fn(() => false);

vi.mock("@/lib/hooks/use-media-query", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

const mockUseSearchParams = vi.fn(() => new URLSearchParams("threadId=thread-1"));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

function shell(props: {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  contextPanel: React.ReactNode;
  mode?: "conversation" | "workspace";
  hideDesktopSidebar?: boolean;
}) {
  return render(
    <AssistantSurfaceProvider>
      <AssistantShell {...props} />
    </AssistantSurfaceProvider>
  );
}

describe("AssistantShell", () => {
  beforeEach(() => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("threadId=thread-1"));
  });

  it("renders desktop three-column regions with slot content", () => {
    mockUseIsMobile.mockReturnValue(false);
    shell({
      sidebar: <div>Sidebar slot</div>,
      main: <div>Main slot</div>,
      contextPanel: <div>Context slot</div>,
    });

    expect(screen.getByTestId("assistant-desktop-layout")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-desktop-sidebar")).toHaveTextContent("Sidebar slot");
    expect(screen.getByTestId("assistant-desktop-main")).toHaveTextContent("Main slot");
    expect(screen.getByTestId("assistant-desktop-context")).toHaveTextContent("Context slot");
  });

  it("renders mobile tabs and switches visible panel", () => {
    mockUseIsMobile.mockReturnValue(true);
    shell({
      sidebar: <div>Sidebar slot</div>,
      main: <div>Main slot</div>,
      contextPanel: <div>Context slot</div>,
    });

    expect(screen.getByTestId("assistant-mobile-layout")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-mobile-chat")).toHaveTextContent("Main slot");
    expect(screen.queryByTestId("assistant-desktop-layout")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "tree" }));
    expect(screen.getByTestId("assistant-mobile-tree")).toHaveTextContent("Sidebar slot");

    fireEvent.click(screen.getByRole("button", { name: "context" }));
    expect(screen.getByTestId("assistant-mobile-context")).toHaveTextContent("Context slot");
  });

  it("switches to workspace grid and renders the workspace column in workspace mode", () => {
    mockUseIsMobile.mockReturnValue(false);
    shell({
      sidebar: <div>Sidebar slot</div>,
      main: <div>Main slot</div>,
      contextPanel: <div>Workspace slot</div>,
      mode: "workspace",
    });

    const layout = screen.getByTestId("assistant-desktop-layout");
    expect(layout.className).toContain("grid-cols-[220px_minmax(320px,0.65fr)_minmax(640px,1.35fr)]");
    expect(screen.getByTestId("assistant-desktop-workspace")).toHaveTextContent("Workspace slot");
  });

  it("hides the desktop tree sidebar when hideDesktopSidebar is set", () => {
    mockUseIsMobile.mockReturnValue(false);
    shell({
      sidebar: <div>Sidebar slot</div>,
      main: <div>Main slot</div>,
      contextPanel: <div>Context slot</div>,
      hideDesktopSidebar: true,
    });

    expect(screen.queryByTestId("assistant-desktop-sidebar")).not.toBeInTheDocument();
    expect(screen.getByTestId("assistant-desktop-main")).toHaveTextContent("Main slot");
    expect(screen.getByTestId("assistant-desktop-layout").className).toContain(
      "grid-cols-[1fr_320px]"
    );
  });
});
