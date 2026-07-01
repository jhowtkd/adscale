"use client";

import { useTranslations } from "next-intl";
import { MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AssistantEmptyStateProps {
  variant?: "landing" | "thread";
  onSelectTree?: () => void;
  onCreateClient?: () => void;
}

export default function AssistantEmptyState({
  variant = "landing",
  onSelectTree,
  onCreateClient,
}: AssistantEmptyStateProps) {
  const t = useTranslations("assistant.empty");
  const isThread = variant === "thread";

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center"
      data-testid={isThread ? "assistant-thread-empty-state" : "assistant-empty-state"}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl border border-[var(--border-dim)] bg-[var(--surface-raised)]">
        <MessageSquare
          className="size-7 text-[var(--text-muted)]"
          aria-hidden="true"
        />
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">
          {isThread ? t("threadTitle") : t("title")}
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          {isThread ? t("selectThread") : t("body")}
        </p>
      </div>
      {!isThread ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {onSelectTree ? (
            <Button type="button" onClick={onSelectTree}>
              {t("selectTree")}
            </Button>
          ) : null}
          {onCreateClient ? (
            <Button type="button" variant="outline" onClick={onCreateClient}>
              <Plus className="size-4" aria-hidden="true" />
              {t("createClient")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
