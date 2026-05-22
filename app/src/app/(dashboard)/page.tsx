"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { platformColors } from "@/lib/mock-data";
import type { ActivityItem } from "@/lib/mock-data";
import type { UiCampaign } from "@/lib/hooks/use-campaigns";
import { useDashboard } from "@/lib/hooks/use-dashboard";
import { useCampaigns } from "@/lib/hooks/use-campaigns";
import { useBillingStatus } from "@/lib/hooks/use-billing";
import StatsCard from "@/components/ui/StatsCard";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";

const RestylingModal = dynamic(() => import("@/components/workspace/RestylingModal"), {
  ssr: false,
  loading: () => null,
});
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
// Recharts imports reserved for future credit usage chart
// import { BarChart, Bar, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import {
  FolderOpen,
  Layers,
  Zap,
  Globe,
  Upload,
  ImageIcon,
  Users,
  Sparkles,
  Download,
  AlertTriangle,
  MoreHorizontal,
  Plus,
  ArrowRight,
} from "lucide-react";
import { useTranslations } from "next-intl";

// ============================================
// Activity Icon Mapper
// ============================================

const activityIcons: Record<ActivityItem["type"], typeof Sparkles> = {
  plan: Sparkles,
  derivation: ImageIcon,
  campaign: FolderOpen,
  export: Download,
  alert: AlertTriangle,
};

const activityIconColors: Record<ActivityItem["type"], string> = {
  plan: "var(--accent-mint)",
  derivation: "var(--accent-mint)",
  campaign: "var(--accent-mint)",
  export: "var(--accent-mint)",
  alert: "var(--accent-amber)",
};

const activityIconBgColors: Record<ActivityItem["type"], string> = {
  plan: "var(--accent-mint-dim)",
  derivation: "var(--accent-mint-dim)",
  campaign: "var(--accent-mint-dim)",
  export: "var(--accent-mint-dim)",
  alert: "rgba(212,160,23,0.12)",
};

const fallbackPlatformColors = { bg: "var(--surface-raised)", text: "var(--text-secondary)" };

// ============================================
// Dashboard Page
// ============================================

