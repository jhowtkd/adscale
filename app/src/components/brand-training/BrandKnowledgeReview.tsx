"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { DiscreetRadios } from "@/components/dashboard/studio-stage/DiscreetRadios";
import {
  studioFilterStripClass,
  studioQuietActionClass,
} from "@/components/dashboard/studio-stage/StudioInstrument";
import {
  useBrandCalibration,
  useBrandKnowledge,
  useBrandKnowledgeVersion,
  useBrandTrainingAssets,
  useReviewBrandKnowledgeClaim,
  useReviewRepertoire,
  useSynthesizeRepertoire,
  type BrandKnowledgeClaimRecord,
  type BrandKnowledgeVersionMetadata,
  type BrandTrainingAssetRecord,
  type SynthesizeRepertoireError,
} from "@/lib/hooks/use-brand-training";
import { BrandCalibrationReview } from "./BrandCalibrationReview";
import { BrandPeopleReview } from "./BrandPeopleReview";
import { VisualRepertoireReview } from "./VisualRepertoireReview";
import { peopleCatalogSchema } from "@/server/brand-training/people";
import { REPERTOIRE_MAX_SOURCES } from "@/server/brand-training/visual-repertoire";
import { visualRepertoireSchema } from "@/server/brand-training/visual-repertoire";

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
  const calibration = useBrandCalibration(clientProfileId);
  const reviewRepertoire = useReviewRepertoire(clientProfileId);
  const synthesize = useSynthesizeRepertoire(clientProfileId);
  const assets = useBrandTrainingAssets(clientProfileId);
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

  const previewById = useMemo(
    () => Object.fromEntries((assets.data ?? []).map((asset) => [asset.id, asset.url])),
    [assets.data],
  );

  if (knowledge.isLoading) {
    return <div role="status" className="h-24 animate-pulse rounded-2xl bg-white/6" />;
  }
  if (!data) return null;

  const repertoireClaim = data.claims.find((claim) => claim.claimKey === "visual.repertoire");
  const synthesizeFailure = (synthesize.error ?? null) as SynthesizeRepertoireError | null;
  const selectionRequired = synthesizeFailure?.code === "brandRepertoireSelectionRequired";
  const repertoireSession = calibration.data?.session;
  const canConfirmRepertoire = Boolean(
    repertoireClaim &&
    repertoireSession &&
    (repertoireSession.status === "review" || repertoireSession.status === "pending"),
  );

  const alternatives = (claim: BrandKnowledgeClaimRecord) =>
    data.claims
      .filter((item) => item.claimKey === claim.claimKey && item.id !== claim.id)
      .map((item) => ({ claimId: item.id, value: item.value }));

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
      </div>

      <BrandCalibrationReview clientProfileId={clientProfileId} />

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          disabled={synthesize.isPending}
          onClick={() => synthesize.mutate({})}
          className={studioQuietActionClass}
        >
          {synthesize.isPending ? t("synthesizingRepertoire") : t("synthesizeRepertoire")}
        </button>
        {canConfirmRepertoire && repertoireClaim && repertoireSession ? (
          <button
            type="button"
            disabled={reviewRepertoire.isPending}
            onClick={() =>
              reviewRepertoire.mutate({
                sessionId: repertoireSession.id,
                expectedRevision: repertoireSession.revision,
                value: repertoireClaim.value,
              })
            }
            className={studioQuietActionClass}
          >
            {t("confirmRepertoireSet")}
          </button>
        ) : null}
      </div>

      {selectionRequired ? (
        <RepertoireSubsetSelector
          assets={assets.data ?? []}
          pending={synthesize.isPending}
          onRetry={(referenceIds) => synthesize.mutate({ referenceIds })}
        />
      ) : null}

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
                previewById={previewById}
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
              <BrandKnowledgeHistoryEntry key={version.id} clientProfileId={clientProfileId} version={version} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BrandKnowledgeHistoryEntry({ clientProfileId, version }: {
  clientProfileId: string;
  version: BrandKnowledgeVersionMetadata;
}) {
  const t = useTranslations("brandTraining.knowledge");
  const [open, setOpen] = useState(false);
  const detail = useBrandKnowledgeVersion(clientProfileId, version.id, open);

  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        v{version.versionNumber} · {version.hash.slice(0, 12)} · {version.publishedByUserId} ·{" "}
        {new Date(version.publishedAt).toLocaleDateString()}
      </summary>
      {open && detail.isPending ? <p role="status" className="mt-1 pl-3">{t("historyLoading")}</p> : null}
      {open && detail.isError ? (
        <div role="alert" className="mt-1 pl-3">
          {t("historyLoadFailed")}{" "}
          <button type="button" className={studioQuietActionClass} onClick={() => void detail.refetch()}>
            {t("historyRetry")}
          </button>
        </div>
      ) : null}
      {open && detail.data ? (
        <ul className="mt-1 space-y-1 pl-3">
          {detail.data.snapshot.claims.map((claim) => (
            <li key={claim.id}>
              {claim.claimKey}: {JSON.stringify(claim.value)} ·{" "}
              {claim.evidenceRefs.map((evidence) => evidence.path).join(", ")}
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

/**
 * Explicit subset picker (plan 02, T1): synthesis refuses more than
 * REPERTOIRE_MAX_SOURCES references instead of silently dropping some, so
 * the operator picks the subset. Only approved, analyzed references are
 * eligible; the deterministic default is the first 48 by id.
 */
function RepertoireSubsetSelector({
  assets,
  pending,
  onRetry,
}: {
  assets: readonly BrandTrainingAssetRecord[];
  pending: boolean;
  onRetry: (referenceIds: string[]) => void;
}) {
  const t = useTranslations("brandTraining.knowledge");
  const tCommon = useTranslations("common");
  const eligible = useMemo(
    () =>
      assets
        .filter((asset) => asset.reviewStatus === "approved" && asset.trainingAnalysis != null)
        .slice()
        .sort((left, right) => left.id.localeCompare(right.id)),
    [assets],
  );
  const [override, setOverride] = useState<readonly string[] | null>(null);
  const selected = override ?? eligible.slice(0, REPERTOIRE_MAX_SOURCES).map((asset) => asset.id);
  const atCap = selected.length >= REPERTOIRE_MAX_SOURCES;
  const toggle = (id: string, checked: boolean) => {
    setOverride(
      checked ? [...selected, id] : selected.filter((entry) => entry !== id),
    );
  };

  if (eligible.length === 0) {
    return (
      <p role="alert" className="text-sm text-[var(--danger-text)]">
        {t("repertoireSelectionEmpty")}
      </p>
    );
  }
  return (
    <fieldset className="space-y-3 rounded-[var(--radius-card)] bg-white/4 p-3">
      <legend className="text-xs font-medium text-[var(--text-secondary)]">
        {t("repertoireSelectionTitle")}
      </legend>
      <p className="text-xs text-[var(--text-muted)]">
        {t("repertoireSelectionHint", { count: eligible.length, max: REPERTOIRE_MAX_SOURCES })}
      </p>
      <ul className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
        {eligible.map((asset) => {
          const checked = selected.includes(asset.id);
          return (
            <li key={asset.id}>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={pending || (!checked && atCap)}
                  onChange={(event) => toggle(asset.id, event.target.checked)}
                />
                <span className="min-w-0 flex-1 truncate">{asset.label || asset.id}</span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                  {asset.id.slice(0, 8)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || selected.length === 0}
          onClick={() => onRetry([...selected])}
          className={studioQuietActionClass}
        >
          {pending ? t("synthesizingRepertoire") : t("synthesizeRepertoire")}
        </button>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {selected.length} {tCommon("selected")}
        </span>
      </div>
    </fieldset>
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
  previewById,
  onReview,
}: {
  claim: BrandKnowledgeClaimRecord;
  pending: boolean;
  previewById: Record<string, string>;
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
  // Named people (plan 03, T1): a parseable people.catalog candidate edits
  // through the structured operator review (names, aliases, primary photo,
  // adequacy) instead of raw JSON. Unparseable drafts keep the textarea.
  const peopleCatalog = claim.claimKey === "people.catalog"
    ? (() => {
        try {
          const parsed = peopleCatalogSchema.safeParse(JSON.parse(draft));
          return parsed.success ? parsed.data : null;
        } catch {
          return null;
        }
      })()
    : null;
  // Visual repertoire (plan 02, T2): a parseable visual.repertoire claim edits
  // through the structured rule/language review with evidence thumbnails.
  const repertoire = claim.claimKey === "visual.repertoire"
    ? (() => {
        try {
          const parsed = visualRepertoireSchema.safeParse(JSON.parse(draft));
          return parsed.success ? parsed.data : null;
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[var(--text-primary)]">{claim.claimKey}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          {t(claim.status)}
        </span>
      </div>
      {peopleCatalog ? (
        <BrandPeopleReview
          value={peopleCatalog.people}
          onChange={(people) => setDraft(JSON.stringify({ ...peopleCatalog, people }))}
          previewByReferenceId={{}}
        />
      ) : repertoire ? (
        <VisualRepertoireReview
          value={repertoire}
          onChange={(next) => setDraft(JSON.stringify(next))}
          previewById={previewById}
        />
      ) : (
        <textarea
          aria-label={`${claim.claimKey} value`}
          aria-invalid={invalid}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          className={cn(occupancyFieldClass, invalid && "ring-2 ring-[var(--danger-text)]")}
        />
      )}
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
