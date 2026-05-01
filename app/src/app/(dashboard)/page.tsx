"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { platformColors } from "@/lib/mock-data";
import type { ActivityItem } from "@/lib/mock-data";
import type { UiCampaign } from "@/lib/hooks/use-campaigns";
import { useDashboard } from "@/lib/hooks/use-dashboard";
import { useCampaigns } from "@/lib/hooks/use-campaigns";
import StatsCard from "@/components/ui/StatsCard";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import RestylingModal from "@/components/workspace/RestylingModal";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  FolderOpen,
  Layers,
  Zap,
  Globe,
  Upload,
  BarChart3,
  ImageIcon,
  Users,
  ChevronRight,
  Sparkles,
  Download,
  AlertTriangle,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { useTranslations } from "next-intl";

// ============================================
// Animation Variants
// ============================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const rowVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.35, ease: [0.19, 1, 0.22, 1] as [number, number, number, number] },
  },
};

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

  const isLoading = isDashboardLoading || isCampaignsLoading;
  const [showRestylingModal, setShowRestylingModal] = useState(false);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ---- Welcome Banner ---- */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
        className="relative rounded-xl px-6 py-5 overflow-hidden"
      >
        {/* Subtle flat background */}
        <div className="absolute inset-0 bg-[var(--surface-raised)] rounded-xl" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
              {t("welcomeBack")}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {t("dashboardSubtitle")}
            </p>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
          >
            <Link
              href="/campaigns"
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-6 py-3 text-sm font-medium text-white",
                "bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-light)] hover:-translate-y-px",
                "active:scale-[0.98] transition-all duration-200",
                "hover:shadow-[0_4px_16px_rgba(47,182,125,0.2)]"
              )}
            >
              <Plus size={16} />
              {tc("new")}
            </Link>
          </motion.div>
        </div>
      </motion.section>

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
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.3 }}
        className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            {t("quickActions")}
          </h2>
          <span className="text-sm text-[var(--text-muted)] cursor-default">
            {t("viewAll")}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickActionCard
            icon={Upload}
            title={t("uploadCreative")}
            description={t("uploadCreativeDesc")}
            iconBgColor="var(--accent-mint-dim)"
            iconColor="var(--accent-mint)"
            href="/campaigns"
            index={0}
          />
          <QuickActionCard
            icon={Sparkles}
            title={t("restyling")}
            description={t("restylingDesc")}
            iconBgColor="var(--accent-mint-dim)"
            iconColor="var(--accent-mint)"
            href="#"
            onClick={() => setShowRestylingModal(true)}
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
            href="#"
            index={3}
          />
        </div>
      </motion.section>

      {/* ---- Recent Campaigns ---- */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.35 }}
        className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] overflow-hidden"
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
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="divide-y divide-[var(--border-dim)]"
          >
            {/* Table Header */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_100px_80px_100px_80px_48px] gap-4 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
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
          </motion.div>
        ) : (
          <EmptyState
            title={t("noCampaignsYet")}
            description={t("createFirstCampaign")}
            action={{ label: tc("new"), onClick: () => {} }}
          />
        )}
      </motion.section>

      {/* ---- Bottom Row: Credit Usage + Activity Feed ---- */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Credit Usage */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
          className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {t("creditUsage")}
            </h2>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-muted)]">
              {t("thisMonth")}
            </span>
          </div>

          {/* Chart placeholder */}
          <div className="h-[120px] mb-4 flex items-center justify-center rounded-lg bg-[var(--surface-raised)]">
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
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${creditPercent}%` }}
              transition={{ delay: 0.8, duration: 0.6, ease: [0.19, 1, 0.22, 1] }}
              className="h-full rounded-full gradient-progress"
            />
          </div>

          <button className="text-sm text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors">
            {t("upgradePlan")}
          </button>
        </motion.div>

        {/* Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.7,
            duration: 0.4,
            ease: [0.19, 1, 0.22, 1],
          }}
          className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-6"
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
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-4"
            >
              {activityFeed.slice(0, 5).map((item) => (
                <motion.div
                  key={item.id}
                  variants={rowVariants}
                  className="flex items-start gap-3"
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
                  <span className="flex-shrink-0 text-[11px] text-[var(--text-muted)]">
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
                </motion.div>
              ))}
            </motion.div>
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
        </motion.div>
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
  href: string;
  disabled?: boolean;
  onClick?: () => void;
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
  index,
}: QuickActionCardProps) {
  const t = useTranslations("common");
  const content = (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        delay: 0.45 + index * 0.06,
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1],
      }}
      whileHover={disabled ? {} : { y: -2 }}
      className={cn(
        "group rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-5 transition-all duration-250",
        !disabled &&
          "hover:border-[var(--border-medium)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      onClick={onClick}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-md mb-3 transition-transform duration-250 group-hover:scale-105"
        style={{ backgroundColor: iconBgColor }}
      >
        <Icon size={20} style={{ color: iconColor }} />
      </div>
      <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
        {title}
      </h3>
      <p className="text-[13px] text-[var(--text-secondary)] leading-snug line-clamp-2">
        {description}
      </p>
    </motion.div>
  );

  if (disabled) {
    return (
      <div title={t("comingSoon")}>
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}

// ============================================
// Campaign Row
// ============================================

function CampaignRow({ campaign }: { campaign: UiCampaign }) {
  return (
    <motion.div
      variants={rowVariants}
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
              const colors = platformColors[platform];
              return (
                <span
                  key={platform}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
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
    </motion.div>

  );
}
