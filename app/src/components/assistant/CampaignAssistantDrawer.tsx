"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useCreateAssistantThread } from "@/lib/hooks/use-assistant-threads";
import AssistantChatCore from "./AssistantChatCore";

export interface CampaignAssistantDrawerProps {
  /**
   * Kept for backward compatibility but no longer used — the panel is always
   * mounted. When migrating call sites to the new name, prefer
   * `CampaignAssistantPanel`.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  campaignId: string;
  clientProfileId: string;
}

/**
 * Permanent assistant panel for the campaign workspace.
 *
 * Previously a `Sheet` (modal overlay) gated behind an `open` toggle. It is now
 * an always-mounted panel rendered in a fixed 380px column on desktop and a
 * toggleable tab on mobile. The thread-creation logic is unchanged.
 *
 * The `CampaignAssistantPanel` name is the preferred export going forward; the
 * default export keeps the historical `CampaignAssistantDrawer` name so
 * existing imports continue to resolve.
 */
export function CampaignAssistantPanel({
  campaignId,
  clientProfileId,
}: CampaignAssistantDrawerProps) {
  return (
    <CampaignAssistantDrawerPanel
      campaignId={campaignId}
      clientProfileId={clientProfileId}
    />
  );
}

export default function CampaignAssistantDrawer(props: CampaignAssistantDrawerProps) {
  return <CampaignAssistantPanel {...props} />;
}

function CampaignAssistantDrawerPanel({
  campaignId,
  clientProfileId,
}: CampaignAssistantDrawerProps) {
  const t = useTranslations("assistant.drawer");
  const createThread = useCreateAssistantThread();
  const requestKey = clientProfileId ? `${campaignId}:${clientProfileId}` : null;
  const requestKeyRef = useRef<string | null>(null);
  const [resolvedThread, setResolvedThread] = useState<{
    requestKey: string;
    threadId: string;
  } | null>(null);
  const threadId =
    resolvedThread?.requestKey === requestKey ? resolvedThread.threadId : null;

  useEffect(() => {
    if (!requestKey || threadId || requestKeyRef.current === requestKey) {
      return;
    }

    requestKeyRef.current = requestKey;

    void createThread
      .mutateAsync({
        clientProfileId,
        campaignId,
        isDefault: true,
      })
      .then((thread) => {
        if (requestKeyRef.current === requestKey) {
          setResolvedThread({ requestKey, threadId: thread.id });
        }
      })
      .catch(() => null);
  }, [requestKey, threadId, clientProfileId, campaignId, createThread]);

  const resolveError = createThread.error
    ? createThread.error instanceof Error
      ? createThread.error.message
      : t("errorResolve")
    : null;
  const missingClient = !clientProfileId;
  const resolving = Boolean(clientProfileId) && !threadId && !resolveError;

  return (
    <div className="flex h-full min-h-0 flex-col">
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
        <AssistantChatCore threadId={threadId} variant="drawer" />
      )}
    </div>
  );
}
