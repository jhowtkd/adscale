"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArtifactVersionPresentation } from "@/lib/assistant/artifact-version";
import {
  isQuickAction,
  resolveDisplayContract,
  toActionCardLifecycleStatus,
} from "@/lib/assistant/display-contract";
import {
  useCancelAssistantAction,
  useConfirmAssistantAction,
} from "@/lib/hooks/use-assistant-actions";
import type { VersionComparisonRequest } from "./AssistantSurfaceContext";
import { stripThinkBlocks } from "@/server/assistant/model/reasoning-sanitizer";
import { renderMarkdownLite } from "./markdown-lite";
import { ActionCard } from "./ActionCard";
import AssistantActionCard from "./AssistantActionCard";
import AssistantEmptyState from "./AssistantEmptyState";
import EquipeCard, { parseEquipeCard } from "./EquipeCard";
import { EquipeEventLine, StaffMessageBubble } from "./EquipeFeed";
import EquipePlanOffer from "./EquipePlanOffer";
import { filterSuggestions } from "@/lib/equipe/suggestions";
import { ArrowRight } from "lucide-react";
import { StrategistRow, StrategistText, UserBubble } from "./conversation/ConversationRows";

export interface AssistantDisplayMessage {
  id: string;
  type:
    | "user"
    | "assistant"
    | "tool"
    | "action_card"
    | "equipe_card"
    | "equipe_event"
    | "staff_message";
  content: string;
  payload: Record<string, unknown>;
  /** Persisted time; absent on a live (streaming) message. */
  createdAt?: string | Date;
}

