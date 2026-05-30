"use client";

import { cn } from "@/lib/utils";
import { ImageIcon, Target, Users, MessageSquare, Monitor, MousePointer } from "lucide-react";

// ============================================
// Types
// ============================================

interface PilotSidebarProps {
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
}

interface BriefingRowProps {
  icon: React.ReactNode;
  label: string;
  value?: string;
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
        <p className="mt-0.5 text-sm text-[var(--text-primary)] truncate">{value}</p>
      </div>
    </div>
  );
}

// ============================================
// Component
// ============================================

export default function PilotSidebar({ campaign, briefing }: PilotSidebarProps) {
  const hasBriefing = Boolean(
    briefing.objective ||
      briefing.audience ||
      briefing.tone ||
      briefing.platforms ||
      briefing.ctaText
  );

  return (
    <aside className="w-[280px] flex-shrink-0 flex flex-col gap-4">
      {/* Campaign Card */}
      <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-4">
        {/* Placeholder Image Area */}
        <div
          className={cn(
            "flex items-center justify-center rounded-lg mb-4",
            "bg-[var(--surface-raised)]"
          )}
          style={{ height: 160 }}
        >
          <ImageIcon size={32} className="text-[var(--border-medium)]" />
        </div>

        {/* Tags */}
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center rounded-full bg-[var(--accent-green-dim)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--accent-green)]">
            Piloto
          </span>
          {campaign.client && (
            <span className="inline-flex items-center rounded-full bg-[var(--surface-raised)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {campaign.client}
            </span>
          )}
        </div>

        {/* Campaign Name */}
        <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-tight">
          {campaign.name}
        </h3>
      </div>

      {/* Briefing Summary Card */}
      {hasBriefing && (
        <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ghost)]">
              Resumo do briefing
            </span>
          </div>

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
      )}
    </aside>
  );
}
