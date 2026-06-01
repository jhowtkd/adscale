"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useState, useMemo, memo } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Layers, MoreHorizontal, Edit2, Copy, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface VisualCampaignCardProps {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  pieceCount: number;
  approvedCount: number;
  status: string;
  platforms?: string[];
  updatedAt: string;
  index?: number;
}

// Bold, high-contrast status config with neon accents
const statusConfig: Record<string, { dot: string; label: string; bg: string; text: string; border: string }> = {
  active: { 
    dot: "bg-[var(--accent-green)] shadow-[0_0_8px_var(--accent-green-dim)0.8)]", 
    label: "ATIVA",
    bg: "bg-[var(--accent-green)]/15",
    text: "text-[var(--accent-green-text)]",
    border: "border-[var(--accent-green)]/30"
  },
  draft: { 
    dot: "bg-[var(--accent-amber)]", 
    label: "RASCUNHO",
    bg: "bg-[var(--accent-amber)]/15",
    text: "text-[var(--accent-amber)]",
    border: "border-[var(--accent-amber)]/30"
  },
  generating: { 
    dot: "bg-[var(--accent-green)] animate-pulse shadow-[0_0_8px_var(--accent-green-dim)0.6)]", 
    label: "GERANDO",
    bg: "bg-[var(--accent-green)]/15",
    text: "text-[var(--accent-green-text)]",
    border: "border-[var(--accent-green)]/30"
  },
  completed: { 
    dot: "bg-[var(--accent-green)]", 
    label: "CONCLUÍDA",
    bg: "bg-[var(--accent-green)]/10",
    text: "text-[var(--accent-green-text)]",
    border: "border-[var(--accent-green)]/20"
  },
  failed: { 
    dot: "bg-[var(--accent-rose)] shadow-[0_0_8px_rgba(225,29,72,0.6)]", 
    label: "FALHOU",
    bg: "bg-[var(--accent-rose)]/15",
    text: "text-[var(--accent-rose)]",
    border: "border-[var(--accent-rose)]/30"
  },
  archived: { 
    dot: "bg-[var(--text-muted)]", 
    label: "ARQUIVADA",
    bg: "bg-[var(--surface-raised)]",
    text: "text-[var(--text-secondary)]",
    border: "border-[var(--border-medium)]"
  },
};

function ThumbnailPlaceholder({ name }: { name: string }) {
  const initials = useMemo(() => 
    name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    [name]
  );

  const hash = useMemo(() => 
    name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0),
    [name]
  );
  
  const angle = hash % 360;

  return (
    <div 
      className="absolute inset-0 flex items-center justify-center"
      style={{
        background: `linear-gradient(${angle}deg, var(--deep-bg) 0%, var(--surface-raised) 50%, var(--deep-bg) 100%)`
      }}
    >
      <div className="relative z-10">
        <div className="size-20 rounded-xl bg-[var(--deep-bg)] border-[3px] border-[var(--accent-green)]/40 flex items-center justify-center shadow-[0_0_30px_var(--accent-green-dim)]">
          <span 
            className="text-3xl font-black text-[var(--accent-green)] tracking-wider" 
            style={{ fontFamily: '"Press Start 2P", cursive' }}
          >
            {initials}
          </span>
        </div>
      </div>
    </div>
  );
}

