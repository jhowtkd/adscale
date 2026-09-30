import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantSidebarPanel from "./AssistantSidebarPanel";
import { AssistantSurfaceProvider, useAssistantSurface } from "./AssistantSurfaceContext";

const mockUseSearchParams = vi.fn(() => new URLSearchParams());
const mockReplace = vi.fn();
const mockUseAssistantThread = vi.fn<(threadId: string | null) => {
  data: { thread: { clientProfileId: string } } | undefined;
}>(() => ({ data: undefined }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@/lib/hooks/use-assistant-threads", () => ({
  useAssistantThread: (threadId: string | null) => mockUseAssistantThread(threadId),
}));

function renderPanel(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AssistantSurfaceProvider>{ui}</AssistantSurfaceProvider>
    </QueryClientProvider>
  );
}

vi.mock("./AssistantTreeSidebar", () => ({
  default: ({
    selectedThreadId,
    onNewClient,
    onNewThread,
    contextClientId,
    expandClientId,
  }: {
    selectedThreadId?: string;
    onNewClient?: () => void;
    onNewThread?: (clientId: string) => void;
    contextClientId?: string | null;
    expandClientId?: string | null;
  }) => (
    <div
      data-testid="tree-sidebar"
      data-selected-thread-id={selectedThreadId ?? ""}
      data-allow-client-creation={String(Boolean(onNewClient))}
      data-allow-thread-creation={String(Boolean(onNewThread))}
      data-context-client-id={contextClientId ?? ""}
      data-expand-client-id={expandClientId ?? ""}
    >
      {onNewClient ? <button onClick={onNewClient}>new-client</button> : null}
      {onNewThread ? <button onClick={() => onNewThread("client-classic")}>new-chat</button> : null}
    </div>
  ),
}));

vi.mock("./AssistantCreateClientDialog", () => ({
  default: ({ open, onSuccess }: { open: boolean; onSuccess: (clientId: string) => void }) =>
    open ? <div role="dialog"><button onClick={() => onSuccess("client-new")}>save-client</button></div> : null,
}));

function SurfaceActions() {
  const { openCreateClient, startNewChat } = useAssistantSurface();
  return <>
    <button onClick={openCreateClient}>surface-create-client</button>
    <button onClick={startNewChat}>surface-new-chat</button>
  </>;
}

describe("AssistantSidebarPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAssistantThread.mockReturnValue({ data: undefined });
  });

  it("uses the threadId query param when no explicit threadId prop is given", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("threadId=thread-from-url"));
    renderPanel(<AssistantSidebarPanel />);

    expect(screen.getByTestId("tree-sidebar")).toHaveAttribute(
      "data-selected-thread-id",
      "thread-from-url",
    );
  });

  it("prefers an explicit threadId prop over an absent query param, as on the home route", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    renderPanel(<AssistantSidebarPanel threadId="thread-from-home" />);

    expect(screen.getByTestId("tree-sidebar")).toHaveAttribute(
      "data-selected-thread-id",
      "thread-from-home",
    );
  });

  it("disables the new-client/new-chat creation actions on the home route", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    renderPanel(<AssistantSidebarPanel threadId="thread-from-home" equipeEnabled />);

    expect(screen.getByTestId("tree-sidebar")).toHaveAttribute("data-allow-client-creation", "false");
    expect(screen.getByTestId("tree-sidebar")).toHaveAttribute("data-allow-thread-creation", "false");
  });

  it("hides the new-client/new-chat creation actions for an existing /assistant conversation", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("threadId=thread-1"));
    renderPanel(<AssistantSidebarPanel equipeEnabled />);

    expect(screen.getByTestId("tree-sidebar")).toHaveAttribute("data-selected-thread-id", "thread-1");
    expect(screen.getByTestId("tree-sidebar")).toHaveAttribute("data-allow-client-creation", "false");
    expect(screen.getByTestId("tree-sidebar")).toHaveAttribute("data-allow-thread-creation", "false");
  });

  it("auto-expands and selects the primary thread's client on the home route", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockUseAssistantThread.mockReturnValue({
      data: { thread: { clientProfileId: "client-primary" } },
    });

    renderPanel(<AssistantSidebarPanel threadId="thread-from-home" />);

    expect(mockUseAssistantThread).toHaveBeenCalledWith("thread-from-home");
    const sidebar = screen.getByTestId("tree-sidebar");
    expect(sidebar).toHaveAttribute("data-context-client-id", "client-primary");
    expect(sidebar).toHaveAttribute("data-expand-client-id", "client-primary");
  });

  it("restores classic creation and registered surface actions with the gate off", () => {
    renderPanel(<><AssistantSidebarPanel /><SurfaceActions /></>);
    expect(screen.getByTestId("tree-sidebar")).toHaveAttribute("data-allow-client-creation", "true");
    expect(screen.getByTestId("tree-sidebar")).toHaveAttribute("data-allow-thread-creation", "true");
    fireEvent.click(screen.getByText("surface-create-client"));
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByText("save-client"));
    expect(mockReplace).toHaveBeenCalledWith("/assistant");
    expect(screen.getByTestId("tree-sidebar")).toHaveAttribute("data-expand-client-id", "client-new");
    mockReplace.mockClear();
    fireEvent.click(screen.getByText("surface-new-chat"));
    expect(mockReplace).toHaveBeenCalledWith("/assistant");
  });

  it("keeps the classic new-chat action scoped to its selected client", () => {
    renderPanel(<AssistantSidebarPanel />);
    fireEvent.click(screen.getByText("new-chat"));
    expect(mockReplace).toHaveBeenCalledWith("/assistant");
    expect(screen.getByTestId("tree-sidebar")).toHaveAttribute("data-context-client-id", "client-classic");
    expect(screen.getByTestId("tree-sidebar")).toHaveAttribute("data-expand-client-id", "client-classic");
  });

  it("keeps registered creation actions inactive with the gate on", () => {
    renderPanel(<><AssistantSidebarPanel equipeEnabled /><SurfaceActions /></>);
    fireEvent.click(screen.getByText("surface-create-client"));
    fireEvent.click(screen.getByText("surface-new-chat"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
