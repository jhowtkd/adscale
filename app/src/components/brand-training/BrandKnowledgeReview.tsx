"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  useBrandKnowledge,
  usePublishBrandKnowledge,
  useReviewBrandKnowledgeClaim,
  type BrandKnowledgeClaimRecord,
} from "@/lib/hooks/use-brand-training";

export function BrandKnowledgeReview({ clientProfileId }: { clientProfileId: string }) {
  const t = useTranslations("brandTraining.knowledge");
  const knowledge = useBrandKnowledge(clientProfileId);
  const review = useReviewBrandKnowledgeClaim(clientProfileId);
  const publish = usePublishBrandKnowledge(clientProfileId);
  const data = knowledge.data;
  if (knowledge.isLoading) return <div role="status" className="h-24 animate-pulse rounded-lg bg-[var(--surface-raised)]" />;
  if (!data) return null;
  const alternatives = (claim: BrandKnowledgeClaimRecord) => data.claims
    .filter((item) => item.claimKey === claim.claimKey && item.id !== claim.id)
    .map((item) => ({ claimId: item.id, value: item.value }));
  const publishable = data.claims.some((claim) => claim.status === "approved") && data.conflicts.length === 0;

  return (
    <section className="space-y-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("title")}</h3>
        {data.activeVersion ? <span className="text-xs text-[var(--success-text)]">{t("activeVersion", { number: data.activeVersion.versionNumber })}</span> : null}
      </div>

      {data.conflicts.length > 0 ? (
        <div role="alert" className="space-y-2 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] p-2">
          <p className="text-xs font-medium text-[var(--danger-text)]">{t("conflictsTitle")}</p>
          {data.conflicts.map((conflict) => (
            <div key={`${conflict.claimKey}:${conflict.comparison}`}>
              <p className="text-xs font-medium text-[var(--text-primary)]">{conflict.claimKey}</p>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {conflict.claims.map((summary) => {
                  const claim = data.claims.find((item) => item.id === summary.id) ?? summary;
                  return <ClaimSummary key={claim.id} claim={claim as BrandKnowledgeClaimRecord} />;
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {data.claims.length === 0 ? <p className="text-xs text-[var(--text-muted)]">{t("empty")}</p> : (
        <ul className="space-y-2">
          {data.claims.map((claim) => (
            <li key={claim.id}>
              <ClaimEditor
                claim={claim}
                pending={review.isPending}
                onReview={(input) => review.mutate({ ...input, alternatives: alternatives(claim) })}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-[var(--border-dim)] pt-3">
        <div>
          <p className="text-xs font-medium text-[var(--text-secondary)]">{t("historyTitle")}</p>
          <div className="text-[10px] text-[var(--text-muted)]">
            {data.versions.map((version) => (
              <details key={version.id}>
                <summary>v{version.versionNumber} · {version.hash.slice(0, 12)} · {version.publishedByUserId} · {new Date(version.publishedAt).toLocaleDateString()}</summary>
                <ul className="pl-3">
                  {version.snapshot?.claims.map((claim) => (
                    <li key={claim.id}>{claim.claimKey}: {JSON.stringify(claim.value)} · {claim.evidenceRefs.map((evidence) => evidence.path).join(", ")}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
        <Button type="button" disabled={!publishable || publish.isPending} onClick={() => publish.mutate()}>{t("publish")}</Button>
      </div>
    </section>
  );
}

function ClaimSummary({ claim }: { claim: BrandKnowledgeClaimRecord }) {
  const t = useTranslations("brandTraining.knowledge");
  return (
    <div className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] p-2 text-[10px] text-[var(--text-muted)]">
      <p className="font-mono text-[var(--text-primary)]">{JSON.stringify(claim.value)}</p>
      <p>{t("authority")}: {claim.authority} · {t("confidence")}: {claim.confidence}</p>
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
    <article className="space-y-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] p-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-[var(--text-primary)]">{claim.claimKey}</span>
        <span className="text-[var(--text-muted)]">{t(claim.status)}</span>
      </div>
      <textarea aria-label={`${claim.claimKey} value`} aria-invalid={invalid} value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} className="w-full rounded border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1 font-mono text-xs text-[var(--text-primary)]" />
      <p className="text-[10px] text-[var(--text-muted)]">{t("authority")}: {claim.authority} · {t("confidence")}: {claim.confidence}</p>
      <p className="text-[10px] text-[var(--text-muted)]">{t("evidence")}: {claim.evidenceRefs.map((evidence) => `${evidence.type} · ${evidence.path}`).join("; ")}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={() => onReview({ claimId: claim.id, status: "approved" })}>{t("approve")}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={save}>{t("saveEdit")}</Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => onReview({ claimId: claim.id, status: "rejected" })}>{t("reject")}</Button>
      </div>
    </article>
  );
}
