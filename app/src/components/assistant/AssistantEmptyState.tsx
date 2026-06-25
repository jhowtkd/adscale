"use client";

import { useTranslations } from "next-intl";
import { MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AssistantEmptyStateProps {
  onSelectTree?: () => void;
  onCreateClient?: () => void;
}

export default function AssistantEmptyState({
  onSelectTree,
  onCreateClient,
}: AssistantEmptyStateProps) {
  const t = useTranslations("assistant.empty");

  return (
    <div
      className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-6 p-8 text-center"
      data-testid="assistant-empty-state"
    >
      <div className="flex size-14 items-center justify-center rounded-2xl border border-[var(--border-dim)] bg-[var(--surface-raised)]">
        <MessageSquare
          className="size-7 text-[var(--text-muted)]"
          aria-hidden="true"
        />
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">
          {t("title")}
        </h2>
        <p className="text-sm text-[var(--text-muted)]">{t("body")}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={onSelectTree}>
          {t("selectTree")}
        </Button>
        <Button type="button" variant="outline" onClick={onCreateClient}>
          <Plus className="size-4" aria-hidden="true" />
          {t("createClient")}
        </Button>
      </div>
    </div>
  );
}
