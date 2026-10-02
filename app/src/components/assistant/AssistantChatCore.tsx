"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAssistantChat } from "@/lib/hooks/use-assistant-chat";
import type { AssistantChatMessage } from "@/lib/hooks/use-assistant-chat";
import type { ChatAttachment } from "@/lib/assistant/chat-attachments";
import { usePlanFeedbackDraft } from "@/lib/hooks/use-plan-feedback-draft";
import {
  useAssistantThread,
  type AssistantMessage,
} from "@/lib/hooks/use-assistant-threads";
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
import { useAssistantSurface, type PendingFirstMessage } from "./AssistantSurfaceContext";
import { followGrowth, followPinnedInset, followsLatest, scrollToLatest } from "./conversation/scroll-latest";

export interface AssistantChatCoreProps {
  threadId: string | null;
  variant?: "full" | "drawer";
  onClose?: () => void;
  pendingFirstMessage?: PendingFirstMessage | null;
  onPendingFirstMessageConsumed?: () => void;
  /** Enables the Equipe card approval flow; off by default (#551). */
  equipeEnabled?: boolean;
  /** "rail": the v4 conversation of the pilot (no thread header, Strategist rows, pill composer). */
  chrome?: "classic" | "rail";
  /** Rendered at the top of the scroll region, so it scrolls away with the conversation (the mesa). */
  mesa?: ReactNode;
  /** False hides the attach button and refuses pasted or dropped images (the free account's chat takes none). */
  attachmentsEnabled?: boolean;
  /** A phrase of the empty screens (`/?suggestion=`): sent once, as a suggestion, when the conversation is ready. */
  urlSuggestion?: string | null;
  onUrlSuggestionHandled?: () => void;
}

function mapServerMessage(message: AssistantMessage): AssistantDisplayMessage {
  return {
    id: message.id,
    type: message.type as AssistantDisplayMessage["type"],
    content: message.content,
    payload: message.payload,
    createdAt: message.createdAt,
  };
}

