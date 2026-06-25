"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAssistantChat } from "@/lib/hooks/use-assistant-chat";
import type { AssistantChatMessage } from "@/lib/hooks/use-assistant-chat";
import {
  useAssistantThread,
  type AssistantMessage,
} from "@/lib/hooks/use-assistant-threads";
import { cn } from "@/lib/utils";
import AssistantChatInput from "./AssistantChatInput";
import AssistantMessageList, {
  type AssistantDisplayMessage,
} from "./AssistantMessageList";

export interface AssistantChatCoreProps {
  threadId: string | null;
  variant?: "full" | "drawer";
  onClose?: () => void;
}

function mapServerMessage(message: AssistantMessage): AssistantDisplayMessage {
  return {
    id: message.id,
    type: message.type as AssistantDisplayMessage["type"],
    content: message.content,
    payload: message.payload,
  };
}

function mergeMessages(
  serverMessages: AssistantDisplayMessage[],
  liveMessages: AssistantChatMessage[]
): AssistantDisplayMessage[] {
  const merged = [...serverMessages];

  for (const live of liveMessages) {
    if (live.type === "action_card") {
      const actionRecordId = live.payload.actionRecordId;
      const index = merged.findIndex(
        (message) =>
          message.type === "action_card" &&
          message.payload.actionRecordId === actionRecordId
      );
      const mapped: AssistantDisplayMessage = {
        id: live.id,
        type: live.type,
        content: live.content,
        payload: live.payload,
      };
      if (index >= 0) {
        merged[index] = mapped;
      } else {
        merged.push(mapped);
      }
      continue;
    }

    const duplicate = merged.some(
      (message) => message.type === live.type && message.content === live.content
    );
    if (!duplicate) {
      merged.push({
        id: live.id,
        type: live.type,
        content: live.content,
        payload: live.payload,
      });
    }
  }

  return merged;
}

export default function AssistantChatCore({
  threadId,
  variant = "full",
  onClose,
}: AssistantChatCoreProps) {
  const t = useTranslations("assistant.chat");
  const { data, isLoading } = useAssistantThread(threadId, {
    pollWhileActive: true,
  });
  const { messages, streamingText, isStreaming, error, sendMessage } =
    useAssistantChat(threadId);

  const displayMessages = useMemo(() => {
    const serverMessages = (data?.messages ?? []).map(mapServerMessage);
    return mergeMessages(serverMessages, messages);
  }, [data?.messages, messages]);

  const inputDisabled = !threadId;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        variant === "full" ? "min-h-[50vh]" : "min-h-0"
      )}
      data-testid="assistant-chat-core"
      data-variant={variant}
    >
      {onClose ? (
        <div className="flex items-center justify-end border-b border-[var(--border-dim)] px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            {t("close")}
          </button>
        </div>
      ) : null}

      {isLoading && threadId ? (
        <p className="p-4 text-sm text-[var(--text-muted)]">{t("loading")}</p>
      ) : (
        <AssistantMessageList
          messages={displayMessages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          threadId={threadId}
        />
      )}

      {error ? (
        <p
          className="px-4 pb-2 text-sm text-[var(--danger-text)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <AssistantChatInput
        disabled={inputDisabled}
        isStreaming={isStreaming}
        noThread={!threadId}
        onSend={sendMessage}
      />
    </div>
  );
}
