// I3 · Quality pipeline (#554): calibration rounds by state — open to
// score first, then recently closed. Quality role only; anyone else gets
// the API's 403 in plain language.

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import { staffFetchJson } from "./staff-api";
import {
  StaffEmpty,
  StaffErrorAlert,
  StaffLoading,
  shortAccountId,
} from "./staff-ui";
import { enumLabel } from "./labels";
import EquipeViewToggle from "./EquipeViewToggle";
import type { QualityPipelineEntryView, QualityPipelineView } from "./types";

export default function QualityPipeline() {
  const t = useTranslations("equipe.quality");
  const tCommon = useTranslations("equipe.common");
  const query = useQuery({
    queryKey: ["equipe-staff-quality"],
    queryFn: () => staffFetchJson<QualityPipelineView>("/api/equipe/staff/quality"),
    retry: false,
  });

  return (
    <PageFrame width="operational" className="min-w-0 space-y-6 py-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<EquipeViewToggle active="quality" />}
      />
      {query.isLoading ? <StaffLoading label={tCommon("loading")} /> : null}
      {query.error ? (
        <StaffErrorAlert error={query.error} onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? (
        <div className="grid gap-6">
          <RoundSection
            title={t("openTitle")}
            entries={query.data.open}
            emptyLabel={t("emptyOpen")}
            actionLabel={t("scoreRound")}
          />
          <RoundSection
            title={t("closedTitle")}
            entries={query.data.recentlyClosed}
            emptyLabel={t("emptyClosed")}
            actionLabel={t("viewRound")}
          />
        </div>
      ) : null}
    </PageFrame>
  );
}

function RoundSection({
  title,
  entries,
  emptyLabel,
  actionLabel,
}: {
  title: string;
  entries: QualityPipelineEntryView[];
  emptyLabel: string;
  actionLabel: string;
}) {
  const t = useTranslations("equipe.quality");
  const tLabels = useTranslations("equipe.labels");
  const tCommon = useTranslations("equipe.common");
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-[var(--text-primary)]">
        {title} · {entries.length}
      </h2>
      {entries.length === 0 ? (
        <StaffEmpty label={emptyLabel} />
      ) : (
        <ul className="grid gap-2">
          {entries.map((entry) => (
            <li
              key={entry.roundId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {t("roundLabel", { sequence: entry.sequence, weekKey: entry.weekKey })}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span>{tCommon("account", { id: shortAccountId(entry.accountId) })}</span>
                  <Badge variant="neutral">
                    {enumLabel(tLabels, `roundStatus.${entry.status}`)}
                  </Badge>
                  {entry.outcome ? (
                    <Badge variant={entry.outcome === "passed" ? "success" : "warning"}>
                      {enumLabel(tLabels, `roundOutcome.${entry.outcome}`)}
                    </Badge>
                  ) : null}
                </p>
              </div>
              <Link
                href={`/admin/equipe/quality/rounds/${entry.roundId}?workspaceId=${entry.workspaceId}&accountId=${entry.accountId}`}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] px-4 text-sm font-medium text-[var(--text-primary)] hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                {actionLabel}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