export default function DashboardPage() {
  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);
  const tNav = useTranslations("navigation");
  const t = useTranslations("common");
  const tc = useTranslations("campaign");

  const { data: dashboardData, isLoading: isDashboardLoading, isError: isDashboardError } = useDashboard();
  const { campaigns, isLoading: isCampaignsLoading } = useCampaigns();

  useEffect(() => {
    setCurrentPageTitle(tNav("dashboard"));
  }, [setCurrentPageTitle, tNav]);

  const recentCampaigns = campaigns.slice(0, 5);
  const activityFeed = dashboardData?.recentActivity ?? [];

  // Stats (with fallbacks for data not yet in scope)
  const totalCampaigns = dashboardData?.campaignCount ?? recentCampaigns.length ?? 0;
  const derivationsThisMonth = 0;
  const creditsUsed = 0;
  const creditsTotal = 1000;
  const activePlatforms = new Set(recentCampaigns.flatMap((c) => c.platforms)).size;
  const campaignsChange = 0;
  const derivationsChange = 0;
  const creditsRemaining = 100;
  const creditPercent = 0;

  const [showRestylingModal, setShowRestylingModal] = useState(false);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <CreditAlertBanner />
      {/* ---- Welcome Banner ---- */}
      <section
        className="relative overflow-hidden rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] px-5 py-5 sm:px-6 animate-fade-in"
      >
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[24px] font-semibold leading-tight text-[var(--text-primary)] sm:text-[28px]">
              {t("welcomeBack")}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {t("dashboardSubtitle")}
            </p>
          </div>
          <div
            className="animate-fade-in"
            style={{ animationDelay: "150ms" }}
          >
            <Link
              href="/campaigns"
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-white sm:px-5",
                "bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-light)] hover:-translate-y-px",
                "active:scale-[0.98] transition-all duration-200",
                "hover:shadow-[0_4px_16px_rgba(47,182,125,0.2)]"
              )}
            >
              <Plus size={16} />
              {tc("new")}
            </Link>
          </div>
        </div>
      </section>

      {/* ---- Stats Cards Grid ---- */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatsCard
          icon={FolderOpen}
          label={tNav("campaigns")}
          value={totalCampaigns}
          change={{ value: `${campaignsChange}%`, positive: true }}
          iconBgColor="var(--accent-mint-dim)"
          iconColor="var(--accent-mint)"
          index={0}
        />
        <StatsCard
          icon={Layers}
          label={t("derivationsThisMonth")}
          value={derivationsThisMonth}
          change={{ value: `${derivationsChange}%`, positive: true }}
          iconBgColor="var(--accent-mint-dim)"
          iconColor="var(--accent-mint)"
          index={1}
        />
        <StatsCard
          icon={Zap}
          label={t("creditsUsedLabel")}
          value={creditsUsed}
          change={{
            value: `${creditsRemaining}% ${t("remaining")}`,
            positive: false,
          }}
          iconBgColor="rgba(212,160,23,0.12)"
          iconColor="var(--accent-amber)"
          index={2}
        />
        <StatsCard
          icon={Globe}
          label={t("activePlatforms")}
          value={activePlatforms}
          iconBgColor="var(--accent-mint-dim)"
          iconColor="var(--accent-mint)"
          index={3}
        />
      </section>

      {/* ---- Quick Actions ---- */}
      <section
        className="space-y-4 animate-fade-in"
        style={{ animationDelay: "200ms" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            {t("quickActions")}
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickActionCard
            icon={Sparkles}
            title={t("restyling")}
            description={t("restylingDesc")}
            iconBgColor="var(--accent-mint-dim)"
            iconColor="var(--accent-mint)"
            onClick={() => setShowRestylingModal(true)}
            featured
            index={0}
          />
          <QuickActionCard
            icon={Upload}
            title={t("uploadCreative")}
            description={t("uploadCreativeDesc")}
            iconBgColor="var(--accent-mint-dim)"
            iconColor="var(--accent-mint)"
            href="/campaigns"
            index={1}
          />
          <QuickActionCard
            icon={ImageIcon}
            title={t("browseLibrary")}
            description={t("browseLibraryDesc")}
            iconBgColor="var(--accent-mint-dim)"
            iconColor="var(--accent-mint)"
            href="/campaigns"
            index={2}
          />
          <QuickActionCard
            icon={Users}
            title={t("inviteTeam")}
            description={t("inviteTeamDesc")}
            iconBgColor="rgba(212,160,23,0.12)"
            iconColor="var(--accent-amber)"
            disabled
            index={3}
          />
        </div>
      </section>

      {/* ---- Recent Campaigns ---- */}
      <section
        className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] overflow-hidden animate-fade-in"
        style={{ animationDelay: "300ms" }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-dim)]">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            {t("recentCampaigns")}
          </h2>
          <Link
            href="/campaigns"
            className="text-sm text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors"
          >
            {t("viewAll")}
          </Link>
        </div>

        {isCampaignsLoading ? (
          <div className="px-6 py-8 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-[var(--surface-raised)] animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-[var(--surface-raised)] rounded animate-pulse" />
                  <div className="h-3 w-24 bg-[var(--surface-raised)] rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : recentCampaigns.length > 0 ? (
          <div className="divide-y divide-[var(--border-dim)]">
            {/* Table Header */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_100px_80px_100px_80px_48px] gap-4 px-6 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              <span>{t("campaign")}</span>
              <span className="text-center">{t("status")}</span>
              <span className="text-center">{t("variations")}</span>
              <span className="text-center">{t("modified")}</span>
              <span className="text-right">{t("credits")}</span>
              <span />
            </div>

            {recentCampaigns.map((campaign) => (
              <CampaignRow key={campaign.id} campaign={campaign} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={t("noCampaignsYet")}
            description={t("createFirstCampaign")}
            action={{ label: tc("new"), onClick: () => {} }}
          />
        )}
      </section>

      {/* ---- Bottom Row: Credit Usage + Activity Feed ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Credit Usage */}
        <div
          className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 sm:p-6 animate-fade-in"
          style={{ animationDelay: "400ms" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {t("creditUsage")}
            </h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-muted)]">
              {t("thisMonth")}
            </span>
          </div>

          {/* Chart placeholder */}
          <div className="h-[120px] mb-4 flex items-center justify-center rounded-md bg-[var(--surface-raised)]">
            <p className="text-sm text-[var(--text-muted)]">{t("noUsageData")}</p>
          </div>

          {/* Summary */}
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            <span className="font-medium text-[var(--text-primary)]">
              {creditsUsed}
            </span>{" "}
            {t("of")}{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {creditsTotal}
            </span>{" "}
            {t("creditsUsedThisMonth")}
          </p>

          {/* Progress bar */}
          <div className="h-1.5 w-full rounded-full bg-[var(--border-dim)] overflow-hidden mb-4">
            <div
              className="h-full rounded-full gradient-progress transition-all duration-600"
              style={{ width: `${creditPercent}%`, transitionDelay: "500ms" }}
            />
          </div>

          <button className="text-sm text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors">
            {t("upgradePlan")}
          </button>
        </div>

        {/* Activity Feed */}
        <div
          className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 sm:p-6 animate-fade-in"
          style={{ animationDelay: "500ms" }}
        >
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)] mb-4">
            {t("activityFeed")}
          </h2>

          {isDashboardLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-[var(--surface-raised)] animate-pulse" />
                  <div className="flex-1 h-4 bg-[var(--surface-raised)] rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : isDashboardError ? (
            <p className="text-sm text-[var(--text-secondary)]">
              {t("failedLoadActivity")}
            </p>
          ) : activityFeed.length > 0 ? (
            <div className="space-y-4">
              {activityFeed.slice(0, 5).map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 animate-fade-in"
                  style={{ animationDelay: `${600 + index * 60}ms` }}
                >
                  <div
                    className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full"
                    style={{
                      backgroundColor: activityIconBgColors[item.type],
                    }}
                  >
                    {(() => {
                      const Icon = activityIcons[item.type];
                      return (
                        <Icon
                          size={14}
                          style={{ color: activityIconColors[item.type] }}
                        />
                      );
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] leading-snug">
                      {item.message}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-[var(--text-muted)]">
                    {(() => {
                      const d = formatDistanceToNow(new Date(item.timestamp), { addSuffix: false });
                      return d
                        .replace("about ", "")
                        .replace("less than a minute ago", "just now")
                        .replace(/ minutes? ago/, "m ago")
                        .replace(/ hours? ago/, "h ago")
                        .replace(/ days? ago/, "d ago")
                        .replace(/ weeks? ago/, "w ago")
                        .replace(/ months? ago/, "mo ago");
                    })()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              {t("noRecentActivity")}
            </p>
          )}

          {activityFeed.length > 5 && (
            <button className="mt-4 text-sm text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors">
              {t("showMore")}
            </button>
          )}
        </div>
      </section>

      {/* Restyling Modal */}
      <RestylingModal open={showRestylingModal} onOpenChange={setShowRestylingModal} />
    </div>
  );
}

// ============================================
// Quick Action Card
// ============================================

interface QuickActionCardProps {
  icon: typeof Sparkles;
  title: string;
  description: string;
  iconBgColor: string;
  iconColor: string;
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
  featured?: boolean;
  index: number;
}

function QuickActionCard({
  icon: Icon,
  title,
  description,
  iconBgColor,
  iconColor,
  href,
  disabled = false,
  onClick,
  featured = false,
  index,
}: QuickActionCardProps) {
  const t = useTranslations("common");
  const content = (
    <div
      className={cn(
        "animate-fade-in group h-full rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4 transition-all duration-250 sm:p-5",
        featured && "border-[var(--accent-mint)]/40 bg-[linear-gradient(135deg,rgba(47,182,125,0.1),rgba(255,255,255,0)_48%)]",
        !disabled &&
          "hover:border-[var(--border-medium)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      style={{ animationDelay: `${250 + index * 60}ms` }}
      onClick={onClick}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-transform duration-250 group-hover:scale-105"
          style={{ backgroundColor: iconBgColor }}
        >
          <Icon size={20} style={{ color: iconColor }} />
        </div>
        {!disabled && (
          <ArrowRight
            size={16}
            className="shrink-0 text-[var(--text-muted)] opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
            aria-hidden="true"
          />
        )}
      </div>
      <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
        {title}
      </h3>
      <p className="text-[13px] text-[var(--text-secondary)] leading-snug line-clamp-2">
        {description}
      </p>
    </div>
  );

  if (disabled) {
    return (
      <div title={t("comingSoon")} className={cn("h-full", featured && "sm:col-span-2 lg:col-span-1")}>
        {content}
      </div>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn("block h-full text-left", featured && "sm:col-span-2 lg:col-span-1")}
      >
        {content}
      </button>
    );
  }

  return (
    <Link href={href ?? "#"} className={cn("block h-full", featured && "sm:col-span-2 lg:col-span-1")}>
      {content}
    </Link>
  );
}

// ============================================
// Credit Alert Banner
// ============================================

function CreditAlertBanner() {
  const { data: billing } = useBillingStatus();
  const subscription = billing?.subscription;
  const isTrialing = subscription?.status === "trialing";
  const isActive = subscription?.status === "active";
  const hasPlan = isActive || isTrialing;
  const balance = billing?.creditBalance ?? 0;
  const lowCredits = balance <= 10 && hasPlan;
  const noPlan = !hasPlan;

  if (!lowCredits && !noPlan) return null;

  return (
    <div
      className={cn(
        "rounded-lg border px-5 py-4 text-sm flex items-center justify-between gap-4 animate-fade-in",
        noPlan
          ? "border-[var(--accent-mint)]/30 bg-[var(--accent-mint)]/10 text-[var(--accent-mint)]"
          : "border-[var(--status-amber-bg)] bg-[var(--status-amber-bg)]/30 text-[var(--status-amber-text)]"
      )}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} />
        <span>
          {noPlan
            ? "Você ainda não tem um plano ativo. Comece seu trial gratuito de 14 dias."
            : `Você está com poucos créditos (${balance} restantes). Considere fazer um upgrade de plano.`}
        </span>
      </div>
      <Link
        href="/settings"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all",
          noPlan
            ? "bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)]"
            : "bg-[var(--status-amber-text)] text-white hover:opacity-90"
        )}
      >
        {noPlan ? "Começar trial" : "Fazer upgrade"}
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}

// ============================================
// Campaign Row
// ============================================

function CampaignRow({ campaign }: { campaign: UiCampaign }) {
  return (
    <div
      className={cn(
        "group grid grid-cols-1 sm:grid-cols-[1fr_100px_80px_100px_80px_48px] gap-2 sm:gap-4 px-4 sm:px-6 py-3 items-center",
        "transition-colors duration-150 hover:bg-[var(--surface-raised)] cursor-pointer"
      )}
    >
      {/* Campaign name + platforms */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {campaign.name}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            {campaign.platforms.map((platform) => {
              const colors = platformColors[platform as keyof typeof platformColors] ?? fallbackPlatformColors;
              return (
                <span
                  key={platform}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: colors.bg,
                    color: colors.text,
                  }}
                >
                  {platform}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="flex justify-center">
        <StatusBadge status={campaign.status} />
      </div>

      {/* Variations */}
      <div className="text-center text-sm text-[var(--text-secondary)]">
        {campaign.variations > 0 ? campaign.variations : "—"}
      </div>

      {/* Last modified */}
      <div className="text-center text-[13px] text-[var(--text-muted)]">
        {(() => {
          const d = formatDistanceToNow(campaign.lastModified, { addSuffix: false });
          return d
            .replace("about ", "")
            .replace("less than a minute ago", "just now")
            .replace(/ minutes? ago/, "m ago")
            .replace(/ hours? ago/, "h ago")
            .replace(/ days? ago/, "d ago")
            .replace(/ weeks? ago/, "w ago")
            .replace(/ months? ago/, "mo ago");
        })()}
      </div>

      {/* Credits */}
      <div className="text-right text-sm text-[var(--text-secondary)]">
        {campaign.creditsUsed > 0 ? `${campaign.creditsUsed}` : "—"}
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <button
          className={cn(
            "flex items-center justify-center h-8 w-8 rounded-md",
            "text-[var(--text-muted)] opacity-0 group-hover:opacity-100",
            "hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
            "transition-all duration-200"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    </div>

  );
}
