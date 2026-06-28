"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAssistantChat } from "@/lib/hooks/use-assistant-chat";
import type { AssistantChatMessage } from "@/lib/hooks/use-assistant-chat";
import type { ChatAttachment } from "@/lib/assistant/chat-attachments";
import { usePlanFeedbackDraft } from "@/lib/hooks/use-plan-feedback-draft";
import {
  useAssistantThread,
  type AssistantMessage,
} from "@/lib/hooks/use-assistant-threads";
import { cn } from "@/lib/utils";
import AssistantChatInput from "./AssistantChatInput";
import AssistantMessageList, {
  type AssistantDisplayMessage,
} from "./AssistantMessageList";
import GuidedFlowResumeBanner from "./GuidedFlowResumeBanner";
import ExistingCreativeSelectPanel from "./ExistingCreativeSelectPanel";
import CreativeDiagnosisPanel from "./CreativeDiagnosisPanel";
import FromZeroProgressiveBriefPanel from "./FromZeroProgressiveBriefPanel";
import FromZeroReferencesPanel from "./FromZeroReferencesPanel";
import GuidedFlowControls from "./GuidedFlowControls";
import VersionComparisonDialog from "./VersionComparisonDialog";
import { useAssistantSurface } from "./AssistantSurfaceContext";

export interface AssistantChatCoreProps {
  threadId: string | null;
  variant?: "full" | "drawer";
  onClose?: () => void;
  pendingFirstMessage?: string | null;
  onPendingFirstMessageConsumed?: () => void;
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
  pendingFirstMessage,
  onPendingFirstMessageConsumed,
}: AssistantChatCoreProps) {
  const t = useTranslations("assistant.chat");
  const { data, isLoading } = useAssistantThread(threadId, {
    pollWhileActive: true,
  });
  const { messages, streamingText, isStreaming, error, sendMessage } =
    useAssistantChat(threadId);
  const draftEnabled = Boolean(threadId && data?.thread?.campaignId);
  const { draftText, onDraftTextChange, clearDraft } = usePlanFeedbackDraft(
    threadId,
    { enabled: draftEnabled }
  );
  const {
    versionComparisonRequest,
    versionComparisonTrigger,
    openVersionComparison,
    closeVersionComparison,
  } = useAssistantSurface();

  const sendingRef = useRef(false);
  const messageScrollerRef = useRef<HTMLDivElement>(null);
  const comparisonRestoreRef = useRef<{
    scrollTop: number;
    trigger: HTMLElement | null;
  } | null>(null);

  useLayoutEffect(() => {
    if (!versionComparisonRequest) return;
    comparisonRestoreRef.current = {
      scrollTop: messageScrollerRef.current?.scrollTop ?? 0,
      trigger: versionComparisonTrigger,
    };
  }, [versionComparisonRequest, versionComparisonTrigger]);

  useEffect(() => {
    if (!threadId || !pendingFirstMessage || sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    const message = pendingFirstMessage;
    onPendingFirstMessageConsumed?.();
    void sendMessage(message).finally(() => {
      sendingRef.current = false;
    });
  }, [
    threadId,
    pendingFirstMessage,
    sendMessage,
    onPendingFirstMessageConsumed,
  ]);

  const displayMessages = useMemo(() => {
    const serverMessages = (data?.messages ?? []).map(mapServerMessage);
    return mergeMessages(serverMessages, messages);
  }, [data?.messages, messages]);

  const inputDisabled = !threadId;

  const handleSend = (text: string, attachments?: ChatAttachment[]) => {
    const send = async () => {
      if (attachments?.length) {
        await sendMessage({ text, attachments });
      } else {
        await sendMessage(text);
      }
      if (draftEnabled) {
        await clearDraft();
      }
    };
    void send();
  };

  const handleComparisonOpenChange = (next: boolean) => {
    if (next) return;
    const restore = comparisonRestoreRef.current;
    closeVersionComparison();
    setTimeout(() => {
      if (restore && messageScrollerRef.current) {
        messageScrollerRef.current.scrollTop = restore.scrollTop;
      }
      restore?.trigger?.focus({ preventScroll: true });
      comparisonRestoreRef.current = null;
    }, 0);
  };

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
        <>
          {data?.guidedFlow ? (
            <>
              <GuidedFlowResumeBanner guidedFlow={data.guidedFlow} />
              {threadId && data.guidedPresentation ? (
                <GuidedFlowControls
                  threadId={threadId}
                  presentation={data.guidedPresentation}
                />
              ) : null}
            </>
          ) : null}
          {threadId &&
          data?.guidedFlow?.path === "existing_creative" &&
          data.guidedFlow.currentStep === "select_creative" ? (
            <ExistingCreativeSelectPanel
              threadId={threadId}
              guidedFlow={data.guidedFlow}
            />
          ) : null}
          {threadId &&
          data?.guidedFlow?.path === "from_zero" &&
          (data.guidedFlow.currentStep === "collect_brief" ||
            data.guidedFlow.currentStep === "review_brief") ? (
            <FromZeroProgressiveBriefPanel
              threadId={threadId}
              guidedFlow={data.guidedFlow}
              presentation={data.guidedPresentation}
            />
          ) : null}
          {threadId &&
          data?.guidedFlow?.path === "from_zero" &&
          data.guidedFlow.currentStep === "select_references" ? (
            <FromZeroReferencesPanel
              threadId={threadId}
              clientProfileId={data.thread.clientProfileId}
              guidedFlow={data.guidedFlow}
            />
          ) : null}
          {threadId &&
          data?.guidedFlow?.path === "existing_creative" &&
          data.guidedFlow.currentStep === "review_diagnosis" ? (
            <CreativeDiagnosisPanel
              threadId={threadId}
              guidedFlow={data.guidedFlow}
              presentation={data.guidedPresentation}
            />
          ) : null}
          <AssistantMessageList
            messages={displayMessages}
            streamingText={streamingText}
            isStreaming={isStreaming}
            threadId={threadId}
            scrollContainerRef={messageScrollerRef}
            artifactLineages={data?.artifactVersionState?.lineages}
            openVersionComparison={openVersionComparison}
          />
        </>
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
        onSend={handleSend}
        draftText={draftEnabled ? draftText : undefined}
        onDraftTextChange={draftEnabled ? onDraftTextChange : undefined}
      />
      {versionComparisonRequest && versionComparisonRequest.threadId === threadId ? (
        <VersionComparisonDialog
          key={`${versionComparisonRequest.lineageId}:${versionComparisonRequest.versionAId}:${versionComparisonRequest.versionBId}`}
          open
          request={versionComparisonRequest}
          lineages={data?.artifactVersionState?.lineages ?? []}
          onOpenChange={handleComparisonOpenChange}
        />
      ) : null}
    </div>
  );
}
