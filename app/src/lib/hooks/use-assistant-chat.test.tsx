import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect, useRef } from "react";
import { encodeAssistantSseEvent } from "@/server/assistant/stream/sse";
import { useAssistantChat } from "./use-assistant-chat";

function createWrapper(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function sseResponse(frames: Array<{ event: string; data: Record<string, unknown> }>) {
  const stream = new ReadableStream({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(
          encodeAssistantSseEvent(
            frame.event as "text_delta" | "tool_summary" | "action_card" | "done" | "error",
            frame.data
          )
        );
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("useAssistantChat", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams text_delta and finalizes on done without duplicating assistant reply", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { event: "text_delta", data: { text: "Hello" } },
        { event: "text_delta", data: { text: " world" } },
        { event: "done", data: { messageId: "assistant-1" } },
      ])
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAssistantChat("thread-1"), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assistant/threads/thread-1/chat",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ message: "Hi" }),
      })
    );

    expect(result.current.messages.some((m) => m.type === "user" && m.content === "Hi")).toBe(
      true
    );
    expect(
      result.current.messages.filter(
        (m) => m.type === "assistant" && m.content === "Hello world"
      )
    ).toHaveLength(0);
    expect(result.current.isStreaming).toBe(false);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["assistant", "thread", "thread-1"],
    });
  });

  it("upserts action_card messages by actionRecordId", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        {
          event: "action_card",
          data: {
            actionRecordId: "action-1",
            status: "pending",
            display: { label: "Generate" },
          },
        },
        { event: "done", data: {} },
      ])
    );

    const { result } = renderHook(() => useAssistantChat("thread-1"), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.sendMessage("Run action");
    });

    const cards = result.current.messages.filter((m) => m.type === "action_card");
    expect(cards).toHaveLength(1);
    expect(cards[0].payload).toMatchObject({
      actionRecordId: "action-1",
      status: "pending",
    });
  });

  it("exposes error event without throwing", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([{ event: "error", data: { message: "Stream failed" } }])
    );

    const { result } = renderHook(() => useAssistantChat("thread-1"), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.sendMessage("Hi");
    });

    expect(result.current.error).toBe("Stream failed");
    expect(result.current.isStreaming).toBe(false);
  });

  it("aborts prior stream when sending a new message", async () => {
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((_url, init) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            sseResponse([{ event: "text_delta", data: { text: "late" } }, { event: "done", data: {} }])
          );
        }, 100);
      });
    });

    const { result } = renderHook(() => useAssistantChat("thread-1"), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      const first = result.current.sendMessage("First");
      await new Promise((r) => setTimeout(r, 10));
      await result.current.sendMessage("Second");
      await first.catch(() => undefined);
    });

    expect(signals[0]?.aborted).toBe(true);
    expect(signals).toHaveLength(2);
  });

  it("does not abort the first message during the Strict Mode effect replay", async () => {
    let capturedSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, init) => {
      capturedSignal = init?.signal as AbortSignal | undefined;
      return Promise.resolve(sseResponse([{ event: "done", data: {} }]));
    });

    function FirstMessageHarness() {
      const { sendMessage, isStreaming } = useAssistantChat("thread-1");
      const sentRef = useRef(false);
      useEffect(() => {
        if (sentRef.current) return;
        sentRef.current = true;
        void sendMessage("First message");
      }, [sendMessage]);
      return <span>{isStreaming ? "streaming" : "idle"}</span>;
    }

    render(
      <StrictMode>
        <QueryClientProvider client={new QueryClient()}>
          <FirstMessageHarness />
        </QueryClientProvider>
      </StrictMode>
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("idle")).toBeInTheDocument());
    expect(capturedSignal?.aborted).toBe(false);
  });

  it("aborts in-flight stream on unmount", async () => {
    let capturedSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, init) => {
      capturedSignal = init?.signal as AbortSignal | undefined;
      return new Promise(() => undefined);
    });

    const { result, unmount } = renderHook(() => useAssistantChat("thread-1"), {
      wrapper: createWrapper(),
    });

    act(() => {
      void result.current.sendMessage("Hi");
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    unmount();
    await waitFor(() => expect(capturedSignal?.aborted).toBe(true));
  });

  it("clears live messages and aborts stream when threadId changes", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        {
          event: "action_card",
          data: {
            actionRecordId: "action-1",
            status: "pending",
            display: { label: "Generate" },
          },
        },
        { event: "done", data: {} },
      ])
    );

    const { result, rerender } = renderHook(
      ({ threadId }: { threadId: string | null }) => useAssistantChat(threadId),
      {
        wrapper: createWrapper(),
        initialProps: { threadId: "thread-1" },
      }
    );

    await act(async () => {
      await result.current.sendMessage("First thread");
    });

    expect(result.current.messages).toHaveLength(2);

    rerender({ threadId: "thread-2" });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.streamingText).toBe("");
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