function mergeMessages(
  serverMessages: AssistantDisplayMessage[],
  liveMessages: AssistantChatMessage[]
): AssistantDisplayMessage[] {
  const merged = [...serverMessages];

  for (const live of liveMessages) {
    if (live.type === "equipe_card") {
      // The SSE frame carries the persisted message id, so the refetch after
      // `done` replaces the live card instead of duplicating it.
      if (!merged.some((message) => message.id === live.id)) {
        merged.push({
          id: live.id,
          type: live.type,
          content: live.content,
          payload: live.payload,
        });
      }
      continue;
    }

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

const INTERNAL_ASSISTANT_ERRORS = new Set([
  "assistantStreamError",
  "invalid_arguments",
  "signal timed out",
]);

export default function AssistantChatCore({
  threadId,
  variant = "full",
  onClose,
  pendingFirstMessage,
  onPendingFirstMessageConsumed,
  equipeEnabled = false,
  chrome = "classic",
  mesa,
  attachmentsEnabled = true,
  urlSuggestion,
  onUrlSuggestionHandled,
}: AssistantChatCoreProps) {
  const t = useTranslations("assistant.chat");
  const tMode = useTranslations("assistant.mode");
  const tTree = useTranslations("assistant.tree");
  const tGuided = useTranslations("assistant.guidedFlow");
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

  const rail = chrome === "rail";
  const sendingRef = useRef(false);
  const messageScrollerRef = useRef<HTMLDivElement>(null);
  // The rail conversation follows its newest message unless the person scrolled up to read.
  const stickToBottomRef = useRef(true);
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
    const payload =
      message.attachments && message.attachments.length > 0
        ? { text: message.text, attachments: message.attachments }
        : message.text;
    void sendMessage(payload).finally(() => {
      sendingRef.current = false;
    });
  }, [
    threadId,
    pendingFirstMessage,
    sendMessage,
    onPendingFirstMessageConsumed,
  ]);

  // The phrase already sent while the URL still carries it: a quick failure or a new chat callback re-runs the effect
  // before the host has cleared the URL, and must not send it again. It is forgotten once the URL no longer has it.
  const sentSuggestionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!urlSuggestion) {
      sentSuggestionRef.current = null;
      return;
    }
    if (!threadId || isLoading || isStreaming || sendingRef.current || sentSuggestionRef.current === urlSuggestion) return;
    sentSuggestionRef.current = urlSuggestion;
    sendingRef.current = true;
    onUrlSuggestionHandled?.();
    void sendMessage({ text: urlSuggestion, fromSuggestion: true }).finally(() => {
      sendingRef.current = false;
    });
  }, [urlSuggestion, threadId, isLoading, isStreaming, sendMessage, onUrlSuggestionHandled]);

  const displayMessages = useMemo(() => {
    const serverMessages = (data?.messages ?? []).map(mapServerMessage);
    return mergeMessages(serverMessages, messages);
  }, [data?.messages, messages]);

  const inputDisabled = !threadId;
  const displayError =
    error && INTERNAL_ASSISTANT_ERRORS.has(error) ? t("errorGeneric") : error;

  const chatSubtitle = data?.guidedFlow
    ? tGuided("resumeLabel")
    : `${tMode("chat")} · ${t("headerSubtitle")}`;

  // The pinned mesa covers the top of the region: what the browser scrolls into view (a focused control) stays under it.
  useLayoutEffect(() => {
    const scroller = messageScrollerRef.current;
    if (!rail || !scroller) return;
    return followPinnedInset(scroller);
  }, [rail, mesa]);

  useEffect(() => {
    const scroller = messageScrollerRef.current;
    if (!rail || !scroller || !stickToBottomRef.current) return;
    scrollToLatest(scroller);
  }, [rail, isLoading, displayMessages.length, streamingText, mesa]);

  // What is in the conversation can grow without a new message (the mesa mounts after the first scroll, its photos load): while the person is
  // following the newest part, the region follows it again, so the last card is never left below the fold on arrival.
  useEffect(() => {
    const scroller = messageScrollerRef.current;
    if (!rail || !scroller) return;
    return followGrowth(scroller, () => stickToBottomRef.current);
  }, [rail, isLoading]);

  const handleSend = (text: string, attachments?: ChatAttachment[]) => {
    stickToBottomRef.current = true;
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
      className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
      data-testid="assistant-chat-core"
      data-variant={variant}
    >
      <div className="row-start-1 min-h-0">
        {onClose ? (
          <div className="flex items-center justify-end border-b border-[var(--border-subtle)] px-4 py-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {t("close")}
            </button>
          </div>
        ) : null}

        {variant === "full" && threadId && data?.thread && !onClose && !rail ? (
          <header
            className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3"
            data-testid="assistant-chat-header"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {data.thread.name?.trim() || tTree("untitled")}
              </p>
              <p className="truncate text-xs text-[var(--text-muted)]">{chatSubtitle}</p>
            </div>
          </header>
        ) : null}
      </div>

      {isLoading && threadId ? (
        <p className="row-start-2 min-h-0 overflow-hidden p-4 text-sm text-[var(--text-muted)]">
          {t("loading")}
        </p>
      ) : (
        <div
          ref={messageScrollerRef}
          className={cn(
            "row-start-2 flex min-h-0 flex-col overflow-y-auto",
            rail && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]",
          )}
          data-testid="assistant-chat-scroll-region"
          // The pilot's conversation can run past the screen with nothing in it to focus (the Library line, the diagnosis
          // being made): the region takes focus itself, so the keyboard can always scroll it.
          {...(rail ? { role: "region", "aria-label": t("messagesRegion"), tabIndex: 0 } : {})}
          onScroll={rail ? (event) => {
            stickToBottomRef.current = followsLatest(event.currentTarget);
          } : undefined}
        >
          {rail ? mesa : null}
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
              clientProfileId={data.thread.clientProfileId}
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
            artifactLineages={data?.artifactVersionState?.lineages}
            openVersionComparison={openVersionComparison}
            equipeEnabled={equipeEnabled}
            variant={rail ? "rail" : "classic"}
            onSuggestion={(text) => {
              if (isStreaming || sendingRef.current) return;
              sendingRef.current = true;
              void sendMessage({ text, fromSuggestion: true }).finally(() => { sendingRef.current = false; });
            }}
          />
        </div>
      )}

      <div className="row-start-3 min-h-0">
        {displayError ? (
          <p
            className="px-4 pb-2 text-sm text-[var(--danger-text)]"
            role="alert"
          >
            {displayError}
          </p>
        ) : null}

        <AssistantChatInput
        clientProfileId={data?.thread.clientProfileId ?? null}
        disabled={inputDisabled}
        isStreaming={isStreaming}
        noThread={!threadId}
        onSend={handleSend}
        draftText={draftEnabled ? draftText : undefined}
        onDraftTextChange={draftEnabled ? onDraftTextChange : undefined}
        variant={rail ? "rail" : "classic"}
        attachmentsEnabled={attachmentsEnabled}
        />
      </div>
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
