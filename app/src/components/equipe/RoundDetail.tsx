// Q2 · Score a calibration angle (#554): the evaluated attempt with
// reviewer findings, the F/M/U/E rubric, the round state per item, and
// the quality actions — return for fix, release, critical failure,
// rejection classification, and round close.

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import { MIN_ATTEMPT_SCORE, MIN_DIMENSION_SCORE } from "@/server/equipe/domain/round";
import { cn } from "@/lib/utils";
import { STAFF_ROLE_FOR_COMMAND, useStaffCommand, staffFetchJson } from "./staff-api";
import {
  StaffEmpty,
  StaffErrorAlert,
  StaffLoading,
  accountDisplayName,
  shortAccountId,
} from "./staff-ui";
import { enumLabel } from "./labels";
import RoundItemPanel from "./RoundItemPanel";
import type { RoundDetailView } from "./types";

export default function RoundDetail({
  roundId,
  workspaceId,
  accountId,
}: {
  roundId: string;
  workspaceId: string;
  accountId: string;
}) {
  const t = useTranslations("equipe.round");
  const tQuality = useTranslations("equipe.quality");
  const tCommon = useTranslations("equipe.common");
  const tLabels = useTranslations("equipe.labels");
  const [angleIndex, setAngleIndex] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const closeCommand = useStaffCommand();

  // The scope resolves on the server from the id; queue links still
  // carry it as a hint, notification links carry nothing.
  const scopeQuery =
    workspaceId.length > 0 && accountId.length > 0
      ? `?workspaceId=${encodeURIComponent(workspaceId)}&accountId=${encodeURIComponent(accountId)}`
      : "";
  const query = useQuery({
    queryKey: ["equipe-staff-round", workspaceId, accountId, roundId],
    queryFn: () =>
      staffFetchJson<RoundDetailView>(`/api/equipe/staff/rounds/${roundId}${scopeQuery}`),
    retry: false,
  });

  const view = query.data;
  const items = view?.items ?? [];
  const selected = items[Math.min(angleIndex, Math.max(items.length - 1, 0))] ?? null;

  async function closeRound() {
    if (!view) return;
    setNotice(null);
    try {
      await closeCommand.mutateAsync({
        type: "close_round",
        payload: { roundId: view.round.id },
        role: STAFF_ROLE_FOR_COMMAND.close_round,
        workspaceId: view.workspaceId,
        accountId: view.accountId,
      });
      setNotice(t("closeDone"));
      void query.refetch();
    } catch {
      // Surfaced below through closeCommand.error.
    }
  }

  return (
    <PageFrame width="operational" className="min-w-0 space-y-6 py-8">
      <PageHeader
        title={
          view
            ? tQuality("roundLabel", {
                sequence: view.round.sequence,
                weekKey: view.round.weekKey,
              })
            : tQuality("title")
        }
        description={
          view
            ? [
                accountDisplayName(
                  view,
                  tCommon("account", { id: shortAccountId(view.accountId) }),
                ),
                view.front ? enumLabel(tLabels, `frontKey.${view.front.key}`) : null,
                view.batch?.title ?? null,
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        meta={
          view ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">
                {enumLabel(tLabels, `roundStatus.${view.round.status}`)}
              </Badge>
              {view.front ? (
                <Badge variant="neutral">
                  {enumLabel(tLabels, `frontStatus.${view.front.status}`)} ·{" "}
                  {view.front.calibrationSequence}/3
                </Badge>
              ) : null}
            </span>
          ) : undefined
        }
        actions={
          view?.round.status === "open" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={closeCommand.isPending}
              onClick={() => void closeRound()}
            >
              {t("closeSubmit")}
            </Button>
          ) : undefined
        }
      />

      {query.isLoading ? <StaffLoading label={tCommon("loading")} /> : null}
      {query.error ? (
        <StaffErrorAlert error={query.error} onRetry={() => void query.refetch()} />
      ) : null}

      {view ? (
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-muted)]">
            {t("cutoff", { cut: MIN_ATTEMPT_SCORE, min: MIN_DIMENSION_SCORE })} · {t("closeHint")}
          </p>
          {items.length === 0 ? (
            <StaffEmpty label={t("noItems")} />
          ) : (
            <>
              <div role="tablist" aria-label={t("evaluatedAttempt")} className="flex flex-wrap gap-1">
                {items.map((item, index) => (
                  <button
                    key={item.item.id}
                    type="button"
                    role="tab"
                    aria-selected={selected?.item.id === item.item.id}
                    onClick={() => setAngleIndex(index)}
                    className={cn(
                      "grid size-9 place-items-center rounded-md border text-sm font-medium",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                      selected?.item.id === item.item.id
                        ? "border-[var(--action-primary-bg)] bg-[var(--action-primary-bg)] text-[var(--action-primary-text)]"
                        : "border-[var(--border-dim)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              {selected ? (
                <RoundItemPanel
                  key={selected.item.id}
                  roundId={view.round.id}
                  workspaceId={view.workspaceId}
                  accountId={view.accountId}
                  detail={selected}
                  position={{ current: items.indexOf(selected) + 1, total: items.length }}
                  onChanged={() => void query.refetch()}
                />
              ) : null}
            </>
          )}
          {view.round.status === "closed" && view.summary != null ? (
            <details className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)]">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-[var(--text-primary)]">
                {t("summaryTitle")}
              </summary>
              <pre className="overflow-x-auto border-t border-[var(--border-dim)] px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                {JSON.stringify(view.summary, null, 2)}
              </pre>
            </details>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm text-[var(--success-text)]">
              {notice}
            </p>
          ) : null}
          {closeCommand.error ? <StaffErrorAlert error={closeCommand.error} /> : null}
        </div>
      ) : null}
    </PageFrame>
  );
}
