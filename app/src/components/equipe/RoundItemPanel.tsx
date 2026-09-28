// One round item (angle): attempt, rubric, state, and quality actions.

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  settingsFieldClass,
  settingsTextareaClass,
} from "@/components/settings/settings-chrome";
import { MIN_DIMENSION_SCORE } from "@/server/equipe/domain/round";
import { STAFF_ROLE_FOR_COMMAND, useStaffCommand } from "./staff-api";
import { StaffErrorAlert } from "./staff-ui";
import { enumLabel } from "./labels";
import type { RoundDetailItemView, RubricView } from "./types";

const DIMENSIONS = ["facts", "brand", "usefulness", "execution"] as const;
const CLASSIFICATIONS = ["fact", "brand", "taste"] as const;

function parseRubric(value: unknown): RubricView | null {
  if (typeof value !== "object" || value === null) return null;
  const rubric = value as Record<string, unknown>;
  for (const dimension of DIMENSIONS) {
    const score = rubric[dimension];
    if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 4) {
      return null;
    }
  }
  return {
    facts: rubric.facts as number,
    brand: rubric.brand as number,
    usefulness: rubric.usefulness as number,
    execution: rubric.execution as number,
  };
}

function rubricTotal(rubric: RubricView): number {
  return rubric.facts + rubric.brand + rubric.usefulness + rubric.execution;
}

function rubricMin(rubric: RubricView): number {
  return Math.min(rubric.facts, rubric.brand, rubric.usefulness, rubric.execution);
}

function isFailingCategory(category: string): boolean {
  return category === "fact" || category === "brand";
}

