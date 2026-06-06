"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  FlaskConical,
  Lock,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useMissions } from "@/lib/hooks/use-missions";
import { useMissionInsightOptional } from "@/components/mission-insights/MissionInsightProvider";
import { MissionCreditBanner } from "@/components/dashboard/MissionCreditBanner";
import type { MissionCreditContext, MissionItem, MissionKey } from "@/lib/progression/missions/types";

function MissionStatusIcon({ status }: { status: MissionItem["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={16} className="text-[var(--accent-green)] shrink-0" aria-hidden="true" />;
    case "active":
      return <Sparkles size={16} className="text-[var(--accent-green)] shrink-0" aria-hidden="true" />;
    case "blocked":
      return <Lock size={16} className="text-[var(--text-muted)] shrink-0" aria-hidden="true" />;
    default:
      return <Circle size={16} className="text-[var(--text-muted)] shrink-0" aria-hidden="true" />;
  }
}

export default function MissionPathCard() {
  const t = useTranslations("dashboard.missions");
  const missionInsight = useMissionInsightOptional();
  const { data, isLoading, isError, refetch, isFetching } = useMissions();
  const [expanded, setExpanded] = useState(false);

  const handleSkipMission = (missionKey: MissionKey) => {
    missionInsight?.maybePromptMissionInsight({
      moment: "mission_skipped",
      missionKey,
      diagnosticContext: { skippedMissionKey: missionKey, operation: "mission_skip" },
    });
  };

  if (isLoading && !data) {
    return (
      <div className="glass-card rounded-xl overflow-hidden mt-4" aria-busy="true">
        <div className="px-5 py-4 border-b border-[var(--border-dim)]">
          <div className="h-4 w-48 bg-[var(--surface-raised)] rounded animate-pulse" />
        </div>
        <div className="p-5 space-y-3">
          <div className="h-10 w-full bg-[var(--surface-raised)] rounded-lg animate-pulse" />
          <div className="h-16 w-full bg-[var(--surface-raised)] rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="glass-card rounded-xl overflow-hidden mt-4">
        <div className="px-5 py-4 border-b border-[var(--border-dim)] flex items-center gap-2">
          <FlaskConical size={16} className="text-[var(--accent-green)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("title")}</h2>
        </div>
        <div className="p-5 flex items-start gap-3">
          <AlertCircle size={18} className="text-[var(--accent-rose)] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">{t("error")}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[var(--accent-green-dark)] hover:text-[var(--accent-green)] transition-colors"
            >
              <RefreshCw size={14} aria-hidden="true" />
              {t("retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    missions,
    activeMissionKey,
    completedCount,
    totalCount,
    progressPercent,
    creditContext,
  } = data;
  const activeMission = missions.find((mission) => mission.key === activeMissionKey);
  const allComplete = completedCount === totalCount;

  return (
    <div className="glass-card rounded-xl overflow-hidden mt-4">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-dim)]">
        <div className="flex items-center gap-2">
          <FlaskConical size={16} className="text-[var(--accent-green)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("title")}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-[var(--text-muted)]">
            {t("progressCount", { completed: completedCount, total: totalCount })}
          </span>
          {isFetching ? <span className="sr-only">{t("updating")}</span> : null}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-[var(--accent-green-dark)] hover:text-[var(--accent-green)] transition-colors"
            aria-expanded={expanded}
            aria-controls="mission-path-list"
          >
            {expanded ? t("collapse") : t("expand")}
            {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
              {t("pathLabel")}
            </span>
            <span className="text-xs font-mono font-bold text-[var(--accent-green)]">
              {progressPercent}%
            </span>
          </div>
          <div
            className="h-2 rounded-full bg-[var(--surface-raised)] overflow-hidden"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("progressAria", { percent: progressPercent })}
          >
            <div
              className="h-full rounded-full bg-[var(--accent-green)] transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {allComplete ? (
          <div className="rounded-lg border border-[var(--accent-green)]/30 bg-[var(--accent-green)]/5 p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{t("allCompleteTitle")}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">{t("allCompleteDescription")}</p>
          </div>
        ) : activeMission ? (
          <ActiveMissionPanel
            mission={activeMission}
            creditContext={creditContext}
            t={t}
            onSkip={handleSkipMission}
          />
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">{t("empty")}</p>
        )}

        {expanded ? (
          <ul id="mission-path-list" className="space-y-2 pt-2 border-t border-[var(--border-dim)]">
            {missions.map((mission) => (
              <MissionListItem key={mission.key} mission={mission} t={t} />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function ActiveMissionPanel({
  mission,
  creditContext,
  t,
  onSkip,
}: {
  mission: MissionItem;
  creditContext?: MissionCreditContext;
  t: ReturnType<typeof useTranslations<"dashboard.missions">>;
  onSkip: (missionKey: MissionKey) => void;
}) {
  const label = t(`items.${mission.key}.label`);
  const description = t(`items.${mission.key}.description`);
  const ctaDisabled = mission.status === "blocked";

  return (
    <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--deep-bg)] p-4">
      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-1">
        {t("activeMission")}
      </p>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
      <p className="text-xs text-[var(--text-secondary)] mt-1">{description}</p>
      {mission.blockedReason ? (
        <p className="text-xs text-[var(--accent-rose)] mt-2 flex items-start gap-1.5">
          <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
          {mission.blockedReason}
        </p>
      ) : null}

      <MissionCreditBanner credit={mission.credit} creditContext={creditContext} />

      {ctaDisabled ? (
        <span
          className={cn(
            "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[var(--border-dim)] px-4 py-2.5 text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]"
          )}
        >
          {t("blockedCta")}
        </span>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href={mission.href}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-[var(--accent-green)]/40 bg-[var(--accent-green)]/10 px-4 py-2.5 text-xs font-mono uppercase tracking-wider text-[var(--accent-green-text)] hover:bg-[var(--accent-green)]/20 transition-colors"
          >
            {t("cta")}
          </Link>
          <button
            type="button"
            onClick={() => onSkip(mission.key)}
            className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            {t("skipMission")}
          </button>
        </div>
      )}
    </div>
  );
}

function MissionListItem({
  mission,
  t,
}: {
  mission: MissionItem;
  t: ReturnType<typeof useTranslations<"dashboard.missions">>;
}) {
  const label = t(`items.${mission.key}.label`);
  const description = t(`items.${mission.key}.description`);

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-3",
        mission.status === "active"
          ? "border-[var(--accent-green)]/40 bg-[var(--accent-green)]/5"
          : "border-[var(--border-dim)] bg-[var(--deep-bg)]",
        mission.status === "completed" && "opacity-80"
      )}
    >
      <MissionStatusIcon status={mission.status} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{description}</p>
        {mission.status === "blocked" && mission.blockedReason ? (
          <p className="text-xs text-[var(--accent-rose)] mt-1">{mission.blockedReason}</p>
        ) : null}
      </div>
      {mission.status === "active" || mission.status === "upcoming" ? (
        <Link
          href={mission.href}
          className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-[var(--accent-green-dark)] hover:text-[var(--accent-green)]"
        >
          {t("resume")}
        </Link>
      ) : null}
      {mission.status === "completed" ? (
        <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-[var(--accent-green)]">
          {t("done")}
        </span>
      ) : null}
    </li>
  );
}

export type { MissionKey };
