"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { DiscreetRadios } from "@/components/dashboard/studio-stage/DiscreetRadios";
import {
  studioChipClass,
  studioFilterStripClass,
  studioQuietActionClass,
} from "@/components/dashboard/studio-stage/StudioInstrument";
import {
  useBrandKnowledge,
  usePublishBrandKnowledge,
  useReviewBrandKnowledgeClaim,
  type BrandKnowledgeClaimRecord,
} from "@/lib/hooks/use-brand-training";

type KnowledgeFilter = "all" | "review" | "approved" | "archive";

const occupancyFieldClass =
  "w-full resize-none rounded-[var(--radius-control)] border-0 bg-white/6 px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

function knowledgeBucket(claim: BrandKnowledgeClaimRecord): Exclude<KnowledgeFilter, "all"> {
  if (claim.status === "candidate") return "review";
  if (claim.status === "approved") return "approved";
  return "archive";
}

export function BrandKnowledgeReview({ clientProfileId }: { clientProfileId: string }) {
  const t = useTranslations("brandTraining.knowledge");
  const knowledge = useBrandKnowledge(clientProfileId);
  const review = useReviewBrandKnowledgeClaim(clientProfileId);
  const publish = usePublishBrandKnowledge(clientProfileId);
  const [filter, setFilter] = useState<KnowledgeFilter>("all");
  const data = knowledge.data;

  const visible = useMemo(
    () =>
      !data
        ? []
        : filter === "all"
          ? data.claims
          : data.claims.filter((claim) => knowledgeBucket(claim) === filter),
    [data, filter],
  );

  if (knowledge.isLoading) {
    return <div role="status" className="h-24 animate-pulse rounded-2xl bg-white/6" />;
  }
  if (!data) return null;

  const alternatives = (claim: BrandKnowledgeClaimRecord) =>
    data.claims
      .filter((item) => item.claimKey === claim.claimKey && item.id !== claim.id)
      .map((item) => ({ claimId: item.id, value: item.value }));
  const publishable = data.claims.some((claim) => claim.status === "approved") && data.conflicts.length === 0;

  return (
    <section data-testid="brand-kit-knowledge" className="space-y-5" aria-label={t("title")}>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {data.activeVersion ? (
          <p
            role="status"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]"
          >
            {t("activeVersion", { number: data.activeVersion.versionNumber })}
          </p>
        ) : null}
        <button
          type="button"
          disabled={!publishable || publish.isPending}
          onClick={() => publish.mutate()}
          className={studioChipClass}
        >
          {t("publish")}
        </button>
      </div>

      <div data-testid="brand-knowledge-strip" className={studioFilterStripClass}>
        <DiscreetRadios
          label={t("filterAria")}
          value={filter}
          onChange={setFilter}
          className="min-w-0 flex-1 justify-center"
          options={[
            { value: "all", label: t("filterAll") },
            { value: "review", label: t("filterReview") },
            { value: "approved", label: t("filterApproved") },
            { value: "archive", label: t("filterArchive") },
          ]}
        />
        <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {visible.length}/{data.claims.length}
        </p>
      </div>

      {data.conflicts.length > 0 ? (
        <div role="alert" className="space-y-3">
          <p className="text-xs font-medium text-[var(--danger-text)]">{t("conflictsTitle")}</p>
          {data.conflicts.map((conflict) => (
            <div key={`${conflict.claimKey}:${conflict.comparison}`} className="space-y-2">
              <p className="font-mono text-xs text-[var(--text-primary)]">{conflict.claimKey}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {conflict.claims.map((summary) => {
                  const claim = data.claims.find((item) => item.id === summary.id) ?? summary;
                  return <ClaimSummary key={claim.id} claim={claim as BrandKnowledgeClaimRecord} />;
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {data.claims.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--text-secondary)]">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-white/8">
          {visible.map((claim) => (
            <li key={claim.id} className="py-4">
              <ClaimEditor
                claim={claim}
                pending={review.isPending}
                onReview={(input) => review.mutate({ ...input, alternatives: alternatives(claim) })}
              />
            </li>
          ))}
        </ul>
      )}

      {data.versions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-[var(--text-secondary)]">
            {t("historyTitle")}
          </p>
          <div className="space-y-1 text-xs text-[var(--text-muted)]">
            {data.versions.map((version) => (
              <details key={version.id}>
                <summary className="cursor-pointer text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  v{version.versionNumber} · {version.hash.slice(0, 12)} · {version.publishedByUserId} ·{" "}
                  {new Date(version.publishedAt).toLocaleDateString()}
                </summary>
                <ul className="mt-1 space-y-1 pl-3">
                  {version.snapshot?.claims.map((claim) => (
                    <li key={claim.id}>
                      {claim.claimKey}: {JSON.stringify(claim.value)} ·{" "}
                      {claim.evidenceRefs.map((evidence) => evidence.path).join(", ")}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ClaimSummary({ claim }: { claim: BrandKnowledgeClaimRecord }) {
  const t = useTranslations("brandTraining.knowledge");
  return (
    <div className="space-y-1 text-xs text-[var(--text-muted)]">
      <p className="font-mono text-[var(--text-primary)]">{JSON.stringify(claim.value)}</p>
      <p>
        {t("authority")}: {claim.authority} · {t("confidence")}: {claim.confidence}
      </p>
      <p>{claim.evidenceRefs.map((evidence) => `${evidence.type} · ${evidence.path}`).join("; ")}</p>
    </div>
  );
}

function ClaimEditor({
  claim,
  pending,
  onReview,
}: {
  claim: BrandKnowledgeClaimRecord;
  pending: boolean;
  onReview: (input: { claimId: string; status: "approved" | "rejected"; value?: unknown }) => void;
}) {
  const t = useTranslations("brandTraining.knowledge");
  const [draft, setDraft] = useState(() => JSON.stringify(claim.value));
  const [invalid, setInvalid] = useState(false);
  const save = () => {
    try {
      onReview({ claimId: claim.id, status: "approved", value: JSON.parse(draft) });
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[var(--text-primary)]">{claim.claimKey}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {t(claim.status)}
        </span>
      </div>
      <textarea
        aria-label={`${claim.claimKey} value`}
        aria-invalid={invalid}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={2}
        className={cn(occupancyFieldClass, invalid && "ring-2 ring-[var(--danger-text)]")}
      />
      <p className="text-xs text-[var(--text-muted)]">
        {t("authority")}: {claim.authority} · {t("confidence")}: {claim.confidence}
      </p>
      <p className="text-xs text-[var(--text-muted)]">
        {t("evidence")}: {claim.evidenceRefs.map((evidence) => `${evidence.type} · ${evidence.path}`).join("; ")}
      </p>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => onReview({ claimId: claim.id, status: "approved" })}
          className={studioQuietActionClass}
        >
          {t("approve")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className={studioQuietActionClass}
        >
          {t("saveEdit")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onReview({ claimId: claim.id, status: "rejected" })}
          className={studioQuietActionClass}
        >
          {t("reject")}
        </button>
      </div>
    </div>
  );
}