export default function RoundItemPanel({
  roundId,
  workspaceId,
  accountId,
  detail,
  position,
  onChanged,
}: {
  roundId: string;
  workspaceId: string;
  accountId: string;
  detail: RoundDetailItemView;
  position: { current: number; total: number };
  onChanged: () => void;
}) {
  const t = useTranslations("equipe.round");
  const tLabels = useTranslations("equipe.labels");
  const [scores, setScores] = useState<Record<(typeof DIMENSIONS)[number], number>>({
    facts: 0,
    brand: 0,
    usefulness: 0,
    execution: 0,
  });
  const [feedback, setFeedback] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [criticalReason, setCriticalReason] = useState("");
  const [classifyTo, setClassifyTo] = useState<(typeof CLASSIFICATIONS)[number]>("taste");
  const [evidence, setEvidence] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const command = useStaffCommand();
  const busy = command.isPending;
  const scope = {
    role: STAFF_ROLE_FOR_COMMAND.score_attempt,
    workspaceId,
    accountId,
  };

  async function run(type: string, payload: Record<string, unknown>, doneMessage: string) {
    setNotice(null);
    try {
      await command.mutateAsync({ type, payload, ...scope });
      setNotice(doneMessage);
      onChanged();
      return true;
    } catch {
      return false;
    }
  }

  const { item, evaluatedAttempt, score, quality, client } = detail;
  const storedRubric = score ? parseRubric(score.rubric) : null;
  const correctedAfterReturn =
    quality.returned !== null &&
    item.currentVersionHash !== null &&
    item.currentVersionHash !== quality.returned.versionHash;
  const releaseBlockedByScore =
    storedRubric !== null &&
    rubricMin(storedRubric) < MIN_DIMENSION_SCORE &&
    !correctedAfterReturn;
  const releasedCurrent =
    quality.released !== null && quality.released.versionHash === item.currentVersionHash;
  const classifyFrom = client.effectiveCategory ?? client.clientCategory;
  const loosening =
    classifyFrom !== null && isFailingCategory(classifyFrom) && classifyTo === "taste";

  return (
    <article className="space-y-5 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-4">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
        {t("angleLabel", { current: position.current, total: position.total })}
      </h2>

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {t("evaluatedAttempt")}
        </h3>
        {evaluatedAttempt ? (
          <div className="space-y-1 text-sm">
            <p className="whitespace-pre-wrap text-[var(--text-primary)]">
              {evaluatedAttempt.caption || "—"}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              {evaluatedAttempt.authorRole} ·{" "}
              {t("versionCount", { count: detail.versions.length })}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">{t("noItems")}</p>
        )}
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-[var(--text-secondary)]">
            {t("reviewerFindings")}
          </h4>
          <ReviewerFindings value={evaluatedAttempt?.reviewerFindings ?? null} />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {t("rubricTitle")}
        </h3>
        {storedRubric ? (
          <div className="space-y-1">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DIMENSIONS.map((dimension) => (
                <div
                  key={dimension}
                  className="rounded-md border border-[var(--border-dim)] px-3 py-2 text-center"
                >
                  <dt className="text-xs text-[var(--text-secondary)]">{t(dimension)}</dt>
                  <dd className="text-lg font-semibold text-[var(--text-primary)]">
                    {storedRubric[dimension]}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-[var(--text-secondary)]">
              {rubricTotal(storedRubric)}/16 ·{" "}
              {enumLabel(tLabels, `scoreVerdict.${score?.verdict ?? "fail"}`)}
            </p>
          </div>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                "score_attempt",
                {
                  roundId,
                  itemId: item.id,
                  ...scores,
                  ...(feedback.trim().length > 0 ? { feedback: feedback.trim() } : {}),
                },
                t("scoreDone"),
              );
            }}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DIMENSIONS.map((dimension) => (
                <label key={dimension} className="grid gap-1 text-sm">
                  <span className="text-[var(--text-secondary)]">{t(dimension)}</span>
                  <select
                    value={scores[dimension]}
                    onChange={(event) =>
                      setScores((current) => ({
                        ...current,
                        [dimension]: Number(event.target.value),
                      }))
                    }
                    disabled={busy}
                    className={settingsFieldClass}
                  >
                    {[0, 1, 2, 3, 4].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--text-secondary)]">{t("feedbackLabel")}</span>
              <textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={2}
                maxLength={2000}
                disabled={busy}
                className={settingsTextareaClass}
              />
            </label>
            <Button type="submit" size="sm" disabled={busy}>
              {t("scoreSubmit")}
            </Button>
          </form>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {t("qualityState")}
        </h3>
        <p className="flex flex-wrap gap-1">
          {quality.returned ? <Badge variant="warning">{t("stateReturned")}</Badge> : null}
          {quality.corrected ? <Badge variant="info">{t("stateCorrected")}</Badge> : null}
          {quality.released ? <Badge variant="success">{t("stateReleased")}</Badge> : null}
          {quality.critical ? <Badge variant="danger">{t("stateCritical")}</Badge> : null}
          {quality.withdrawn ? <Badge variant="neutral">{t("stateWithdrawn")}</Badge> : null}
          {quality.classification?.loosened ? (
            <Badge variant="warning">{t("stateLoosened")}</Badge>
          ) : null}
          {!quality.returned &&
          !quality.corrected &&
          !quality.released &&
          !quality.critical &&
          !quality.withdrawn &&
          !quality.classification ? (
            <span className="text-sm text-[var(--text-muted)]">—</span>
          ) : null}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          {t("clientSays")}: {enumLabel(tLabels, `clientVerdict.${client.verdict}`)}
          {client.clientCategory
            ? ` (${enumLabel(tLabels, `classification.${client.clientCategory}`)}${client.effectiveCategory && client.effectiveCategory !== client.clientCategory ? ` → ${enumLabel(tLabels, `classification.${client.effectiveCategory}`)}` : ""})`
            : ""}
        </p>
      </section>

      <section className="grid gap-4 border-t border-[var(--border-dim)] pt-4 md:grid-cols-2">
        {!quality.returned ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (returnNote.trim().length === 0) return;
              void run(
                "return_item_for_fix",
                { roundId, itemId: item.id, note: returnNote.trim() },
                t("returnDone"),
              ).then((done) => {
                if (done) setReturnNote("");
              });
            }}
          >
            <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("returnTitle")}</h3>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--text-secondary)]">{t("returnNote")}</span>
              <textarea
                value={returnNote}
                onChange={(event) => setReturnNote(event.target.value)}
                rows={2}
                maxLength={2000}
                required
                disabled={busy}
                className={settingsTextareaClass}
              />
            </label>
            <Button type="submit" variant="outline" size="sm" disabled={busy}>
              {t("returnSubmit")}
            </Button>
          </form>
        ) : null}

        {!releasedCurrent ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("releaseSubmit")}</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {t("releaseHint", { min: MIN_DIMENSION_SCORE })}
            </p>
            <Button
              type="button"
              size="sm"
              disabled={busy || releaseBlockedByScore}
              title={releaseBlockedByScore ? t("releaseHint", { min: MIN_DIMENSION_SCORE }) : undefined}
              onClick={() =>
                void run(
                  "release_item_to_client",
                  { roundId, itemId: item.id },
                  t("releaseDone"),
                )
              }
            >
              {t("releaseSubmit")}
            </Button>
          </div>
        ) : null}

        {!quality.critical ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (criticalReason.trim().length === 0) return;
              void run(
                "mark_critical_failure",
                { roundId, itemId: item.id, reason: criticalReason.trim() },
                t("criticalDone"),
              ).then((done) => {
                if (done) setCriticalReason("");
              });
            }}
          >
            <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("criticalTitle")}</h3>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--text-secondary)]">{t("criticalReason")}</span>
              <input
                value={criticalReason}
                onChange={(event) => setCriticalReason(event.target.value)}
                maxLength={2000}
                required
                disabled={busy}
                className={settingsFieldClass}
              />
            </label>
            <Button type="submit" variant="destructive" size="sm" disabled={busy}>
              {t("criticalSubmit")}
            </Button>
          </form>
        ) : null}

        {client.clientCategory ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                "classify_rejection",
                {
                  roundId,
                  itemId: item.id,
                  category: classifyTo,
                  ...(evidence.trim().length > 0 ? { evidence: evidence.trim() } : {}),
                },
                t("classifyDone"),
              ).then((done) => {
                if (done) setEvidence("");
              });
            }}
          >
            <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("classifyTitle")}</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              {t("classifyFrom")}:{" "}
              {classifyFrom ? enumLabel(tLabels, `classification.${classifyFrom}`) : "—"}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--text-secondary)]">{t("classifyTo")}</span>
                <select
                  value={classifyTo}
                  onChange={(event) =>
                    setClassifyTo(event.target.value as typeof classifyTo)
                  }
                  disabled={busy}
                  className={settingsFieldClass}
                >
                  {CLASSIFICATIONS.map((value) => (
                    <option key={value} value={value}>
                      {enumLabel(tLabels, `classification.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[var(--text-secondary)]">
                  {t("classifyEvidence")}
                  {loosening ? " *" : ""}
                </span>
                <input
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  maxLength={4000}
                  required={loosening}
                  disabled={busy}
                  className={settingsFieldClass}
                />
              </label>
            </div>
            <p className="text-xs text-[var(--text-muted)]">{t("classifyHint")}</p>
            <Button type="submit" variant="outline" size="sm" disabled={busy}>
              {t("classifySubmit")}
            </Button>
          </form>
        ) : null}
      </section>

      {notice ? (
        <p role="status" className="text-sm text-[var(--success-text)]">
          {notice}
        </p>
      ) : null}
      {command.error ? <StaffErrorAlert error={command.error} /> : null}
    </article>
  );
}

function ReviewerFindings({ value }: { value: unknown }) {
  const t = useTranslations("equipe.round");
  if (value === null || value === undefined) {
    return <p className="text-sm text-[var(--text-muted)]">{t("noFindings")}</p>;
  }
  if (typeof value === "string") {
    return <p className="text-sm text-[var(--text-primary)]">{value}</p>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-sm text-[var(--text-muted)]">{t("noFindings")}</p>;
    }
    return (
      <ul className="list-inside list-disc space-y-1 text-sm text-[var(--text-primary)]">
        {value.map((finding, index) => (
          <li key={index}>
            {typeof finding === "string" ? finding : JSON.stringify(finding)}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="font-mono text-xs text-[var(--text-secondary)]">{JSON.stringify(value)}</p>
  );
}
