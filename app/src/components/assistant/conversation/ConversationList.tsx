"use client";

// The v4 conversations panel: Buscar, "Conversa principal" and "Conversas paralelas" (+). Only the account's own
// conversations are listed: the main one and the parallel ones bound to it (the binding is what routes them through
// the Strategist and the free ceiling). The same list serves the desktop panel and the mobile sheet.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import NewConversationDialog from "@/components/layout/rail/NewConversationDialog";
import { useRailSearchTarget } from "@/components/layout/rail/rail-search";
import { useConversationContext } from "@/lib/equipe/use-conversation-context";

const row =
  "flex min-h-[34px] items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

/** Plain-text match, ignoring case and accents, so "promocao" finds "Promoção". */
export function matchesSearch(text: string, query: string): boolean {
  const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const needle = fold(query).trim();
  return needle === "" || fold(text).includes(needle);
}

export default function ConversationList({ threadId, onNavigate }: { threadId: string | null; onNavigate?: () => void }) {
  const t = useTranslations("assistant.panel");
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const newParallelRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const conversation = useConversationContext(threadId);
  useRailSearchTarget(searchRef);

  const mainLabel = t("main");
  const showMain = matchesSearch(mainLabel, query);
  const parallel = conversation.parallel.filter((entry) => entry.assistantThreadId && matchesSearch(entry.topic ?? "", query));
  // "/" is always the main conversation; /assistant?threadId=… is the main one only when that thread is the account's primary.
  const mainActive = pathname === "/" || conversation.isPrimary === true;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3" data-testid="conversation-list">
      <label className="flex h-9 items-center gap-2 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 focus-within:ring-2 focus-within:ring-[var(--focus-ring)]">
        <Search size={14} aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          data-testid="conversation-search"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
      </label>

      <nav aria-label={t("label")} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {showMain ? (
          <Link
            href="/"
            onClick={onNavigate}
            aria-current={mainActive ? "page" : undefined}
            data-testid="conversation-main"
            className={cn(row, mainActive ? "bg-[var(--surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]")}
          >
            <MessageCircle size={14} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1 truncate font-medium">{mainLabel}</span>
          </Link>
        ) : null}

        <div className="mt-3 flex items-center justify-between px-3">
          <p id="conversation-parallel-label" className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">{t("parallel")}</p>
          <button
            ref={newParallelRef}
            type="button"
            onClick={() => setCreating(true)}
            aria-haspopup="dialog"
            aria-label={t("newParallel")}
            title={t("newParallel")}
            data-testid="conversation-new"
            className="grid size-6 place-items-center rounded-full text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>

        {parallel.length > 0 ? (
          <ul aria-labelledby="conversation-parallel-label" className="m-0 flex list-none flex-col gap-1 p-0" data-testid="conversation-parallel">
            {parallel.map((entry) => {
              const active = entry.assistantThreadId === threadId;
              return (
                <li key={entry.id}>
                  <Link
                    href={`/assistant?threadId=${entry.assistantThreadId}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(row, active ? "bg-[var(--surface-raised)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]")}
                  >
                    <span className="min-w-0 flex-1 truncate">{entry.topic}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : query.trim() ? (
          <p className="px-3 text-xs text-[var(--text-muted)]" data-testid="conversation-parallel-empty">
            {t("noMatches")}
          </p>
        ) : null}
      </nav>

      <NewConversationDialog
        open={creating}
        onOpenChange={setCreating}
        accountId={conversation.accountId}
        clientProfileId={conversation.clientProfileId}
        returnFocusRef={newParallelRef}
      />
    </div>
  );
}