export interface AssistantMessageListProps {
  messages: AssistantDisplayMessage[];
  streamingText: string;
  isStreaming: boolean;
  threadId: string | null;
  artifactLineages?: ArtifactVersionPresentation[];
  openVersionComparison?: (request: VersionComparisonRequest) => void;
  /**
   * Equipe approval actions (#551). Off unless the host passes true: the
   * "Revisar" links always render, but the approve flow stays hidden while
   * the Equipe is disabled for the workspace.
   */
  equipeEnabled?: boolean;
  onSuggestion?: (text: string) => void;
  /** "rail": the v4 conversation (Strategist rows, bubbles with time, event lines with icon). Classic keeps the bubbles. */
  variant?: "classic" | "rail";
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
          ? "ml-auto bg-[var(--surface-inset)] text-[var(--text-primary)]"
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

/**
 * Renders a `propose_action` card inside the chat thread.
 *
 * `quick_action`-family proposals use the new contract-driven {@link ActionCard}
 * (Task 7). `complete_campaign`-family proposals keep the bespoke legacy
 * {@link AssistantActionCard}, which carries credit-confirmation gating,
 * version-comparison shortcuts and reference thumbnails that the generic card
 * does not replicate yet.
 *
 * The new card is driven entirely by the `display` object the server serializes
 * into the message payload (label, actionType, riskLabel, riskCopyLines,
 * confirmationPolicy, creditImpact). The server action-contract registry is
 * "server-only", so it cannot be imported here; {@link resolveDisplayContract}
 * reconstructs a contract-shaped object from that payload instead.
 */
function ActionCardMessage({
  message,
  threadId,
  artifactLineages,
  openVersionComparison,
}: {
  message: AssistantDisplayMessage;
  threadId: string | null;
  artifactLineages?: ArtifactVersionPresentation[];
  openVersionComparison?: (request: VersionComparisonRequest) => void;
}) {
  const display = message.payload.display as Record<string, unknown> | undefined;

  if (display?.actionType === "quick_persona_simulate") {
    return null;
  }

  if (!isQuickAction(display)) {
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

  return (
    <QuickActionCard
      key={message.id}
      threadId={threadId}
      payload={message.payload}
    />
  );
}

/**
 * New contract-driven ActionCard for quick actions. Confirm/Cancel are wired to
 * the existing confirm/cancel endpoints via the TanStack Query hooks.
 */
function QuickActionCard({
  threadId,
  payload,
}: {
  threadId: string | null;
  payload: Record<string, unknown>;
}) {
  const confirmMutation = useConfirmAssistantAction();
  const cancelMutation = useCancelAssistantAction();

  const contract = resolveDisplayContract(payload.display);
  const actionRecordId =
    typeof payload.actionRecordId === "string" ? payload.actionRecordId : "";
  const rawStatus = typeof payload.status === "string" ? payload.status : "pending";
  const lifecycleStatus = toActionCardLifecycleStatus(rawStatus);
  const isPending = lifecycleStatus === "pending";
  const isMutating = confirmMutation.isPending || cancelMutation.isPending;

  const inputSnapshot =
    payload.inputSnapshot && typeof payload.inputSnapshot === "object"
      ? (payload.inputSnapshot as Record<string, unknown>)
      : {};

  const handleConfirm = () => {
    if (!threadId || !actionRecordId || !isPending || isMutating) {
      return;
    }
    confirmMutation.mutate({ actionId: actionRecordId, threadId });
  };

  const handleCancel = () => {
    if (!threadId || !actionRecordId || isMutating) {
      return;
    }
    cancelMutation.mutate({ actionId: actionRecordId, threadId });
  };

  if (!contract) {
    // Defensive: if the payload is malformed, fall back to the legacy card
    // rather than rendering nothing.
    return (
      <AssistantActionCard threadId={threadId} payload={payload} />
    );
  }

  return (
    <div data-testid="assistant-action-card-propose">
      <ActionCard
        contract={contract}
        snapshot={inputSnapshot}
        status={isPending ? "pending" : lifecycleStatus}
        errorMessage={
          lifecycleStatus === "error"
            ? cancelMutation.error?.message || confirmMutation.error?.message
            : undefined
        }
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}

export default function AssistantMessageList({
  messages,
  streamingText,
  isStreaming,
  threadId,
  artifactLineages,
  openVersionComparison,
  equipeEnabled = false,
  onSuggestion,
  variant = "classic",
}: AssistantMessageListProps) {
  const t = useTranslations("assistant.chat");
  const handoffT = useTranslations("assistant.handoff");
  const diagnosisT = useTranslations("assistant.equipe.diagnosis");
  const rail = variant === "rail";
  const sanitizedStreamingText = useMemo(
    () => (isStreaming && streamingText ? stripThinkBlocks(streamingText) : ""),
    [isStreaming, streamingText]
  );
  const showEmptyThread = messages.length === 0 && !isStreaming;

  /** Only the newest card of a handoff (or of a diagnosis) is alive; older ones are history. */
  const isLatestCard = (message: AssistantDisplayMessage, card: { kind: string; handoffId?: string }) =>
    card.kind === "handoff"
      ? messages.findLast((m) => m.type === "equipe_card" && m.payload.kind === "handoff" && m.payload.handoffId === card.handoffId)?.id === message.id
      : card.kind === "diagnosis"
        ? messages.findLast((m) => m.type === "equipe_card" && m.payload.kind === "diagnosis")?.id === message.id
        : true;

  const eventText = (message: AssistantDisplayMessage) =>
    message.payload.kind === "handoff.decided" && typeof message.payload.command === "string"
      ? handoffT(`decisions.${message.payload.command}`)
      : message.payload.kind === "diagnosis.started" ? diagnosisT("building")
        : message.payload.kind === "library.assembled" && typeof message.payload.items === "number" ? handoffT("libraryBuilt", { count: message.payload.items })
          : typeof message.payload.text === "string" ? message.payload.text : message.content;

  /** The v4 conversation rows. Returns undefined for what the rail does not restyle (action cards, tool lines, staff messages). */
  const renderRail = (message: AssistantDisplayMessage, index: number) => {
    const previous = messages[index - 1];
    const speaksAfterStrategist = previous?.type === "assistant" || previous?.type === "equipe_card";
    if (message.type === "user") {
      const rawAttachments = message.payload.attachments;
      const attachments = Array.isArray(rawAttachments)
        ? rawAttachments.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
      return (
        <UserBubble key={message.id} at={message.createdAt}>
          {message.content}
          <MessageAttachments attachments={attachments} />
        </UserBubble>
      );
    }
    if (message.type === "assistant") {
      const text = message.payload.handoffStep === "intro" ? handoffT("introText")
        : message.payload.handoffStep === "done" ? handoffT("doneText") : stripThinkBlocks(message.content);
      const suggestions = filterSuggestions(message.payload.suggestions);
      return (
        <StrategistRow key={message.id} at={message.createdAt} showHeader={!speaksAfterStrategist}>
          <StrategistText>{renderMarkdownLite(text)}</StrategistText>
          {suggestions.length > 0 ? (
            <div className="mt-2 flex max-w-[645px] flex-col gap-1.5" data-testid="assistant-suggestions">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" disabled={isStreaming || !equipeEnabled || !onSuggestion} onClick={() => onSuggestion?.(suggestion)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3.5 py-2.5 text-left text-sm text-[var(--text-primary)] outline-none transition-colors hover:bg-[var(--surface-raised)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">
                  <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" />{suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </StrategistRow>
      );
    }
    if (message.type === "equipe_event") {
      const icon = message.payload.kind === "library.assembled" ? "library" : message.payload.kind === "handoff.decided" ? "check" : undefined;
      return <EquipeEventLine key={message.id} text={eventText(message)} icon={icon} at={message.createdAt} />;
    }
    if (message.type === "equipe_card") {
      const accountId = message.payload.accountId;
      if (message.payload.kind === "plan_offer" && typeof accountId === "string" && accountId) {
        return (
          <StrategistRow key={message.id} at={message.createdAt} showHeader={!speaksAfterStrategist}>
            <EquipePlanOffer accountId={accountId} threadId={threadId} disabled={isStreaming || !equipeEnabled} onSuggestion={onSuggestion} />
          </StrategistRow>
        );
      }
      const card = parseEquipeCard(message.payload);
      if (!card) return undefined;
      const latest = isLatestCard(message, card);
      // The decisions are already told by their event lines: an older handoff card leaves no trace in the conversation.
      if (card.kind === "handoff" && !latest) return null;
      return (
        <StrategistRow key={message.id} at={message.createdAt} showHeader={!speaksAfterStrategist}>
          <EquipeCard card={card} equipeEnabled={equipeEnabled} threadId={threadId} latest={latest} disabled={isStreaming} onSuggestion={onSuggestion}
            hideLine={previous?.type === "assistant" && previous.payload.handoffStep === "intro"} />
        </StrategistRow>
      );
    }
    return undefined;
  };

  return (
    <div
      className={cn("flex flex-col p-4", rail ? "mx-auto w-full max-w-[712px] gap-5" : "gap-3")}
      data-testid="assistant-message-list"
    >
      {showEmptyThread ? (
        <AssistantEmptyState variant="thread" />
      ) : null}
      {messages.map((message, index) => {
        if (rail) {
          const railed = renderRail(message, index);
          if (railed !== undefined) return railed;
        }
        if (message.type === "assistant" && message.payload.handoffStep === "done") {
          return <MessageBubble key={message.id} message={{ ...message, content: handoffT("doneText") }} />;
        }
        if (message.type === "action_card") {
          return (
            <ActionCardMessage
              key={message.id}
              message={message}
              threadId={threadId}
              artifactLineages={artifactLineages}
              openVersionComparison={openVersionComparison}
            />
          );
        }
        if (message.type === "equipe_card") {
          if (message.payload.kind === "plan_offer" && typeof message.payload.accountId === "string" && message.payload.accountId) {
            return <EquipePlanOffer key={message.id} accountId={message.payload.accountId} threadId={threadId}
              disabled={isStreaming || !equipeEnabled} onSuggestion={onSuggestion} />;
          }
          const card = parseEquipeCard(message.payload);
          if (!card) {
            return <MessageBubble key={message.id} message={message} />;
          }
          return <EquipeCard key={message.id} card={card} equipeEnabled={equipeEnabled} threadId={threadId} latest={isLatestCard(message, card)}
            disabled={isStreaming} onSuggestion={onSuggestion} />;
        }
        if (message.type === "equipe_event") {
          return <EquipeEventLine key={message.id} text={eventText(message)} />;
        }
        if (message.type === "staff_message") {
          const name =
            typeof message.payload.name === "string" && message.payload.name
              ? message.payload.name
              : "ADScale";
          const photoUrl =
            typeof message.payload.photoUrl === "string" ? message.payload.photoUrl : null;
          return (
            <StaffMessageBubble
              key={message.id}
              name={name}
              photoUrl={photoUrl}
              content={message.content}
            />
          );
        }
        const suggestions = message.type === "assistant" ? filterSuggestions(message.payload.suggestions) : [];
        return (
          <div key={message.id} className="flex flex-col gap-2">
            <MessageBubble message={message} />
            {suggestions.length > 0 ? (
              <div className="flex max-w-[85%] flex-col gap-1.5" data-testid="assistant-suggestions">
                {suggestions.map((text) => (
                  <button key={text} type="button" disabled={isStreaming || !equipeEnabled || !onSuggestion} onClick={() => onSuggestion?.(text)}
                    className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-inset)] disabled:opacity-50">
                    <span aria-hidden="true">→ </span>{text}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      {isStreaming && sanitizedStreamingText ? (
        rail ? (
          <StrategistRow showHeader={!(messages.at(-1)?.type === "assistant" || messages.at(-1)?.type === "equipe_card")}>
            <StrategistText>{renderMarkdownLite(sanitizedStreamingText)}</StrategistText>
          </StrategistRow>
        ) : (
          <div
            className="max-w-[85%] rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap"
            data-testid="assistant-streaming-bubble"
          >
            {renderMarkdownLite(sanitizedStreamingText)}
          </div>
        )
      ) : null}
      {isStreaming && !sanitizedStreamingText ? (
        <div
          className={cn(
            "flex items-center gap-2 text-sm text-[var(--text-muted)]",
            rail ? "pl-9" : "max-w-[85%] rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3",
          )}
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
