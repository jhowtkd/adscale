import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantChatCore from "./AssistantChatCore";

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

vi.mock("./AssistantActionCard", () => ({
  default: ({ payload }: { payload: Record<string, unknown> }) => (
    <div data-testid="action-card">{String(payload.actionRecordId)}</div>
  ),
}));

describe("AssistantChatCore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    render(<AssistantChatCore threadId={null} variant="full" />);

    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
    expect(screen.getByText("noThreadHint")).toBeInTheDocument();
  });

  it("calls sendMessage when user submits with a thread", () => {
    render(<AssistantChatCore threadId="thread-1" variant="full" />);

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

    render(<AssistantChatCore threadId="thread-1" variant="full" />);

    expect(screen.getByText("Hi")).toBeInTheDocument();
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });
});
