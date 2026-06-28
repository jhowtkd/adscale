import { readAssistantSseStream } from "@/lib/assistant/parse-sse";
import type { ChatAttachment } from "@/lib/assistant/chat-attachments";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { assistantThreadQueryKey } from "./use-assistant-threads";

export interface AssistantChatMessage {
  id: string;
  type: "user" | "assistant" | "action_card" | "tool";
  content: string;
  payload: Record<string, unknown>;
}

export interface SendAssistantMessageInput {
  text: string;
  attachments?: ChatAttachment[];
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
    async (input: string | SendAssistantMessageInput) => {
      if (!threadId) {
        setError("Selecione uma conversa antes de enviar mensagens.");
        return;
      }

      const text = typeof input === "string" ? input : input.text;
      const attachments =
        typeof input === "string" ? undefined : input.attachments;

      const trimmed = text.trim();
      if (!trimmed && (!attachments || attachments.length === 0)) {
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const ABSOLUTE_TIMEOUT_MS = 120_000;
      const absoluteTimer = setTimeout(() => controller.abort(), ABSOLUTE_TIMEOUT_MS);

      setError(null);
      setIsStreaming(true);
      setStreamingText("");

      const userPayload: Record<string, unknown> = {};
      if (attachments?.length) {
        userPayload.attachments = attachments;
      }

      const userMessage: AssistantChatMessage = {
        id: createLocalId("user"),
        type: "user",
        content: trimmed,
        payload: userPayload,
      };
      setMessages((prev) => [...prev, userMessage]);

      let assistantText = "";

      try {
        const body: Record<string, unknown> = { message: trimmed };
        if (attachments?.length) {
          body.attachments = attachments.map(
            ({ assetId, key, type, name, size }) => ({
              assetId,
              key,
              type,
              name,
              size,
            })
          );
        }

        const response = await fetch(
          `/api/assistant/threads/${threadId}/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
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
            const delta =
              typeof frame.data.text === "string" ? frame.data.text : "";
            assistantText += delta;
            setStreamingText(assistantText);
          } else if (frame.event === "tool_summary") {
            const toolName =
              typeof frame.data.toolName === "string"
                ? frame.data.toolName
                : "tool";
            const summary =
              typeof frame.data.summary === "string" ? frame.data.summary : "";
            const toolMessage: AssistantChatMessage = {
              id: createLocalId("tool"),
              type: "tool",
              content: summary,
              payload: { toolName, summary },
            };
            setMessages((prev) => [...prev, toolMessage]);
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
            await queryClient.invalidateQueries({
              queryKey: assistantThreadQueryKey(threadId),
            });
          }
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Erro ao enviar mensagem";
        setError(message);
      } finally {
        clearTimeout(absoluteTimer);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        if (!controller.signal.aborted) {
          setIsStreaming(false);
          setStreamingText("");
        } else if (controller.signal.reason === "timeout") {
          setError("O assistente demorou demais para responder. Tente novamente.");
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
