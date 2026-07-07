"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  useClientProfiles,
  useClientReferences,
} from "@/lib/hooks/use-client-profiles";
import {
  useConfirmCreativeWork,
  useCreateCreativeWork,
  useCreativeWork,
  useGenerateCopy,
  useRetryOutput,
  useSelectOutput,
  useTriggerTriplet,
  type CreativeWorkOutput,
  type SocialPostBrief,
} from "@/lib/hooks/use-creative-work";
import CreativeProposalGrid from "./CreativeProposalGrid";

type StepId = "brief" | "copy" | "assets" | "confirm" | "proposals";

const STEP_ORDER: StepId[] = ["brief", "copy", "assets", "confirm", "proposals"];

const FORMAT_OPTIONS: Array<{ value: "1:1" | "4:5" | "9:16"; label: string }> = [
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "9:16", label: "9:16" },
];

const CATEGORY_LABELS: Record<string, string> = {
  logo: "Logo",
  visual_reference: "Referência visual",
  product: "Produto",
  guide: "Guia",
  creative: "Criativo",
};

const USAGE_MODE_LABELS: Record<string, string> = {
  primary_logo: "Logo principal",
  secondary_logo: "Logo secundário",
  reference: "Referência",
  product_shot: "Foto do produto",
  pattern: "Padrão",
};

type BriefFormState = SocialPostBrief;

const EMPTY_BRIEF: BriefFormState = {
  theme: "",
  objective: "",
  audience: "",
  offer: "",
};

const VISUAL_TRIPLET_CREDITS = 15;

