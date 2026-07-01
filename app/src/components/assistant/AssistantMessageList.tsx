"use client";

import { useMemo, type Ref } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtifactVersionPresentation } from "@/lib/assistant/artifact-version";
import type { VersionComparisonRequest } from "./AssistantSurfaceContext";
import { stripThinkBlocks } from "@/server/assistant/model/reasoning-sanitizer";
import { renderMarkdownLite } from "./markdown-lite";
import AssistantActionCard from "./AssistantActionCard";
import AssistantEmptyState from "./AssistantEmptyState";

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
  scrollContainerRef?: Ref<HTMLDivElement>;
  artifactLineages?: ArtifactVersionPresentation[];
  openVersionComparison?: (request: VersionComparisonRequest) => void;
}

function looksLikeJsonPayload(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function MessageAttachments({
  attachments,
}: {
  attachments: Array<Record<string, unknown>>;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment) => {
        const url = typeof attachment.url === "string" ? attachment.url : null;
        const name = typeof attachment.name === "string" ? attachment.name : "anexo";
        const assetId =
          typeof attachment.assetId === "string" ? attachment.assetId : name;

        if (!url) return null;

        return (
          <img
            key={assetId}
            src={url}
            alt={name}
            className="max-h-24 max-w-[120px] rounded-md border border-white/20 object-cover"
          />
        );
      })}
    </div>
  );
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

    if (toolName === "get_thread_context" || looksLikeJsonPayload(summary)) {
      return null;
    }

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

  const displayContent = isUser
    ? message.content
    : stripThinkBlocks(message.content);
  const rawAttachments = message.payload.attachments;
  const attachments = Array.isArray(rawAttachments)
    ? rawAttachments.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null
      )
    : [];

  return (
    <div
      className={cn(
        "max-w-[85%] rounded-[var(--radius-panel)] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
        isUser
          ? "ml-auto bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
          : "border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
      )}
      data-testid={`assistant-message-${message.type}`}
    >
      {displayContent ? (
        isUser ? displayContent : renderMarkdownLite(displayContent)
      ) : null}
      <MessageAttachments attachments={attachments} />
    </div>
  );
}

export default function AssistantMessageList({
  messages,
  streamingText,
  isStreaming,
  threadId,
  scrollContainerRef,
  artifactLineages,
  openVersionComparison,
}: AssistantMessageListProps) {
  const t = useTranslations("assistant.chat");
  const sanitizedStreamingText = useMemo(
    () => (isStreaming && streamingText ? stripThinkBlocks(streamingText) : ""),
    [isStreaming, streamingText]
  );
  const showEmptyThread = messages.length === 0 && !isStreaming;

  return (
    <div
      ref={scrollContainerRef}
      className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
      data-testid="assistant-message-list"
    >
      {showEmptyThread ? (
        <AssistantEmptyState variant="thread" />
      ) : null}
      {messages.map((message) => {
        if (message.type === "action_card") {
          return (
            <AssistantActionCard
              key={message.id}
              threadId={threadId}
              payload={message.payload}
              artifactLineages={artifactLineages}
              openVersionComparison={openVersionComparison}
            />
          );
        }
        return <MessageBubble key={message.id} message={message} />;
      })}
      {isStreaming && sanitizedStreamingText ? (
        <div
          className="max-w-[85%] rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap"
          data-testid="assistant-streaming-bubble"
        >
          {renderMarkdownLite(sanitizedStreamingText)}
        </div>
      ) : null}
      {isStreaming && !sanitizedStreamingText ? (
        <div
          className="flex max-w-[85%] items-center gap-2 rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--text-muted)]"
          data-testid="assistant-streaming-indicator"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          {t("streaming")}
        </div>
      ) : null}
    </div>
  );
}
