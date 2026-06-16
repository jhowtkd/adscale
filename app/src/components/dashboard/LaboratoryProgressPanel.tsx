"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
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
import Panel from "@/components/layout/Panel";
import { useProgression } from "@/lib/hooks/use-progression";
import { useMissions } from "@/lib/hooks/use-missions";
import { useMissionInsightOptional } from "@/components/mission-insights/MissionInsightProvider";
import { MissionCreditBanner } from "@/components/dashboard/MissionCreditBanner";
import type { MissionCreditContext, MissionItem, MissionKey } from "@/lib/progression/missions/types";

function MissionStatusIcon({ status }: { status: MissionItem["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={16} className="shrink-0 text-[var(--accent-green)]" aria-hidden="true" />;
    case "active":
      return <Sparkles size={16} className="shrink-0 text-[var(--accent-green)]" aria-hidden="true" />;
    case "blocked":
      return <Lock size={16} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />;
    default:
      return <Circle size={16} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />;
  }
}

export default function LaboratoryProgressPanel() {
  const t = useTranslations("dashboard.laboratory");
  const tMissions = useTranslations("dashboard.missions");
  const missionInsight = useMissionInsightOptional();
  const progression = useProgression();
  const missions = useMissions();
  const [expanded, setExpanded] = useState(false);

  const isLoading = (progression.isLoading && !progression.data) || (missions.isLoading && !missions.data);
  const isError =
    (progression.isError && !progression.data) || (missions.isError && !missions.data);
  const isFetching = progression.isFetching || missions.isFetching;

  const handleSkipMission = (missionKey: MissionKey) => {
    missionInsight?.maybePromptMissionInsight({
      moment: "mission_skipped",
      missionKey,
      diagnosticContext: { skippedMissionKey: missionKey, operation: "mission_skip" },
    });
  };

  if (isLoading) {
    return (
      <div aria-busy="true">
        <Panel padding="none">
          <div className="border-b border-[var(--border-dim)] px-5 py-4">
            <div className="h-4 w-48 animate-pulse rounded bg-[var(--surface-raised)]" />
          </div>
          <div className="space-y-3 p-5">
            <div className="h-2 w-full animate-pulse rounded-full bg-[var(--surface-raised)]" />
            <div className="h-16 w-full animate-pulse rounded-lg bg-[var(--surface-raised)]" />
            <div className="h-10 max-w-sm animate-pulse rounded-lg bg-[var(--surface-raised)]" />
          </div>
        </Panel>
      </div>
    );
  }

  if (isError) {
    return (
      <Panel padding="none">
        <div className="flex items-center gap-2 border-b border-[var(--border-dim)] px-5 py-4">
          <FlaskConical size={16} className="text-[var(--accent-green)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("title")}</h2>
        </div>
        <div className="flex items-start gap-3 p-5">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-[var(--accent-rose)]" aria-hidden="true" />
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">{t("error")}</p>
            <button
              type="button"
              onClick={() => {
                void progression.refetch();
                void missions.refetch();
              }}
              className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[var(--accent-green-dark)] transition-colors hover:text-[var(--accent-green)]"
            >
              <RefreshCw size={14} aria-hidden="true" />
              {t("retry")}
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  const progressionData = progression.data;
  const missionsData = missions.data;
  if (!progressionData || !missionsData) return null;

  const {
    missions: missionItems,
    activeMissionKey,
    completedCount,
    totalCount,
    progressPercent,
    creditContext,
  } = missionsData;
  const activeMission = missionItems.find((mission) => mission.key === activeMissionKey);
  const allComplete = completedCount === totalCount;
  const currentStep = allComplete ? totalCount : completedCount + 1;

  return (
    <Panel padding="none">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-dim)] px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <FlaskConical size={16} className="shrink-0 text-[var(--accent-green)]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("title")}</h2>
          {isFetching ? <span className="sr-only">{t("updating")}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]">
            {progressionData.level.shortLabel}
          </span>
          <span className="text-xs font-mono text-[var(--text-muted)]">
            {tMissions("progressCount", { completed: completedCount, total: totalCount })}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-xs text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">{progressionData.level.label}</span>
          {" — "}
          {progressionData.level.description}
        </p>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
              {t("stepLabel", { current: currentStep, total: totalCount })}
            </span>
            <span className="text-xs font-mono font-bold text-[var(--accent-green)]">{progressPercent}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-[var(--surface-raised)]"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={tMissions("progressAria", { percent: progressPercent })}
          >
            <div
              className="h-full rounded-full bg-[var(--accent-green)] transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {allComplete ? (
          <div className="rounded-lg border border-[var(--accent-green)]/30 bg-[var(--accent-green)]/5 p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{tMissions("allCompleteTitle")}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{tMissions("allCompleteDescription")}</p>
          </div>
        ) : activeMission ? (
          <ActiveStep
            mission={activeMission}
            creditContext={creditContext}
            whatToDoLabel={t("whatToDoNow")}
            ctaLabel={tMissions("cta")}
            blockedCtaLabel={tMissions("blockedCta")}
            blockedCtaHint={tMissions("blockedCtaHint")}
            skipLabel={tMissions("skipMission")}
            tMissions={tMissions}
            onSkip={handleSkipMission}
          />
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">{tMissions("empty")}</p>
        )}

        <div className="border-t border-[var(--border-dim)] pt-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-[var(--accent-green-dark)] transition-colors hover:text-[var(--accent-green)]"
            aria-expanded={expanded}
            aria-controls="laboratory-mission-list"
          >
            {expanded ? tMissions("collapse") : tMissions("expand")}
            {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>
          {expanded ? (
            <ul id="laboratory-mission-list" className="mt-3 space-y-2">
              {missionItems.map((mission) => (
                <MissionListItem key={mission.key} mission={mission} t={tMissions} />
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

function ActiveStep({
  mission,
  creditContext,
  whatToDoLabel,
  ctaLabel,
  blockedCtaLabel,
  blockedCtaHint,
  skipLabel,
  tMissions,
  onSkip,
}: {
  mission: MissionItem;
  creditContext?: MissionCreditContext;
  whatToDoLabel: string;
  ctaLabel: string;
  blockedCtaLabel: string;
  blockedCtaHint: string;
  skipLabel: string;
  tMissions: ReturnType<typeof useTranslations<"dashboard.missions">>;
  onSkip: (missionKey: MissionKey) => void;
}) {
  const label = tMissions(`items.${mission.key}.label`);
  const description = tMissions(`items.${mission.key}.description`);
  const ctaDisabled = mission.status === "blocked";

  return (
    <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)]/40 p-4">
      <p className="mb-1 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
        {whatToDoLabel}
      </p>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{description}</p>
      {mission.blockedReason ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--accent-rose)]">
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {mission.blockedReason}
        </p>
      ) : null}

      <MissionCreditBanner credit={mission.credit} creditContext={creditContext} />

      {ctaDisabled ? (
        <div className="mt-4 space-y-2">
          <span className="inline-flex max-w-sm items-center justify-center rounded-lg border border-[var(--border-dim)] px-4 py-2.5 text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
            {mission.blockedReason ?? blockedCtaLabel}
          </span>
          {mission.blockedReason ? (
            <p className="text-[10px] text-[var(--text-muted)]">{blockedCtaHint}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={mission.href}
            className="inline-flex max-w-sm items-center justify-center gap-2 rounded-lg bg-[var(--accent-green)] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--accent-green-on-fill)] transition-colors hover:bg-[var(--accent-green-light)]"
          >
            {ctaLabel}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => onSkip(mission.key)}
            className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
          >
            {skipLabel}
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
        "flex items-start gap-3 rounded-lg border px-3 py-2.5",
        mission.status === "active"
          ? "border-[var(--accent-green)]/40 bg-[var(--accent-green)]/5"
          : "border-[var(--border-dim)] bg-[var(--deep-bg)]",
        mission.status === "completed" && "opacity-80",
      )}
    >
      <MissionStatusIcon status={mission.status} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{description}</p>
        {mission.status === "blocked" && mission.blockedReason ? (
          <p className="mt-1 text-xs text-[var(--accent-rose)]">{mission.blockedReason}</p>
        ) : null}
      </div>
      {mission.status === "blocked" ? (
        <Link
          href={mission.href}
          className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-[var(--accent-green-dark)] hover:text-[var(--accent-green)]"
        >
          {t(`blockedResume.${mission.key}`, { defaultValue: t("blockedResume.default") })}
        </Link>
      ) : null}
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
