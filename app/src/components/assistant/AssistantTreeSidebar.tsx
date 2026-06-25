"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAssistantThreads } from "@/lib/hooks/use-assistant-threads";
import { useClientProfiles } from "@/lib/hooks/use-client-profiles";
import { useCampaigns } from "@/lib/hooks/use-campaigns";

export interface AssistantTreeSidebarProps {
  selectedThreadId?: string;
  onSelectThread: (threadId: string) => void;
  onNewClient?: () => void;
  onNewCampaign?: () => void;
  onNewThread?: () => void;
  contextClientId?: string | null;
  onContextClientChange?: (clientId: string | null) => void;
  expandClientId?: string | null;
}

function ThreadList({
  clientProfileId,
  campaignId,
  selectedThreadId,
  onSelectThread,
}: {
  clientProfileId: string;
  campaignId: string | null;
  selectedThreadId?: string;
  onSelectThread: (threadId: string) => void;
}) {
  const { data: threads = [], isLoading } = useAssistantThreads(
    clientProfileId,
    campaignId
  );
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-6 py-1.5 text-xs text-[var(--text-muted)]">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (threads.length === 0) {
    return null;
  }

  const handleSelect = (threadId: string) => {
    onSelectThread(threadId);
    router.replace(`/assistant?threadId=${threadId}`);
  };

  return (
    <ul className="space-y-0.5">
      {threads.map((thread) => {
        const isActive = selectedThreadId === thread.id;
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
              <MessageSquare className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
              <span className="truncate">{thread.name}</span>
              {thread.isDefault ? (
                <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  default
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CampaignNode({
  clientProfileId,
  campaignId,
  campaignName,
  selectedThreadId,
  onSelectThread,
  expandedCampaigns,
  toggleCampaign,
}: {
  clientProfileId: string;
  campaignId: string;
  campaignName: string;
  selectedThreadId?: string;
  onSelectThread: (threadId: string) => void;
  expandedCampaigns: Set<string>;
  toggleCampaign: (id: string) => void;
}) {
  const isExpanded = expandedCampaigns.has(campaignId);

  return (
    <li>
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => toggleCampaign(campaignId)}
        className="flex w-full items-center gap-1.5 rounded-md px-4 py-1.5 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
      >
        {isExpanded ? (
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{campaignName}</span>
      </button>
      {isExpanded ? (
        <ThreadList
          clientProfileId={clientProfileId}
          campaignId={campaignId}
          selectedThreadId={selectedThreadId}
          onSelectThread={onSelectThread}
        />
      ) : null}
    </li>
  );
}

function ClientNode({
  clientId,
  clientName,
  campaigns,
  selectedThreadId,
  onSelectThread,
  expandedClients,
  expandedCampaigns,
  toggleClient,
  toggleCampaign,
  onContextClientChange,
}: {
  clientId: string;
  clientName: string;
  campaigns: Array<{ id: string; name: string }>;
  selectedThreadId?: string;
  onSelectThread: (threadId: string) => void;
  expandedClients: Set<string>;
  expandedCampaigns: Set<string>;
  toggleClient: (id: string) => void;
  toggleCampaign: (id: string) => void;
  onContextClientChange?: (clientId: string | null) => void;
}) {
  const isExpanded = expandedClients.has(clientId);

  const handleToggle = () => {
    toggleClient(clientId);
    onContextClientChange?.(clientId);
  };

  return (
    <li>
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-label={clientName}
        onClick={handleToggle}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"
      >
        {isExpanded ? (
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{clientName}</span>
      </button>
      {isExpanded ? (
        <div className="mt-0.5 space-y-0.5">
          <ThreadList
            clientProfileId={clientId}
            campaignId={null}
            selectedThreadId={selectedThreadId}
            onSelectThread={onSelectThread}
          />
          <ul className="space-y-0.5">
            {campaigns.map((campaign) => (
              <CampaignNode
                key={campaign.id}
                clientProfileId={clientId}
                campaignId={campaign.id}
                campaignName={campaign.name}
                selectedThreadId={selectedThreadId}
                onSelectThread={onSelectThread}
                expandedCampaigns={expandedCampaigns}
                toggleCampaign={toggleCampaign}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

export default function AssistantTreeSidebar({
  selectedThreadId,
  onSelectThread,
  onNewClient,
  onNewCampaign,
  onNewThread,
  contextClientId,
  onContextClientChange,
  expandClientId,
}: AssistantTreeSidebarProps) {
  const t = useTranslations("assistant.tree");
  const { data: clients = [], isLoading: clientsLoading } = useClientProfiles();
  const { campaigns: allCampaigns = [], isLoading: campaignsLoading } =
    useCampaigns({ limit: 100 });

  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    if (expandClientId) {
      setExpandedClients((prev) => new Set(prev).add(expandClientId));
    }
  }, [expandClientId]);

  const campaignsByClient = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    for (const campaign of allCampaigns) {
      const profileId = campaign.clientProfileId;
      if (!profileId) continue;
      const list = map.get(profileId) ?? [];
      list.push({ id: campaign.id, name: campaign.name });
      map.set(profileId, list);
    }
    return map;
  }, [allCampaigns]);

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
  };

  const toggleCampaign = (id: string) => {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isLoading = clientsLoading || campaignsLoading;
  const hasClientContext = !!contextClientId;

  return (
    <div
      className="flex h-full flex-col"
      data-testid="assistant-tree-sidebar"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-dim)] px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {t("title")}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("newClient")}
            onClick={onNewClient}
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("newCampaign")}
            disabled={!hasClientContext}
            onClick={onNewCampaign}
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("newThread")}
            disabled={!hasClientContext}
            onClick={onNewThread}
          >
            <MessageSquare className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-[var(--text-muted)]">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          </div>
        ) : clients.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-[var(--text-muted)]">
            {t("noClients")}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {clients.map((client) => (
              <ClientNode
                key={client.id}
                clientId={client.id}
                clientName={client.name}
                campaigns={campaignsByClient.get(client.id) ?? []}
                selectedThreadId={selectedThreadId}
                onSelectThread={onSelectThread}
                expandedClients={expandedClients}
                expandedCampaigns={expandedCampaigns}
                toggleClient={toggleClient}
                toggleCampaign={toggleCampaign}
                onContextClientChange={onContextClientChange}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
