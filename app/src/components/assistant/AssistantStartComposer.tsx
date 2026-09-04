"use client";

import Link from "next/link";
import { useCallback, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUp, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { useCreateAssistantThread } from "@/lib/hooks/use-assistant-threads";
import { useUpsertGuidedFlow, type GuidedFlowPath } from "@/lib/hooks/use-guided-flow";
import { useChatComposerAttachments } from "@/lib/assistant/use-chat-composer-attachments";
import { useAssistantSurface } from "./AssistantSurfaceContext";
import AssistantJourneyCards from "./AssistantJourneyCards";
import {
  assistantComposerClass,
  assistantQuietCommitClass,
} from "./assistant-chrome";

export interface AssistantStartComposerProps {
  onSelectThread: (threadId: string) => void;
  onCreateClient?: () => void;
  /**
   * Whether the caller qualifies for the goal-agent pilot. The server remains
   * the authority; this only controls the default composer experience so an
   * ineligible user never sees the agent UI.
   */
  goalAgentEligible?: boolean;
}

type StartExperience = "agent" | "classic";

export default function AssistantStartComposer({
  onSelectThread,
  onCreateClient,
  goalAgentEligible = false,
}: AssistantStartComposerProps) {
  const t = useTranslations("assistant.start");
  const router = useRouter();
  const {
    profiles: clients,
    activeProfile: activeClient,
    activeClientProfileId: effectiveClientId,
    isLoading: clientsLoading,
    selectProfile,
  } = useActiveClientProfile();
  const createThread = useCreateAssistantThread();
  const upsertGuidedFlow = useUpsertGuidedFlow();
  const {
    setPendingFirstMessage,
  } = useAssistantSurface();

  const [experience, setExperience] = useState<StartExperience>(
    goalAgentEligible ? "agent" : "classic"
  );
  const [value, setValue] = useState("");
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const onUploadError = useCallback(
    (message: string) => setAttachmentError(message),
    []
  );

  const {
    attachments,
    isUploading: uploading,
    dragOver,
    fileInputRef,
    removeAttachment,
    clearAttachments,
    handleFileInputChange,
    dragHandlers,
  } = useChatComposerAttachments({
    onError: onUploadError,
    maxAttachmentsError: t("maxAttachments"),
    invalidTypeError: t("attachmentTypeError"),
  });

  const isAgent = experience === "agent";

  const startJourney = async (path: Exclude<GuidedFlowPath, "unclassified">) => {
    if (!effectiveClientId || createThread.isPending || upsertGuidedFlow.isPending) {
      return;
    }

    try {
      const thread = await createThread.mutateAsync({
        clientProfileId: effectiveClientId,
        name: t(`journeys.${path}.title`),
        experience: "classic",
      });
      await upsertGuidedFlow.mutateAsync({ threadId: thread.id, path });
      onSelectThread(thread.id);
      router.replace(`/assistant?threadId=${thread.id}`);
    } catch {
      // mutation errors surface via hook state
    }
  };

  const submit = async () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || !effectiveClientId || createThread.isPending) {
      return;
    }

    setPendingFirstMessage({ text: trimmed, attachments });
    setValue("");
    clearAttachments();

    try {
      const thread = await createThread.mutateAsync({
        clientProfileId: effectiveClientId,
        name: trimmed.slice(0, 80) || (attachments.length ? t("imageAttachment") : "Cliente"),
        experience: isAgent ? "agent" : "classic",
      });
      onSelectThread(thread.id);
      router.replace(`/assistant?threadId=${thread.id}`);
    } catch {
      setPendingFirstMessage(null);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const promptHeading = activeClient
    ? t("promptIn", { project: activeClient.name })
    : t("promptGeneric");

  if (clientsLoading) {
    return (
      <div
        className="flex h-full min-h-[50vh] items-center justify-center text-[var(--text-muted)]"
        data-testid="assistant-start-composer-loading"
      >
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div
        className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-6 p-8 text-center"
        data-testid="assistant-start-empty"
      >
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-medium text-[var(--text-primary)]">
            {t("noProjectsTitle")}
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            {t("noProjectsBody")}
          </p>
        </div>
        {onCreateClient ? (
          <Button type="button" onClick={onCreateClient} className={assistantQuietCommitClass}>
            {t("createFirstClient")}
          </Button>
        ) : null}
      </div>
    );
  }

  const canSend =
    (!!value.trim() || attachments.length > 0) &&
    !!effectiveClientId &&
    !createThread.isPending &&
    !upsertGuidedFlow.isPending &&
    !uploading;
  const journeyDisabled = createThread.isPending || upsertGuidedFlow.isPending;
  const threadError =
    createThread.error instanceof Error
      ? createThread.error.message
      : createThread.isError
        ? t("createError")
        : upsertGuidedFlow.error instanceof Error
          ? upsertGuidedFlow.error.message
          : upsertGuidedFlow.isError
            ? t("createError")
            : attachmentError;

  return (
    <div
      className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-8 p-6"
      data-testid="assistant-start-composer"
    >
      <h1 className="max-w-2xl text-center text-2xl font-medium text-[var(--text-primary)] sm:text-3xl">
        {promptHeading}
      </h1>

      {isAgent ? (
        <div className="w-full max-w-2xl">
          <label className="sr-only" htmlFor="assistant-client-select">
            {t("chooseProject")}
          </label>
          <select
            id="assistant-client-select"
            data-testid="assistant-client-select"
            value={effectiveClientId ?? ""}
            onChange={(event) => selectProfile(event.target.value)}
            disabled={createThread.isPending}
            className="block w-full rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {!effectiveClientId ? <option value="">{t("chooseProject")}</option> : null}
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              data-testid="assistant-classic-flow-toggle"
              onClick={() => setExperience("classic")}
              className="text-xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-secondary)] hover:underline"
            >
              {t("useClassicFlow")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="w-full max-w-2xl rounded-[var(--radius-object)] border border-[var(--info-border)] bg-[var(--info-bg)] px-4 py-3 text-center">
            <p className="text-sm text-[var(--text-secondary)]">{t("composerPathHint")}</p>
            <Link
              href="/?compose=1"
              className="mt-2 inline-flex min-h-9 items-center justify-center rounded-[var(--radius-control)] px-2 text-sm font-semibold text-[var(--info-text)] underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2"
            >
              {t("openHomeComposer")}
            </Link>
          </div>
          <AssistantJourneyCards
            onSelectPath={(path) => void startJourney(path)}
            disabled={journeyDisabled}
          />
          {goalAgentEligible ? (
            <button
              type="button"
              onClick={() => setExperience("agent")}
              className="text-xs text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-secondary)] hover:underline"
            >
              {t("useGoalAgent")}
            </button>
          ) : null}
        </>
      )}

      {threadError ? (
        <p className="w-full max-w-2xl rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-text)]" role="alert">
          {threadError}
        </p>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl"
        data-testid="assistant-start-form"
      >
        <div
          className={cn(
            assistantComposerClass,
            dragOver && "border-[var(--selection-border)] ring-2 ring-inset ring-[var(--selection-border)]"
          )}
          data-testid="assistant-start-dropzone"
          {...dragHandlers}
        >
          {attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {attachments.map((attachment) => (
                <span
                  key={attachment.assetId}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border-dim)] bg-[var(--surface-inset)] px-2 py-1 text-xs text-[var(--text-secondary)]"
                >
                  {attachment.name}
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.assetId)}
                    aria-label={t("removeAttachment")}
                    className="text-[var(--text-muted)] hover:text-[var(--danger-text)]"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={createThread.isPending}
            placeholder={t("inputPlaceholder")}
            rows={4}
            className={cn(
              "block w-full resize-none bg-transparent px-4 pt-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none disabled:opacity-50"
            )}
            aria-label={promptHeading}
          />
          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(event) => {
                  setAttachmentError(null);
                  handleFileInputChange(event.target.files);
                }}
                className="hidden"
                data-testid="assistant-start-file-input"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || createThread.isPending}
                aria-label={t("addImage")}
                className="size-9 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus className="size-4" aria-hidden="true" />
                )}
              </Button>
              <span className="rounded-md border border-[var(--border-dim)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                {t("organizeBriefing")}
              </span>
            </div>
            <Button
              type="submit"
              variant="outline"
              size="default"
              disabled={!canSend}
              aria-label={createThread.isPending ? t("submitting") : t("sendBriefing")}
              className={assistantQuietCommitClass}
            >
              {createThread.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <span>{t("sendBriefing")}</span>
                  <ArrowUp className="size-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">{t("firstActionHint")}</p>
      </form>
    </div>
  );
}
