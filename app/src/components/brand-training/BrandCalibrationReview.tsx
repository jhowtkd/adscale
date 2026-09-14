"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { studioChipClass } from "@/components/dashboard/studio-stage/StudioInstrument";
import {
  useBrandCalibration,
  useCalibrationCommand,
  usePublishBrandKnowledge,
  type BrandCalibrationExample,
} from "@/lib/hooks/use-brand-training";

const CALIBRATION_BASE_ROUNDS = 3;

/**
 * Client-side mirror of the server `canActivate` gate: it only enables the
 * activation button. The server revalidates the hash, the four persisted
 * outputs and the evidence inside the publish transaction.
 */
function roundActivatable(examples: BrandCalibrationExample[]): boolean {
  return (
    examples.length === 4 &&
    examples.every(
      (example) =>
        example.assessment.status === "completed" &&
        example.assessment.objective !== "fail" &&
        example.assessment.rating === "good" &&
        !example.assessment.needsHumanReview,
    )
  );
}

export function BrandCalibrationReview({ clientProfileId }: { clientProfileId: string }) {
  const t = useTranslations("brandTraining.knowledge");
  const calibration = useBrandCalibration(clientProfileId);
  const command = useCalibrationCommand(clientProfileId);
  const publish = usePublishBrandKnowledge(clientProfileId);

  if (calibration.isLoading) {
    return <div role="status" className="h-24 animate-pulse rounded-2xl bg-white/6" />;
  }
  const payload = calibration.data;
  if (!payload) return null;
  const { session, activeVersionId, quoteCredits, examples } = payload;
  const uncovered = payload.uncovered ?? [];
  const latest = session?.rounds[session.rounds.length - 1] ?? null;
  const totalRounds = CALIBRATION_BASE_ROUNDS + (session?.extensionCount ?? 0);
  const atCeiling = (session?.rounds.length ?? 0) >= totalRounds;
  const roundRunning = examples.some(
    (example) => example.assessment.status === "queued" || example.assessment.status === "processing",
  );
  const activatable =
    session !== null &&
    latest !== null &&
    session.candidate.hash === latest.candidate.hash &&
    roundActivatable(examples);
  const busy = command.isPending || publish.isPending;

  return (
    <section data-testid="brand-calibration-review" className="space-y-4" aria-label={t("calibrationTitle")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">{t("calibrationTitle")}</h3>
        {latest ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {t("calibrationRound", { current: latest.number, total: totalRounds })}
          </p>
        ) : null}
      </div>

      {!session ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">{t("calibrationNoSession")}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => command.mutate({ action: "create", expectedActiveVersionId: activeVersionId })}
            className={studioChipClass}
          >
            {t("calibrationConfirmSet")}
          </button>
        </div>
      ) : null}

      {session && !latest ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            {t("calibrationQuote", { credits: quoteCredits })}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              command.mutate({
                action: "start",
                sessionId: session.id,
                expectedRevision: session.revision,
                acceptedCredits: quoteCredits,
              })
            }
            className={studioChipClass}
          >
            {command.isPending ? t("calibrationStarting") : t("calibrationStart")}
          </button>
        </div>
      ) : null}

      {latest ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            {t("calibrationCoverage", { covered: latest.coverage.join(", ") || "—" })}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {t("calibrationUncovered", { uncovered: uncovered.join(", ") || "—" })}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {examples.map((example, slot) => (
              <li key={example.workItemId}>
                <CalibrationExampleItem
                  clientProfileId={clientProfileId}
                  sessionId={session!.id}
                  expectedRevision={session!.revision}
                  round={latest.number}
                  slot={slot}
                  example={example}
                  disabled={busy}
                />
              </li>
            ))}
          </ul>
          {roundRunning ? (
            <p role="status" className="text-sm text-[var(--text-secondary)]">
              {t("calibrationRunning")}
            </p>
          ) : null}
        </div>
      ) : null}

      {session && latest && !roundRunning && !atCeiling ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            {t("calibrationQuote", { credits: quoteCredits })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || activatable}
              onClick={() =>
                command.mutate({
                  action: "start",
                  sessionId: session.id,
                  expectedRevision: session.revision,
                  acceptedCredits: quoteCredits,
                })
              }
              className={studioChipClass}
            >
              {command.isPending ? t("calibrationStarting") : t("calibrationStart")}
            </button>
            <button
              type="button"
              disabled={!activatable || busy}
              onClick={() =>
                publish.mutate({
                  sessionId: session.id,
                  expectedRevision: session.revision,
                  candidateHash: latest.candidate.hash,
                })
              }
              className={studioChipClass}
            >
              {publish.isPending ? t("calibrationActivating") : t("calibrationActivate")}
            </button>
          </div>
          {!activatable ? (
            <p className="text-xs text-[var(--text-muted)]">{t("calibrationWaitingJudgement")}</p>
          ) : null}
        </div>
      ) : null}

      {session && latest && !roundRunning && atCeiling ? (
        <div className="space-y-3">
          <p role="status" className="text-sm font-medium text-[var(--text-primary)]">
            {t("calibrationPending")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!activatable || busy}
              onClick={() =>
                publish.mutate({
                  sessionId: session.id,
                  expectedRevision: session.revision,
                  candidateHash: latest.candidate.hash,
                })
              }
              className={studioChipClass}
            >
              {publish.isPending ? t("calibrationActivating") : t("calibrationActivate")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                command.mutate({ action: "extend", sessionId: session.id, expectedRevision: session.revision })
              }
              className={studioChipClass}
            >
              {t("calibrationExtend")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CalibrationExampleItem({
  clientProfileId,
  sessionId,
  expectedRevision,
  round,
  slot,
  example,
  disabled,
}: {
  clientProfileId: string;
  sessionId: string;
  expectedRevision: number;
  round: number;
  slot: number;
  example: BrandCalibrationExample;
  disabled: boolean;
}) {
  const t = useTranslations("brandTraining.knowledge");
  const command = useCalibrationCommand(clientProfileId);
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<"good" | "bad" | null>(example.assessment.rating);
  const { assessment } = example;
  const save = (next: "good" | "bad") => {
    setRating(next);
    command.mutate({
      action: "feedback",
      sessionId,
      expectedRevision,
      round,
      slot,
      rating: next,
      note,
      dimensions: [],
    });
  };

  return (
    <div className="space-y-2 rounded-[var(--radius-card)] bg-white/4 p-3">
      {example.previewUrl && assessment.status === "completed" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={example.previewUrl}
          alt={t("calibrationExample", { slot: slot + 1 })}
          className="aspect-[4/5] w-full rounded object-cover"
        />
      ) : (
        <div
          role={assessment.status === "failed" ? "alert" : "status"}
          className="flex aspect-[4/5] w-full items-center justify-center rounded bg-white/6 p-3 text-center text-xs text-[var(--text-muted)]"
        >
          {assessment.status === "failed" ? t("calibrationFailed") : t("calibrationRunning")}
        </div>
      )}
      <fieldset disabled={disabled || assessment.status !== "completed"}>
        <legend className="text-xs font-medium text-[var(--text-secondary)]">
          {t("calibrationExample", { slot: slot + 1 })}
        </legend>
        <div className="mt-1 flex flex-wrap gap-1">
          <button
            type="button"
            aria-pressed={rating === "good"}
            onClick={() => save("good")}
            className={studioChipClass}
          >
            {t("calibrationRateGood")}
          </button>
          <button
            type="button"
            aria-pressed={rating === "bad"}
            onClick={() => save("bad")}
            className={studioChipClass}
          >
            {t("calibrationRateBad")}
          </button>
        </div>
        <label className="mt-2 block space-y-1 text-xs text-[var(--text-secondary)]">
          {t("calibrationNoteLabel")}
          <textarea
            value={note}
            maxLength={2000}
            placeholder={t("calibrationNotePlaceholder")}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            className="w-full resize-none rounded-[var(--radius-control)] border-0 bg-white/6 px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          />
        </label>
      </fieldset>
      {assessment.needsHumanReview ? (
        <p role="note" className="text-xs text-[var(--danger-text)]">
          {t("calibrationNeedsReview")}
        </p>
      ) : null}
    </div>
  );
}
