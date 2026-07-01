"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useClientProfiles } from "@/lib/hooks/use-client-profiles";
import { useCreateAssistantThread } from "@/lib/hooks/use-assistant-threads";
import { useUpsertGuidedFlow, type GuidedFlowPath } from "@/lib/hooks/use-guided-flow";
import { useAssistantSurface } from "./AssistantSurfaceContext";
import AssistantJourneyCards from "./AssistantJourneyCards";

export interface AssistantStartComposerProps {
  onSelectThread: (threadId: string) => void;
  onCreateClient?: () => void;
}

export default function AssistantStartComposer({
  onSelectThread,
  onCreateClient,
}: AssistantStartComposerProps) {
  const t = useTranslations("assistant.start");
  const router = useRouter();
  const { data: clients = [], isLoading: clientsLoading } = useClientProfiles();
  const createThread = useCreateAssistantThread();
  const upsertGuidedFlow = useUpsertGuidedFlow();
  const {
    activeClientId,
    setActiveClientId,
    setPendingFirstMessage,
  } = useAssistantSurface();

  const [value, setValue] = useState("");
  const [clientId, setClientId] = useState<string | null>(activeClientId);

  const effectiveClientId = clientId ?? activeClientId ?? clients[0]?.id ?? null;
  const activeClient = useMemo(
    () => clients.find((c) => c.id === effectiveClientId) ?? null,
    [clients, effectiveClientId]
  );

  const startJourney = async (path: Exclude<GuidedFlowPath, "unclassified">) => {
    if (!effectiveClientId || createThread.isPending || upsertGuidedFlow.isPending) {
      return;
    }

    setActiveClientId(effectiveClientId);

    try {
      const thread = await createThread.mutateAsync({
        clientProfileId: effectiveClientId,
        name: t(`journeys.${path}.title`),
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
    if (!trimmed || !effectiveClientId || createThread.isPending) {
      return;
    }

    setActiveClientId(effectiveClientId);
    setPendingFirstMessage(trimmed);
    setValue("");

    try {
      const thread = await createThread.mutateAsync({
        clientProfileId: effectiveClientId,
        name: trimmed.slice(0, 80),
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
          <Button type="button" onClick={onCreateClient}>
            {t("createFirstClient")}
          </Button>
        ) : null}
      </div>
    );
  }

  const canSend =
    !!value.trim() &&
    !!effectiveClientId &&
    !createThread.isPending &&
    !upsertGuidedFlow.isPending;
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
            : null;

  return (
    <div
      className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-8 p-6"
      data-testid="assistant-start-composer"
    >
      <h1 className="max-w-2xl text-center text-2xl font-medium text-[var(--text-primary)] sm:text-3xl">
        {promptHeading}
      </h1>

      <AssistantJourneyCards
        onSelectPath={(path) => void startJourney(path)}
        disabled={journeyDisabled}
      />

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
        <div className="overflow-hidden rounded-2xl border border-[var(--border-dim)] bg-[var(--surface-raised)] shadow-lg shadow-black/20 focus-within:border-[var(--accent-primary)]">
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
            <span className="rounded-md border border-[var(--border-dim)] px-2 py-1 text-xs text-[var(--text-secondary)]">
              {t("accessFull")}
            </span>
            <Button
              type="submit"
              size="icon"
              disabled={!canSend}
              aria-label={t("send")}
              className={cn(
                "size-11 rounded-full",
                canSend
                  ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:bg-[var(--accent-primary-hover)]"
                  : "bg-[var(--surface-inset)] text-[var(--text-muted)]"
              )}
            >
                {createThread.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowUp className="size-4" aria-hidden="true" />
                )}
            </Button>
          </div>
        </div>
      </form>

      <div className="flex w-full max-w-2xl items-center justify-between text-xs text-[var(--text-muted)]">
        <button
          type="button"
          onClick={() => setClientId(clients[0]?.id ?? null)}
          className="flex items-center gap-2 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <span
            className="size-3.5 rounded-sm bg-[var(--accent-primary)]"
            aria-hidden="true"
          />
          {activeClient?.name ?? t("chooseProject")}
        </button>
      </div>
    </div>
  );
}
