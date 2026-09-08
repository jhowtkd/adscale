"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { studioQuietActionClass } from "@/components/dashboard/studio-stage/StudioInstrument";
import type { PieceReviewArea, PieceReviewDecision } from "@/server/creative-work/external-piece-review";

export type PieceReviewHistoryItem = {
  id: string;
  outputVersion: number;
  authorLabel: string;
  decision: PieceReviewDecision;
  body: string | null;
  area: PieceReviewArea | null;
  createdAt: string | Date;
};

type PieceReviewProps = {
  token: string;
  outputId: string;
  outputVersion: number;
  imageUrl: string;
  title: string;
  canApprove: boolean;
  history: PieceReviewHistoryItem[];
};

const PIN = 0.12;

export default function PieceReview({
  token,
  outputId,
  outputVersion,
  imageUrl,
  title,
  canApprove,
  history: initialHistory,
}: PieceReviewProps) {
  const t = useTranslations("share");
  const [authorLabel, setAuthorLabel] = useState("");
  const [body, setBody] = useState("");
  const [area, setArea] = useState<PieceReviewArea | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PieceReviewDecision | null>(null);

  const decisionLabel = useMemo(() => ({
    comment: t("reviewDecisionComment"),
    approve: t("reviewDecisionApprove"),
    request_changes: t("reviewDecisionChanges"),
  }), [t]);

  async function submit(decision: PieceReviewDecision) {
    if (pending) return;
    setPending(decision);
    setError(null);
    try {
      const response = await fetch(`/api/share/${token}/asset/${outputId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorLabel,
          decision,
          body,
          area,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        history?: PieceReviewHistoryItem[];
      };
      if (!response.ok) {
        setError(payload.error ?? t("unavailableBody"));
        return;
      }
      setHistory(payload.history ?? history);
      setBody("");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="grid gap-8 pt-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
      <div className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {t("reviewVersion", { version: outputVersion })}
        </p>
        <button
          type="button"
          className="relative block w-full overflow-hidden rounded-2xl bg-white/[0.04] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          aria-label={t("reviewPinHint")}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const x = Math.min(1 - PIN, Math.max(0, (event.clientX - box.left) / box.width - PIN / 2));
            const y = Math.min(1 - PIN, Math.max(0, (event.clientY - box.top) / box.height - PIN / 2));
            setArea({ x, y, width: PIN, height: PIN });
          }}
        >
          <Image
            src={imageUrl}
            alt={title}
            width={1080}
            height={1350}
            unoptimized
            className="block h-auto w-full"
          />
          {area ? (
            <span
              className="pointer-events-none absolute border border-[var(--focus-ring)] bg-[var(--focus-ring)]/20"
              style={{
                left: `${area.x * 100}%`,
                top: `${area.y * 100}%`,
                width: `${area.width * 100}%`,
                height: `${area.height * 100}%`,
              }}
            />
          ) : null}
        </button>
        <p className="text-sm text-[var(--text-muted)]">{t("reviewPinHint")}</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("reviewTitle")}</h2>
        {!canApprove ? (
          <p className="text-sm text-[var(--text-secondary)]">{t("reviewObjectiveBlocked")}</p>
        ) : null}
        <label className="block text-sm text-[var(--text-primary)]">
          {t("reviewName")}
          <input
            value={authorLabel}
            onChange={(event) => setAuthorLabel(event.target.value)}
            className="mt-1 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm text-[var(--text-primary)]">
          {t("reviewComment")}
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="mt-1 min-h-24 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
          />
        </label>
        {error ? <p role="alert" className="text-sm text-[var(--text-secondary)]">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={studioQuietActionClass} disabled={Boolean(pending)} onClick={() => void submit("comment")}>
            {t("reviewSend")}
          </button>
          <button type="button" className={studioQuietActionClass} disabled={Boolean(pending)} onClick={() => void submit("request_changes")}>
            {t("reviewRequestChanges")}
          </button>
          {canApprove ? (
            <button type="button" className={studioQuietActionClass} disabled={Boolean(pending)} onClick={() => void submit("approve")}>
              {t("reviewApprove")}
            </button>
          ) : null}
        </div>

        <div className="space-y-2 pt-4">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{t("reviewHistory")}</h3>
          {history.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t("reviewEmpty")}</p>
          ) : (
            <ol className="space-y-3">
              {history.map((item) => (
                <li key={item.id} className="text-sm text-[var(--text-secondary)]">
                  <p className="font-medium text-[var(--text-primary)]">
                    {item.authorLabel} · {decisionLabel[item.decision]} · {t("reviewVersion", { version: item.outputVersion })}
                  </p>
                  {item.body ? <p>{item.body}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
