"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCreateAssistantThread } from "@/lib/hooks/use-assistant-threads";
import AssistantChatCore from "./AssistantChatCore";

export interface CampaignAssistantDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  clientProfileId: string;
}

export default function CampaignAssistantDrawer({
  open,
  onOpenChange,
  campaignId,
  clientProfileId,
}: CampaignAssistantDrawerProps) {
  const t = useTranslations("assistant.drawer");
  const createThread = useCreateAssistantThread();
  const [threadId, setThreadId] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open || threadId || !clientProfileId) {
      return;
    }

    let cancelled = false;

    void createThread
      .mutateAsync({
        clientProfileId,
        campaignId,
        isDefault: true,
      })
      .then((thread) => {
        if (!cancelled) {
          setThreadId(thread.id);
        }
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [open, threadId, clientProfileId, campaignId, createThread]);

  const resolveError = createThread.error
    ? createThread.error instanceof Error
      ? createThread.error.message
      : t("errorResolve")
    : null;
  const missingClient = open && !clientProfileId;
  const resolving =
    open && Boolean(clientProfileId) && !threadId && !resolveError;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="xl" className="flex flex-col p-0">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
        </SheetHeader>

        <SheetBody className="flex min-h-0 flex-1 flex-col p-0">
          {missingClient ? (
            <p className="p-4 text-sm text-[var(--danger-text)]" role="alert">
              {t("errorMissingClient")}
            </p>
          ) : resolving ? (
            <p className="p-4 text-sm text-[var(--text-muted)]">{t("loading")}</p>
          ) : resolveError ? (
            <p className="p-4 text-sm text-[var(--danger-text)]" role="alert">
              {resolveError}
            </p>
          ) : (
            <AssistantChatCore
              threadId={threadId}
              variant="drawer"
              onClose={handleClose}
            />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
