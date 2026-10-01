import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AssistantContextPanelSlot from "./AssistantContextPanelSlot";
import { AssistantSurfaceProvider } from "./AssistantSurfaceContext";

const mockUseSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("./AssistantContextPanel", () => ({
  default: ({ threadId }: { threadId?: string | null }) => (
    <div data-testid="context-panel" data-thread-id={threadId ?? ""} />
  ),
}));

vi.mock("./AssistantGoalWorkspaceSlot", () => ({
  default: ({ threadId }: { threadId: string }) => (
    <div data-testid="goal-workspace" data-thread-id={threadId} />
  ),
}));

describe("AssistantContextPanelSlot", () => {
  it("uses the threadId query param when no explicit threadId prop is given", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("threadId=thread-from-url"));
    render(
      <AssistantSurfaceProvider>
        <AssistantContextPanelSlot />
      </AssistantSurfaceProvider>
    );

    expect(screen.getByTestId("context-panel")).toHaveAttribute("data-thread-id", "thread-from-url");
  });

  it("prefers an explicit threadId prop over an absent query param, as on the home route", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    render(
      <AssistantSurfaceProvider>
        <AssistantContextPanelSlot threadId="thread-from-home" />
      </AssistantSurfaceProvider>
    );

    expect(screen.getByTestId("context-panel")).toHaveAttribute("data-thread-id", "thread-from-home");
  });
});
