"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { stripThinkBlocks } from "@/server/assistant/model/reasoning-sanitizer";
import AssistantActionCard from "./AssistantActionCard";

export interface AssistantDisplayMessage {
  id: string;
  type: "user" | "assistant" | "tool" | "action_card";
  content: string;
  payload: Record<string, unknown>;
}

export interface AssistantMessageListProps {
  messages: AssistantDisplayMessage[];
  streamingText: string;
  isStreaming: boolean;
  threadId: string | null;
}

function MessageBubble({
  message,
}: {
  message: AssistantDisplayMessage;
}) {
  if (message.type === "tool") {
    const summary =
      typeof message.payload.summary === "string"
        ? message.payload.summary
        : message.content;
    const toolName =
      typeof message.payload.toolName === "string"
        ? message.payload.toolName
        : "tool";
    return (
      <div
        className="text-xs text-[var(--text-muted)]"
        data-testid="assistant-tool-message"
      >
        <span className="font-medium text-[var(--text-secondary)]">
          {toolName}:
        </span>{" "}
        {summary}
      </div>
    );
  }

  const isUser = message.type === "user";

  const displayContent = useMemo(
    () => (isUser ? message.content : stripThinkBlocks(message.content)),
    [isUser, message.content]
  );

  return (
    <div
      className={cn(
        "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
        isUser
          ? "ml-auto bg-[var(--accent-primary)] text-white"
          : "bg-[var(--surface-raised)] text-[var(--text-primary)]"
      )}
      data-testid={`assistant-message-${message.type}`}
    >
      {displayContent}
    </div>
  );
}

export default function AssistantMessageList({
  messages,
  streamingText,
  isStreaming,
  threadId,
}: AssistantMessageListProps) {
  const sanitizedStreamingText = useMemo(
    () => (isStreaming && streamingText ? stripThinkBlocks(streamingText) : ""),
    [isStreaming, streamingText]
  );

  return (
    <div
      className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
      data-testid="assistant-message-list"
    >
      {messages.map((message) => {
        if (message.type === "action_card") {
          return (
            <AssistantActionCard
              key={message.id}
              threadId={threadId}
              payload={message.payload}
            />
          );
        }
        return <MessageBubble key={message.id} message={message} />;
      })}
      {isStreaming && sanitizedStreamingText ? (
        <div
          className="max-w-[85%] rounded-lg bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] whitespace-pre-wrap"
          data-testid="assistant-streaming-bubble"
        >
          {sanitizedStreamingText}
        </div>
      ) : null}
    </div>
  );
}
