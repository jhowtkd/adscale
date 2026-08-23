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

  it("keeps context collapsed by default and expands it on demand", () => {
    mockUseIsMobile.mockReturnValue(false);
    shell({
      sidebar: <div>Sidebar slot</div>,
      main: <div>Main slot</div>,
      contextPanel: <div>Context slot</div>,
    });

    expect(screen.getByTestId("assistant-desktop-layout")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-desktop-sidebar")).toHaveTextContent("Sidebar slot");
    expect(screen.getByTestId("assistant-desktop-main")).toHaveTextContent("Main slot");
    expect(screen.queryByTestId("assistant-desktop-context")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand context panel" }));

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

  it("keeps context unavailable until a conversation exists", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockUseIsMobile.mockReturnValue(false);
    const { rerender } = shell({
      sidebar: <div>Sidebar slot</div>,
      main: <div>Main slot</div>,
      contextPanel: <div>Context slot</div>,
    });

    expect(screen.queryByTestId("assistant-desktop-context")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand context panel" })).not.toBeInTheDocument();

    mockUseIsMobile.mockReturnValue(true);
    rerender(
      <AssistantSurfaceProvider>
        <AssistantShell
          sidebar={<div>Sidebar slot</div>}
          main={<div>Main slot</div>}
          contextPanel={<div>Context slot</div>}
        />
      </AssistantSurfaceProvider>
    );

    expect(screen.queryByRole("button", { name: "context" })).not.toBeInTheDocument();
  });

  it("does not carry an open context panel into a new conversation", () => {
    mockUseIsMobile.mockReturnValue(false);
    const { rerender } = shell({
      sidebar: <div>Sidebar slot</div>,
      main: <div>Main slot</div>,
      contextPanel: <div>Context slot</div>,
    });
    fireEvent.click(screen.getByRole("button", { name: "Expand context panel" }));
    expect(screen.getByTestId("assistant-desktop-context")).toBeInTheDocument();

    mockUseSearchParams.mockReturnValue(new URLSearchParams("threadId=thread-2"));
    rerender(
      <AssistantSurfaceProvider>
        <AssistantShell
          sidebar={<div>Sidebar slot</div>}
          main={<div>Main slot</div>}
          contextPanel={<div>Context slot</div>}
        />
      </AssistantSurfaceProvider>
    );

    expect(screen.queryByTestId("assistant-desktop-context")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand context panel" })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Expand context panel" }));

    expect(screen.getByTestId("assistant-desktop-layout").className).toContain(
      "grid-cols-[1fr_320px]"
    );
  });
});