const VisualCampaignCard = memo(function VisualCampaignCard({
  id,
  name,
  thumbnailUrl,
  pieceCount,
  approvedCount,
  status,
  platforms = [],
  updatedAt,
  index = 0,
}: VisualCampaignCardProps) {
  const t = useTranslations("campaign");
  const statusInfo = statusConfig[status] ?? statusConfig.draft;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const formattedDate = useMemo(() => 
    formatDistanceToNow(new Date(updatedAt), {
      addSuffix: true,
      locale: ptBR,
    }),
    [updatedAt]
  );

  const displayName = useMemo(() => 
    name.length > 35 ? name.substring(0, 32) + "..." : name,
    [name]
  );

  return (
    <article
        className={cn(
          "group relative rounded-2xl glass-card overflow-hidden",
          "transition-all duration-300 ease-out will-change-transform",
          "hover:border-[var(--accent-green)]/50 hover:shadow-[0_0_40px_var(--accent-green-dim),0_8px_32px_rgba(0,0,0,0.4)] hover:-translate-y-2 hover:scale-[1.02]",
          "focus-within:border-[var(--accent-green)]/60 focus-within:shadow-[0_0_40px_var(--accent-green-dim)]",
        "active:scale-[0.98] active:duration-100"
      )}
      style={{ 
        animationDelay: `${index * 80}ms`,
        animation: "fade-in-up 500ms ease-out forwards",
        opacity: 0
      }}
    >
      <Link 
        href={`/campaigns/${id}`}
        prefetch={false}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--deep-bg)] rounded-2xl"
        aria-label={`${t("openCampaign")}: ${name}`}
      >
        {/* Thumbnail Area */}
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-raised)]">
          {thumbnailUrl && !imageError ? (
            <>
              <Image
                src={thumbnailUrl}
                alt={t("thumbnailAlt", { name })}
                loading="lazy"
                decoding="async"
                className={cn(
                  "size-full object-cover transition-transform duration-500 group-hover:scale-110",
                  !imageLoaded && "opacity-0"
                )}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              
        width={800}
        height={800}
        unoptimized
      />
              {!imageLoaded && (
                <div className="absolute inset-0 animate-pulse bg-[var(--surface-raised)]" />
              )}
            </>
          ) : (
            <ThumbnailPlaceholder name={name} />
          )}

          {/* Status Badge - Top Right with glow */}
          <div className="absolute top-4 right-4 z-10">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase",
              "backdrop-blur-md border",
              statusInfo.bg,
              statusInfo.text,
              statusInfo.border
            )}>
              <span className={cn("size-2 rounded-full", statusInfo.dot)} />
              {statusInfo.label}
            </div>
          </div>

          {/* Gradient Overlay - stronger */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

          {/* Hover overlay — decorative only (no nested controls inside link) */}
          <div 
            className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none"
            aria-hidden="true"
          />
        </div>

        {/* Info Area - bolder typography */}
        <div className="p-5">
          {/* Campaign Name */}
          <h3 className="text-base font-bold text-[var(--text-primary)] truncate leading-tight group-hover:text-[var(--accent-green)] transition-colors">
            {displayName}
          </h3>

          {/* Meta Info */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                <Layers size={13} className="text-[var(--accent-green)]/60" aria-hidden="true" />
                <span className="text-[var(--accent-green)]">{pieceCount}</span>
                <span>{pieceCount === 1 ? "variação" : "variações"}</span>
              </span>
            </div>
            <time 
              className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider"
              dateTime={updatedAt}
            >
              {formattedDate}
            </time>
          </div>

          {/* Platforms - pill style */}
          {platforms.length > 0 && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              {platforms.slice(0, 3).map((platform) => (
                <span
                  key={platform}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-[var(--deep-bg)] text-[var(--text-secondary)] border border-[var(--border-dim)]"
                >
                  {platform}
                </span>
              ))}
              {platforms.length > 3 && (
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-[var(--accent-green)]"
                >
                  +{platforms.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* Dropdown Menu — outside link to avoid nested interactive controls */}
      <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-all duration-300">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("moreActions")}
            className="size-9 rounded-xl bg-[var(--surface-base)] border-2 border-[var(--border-dim)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent-green)] hover:border-[var(--accent-green)]/40 transition-all hover:scale-110"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 border-2 border-[var(--border-dim)]">
            <DropdownMenuItem className="cursor-pointer font-semibold">
              <Edit2 size={14} className="mr-2" aria-hidden="true" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer font-semibold">
              <Copy size={14} className="mr-2" aria-hidden="true" />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer text-[var(--accent-rose)] font-semibold">
              <Trash2 size={14} className="mr-2" aria-hidden="true" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
});

export default VisualCampaignCard;
