"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ImageIcon, Target, Users, MessageSquare, Monitor, MousePointer, Loader2 } from "lucide-react";
import { useCampaignAssets } from "@/lib/hooks/use-assets";
import Panel from "@/components/layout/Panel";
import CreativeReadinessPanel from "@/components/workspace/CreativeReadinessPanel";

interface PilotSidebarProps {
  campaignId: string;
  campaign: {
    name: string;
    client?: string;
  };
  briefing: {
    objective?: string;
    audience?: string;
    tone?: string;
    platforms?: string;
    ctaText?: string;
  };
  onReadinessOverride?: () => void;
}

interface BriefingRowProps {
  icon: React.ReactNode;
  label: string;
  value?: string;
}

function selectPilotAsset(
  assets: { id: string; role?: string; url?: string }[]
) {
  return (
    assets.find((a) => a.role === "base" || a.role === "linked") ?? assets[0]
  );
}

function BriefingRow({ icon, label, value }: BriefingRowProps) {
  if (!value) return null;

  return (
    <div className="flex items-start gap-2.5 py-2">
      <div className="mt-0.5 text-[var(--text-muted)]">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)]">
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm text-[var(--text-primary)]">{value}</p>
      </div>
    </div>
  );
}

export default function PilotSidebar({
  campaignId,
  campaign,
  briefing,
  onReadinessOverride,
}: PilotSidebarProps) {
  const { data: assets, isLoading } = useCampaignAssets(campaignId);
  const [imageError, setImageError] = useState(false);

  const pilotAsset = useMemo(
    () => (assets?.length ? selectPilotAsset(assets) : undefined),
    [assets]
  );

  const pilotImageUrl =
    pilotAsset?.url && !imageError ? pilotAsset.url : undefined;

  const hasBriefing = Boolean(
    briefing.objective ||
      briefing.audience ||
      briefing.tone ||
      briefing.platforms ||
      briefing.ctaText
  );

  return (
    <aside className="flex w-full max-w-[280px] shrink-0 flex-col gap-4">
      <Panel padding="sm" className="space-y-4">
        <div
          className={cn(
            "relative flex items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-raised)] p-[30px]",
          )}
          style={{ height: 220 }}
        >
          {isLoading && (
            <Loader2 size={28} className="animate-spin text-[var(--text-muted)]" />
          )}

          {!isLoading && pilotImageUrl && (
            <div className="relative h-full w-full">
              <Image
                key={pilotAsset?.id ?? pilotAsset?.url ?? "pilot"}
                src={pilotImageUrl}
                alt={campaign.name || "Piloto"}
                fill
                sizes="280px"
                unoptimized
                className="object-contain"
                onError={() => setImageError(true)}
              />
            </div>
          )}

          {!isLoading && !pilotImageUrl && (
            <ImageIcon size={32} className="text-[var(--border-medium)]" />
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[var(--accent-green-dim)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--accent-green-text)]">
              Piloto
            </span>
            {campaign.client ? (
              <span className="inline-flex items-center rounded-full bg-[var(--surface-raised)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                {campaign.client}
              </span>
            ) : null}
          </div>
          <h3 className="text-sm font-semibold leading-tight text-[var(--text-primary)]">
            {campaign.name}
          </h3>
        </div>

        {hasBriefing ? (
          <div className="border-t border-[var(--border-dim)] pt-4 animate-fade-in">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)]">
              Resumo do briefing
            </p>
            <div className="divide-y divide-[var(--border-dim)]">
              <BriefingRow
                icon={<Target size={14} />}
                label="Objetivo"
                value={briefing.objective}
              />
              <BriefingRow
                icon={<Users size={14} />}
                label="Público"
                value={briefing.audience}
              />
              <BriefingRow
                icon={<MessageSquare size={14} />}
                label="Tom"
                value={briefing.tone}
              />
              <BriefingRow
                icon={<Monitor size={14} />}
                label="Plataformas"
                value={briefing.platforms}
              />
              <BriefingRow
                icon={<MousePointer size={14} />}
                label="CTA"
                value={briefing.ctaText}
              />
            </div>
          </div>
        ) : null}
      </Panel>

      <div id="mission-readiness">
        <CreativeReadinessPanel
          campaignId={campaignId}
          assetId={pilotAsset?.id}
          onOverride={onReadinessOverride}
        />
      </div>
    </aside>
  );
}
