"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, CircleX, RefreshCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GuidedFlowPresentation } from "@/lib/guided-flow/commands";
import { useGuidedFlowCommand } from "@/lib/hooks/use-guided-flow-commands";

type PendingChange =
  | { type: "restart" }
  | { type: "switch_path"; path: "existing_creative" | "from_zero" };

export default function GuidedFlowControls({
  threadId,
  presentation,
}: {
  threadId: string;
  presentation: GuidedFlowPresentation;
}) {
  const t = useTranslations("assistant.guidedFlow.controls");
  const mutation = useGuidedFlowCommand(threadId);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [preview, setPreview] = useState<GuidedFlowPresentation["retentionPreview"]>();
  const [error, setError] = useState<string | null>(null);

  const send = async (command: Parameters<typeof mutation.mutateAsync>[0]["command"]) => {
    setError(null);
    try {
      return await mutation.mutateAsync({
        commandId: crypto.randomUUID(),
        expectedRevision: presentation.revision,
        command,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("updateError"));
      return null;
    }
  };

  const previewChange = async (change: PendingChange) => {
    const result = await send(
      change.type === "restart"
        ? { type: "preview_restart" }
        : { type: "preview_switch", path: change.path }
    );
    if (result) {
      setPending(change);
      setPreview(result.presentation.retentionPreview);
    }
  };

  const otherPath =
    presentation.path === "from_zero" ? "existing_creative" : "from_zero";

  const formatItems = (items: string[]) => items.join(", ") || t("nothing");

  return (
    <div className="mx-4 mt-2" data-testid="guided-flow-controls">
      <div className="flex flex-wrap gap-2">
        {presentation.allowedCommands.includes("clear_error") ? (
          <Button type="button" size="sm" variant="outline" onClick={() => void send({ type: "clear_error" })}>
            <CircleX className="mr-2 size-4" aria-hidden="true" /> {t("retry")}
          </Button>
        ) : null}
        {presentation.allowedCommands.includes("back") ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => void send({ type: "back" })}>
            <ArrowLeft className="mr-2 size-4" aria-hidden="true" /> {t("back")}
          </Button>
        ) : null}
        {presentation.allowedCommands.includes("preview_restart") ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => void previewChange({ type: "restart" })}>
            <RefreshCcw className="mr-2 size-4" aria-hidden="true" /> {t("restart")}
          </Button>
        ) : null}
        {presentation.path !== "unclassified" ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void previewChange({ type: "switch_path", path: otherPath })}
          >
            <Shuffle className="mr-2 size-4" aria-hidden="true" /> {t("switchPath")}
          </Button>
        ) : null}
      </div>

      {pending && preview ? (
        <div
          className="mt-2 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3 text-xs text-[var(--text-secondary)]"
          role="status"
        >
          <p>{t("retained", { items: formatItems(preview.retained) })}</p>
          <p>{t("cleared", { items: formatItems(preview.cleared) })}</p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void send(pending).then(() => {
                  setPending(null);
                  setPreview(undefined);
                });
              }}
            >
              {t("confirm")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setPending(null);
                setPreview(undefined);
              }}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-sm text-[var(--danger-text)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
