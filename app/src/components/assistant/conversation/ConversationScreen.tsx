"use client";

// The conversation of the Equipe pilot, as designed in v4 (H1–H6, D1): the conversations panel on the left (desktop;
// a sheet on mobile), the mono label of the conversation on top and the chat below. Used by `/` (the main
// conversation) and `/assistant?threadId=…` (the parallel ones). The classic shell keeps AssistantShell.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { List } from "lucide-react";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useConversationContext } from "@/lib/equipe/use-conversation-context";
import ConversationList from "./ConversationList";
import RailChat from "./RailChat";

export default function ConversationScreen({ threadId }: { threadId: string }) {
  const t = useTranslations("assistant.panel");
  const conversation = useConversationContext(threadId);
  const [listOpen, setListOpen] = useState(false);
  // A parallel conversation is named by its topic; the main one (or one not resolved yet) by "Conversa principal".
  const label = conversation.isPrimary === false && conversation.topic ? conversation.topic : t("main");

  return (
    <div className="flex min-h-0 flex-1" data-testid="conversation-screen">
      <aside
        aria-label={t("label")}
        data-testid="conversation-panel"
        className="my-4 hidden w-[248px] shrink-0 flex-col overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-base)_55%,var(--canvas))] md:flex"
      >
        <ConversationList threadId={threadId} />
      </aside>

      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col md:pt-20">
        <div className="flex h-10 shrink-0 items-center justify-between gap-3 px-4 md:absolute md:left-9 md:top-[29px] md:h-[34px] md:px-0">
          <h1
            className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]"
            data-testid="conversation-label"
          >
            {label}
          </h1>
          <button
            type="button"
            onClick={() => setListOpen(true)}
            aria-haspopup="dialog"
            data-testid="conversation-list-open"
            className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--border-default)] px-3 text-xs font-medium text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] md:hidden"
          >
            <List size={13} aria-hidden="true" />
            {t("openList")}
          </button>
        </div>
        <RailChat threadId={threadId} />
      </section>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent side="bottom" className="md:hidden">
          <SheetHeader>
            <SheetTitle>{t("label")}</SheetTitle>
          </SheetHeader>
          <SheetBody className="p-0">
            <ConversationList threadId={threadId} onNavigate={() => setListOpen(false)} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
