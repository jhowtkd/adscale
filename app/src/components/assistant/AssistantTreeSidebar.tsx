"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAssistantThreads } from "@/lib/hooks/use-assistant-threads";
import { useClientProfiles } from "@/lib/hooks/use-client-profiles";
import { formatRelativeTime, type RelativeTimeLabels } from "@/lib/relative-time";

export interface AssistantTreeSidebarProps {
  selectedThreadId?: string;
  onSelectThread: (threadId: string) => void;
  onNewClient?: () => void;
  onNewCampaign?: () => void;
  onNewThread?: (clientId: string) => void;
  contextClientId?: string | null;
  onContextClientChange?: (clientId: string | null) => void;
  expandClientId?: string | null;
  onActiveClientChange?: (clientId: string | null) => void;
}

const THREAD_PREVIEW_LIMIT = 3;

export default function AssistantTreeSidebar({
  selectedThreadId,
  onSelectThread,
  onNewClient,
  onNewThread,
  contextClientId,
  onContextClientChange,
  expandClientId,
  onActiveClientChange,
}: AssistantTreeSidebarProps) {
  const t = useTranslations("assistant.tree");
  const { data: clients = [], isLoading: clientsLoading } = useClientProfiles();

  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedPreviews, setExpandedPreviews] = useState<Set<string>>(
    new Set()
  );
  const [search, setSearch] = useState("");

  const effectiveExpanded = useMemo(() => {
    const seeds = [expandClientId, contextClientId].filter(
      (id): id is string => Boolean(id)
    );
    if (seeds.length === 0) return expandedClients;
    if (seeds.every((id) => expandedClients.has(id))) return expandedClients;
    const next = new Set(expandedClients);
    for (const id of seeds) next.add(id);
    return next;
  }, [expandedClients, expandClientId, contextClientId]);

  const toggleClient = (id: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    onContextClientChange?.(id);
    onActiveClientChange?.(id);
  };

  const togglePreview = (id: string) => {
    setExpandedPreviews((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isLoading = clientsLoading;
  const trimmedSearch = search.trim().toLowerCase();

  const filteredClients = useMemo(() => {
    if (!trimmedSearch) return clients;
    return clients.filter((c) =>
      c.name.toLowerCase().includes(trimmedSearch)
    );
  }, [clients, trimmedSearch]);

  return (
    <div
      className="flex h-full flex-col"
      data-testid="assistant-tree-sidebar"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-dim)] px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {t("title")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("newClient")}
          onClick={onNewClient}
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </Button>
      </div>

      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1.5">
          <Search className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
            className="w-full bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-[var(--text-muted)]">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          </div>
        ) : filteredClients.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-[var(--text-muted)]">
            {trimmedSearch ? t("searchPlaceholder") : t("noClients")}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filteredClients.map((client) => (
              <ProjectNode
                key={client.id}
                clientId={client.id}
                clientName={client.name}
                selectedThreadId={selectedThreadId}
                onSelectThread={onSelectThread}
                isExpanded={effectiveExpanded.has(client.id)}
                isPreviewExpanded={expandedPreviews.has(client.id)}
                onToggle={() => toggleClient(client.id)}
                onTogglePreview={() => togglePreview(client.id)}
                onNewThread={onNewThread}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const RELATIVE_LABELS: RelativeTimeLabels = {
  now: "agora",
  minute: "1m",
  minutes: "{n}m",
  hour: "1h",
  hours: "{n}h",
  day: "1d",
  days: "{n}d",
};

function ProjectNode({
  clientId,
  clientName,
  selectedThreadId,
  onSelectThread,
  isExpanded,
  isPreviewExpanded,
  onToggle,
  onTogglePreview,
  onNewThread,
}: {
  clientId: string;
  clientName: string;
  selectedThreadId?: string;
  onSelectThread: (threadId: string) => void;
  isExpanded: boolean;
  isPreviewExpanded: boolean;
  onToggle: () => void;
  onTogglePreview: () => void;
  onNewThread?: (clientId: string) => void;
}) {
  const t = useTranslations("assistant.tree");
  const router = useRouter();
  const { data: threads = [], isLoading } = useAssistantThreads(clientId, null);

  const handleSelect = (threadId: string) => {
    onSelectThread(threadId);
    router.replace(`/assistant?threadId=${threadId}`);
  };

  const visibleThreads = isPreviewExpanded
    ? threads
    : threads.slice(0, THREAD_PREVIEW_LIMIT);
  const hasMore = threads.length > THREAD_PREVIEW_LIMIT;

  return (
    <li>
      <div className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-[var(--surface-secondary)]">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-label={clientName}
          onClick={onToggle}
          className="flex flex-1 items-center gap-1.5 text-left text-sm font-medium text-[var(--text-primary)]"
        >
          {isExpanded ? (
            <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{clientName}</span>
        </button>
        <button
          type="button"
          aria-label={t("newChat")}
          onClick={() => onNewThread?.(clientId)}
          className="flex size-5 items-center justify-center rounded text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--text-primary)] group-hover:opacity-100"
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {isExpanded ? (
        <div className="mt-0.5 space-y-0.5">
          {isLoading ? (
            <div className="flex items-center gap-2 px-6 py-1.5 text-xs text-[var(--text-muted)]">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            </div>
          ) : threads.length === 0 ? (
            <button
              type="button"
              onClick={() => onNewThread?.(clientId)}
              className="flex w-full items-center gap-2 rounded-md px-6 py-1.5 text-left text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <MessageSquare className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
              {t("noThreads")}
            </button>
          ) : (
            <>
              <ul className="space-y-0.5">
                {visibleThreads.map((thread) => {
                  const isActive = selectedThreadId === thread.id;
                  const label = thread.name?.trim() || t("untitled");
                  return (
                    <li key={thread.id}>
                      <button
                        type="button"
                        aria-current={isActive ? "true" : undefined}
                        onClick={() => handleSelect(thread.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-6 py-1.5 text-left text-sm transition-colors",
                          isActive
                            ? "bg-[var(--surface-raised)] text-[var(--text-primary)]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
                        )}
                      >
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-[var(--accent-red)]"
                          aria-hidden="true"
                        />
                        <span className="flex-1 truncate">{label}</span>
                        {thread.isDefault ? (
                          <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                            default
                          </span>
                        ) : null}
                        <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                          {formatRelativeTime(thread.updatedAt, new Date(), RELATIVE_LABELS)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hasMore ? (
                <button
                  type="button"
                  onClick={onTogglePreview}
                  className="flex w-full items-center px-6 py-1.5 text-left text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {isPreviewExpanded ? t("showLess") : t("showMore")}
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
