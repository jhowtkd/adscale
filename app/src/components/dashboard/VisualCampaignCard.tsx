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
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import {
  type DashboardCampaignItem,
  statusConfig,
} from "@/components/dashboard/campaign-status-config";

interface VisualCampaignCardProps extends DashboardCampaignItem {
  platforms?: string[];
  index?: number;
}

function ThumbnailPlaceholder({ name }: { name: string }) {
  const initials = useMemo(
    () =>
      name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [name],
  );

  const hash = useMemo(
    () => name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0),
    [name],
  );

  const angle = hash % 360;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        background: `linear-gradient(${angle}deg, var(--deep-bg) 0%, var(--surface-raised) 50%, var(--deep-bg) 100%)`,
      }}
    >
      <div className="relative z-10">
        <div className="size-20 rounded-xl bg-[var(--deep-bg)] border-[3px] border-[var(--accent-green)]/40 flex items-center justify-center">
          <span className="font-mono text-2xl font-bold text-[var(--accent-green)] tracking-wider">
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
  const reducedMotion = useReducedMotion();
  const statusInfo = statusConfig[status] ?? statusConfig.draft;
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const formattedDate = useMemo(
    () =>
      formatDistanceToNow(new Date(updatedAt), {
        addSuffix: true,
        locale: ptBR,
      }),
    [updatedAt],
  );

  const displayName = useMemo(
    () => (name.length > 35 ? name.substring(0, 32) + "..." : name),
    [name],
  );

  return (
    <article
      className={cn(
        "group relative rounded-2xl glass-card overflow-hidden animate-fade-in",
        "transition-all duration-300 ease-out",
        !reducedMotion && "will-change-transform hover:-translate-y-1 hover:scale-[1.01]",
        "hover:border-[var(--accent-green)]/40 hover:shadow-[0_0_24px_var(--accent-green-dim),0_4px_16px_rgba(0,0,0,0.3)]",
        "focus-within:border-[var(--accent-green)]/50 focus-within:shadow-[0_0_24px_var(--accent-green-dim)]",
        !reducedMotion && "active:scale-[0.98] active:duration-100",
      )}
      style={{
        animationDelay: `${index * 80}ms`,
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
                  "size-full object-cover transition-transform duration-500 group-hover:scale-105",
                  !imageLoaded && "opacity-0",
                  reducedMotion && "group-hover:scale-100",
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

          {/* Status Badge - solid overlay for contrast on creatives */}
          <div className="absolute top-4 right-4 z-10">
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide",
                "bg-black/60 border border-white/10 text-white",
                status === "active" || status === "generating" || status === "completed"
                  ? "text-[var(--accent-green-light)]"
                  : status === "failed"
                    ? "text-[var(--accent-rose)]"
                    : status === "draft"
                      ? "text-[var(--accent-amber)]"
                      : "text-white/80",
              )}
            >
              <span className={cn("size-2 rounded-full", statusInfo.dot)} />
              {statusInfo.label}
            </div>
          </div>

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

          {/* Hover overlay — decorative only */}
          <div
            className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none [@media(hover:none)]:opacity-0"
            aria-hidden="true"
          />
        </div>

        {/* Info Area */}
        <div className="p-5">
          <h3 className="text-base font-bold text-[var(--text-primary)] truncate leading-tight group-hover:text-[var(--accent-green)] transition-colors">
            {displayName}
          </h3>

          <div className="flex items-center justify-between mt-3 gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                <Layers size={13} className="text-[var(--accent-green)]/60" aria-hidden="true" />
                <span className="text-[var(--accent-green)]">{pieceCount}</span>
                <span>
                  {pieceCount === 1 ? t("variationSingular") : t("variationPlural")}
                </span>
              </span>
              {approvedCount > 0 && (
                <span className="text-xs text-[var(--text-muted)]">
                  · {t("approvedCount", { count: approvedCount })}
                </span>
              )}
            </div>
            <time
              className="shrink-0 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide"
              dateTime={updatedAt}
            >
              {formattedDate}
            </time>
          </div>

          {platforms.length > 0 && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              {platforms.slice(0, 3).map((platform) => (
                <span
                  key={platform}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-[var(--deep-bg)] text-[var(--text-secondary)] border border-[var(--border-dim)]"
                >
                  {platform}
                </span>
              ))}
              {platforms.length > 3 && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold text-[var(--accent-green)]">
                  +{platforms.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* Dropdown Menu — visible on touch, hover-reveal on pointer devices */}
      <div className="absolute bottom-5 right-5 opacity-100 transition-opacity duration-300 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("moreActions")}
            className="min-h-11 min-w-11 rounded-xl bg-[var(--surface-base)] border-2 border-[var(--border-dim)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent-green)] hover:border-[var(--accent-green)]/40 transition-colors"
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
