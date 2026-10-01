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

  it("forwards the preserved first message and attachments once", async () => {
    mockSendMessage.mockResolvedValue(undefined);
    const onConsumed = vi.fn();
    const pendingFirstMessage = {
      text: "Use esta referência",
      attachments: [
        {
          assetId: "asset-1",
          key: "uploads/reference.png",
          url: "https://example.com/reference.png",
          type: "image/png",
          name: "reference.png",
          size: 123,
        },
      ],
    };

    renderCore(
      <AssistantChatCore
        threadId="thread-1"
        variant="full"
        pendingFirstMessage={pendingFirstMessage}
        onPendingFirstMessageConsumed={onConsumed}
      />
    );

    await vi.waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(pendingFirstMessage);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(onConsumed).toHaveBeenCalledTimes(1);
    });
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

  it("sends a suggestion click as a fromSuggestion message (ticket 02)", () => {
    mockUseAssistantChat.mockReturnValue({
      messages: [
        {
          id: "a1",
          type: "assistant",
          content: "Aqui está o resumo.",
          payload: { suggestions: ["Me explica a oportunidade 2"] },
        },
      ],
      streamingText: "",
      isStreaming: false,
      error: null,
      sendMessage: mockSendMessage,
    });

    renderCore(<AssistantChatCore threadId="thread-1" variant="full" equipeEnabled />);

    fireEvent.click(screen.getByRole("button", { name: "Me explica a oportunidade 2" }));

    expect(mockSendMessage).toHaveBeenCalledWith({
      text: "Me explica a oportunidade 2",
      fromSuggestion: true,
    });
  });

  it("does not expose internal assistant error codes to the user", () => {
    mockUseAssistantChat.mockReturnValue({
      messages: [],
      streamingText: "",
      isStreaming: false,
      error: "assistantStreamError",
      sendMessage: mockSendMessage,
    });

    renderCore(<AssistantChatCore threadId="thread-1" variant="full" />);

    expect(screen.getByRole("alert")).toHaveTextContent("errorGeneric");
    expect(screen.queryByText("assistantStreamError")).not.toBeInTheDocument();
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

describe("AssistantChatCore: the pilot conversation (rail chrome)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePlanFeedbackDraft.mockReturnValue({ draftText: "", onDraftTextChange: vi.fn(), clearDraft: vi.fn(), isLoading: false });
    mockSendMessage.mockResolvedValue(undefined);
    mockUseAssistantChat.mockReturnValue({ messages: [], streamingText: "", isStreaming: false, error: null, sendMessage: mockSendMessage });
    mockUseAssistantThread.mockReturnValue({ data: { thread: { id: "thread-1" }, messages: [] }, isLoading: false });
  });

  it("sends a suggestion from the URL once, as a suggestion, and tells the host to clear it", async () => {
    const handled = vi.fn();
    const { rerender } = renderCore(<AssistantChatCore threadId="thread-1" variant="full" chrome="rail" equipeEnabled urlSuggestion="Montar o calendário do mês" onUrlSuggestionHandled={handled} />);
    await vi.waitFor(() => expect(mockSendMessage).toHaveBeenCalledExactlyOnceWith({ text: "Montar o calendário do mês", fromSuggestion: true }));
    expect(handled).toHaveBeenCalledTimes(1);
    rerender(<AssistantSurfaceProvider><AssistantChatCore threadId="thread-1" variant="full" chrome="rail" equipeEnabled urlSuggestion="Montar o calendário do mês" onUrlSuggestionHandled={handled} /></AssistantSurfaceProvider>);
    await Promise.resolve();
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  // KNOWN DEFECT (reported to the ticket 09 coordinator): the effect that sends `urlSuggestion` re-runs whenever the chat
  // hook's callbacks change, and nothing remembers the phrase was sent, so a send that ends before the host clears the
  // URL goes out again. `it.fails` keeps this honest: when the code is fixed this test passes and must become a plain `it`.
  it.fails("does not send the suggestion again when a quick failure returns before the host cleared it from the URL", async () => {
    // A send that ends fast (a refusal, a rate limit) changes the chat's callbacks; the URL clears only on the host's next render.
    let sends = 0;
    const handled = vi.fn();
    const makeChat = (streaming: boolean) => ({
      messages: [], streamingText: "", isStreaming: streaming, error: null,
      sendMessage: vi.fn(async () => { sends += 1; }),
    });
    mockUseAssistantChat.mockReturnValue(makeChat(false));
    const ui = () => (
      <AssistantSurfaceProvider>
        <AssistantChatCore threadId="thread-1" variant="full" chrome="rail" equipeEnabled urlSuggestion="Montar o calendário do mês" onUrlSuggestionHandled={handled} />
      </AssistantSurfaceProvider>
    );
    const { rerender } = render(ui());
    await vi.waitFor(() => expect(sends).toBe(1));
    for (const streaming of [true, false, true, false]) {
      mockUseAssistantChat.mockReturnValue(makeChat(streaming));
      rerender(ui());
    }
    await Promise.resolve();
    expect(sends).toBe(1);
    expect(handled).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the conversation is still loading", { isLoading: true }],
    ["a reply is streaming", { streaming: true }],
    ["there is no thread yet", { noThread: true }],
  ])("waits and sends nothing while %s", (_label, state: { isLoading?: boolean; streaming?: boolean; noThread?: boolean }) => {
    mockUseAssistantThread.mockReturnValue({ data: { thread: { id: "thread-1" }, messages: [] }, isLoading: Boolean(state.isLoading) });
    mockUseAssistantChat.mockReturnValue({ messages: [], streamingText: "", isStreaming: Boolean(state.streaming), error: null, sendMessage: mockSendMessage });
    const handled = vi.fn();
    renderCore(<AssistantChatCore threadId={state.noThread ? null : "thread-1"} variant="full" chrome="rail" equipeEnabled urlSuggestion="Montar o calendário do mês" onUrlSuggestionHandled={handled} />);
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(handled).not.toHaveBeenCalled();
  });

  it("sends nothing without a suggestion", () => {
    renderCore(<AssistantChatCore threadId="thread-1" variant="full" chrome="rail" equipeEnabled urlSuggestion={null} />);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("hides the attach button when attachments are off, and keeps it by default", () => {
    const { unmount } = renderCore(<AssistantChatCore threadId="thread-1" variant="full" chrome="rail" attachmentsEnabled={false} />);
    expect(screen.queryByRole("button", { name: "addImage" })).not.toBeInTheDocument();
    unmount();
    renderCore(<AssistantChatCore threadId="thread-1" variant="full" chrome="rail" />);
    expect(screen.getByRole("button", { name: "addImage" })).toBeInTheDocument();
  });

  it("shows the mesa on top of the conversation only in the rail chrome, and no thread header", () => {
    const { unmount } = renderCore(<AssistantChatCore threadId="thread-1" variant="full" chrome="rail" mesa={<div data-testid="the-mesa" />} />);
    expect(screen.getByTestId("the-mesa")).toBeInTheDocument();
    expect(screen.queryByTestId("assistant-chat-header")).not.toBeInTheDocument();
    unmount();
    renderCore(<AssistantChatCore threadId="thread-1" variant="full" mesa={<div data-testid="the-mesa" />} />);
    expect(screen.queryByTestId("the-mesa")).not.toBeInTheDocument();
  });

  it("uses the pill composer in the rail chrome and the classic one otherwise", () => {
    const { unmount } = renderCore(<AssistantChatCore threadId="thread-1" variant="full" chrome="rail" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "1");
    unmount();
    renderCore(<AssistantChatCore threadId="thread-1" variant="full" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "2");
  });
});
