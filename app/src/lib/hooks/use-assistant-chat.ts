import { readAssistantSseStream } from "@/lib/assistant/parse-sse";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { assistantThreadQueryKey } from "./use-assistant-threads";

export interface AssistantChatMessage {
  id: string;
  type: "user" | "assistant" | "action_card" | "tool";
  content: string;
  payload: Record<string, unknown>;
}

function createLocalId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function useAssistantChat(threadId: string | null) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!threadId) {
        setError("Selecione uma conversa antes de enviar mensagens.");
        return;
      }

      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setIsStreaming(true);
      setStreamingText("");

      const userMessage: AssistantChatMessage = {
        id: createLocalId("user"),
        type: "user",
        content: trimmed,
        payload: {},
      };
      setMessages((prev) => [...prev, userMessage]);

      let assistantText = "";

      try {
        const response = await fetch(
          `/api/assistant/threads/${threadId}/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ message: trimmed }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || "Erro ao enviar mensagem");
        }

        for await (const frame of readAssistantSseStream(
          response,
          controller.signal
        )) {
          if (frame.event === "text_delta") {
            const delta = typeof frame.data.text === "string" ? frame.data.text : "";
            assistantText += delta;
            setStreamingText(assistantText);
          } else if (frame.event === "action_card") {
            const actionRecordId =
              typeof frame.data.actionRecordId === "string"
                ? frame.data.actionRecordId
                : createLocalId("action");
            const card: AssistantChatMessage = {
              id: actionRecordId,
              type: "action_card",
              content: "",
              payload: frame.data,
            };
            setMessages((prev) => {
              const index = prev.findIndex(
                (message) =>
                  message.type === "action_card" &&
                  message.payload.actionRecordId === actionRecordId
              );
              if (index === -1) {
                return [...prev, card];
              }
              const next = [...prev];
              next[index] = card;
              return next;
            });
          } else if (frame.event === "error") {
            const message =
              typeof frame.data.message === "string"
                ? frame.data.message
                : "Erro no assistente";
            setError(message);
          } else if (frame.event === "done") {
            if (assistantText) {
              const assistantMessage: AssistantChatMessage = {
                id: createLocalId("assistant"),
                type: "assistant",
                content: assistantText,
                payload: {},
              };
              setMessages((prev) => [...prev, assistantMessage]);
            }
            setStreamingText("");
            await queryClient.invalidateQueries({
              queryKey: assistantThreadQueryKey(threadId),
            });
          }
        }

        if (assistantText && !controller.signal.aborted) {
          setMessages((prev) => {
            const hasAssistant = prev.some(
              (message) =>
                message.type === "assistant" && message.content === assistantText
            );
            if (hasAssistant) {
              return prev;
            }
            return [
              ...prev,
              {
                id: createLocalId("assistant"),
                type: "assistant",
                content: assistantText,
                payload: {},
              },
            ];
          });
          setStreamingText("");
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Erro ao enviar mensagem";
        setError(message);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        if (!controller.signal.aborted) {
          setIsStreaming(false);
          setStreamingText("");
        }
      }
    },
    [queryClient, threadId]
  );

  return {
    messages,
    streamingText,
    isStreaming,
    error,
    sendMessage,
  };
}
