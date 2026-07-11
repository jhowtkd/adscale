import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantChatCore from "./AssistantChatCore";
import { AssistantSurfaceProvider, useAssistantSurface } from "./AssistantSurfaceContext";

const mockSendMessage = vi.fn();
const mockUseAssistantChat = vi.fn();
const mockUseAssistantThread = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-assistant-chat", () => ({
  useAssistantChat: (...args: unknown[]) => mockUseAssistantChat(...args),
}));

vi.mock("@/lib/hooks/use-assistant-threads", () => ({
  useAssistantThread: (...args: unknown[]) => mockUseAssistantThread(...args),
}));

const mockUsePlanFeedbackDraft = vi.fn();

vi.mock("@/lib/hooks/use-plan-feedback-draft", () => ({
  usePlanFeedbackDraft: (...args: unknown[]) => mockUsePlanFeedbackDraft(...args),
}));

vi.mock("./AssistantActionCard", () => ({
  default: ({ payload }: { payload: Record<string, unknown> }) => (
    <div data-testid="action-card">{String(payload.actionRecordId)}</div>
  ),
}));

vi.mock("./VersionComparisonDialog", () => ({
  default: ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => (
    <div data-testid="comparison-host">
      <button type="button" onClick={() => onOpenChange(false)}>close comparison</button>
    </div>
  ),
}));

function ComparisonTrigger() {
  const { openVersionComparison } = useAssistantSurface();
  return (
    <button
      type="button"
      onClick={() => openVersionComparison({
        threadId: "thread-1",
        lineageId: "lineage-1",
        artifactType: "plan",
        versionAId: "version-1",
        versionBId: "version-2",
      })}
    >
      compare trigger
    </button>
  );
}

function renderCore(ui: ReactElement) {
  return render(<AssistantSurfaceProvider>{ui}</AssistantSurfaceProvider>);
}

describe("AssistantChatCore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePlanFeedbackDraft.mockReturnValue({
      draftText: "",
      onDraftTextChange: vi.fn(),
      clearDraft: vi.fn(),
      isLoading: false,
    });
    mockUseAssistantChat.mockReturnValue({
      messages: [],
      streamingText: "",
      isStreaming: false,
      error: null,
      sendMessage: mockSendMessage,
    });
    mockUseAssistantThread.mockReturnValue({
      data: { thread: { id: "thread-1" }, messages: [] },
      isLoading: false,
    });
  });

  it("disables input when threadId is null", () => {
    renderCore(<AssistantChatCore threadId={null} variant="full" />);

    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
    expect(screen.getByText("noThreadHint")).toBeInTheDocument();
  });

  it("calls sendMessage when user submits with a thread", () => {
    renderCore(<AssistantChatCore threadId="thread-1" variant="full" />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Hello assistant" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    expect(mockSendMessage).toHaveBeenCalledWith("Hello assistant");
  });

  it("renders server history and streaming assistant text", () => {
    mockUseAssistantThread.mockReturnValue({
      data: {
        thread: { id: "thread-1" },
        messages: [
          {
            id: "msg-1",
            type: "user",
            content: "Hi",
            payload: {},
          },
          {
            id: "msg-2",
            type: "assistant",
            content: "Hello there",
            payload: {},
          },
        ],
      },
      isLoading: false,
    });
    mockUseAssistantChat.mockReturnValue({
      messages: [],
      streamingText: "Thinking",
      isStreaming: true,
      error: null,
      sendMessage: mockSendMessage,
    });

    renderCore(<AssistantChatCore threadId="thread-1" variant="full" />);

    expect(screen.getByText("Hi")).toBeInTheDocument();
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("enables plan feedback draft hook for campaign threads", () => {
    mockUseAssistantThread.mockReturnValue({
      data: {
        thread: { id: "thread-1", campaignId: "campaign-1" },
        messages: [],
      },
      isLoading: false,
    });

    renderCore(<AssistantChatCore threadId="thread-1" variant="full" />);

    expect(mockUsePlanFeedbackDraft).toHaveBeenCalledWith("thread-1", {
      enabled: true,
    });
  });

  it("clears plan feedback draft after send on campaign threads", async () => {
    const clearDraft = vi.fn().mockResolvedValue(undefined);
    let draftText = "";
    const onDraftTextChange = vi.fn((text: string) => {
      draftText = text;
    });
    mockUsePlanFeedbackDraft.mockImplementation(() => ({
      draftText,
      onDraftTextChange,
      clearDraft,
      isLoading: false,
    }));
    mockUseAssistantThread.mockReturnValue({
      data: {
        thread: { id: "thread-1", campaignId: "campaign-1" },
        messages: [],
      },
      isLoading: false,
    });
    mockSendMessage.mockResolvedValue(undefined);

    const { rerender } = renderCore(
      <AssistantChatCore threadId="thread-1" variant="full" />
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Hello assistant" } });
    rerender(
      <AssistantSurfaceProvider>
        <AssistantChatCore threadId="thread-1" variant="full" />
      </AssistantSurfaceProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await vi.waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith("Hello assistant");
      expect(clearDraft).toHaveBeenCalled();
    });
  });

  it("mounts one comparison host and restores exact scroll and trigger focus", async () => {
    mockUseAssistantThread.mockReturnValue({
      data: {
        thread: { id: "thread-1", campaignId: "campaign-1" },
        messages: [],
        artifactVersionState: { lineages: [] },
      },
      isLoading: false,
    });
    render(
      <AssistantSurfaceProvider>
        <ComparisonTrigger />
        <AssistantChatCore threadId="thread-1" />
      </AssistantSurfaceProvider>
    );
    const scroller = screen.getByTestId("assistant-chat-scroll-region");
    scroller.scrollTop = 137;
    const trigger = screen.getByRole("button", { name: "compare trigger" });
    trigger.focus();
    fireEvent.click(trigger);
    scroller.scrollTop = 0;

    expect(screen.getAllByTestId("comparison-host")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "close comparison" }));

    await vi.waitFor(() => {
      expect(scroller.scrollTop).toBe(137);
      expect(trigger).toHaveFocus();
    });
  });
});