export default function CreatePostWizard({ workId: initialWorkId }: { workId?: string } = {}) {
  const tQuick = useTranslations("quickTools.createPost");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const addToast = useAppStore((s) => s.addToast);

  const urlWorkId = searchParams?.get("workId") ?? null;
  const workId = initialWorkId ?? urlWorkId ?? null;

  const profilesQuery = useClientProfiles();
  const profiles = profilesQuery.data ?? [];

  const [clientProfileId, setClientProfileId] = useState<string>("");
  const [format, setFormat] = useState<"1:1" | "4:5" | "9:16">("1:1");
  const [brief, setBrief] = useState<BriefFormState>(EMPTY_BRIEF);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [activeWorkId, setActiveWorkId] = useState<string | null>(workId);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("");
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);

  const workQuery = useCreativeWork(activeWorkId);
  const referencesQuery = useClientReferences(clientProfileId);
  // The /api/client-profiles/[id]/references endpoint returns the full row,
  // including `trainingCategory`, `usageMode`, and `reviewStatus`. The shared
  // hook type intentionally only exposes the original fields; widen it here
  // (without modifying the hook) so we can filter to approved-only.
  type ApprovedReference = (typeof referencesQuery.data extends (infer R)[] | undefined ? R : never) & {
    trainingCategory: string | null;
    usageMode: string | null;
    reviewStatus: string | null;
  };
  const approvedReferences = useMemo<ApprovedReference[]>(
    () =>
      ((referencesQuery.data ?? []) as ApprovedReference[]).filter(
        (ref) =>
          ref.reviewStatus === "approved" && Boolean(ref.trainingCategory) && Boolean(ref.usageMode),
      ),
    [referencesQuery.data],
  );

  const createMutation = useCreateCreativeWork();
  const copyMutation = useGenerateCopy();
  const confirmMutation = useConfirmCreativeWork();
  const triggerMutation = useTriggerTriplet();
  const retryMutation = useRetryOutput();
  const selectMutation = useSelectOutput();

  const detail = workQuery.data;

  // Step routing is derived from the persisted work status. While the user
  // is still editing a brand-new draft they advance manually via goNext().
  const persistedStepIndex = useMemo(() => {
    if (!detail) return stepIndex;
    const status = detail.work.status;
    if (status === "draft") return detail.work.copy ? 2 : 1;
    if (status === "ready") return 3;
    return 4;
    // detail is intentionally not listed — we only need the three scalar
    // fields, and adding the whole object would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.work.id, detail?.work.status, detail?.work.copy, stepIndex]);

  // After a brand-new draft is created, normalise the in-memory state so
  // later renders don't drift from the persisted snapshot. This is the
  // canonical "sync from server" pattern that requires an effect: the
  // external data source (TanStack Query) pushes updates and we mirror them
  // into local state. We track the last-synced workId in a ref so each
  // setState only fires once per server-side change.
  const lastSyncedWorkIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detail) return;
    if (lastSyncedWorkIdRef.current === detail.work.id) return;
    lastSyncedWorkIdRef.current = detail.work.id;
    // The set-state-in-effect rule is intended for synchronising React with
    // *external* systems — TanStack Query is exactly that, so we explicitly
    // mirror the server snapshot here. The ref guard prevents the cascading
    // render the rule warns about.
    /* eslint-disable react-hooks/set-state-in-effect */
    setClientProfileId(detail.work.clientProfileId);
    setBrief(detail.work.brief);
    setFormat(detail.work.format);
    if (detail.work.copy) {
      setHeadline(detail.work.copy.headline);
      setBody(detail.work.copy.body);
      setCta(detail.work.copy.cta);
    }
    setStepIndex((current) => (current >= persistedStepIndex ? current : persistedStepIndex));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [detail?.work.id, detail?.work.status, detail?.work.copy, detail, persistedStepIndex]);

  // ----- Step navigation helpers -------------------------------------------

  const canAdvanceFromBrief =
    Boolean(clientProfileId) &&
    brief.theme.trim().length > 0 &&
    brief.objective.trim().length > 0 &&
    brief.audience.trim().length > 0 &&
    brief.offer.trim().length > 0;

  const goNext = () => setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  // ----- Step 2: persist draft + request copy -----------------------------

  const handleCreateCopy = async () => {
    if (!canAdvanceFromBrief) return;
    try {
      let currentId = activeWorkId;
      if (!currentId) {
        const result = await createMutation.mutateAsync({
          clientProfileId,
          toolKind: "social_post",
          format,
          brief,
        });
        currentId = result.work.id;
        setActiveWorkId(currentId);
        // Persist the workId in the URL so refresh / share keeps the context.
        router.replace(`/quick-tools/create-post?workId=${currentId}`);
      }
      const copyResult = await copyMutation.mutateAsync(currentId);
      setHeadline(copyResult.copy.headline);
      setBody(copyResult.copy.body);
      setCta(copyResult.copy.cta);
      goNext();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tCommon("error"));
    }
  };

  // ----- Step 3: confirm identity snapshot ---------------------------------

  const handleAdvanceFromAssets = () => {
    if (selectedReferenceIds.length === 0) return;
    goNext();
  };

  const handleConfirmAndGenerate = async () => {
    if (!activeWorkId || !detail?.work.copy) return;
    try {
      await confirmMutation.mutateAsync({
        workItemId: activeWorkId,
        copy: detail.work.copy,
        selectedReferenceIds,
      });
      await triggerMutation.mutateAsync(activeWorkId);
      goNext();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tCommon("error"));
    }
  };

  // ----- Step 5: proposal grid callbacks -----------------------------------

  const handleRetry = async (outputId: string) => {
    if (!activeWorkId) return;
    try {
      await retryMutation.mutateAsync({ workItemId: activeWorkId, outputId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tCommon("error"));
    }
  };

  const handleSelect = async (outputId: string) => {
    if (!activeWorkId) return;
    try {
      await selectMutation.mutateAsync({ workItemId: activeWorkId, outputId, saveToLibrary: false });
      addToast("success", tQuick("selectSuccess"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tCommon("error"));
    }
  };

  const handleSave = async (outputId: string) => {
    if (!activeWorkId) return;
    try {
      await selectMutation.mutateAsync({ workItemId: activeWorkId, outputId, saveToLibrary: true });
      addToast("success", tQuick("saveSuccess"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tCommon("error"));
    }
  };

  const handleDownload = (outputId: string) => {
    if (!activeWorkId) return;
    const url = `/api/creative-work/${activeWorkId}/outputs/${outputId}/download`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ----- Rendering ---------------------------------------------------------

  const currentStep = STEP_ORDER[stepIndex];

  return (
    <section
      aria-label={tQuick("title")}
      data-testid="create-post-wizard"
      className="mx-auto flex w-full max-w-4xl flex-col gap-8"
    >
      <header className="space-y-1">
        <h1 className="product-page-title text-[var(--text-primary)]">{tQuick("title")}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{tQuick("subtitle")}</p>
      </header>

      <Stepper currentIndex={stepIndex} />

      {currentStep === "brief" ? (
        <BriefStep
          profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
          clientProfileId={clientProfileId}
          onSelectProfile={setClientProfileId}
          format={format}
          onChangeFormat={setFormat}
          brief={brief}
          onChangeBrief={setBrief}
          canAdvance={canAdvanceFromBrief}
          onAdvance={handleCreateCopy}
          isSubmitting={createMutation.isPending || copyMutation.isPending}
          error={createMutation.error ?? copyMutation.error}
        />
      ) : null}

      {currentStep === "copy" && detail?.work ? (
        <CopyStep
          headline={headline}
          body={body}
          cta={cta}
          onChangeHeadline={setHeadline}
          onChangeBody={setBody}
          onChangeCta={setCta}
          isGenerating={copyMutation.isPending && !detail.work.copy}
          onPersist={async () => {
            if (!activeWorkId) return;
            // Edits are persisted implicitly via the confirm step (the work
            // PATCH carries the latest copy values). For a smoother UX we
            // also re-issue the copy endpoint when the user has not yet
            // generated it.
            if (!detail.work.copy) {
              await copyMutation.mutateAsync(activeWorkId);
            }
            goNext();
          }}
          onBack={goBack}
        />
      ) : null}

      {currentStep === "assets" ? (
        <AssetsStep
          references={approvedReferences.map((r) => ({
            id: r.id,
            label: r.label,
            trainingCategory: r.trainingCategory ?? "",
            usageMode: r.usageMode ?? "",
            reason: r.notes ?? "",
          }))}
          selectedIds={selectedReferenceIds}
          onToggle={(id) =>
            setSelectedReferenceIds((current) =>
              current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
            )
          }
          onAdvance={handleAdvanceFromAssets}
          onBack={goBack}
        />
      ) : null}

      {currentStep === "confirm" && detail?.work ? (
        <ConfirmStep
          credits={VISUAL_TRIPLET_CREDITS}
          isSubmitting={confirmMutation.isPending || triggerMutation.isPending}
          onConfirm={handleConfirmAndGenerate}
          onBack={goBack}
          error={confirmMutation.error ?? triggerMutation.error}
        />
      ) : null}

      {currentStep === "proposals" && detail ? (
        <ProposalsStep
          outputs={detail.outputs}
          onRetry={handleRetry}
          onSelect={handleSelect}
          onSave={handleSave}
          onDownload={handleDownload}
          isRetrying={(id) => retryMutation.isPending && retryMutation.variables?.outputId === id}
          isSelecting={(id) => selectMutation.isPending && selectMutation.variables?.outputId === id}
          isSaving={(id) =>
            selectMutation.isPending && selectMutation.variables?.outputId === id && (selectMutation.variables?.saveToLibrary ?? false)
          }
        />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step subcomponents
// ---------------------------------------------------------------------------

function Stepper({ currentIndex }: { currentIndex: number }) {
  const tQuick = useTranslations("quickTools.createPost");
  const labels: Array<{ key: StepId; labelKey: string }> = [
    { key: "brief", labelKey: "stepBrief" },
    { key: "copy", labelKey: "stepCopy" },
    { key: "assets", labelKey: "stepAssets" },
    { key: "confirm", labelKey: "stepConfirm" },
    { key: "proposals", labelKey: "stepProposals" },
  ];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
      {labels.map((step, index) => (
        <li key={step.key} className="flex items-center gap-2">
          <span
            className={cn(
              "grid h-6 w-6 place-items-center rounded-full border text-[10px] font-medium",
              index === currentIndex
                ? "border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
                : index < currentIndex
                  ? "border-[var(--accent-primary)] text-[var(--accent-primary)]"
                  : "border-[var(--border-subtle)] text-[var(--text-muted)]",
            )}
            aria-current={index === currentIndex ? "step" : undefined}
          >
            {index + 1}
          </span>
          <span className={cn(index === currentIndex && "text-[var(--text-primary)]")}>
            {tQuick(step.labelKey)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function BriefStep(props: {
  profiles: Array<{ id: string; name: string }>;
  clientProfileId: string;
  onSelectProfile: (id: string) => void;
  format: "1:1" | "4:5" | "9:16";
  onChangeFormat: (format: "1:1" | "4:5" | "9:16") => void;
  brief: BriefFormState;
  onChangeBrief: (brief: BriefFormState) => void;
  canAdvance: boolean;
  onAdvance: () => void;
  isSubmitting: boolean;
  error: unknown;
}) {
  const tQuick = useTranslations("quickTools.createPost");
  const tCommon = useTranslations("common");

  return (
    <div className="space-y-6 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-6">
      <div className="space-y-2">
        <label htmlFor="cp-profile" className="text-sm font-medium text-[var(--text-primary)]">
          {tQuick("brandLabel")}
        </label>
        <select
          id="cp-profile"
          aria-label="Marca"
          value={props.clientProfileId}
          onChange={(event) => props.onSelectProfile(event.target.value)}
          className="w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
        >
          <option value="">{tQuick("brandPlaceholder")}</option>
          {props.profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="cp-theme"
          label={tQuick("briefTheme")}
          value={props.brief.theme}
          onChange={(value) => props.onChangeBrief({ ...props.brief, theme: value })}
        />
        <Field
          id="cp-objective"
          label={tQuick("briefObjective")}
          value={props.brief.objective}
          onChange={(value) => props.onChangeBrief({ ...props.brief, objective: value })}
        />
        <Field
          id="cp-audience"
          label={tQuick("briefAudience")}
          value={props.brief.audience}
          onChange={(value) => props.onChangeBrief({ ...props.brief, audience: value })}
        />
        <Field
          id="cp-offer"
          label={tQuick("briefOffer")}
          value={props.brief.offer}
          onChange={(value) => props.onChangeBrief({ ...props.brief, offer: value })}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-[var(--text-primary)]">{tQuick("formatLabel")}</legend>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label={tQuick("formatLabel")}>
          {FORMAT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="inline-flex min-h-[var(--control-touch)] cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
            >
              <input
                type="radio"
                name="format"
                value={option.value}
                checked={props.format === option.value}
                onChange={() => props.onChangeFormat(option.value)}
                className="accent-[var(--accent-primary)]"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {props.error ? (
        <p role="alert" className="text-sm text-[var(--danger-text)]">
          {props.error instanceof Error ? props.error.message : tCommon("error")}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={props.onAdvance}
          disabled={!props.canAdvance || props.isSubmitting}
        >
          {props.isSubmitting ? tQuick("submitting") : tQuick("stepCopyCta")}
        </Button>
      </div>
    </div>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={props.id} className="text-xs font-medium text-[var(--text-secondary)]">
        {props.label}
      </label>
      <input
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
      />
    </div>
  );
}

function CopyStep(props: {
  headline: string;
  body: string;
  cta: string;
  onChangeHeadline: (value: string) => void;
  onChangeBody: (value: string) => void;
  onChangeCta: (value: string) => void;
  isGenerating: boolean;
  onPersist: () => void;
  onBack: () => void;
}) {
  const tQuick = useTranslations("quickTools.createPost");
  return (
    <div className="space-y-6 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-6">
      {props.isGenerating ? (
        <p role="status" className="text-sm text-[var(--text-secondary)]">
          {tQuick("generatingCopy")}
        </p>
      ) : null}

      <Field id="cp-headline" label={tQuick("headline")} value={props.headline} onChange={props.onChangeHeadline} />
      <div className="space-y-1">
        <label htmlFor="cp-body" className="text-xs font-medium text-[var(--text-secondary)]">
          {tQuick("body")}
        </label>
        <textarea
          id="cp-body"
          value={props.body}
          onChange={(event) => props.onChangeBody(event.target.value)}
          rows={5}
          className="w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
        />
      </div>
      <Field id="cp-cta" label={tQuick("cta")} value={props.cta} onChange={props.onChangeCta} />

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={props.onBack}>
          {tQuick("back")}
        </Button>
        <Button type="button" onClick={props.onPersist} disabled={props.isGenerating}>
          {tQuick("next")}
        </Button>
      </div>
    </div>
  );
}

function AssetsStep(props: {
  references: Array<{ id: string; label: string; trainingCategory: string; usageMode: string; reason: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onAdvance: () => void;
  onBack: () => void;
}) {
  const tQuick = useTranslations("quickTools.createPost");
  const canAdvance = props.selectedIds.length > 0;

  return (
    <div className="space-y-6 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-6">
      <p className="text-sm text-[var(--text-secondary)]">{tQuick("assetsHelp")}</p>

      {props.references.length === 0 ? (
        <p role="status" className="text-sm text-[var(--text-muted)]">
          {tQuick("noApprovedAssets")}
        </p>
      ) : (
        <ul className="space-y-2">
          {props.references.map((reference) => {
            const checked = props.selectedIds.includes(reference.id);
            return (
              <li
                key={reference.id}
                className={cn(
                  "flex items-start gap-3 rounded-[var(--radius-control)] border p-3",
                  checked
                    ? "border-[var(--accent-primary)] bg-[var(--accent-primary-subtle)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-raised)]",
                )}
              >
                <input
                  type="checkbox"
                  id={`cp-asset-${reference.id}`}
                  checked={checked}
                  onChange={() => props.onToggle(reference.id)}
                  className="mt-1 accent-[var(--accent-primary)]"
                  aria-label={reference.label}
                />
                <label htmlFor={`cp-asset-${reference.id}`} className="flex-1 cursor-pointer space-y-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{reference.label}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {CATEGORY_LABELS[reference.trainingCategory] ?? reference.trainingCategory} ·{" "}
                    {USAGE_MODE_LABELS[reference.usageMode] ?? reference.usageMode}
                  </p>
                  {reference.reason ? (
                    <p className="text-xs text-[var(--text-secondary)]">{reference.reason}</p>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={props.onBack}>
          {tQuick("back")}
        </Button>
        <Button type="button" onClick={props.onAdvance} disabled={!canAdvance}>
          {tQuick("next")}
        </Button>
      </div>
    </div>
  );
}

function ConfirmStep(props: {
  credits: number;
  isSubmitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
  error: unknown;
}) {
  const tQuick = useTranslations("quickTools.createPost");
  const tCommon = useTranslations("common");
  return (
    <div className="space-y-6 rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-6">
      <p className="text-sm text-[var(--text-secondary)]">
        {tQuick("confirmHelp", { credits: props.credits })}
      </p>
      <p role="status" className="text-sm text-[var(--text-primary)]">
        {tQuick("confirmCredits", { credits: props.credits })}
      </p>

      {props.error ? (
        <p role="alert" className="text-sm text-[var(--danger-text)]">
          {props.error instanceof Error ? props.error.message : tCommon("error")}
        </p>
      ) : null}

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={props.onBack}>
          {tQuick("back")}
        </Button>
        <Button type="button" onClick={props.onConfirm} disabled={props.isSubmitting}>
          {props.isSubmitting ? tQuick("submitting") : tQuick("stepConfirmCta")}
        </Button>
      </div>
    </div>
  );
}

function ProposalsStep(props: {
  outputs: CreativeWorkOutput[];
  onRetry: (outputId: string) => void;
  onSelect: (outputId: string) => void;
  onSave: (outputId: string) => void;
  onDownload: (outputId: string) => void;
  isRetrying: (outputId: string) => boolean;
  isSelecting: (outputId: string) => boolean;
  isSaving: (outputId: string) => boolean;
}) {
  const tQuick = useTranslations("quickTools.createPost");
  const sortedOutputs = useMemo(() => {
    const order: CreativeWorkOutput["creativeLevel"][] = ["conservative", "balanced", "bold"];
    return [...props.outputs].sort(
      (a, b) => order.indexOf(a.creativeLevel) - order.indexOf(b.creativeLevel),
    );
  }, [props.outputs]);

  return (
    <div className="space-y-4">
      <p role="status" className="text-sm text-[var(--text-secondary)]">
        {tQuick("proposalsHelp")}
      </p>
      <CreativeProposalGrid
        outputs={sortedOutputs}
        onRetry={props.onRetry}
        onSelect={props.onSelect}
        onSave={props.onSave}
        onDownload={props.onDownload}
        isRetrying={props.isRetrying}
        isSelecting={props.isSelecting}
        isSaving={props.isSaving}
      />
    </div>
  );
}