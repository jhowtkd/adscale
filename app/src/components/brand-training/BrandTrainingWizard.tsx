"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { m } from "@/components/animations/MotionBoundary";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useClientProfiles,
  useCreateClientProfile,
} from "@/lib/hooks/use-client-profiles";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import {
  useBrandKit,
  useUpdateBrandKit,
} from "@/lib/hooks/use-brand-kit";
import {
  useApproveVoice,
  useBrandTrainingStatus,
  useBrandFonts,
  useExtractMulti,
  useExtractVoice,
  useReviewBrandFont,
  useUploadBrandFont,
  type BrandFontAssetRecord,
  type BrandVoiceConfig,
  type MultiExtractResult,
} from "@/lib/hooks/use-brand-training";
import { BrandTrainingAssets } from "./BrandTrainingAssets";
import { BrandTrainingStepper } from "./BrandTrainingStepper";
import { BrandKnowledgeReview } from "./BrandKnowledgeReview";

type StepId = "profile" | "ingest" | "validate" | "curate" | "voice";

const STEPS: { id: StepId; label: "stepProfile" | "stepIngest" | "stepValidate" | "stepCurate" | "stepVoice" }[] = [
  { id: "profile", label: "stepProfile" },
  { id: "ingest", label: "stepIngest" },
  { id: "validate", label: "stepValidate" },
  { id: "curate", label: "stepCurate" },
  { id: "voice", label: "stepVoice" },
];

const FOCUS_RING =
  "focus:outline-none focus:ring-[3px] focus:ring-[var(--focus-ring)]";

export default function BrandTrainingWizard() {
  const t = useTranslations("brandTraining");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const addToast = useAppStore((s) => s.addToast);
  const activeProfile = useActiveClientProfile();
  const { activeClientProfileId, profiles, selectProfile } = activeProfile;
  const requestedProfileId = searchParams.get("clientProfileId");
  const requestedProfileExists = requestedProfileId !== null
    && profiles.some((profile) => profile.id === requestedProfileId);
  const clientProfileId = activeClientProfileId;
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [extractResult, setExtractResult] = useState<MultiExtractResult | null>(null);

  const status = useBrandTrainingStatus(clientProfileId);

  // Auto-advance gate hint: once trained, surface the badge but stay on the step.
  const trained = status.data?.trained ?? false;

  useEffect(() => {
    if (requestedProfileExists && requestedProfileId && requestedProfileId !== activeClientProfileId) {
      selectProfile(requestedProfileId);
    }
  }, [activeClientProfileId, requestedProfileExists, requestedProfileId, selectProfile]);

  const selectClientProfile = (id: string) => {
    selectProfile(id);
    router.replace(
      `/brand-kit?mode=training&clientProfileId=${encodeURIComponent(id)}`,
      { scroll: false },
    );
  };

  const steps = useMemo(
    () =>
      STEPS.map((s) => ({ id: s.id, labelKey: t(s.label) })),
    [t],
  );

  const goNext = () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-[760px] space-y-6"
    >
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            {t("title")}
          </h1>
          {trained && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-bg)] px-2.5 py-1 text-xs font-medium text-[var(--success-text)]">
              <Check size={12} /> {t("trainedBadge")}
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--text-muted)]">{t("subtitle")}</p>
        <BrandTrainingStepper steps={steps} currentIndex={stepIndex} />
      </header>

      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        {clientProfileId === null ? (
          <ProfileStep
            selectedId={clientProfileId}
            onSelect={selectClientProfile}
            onCreated={() => addToast("success", tc("saved"))}
          />
        ) : stepIndex === 0 ?(
          <ProfileStep
            selectedId={clientProfileId}
            onSelect={selectClientProfile}
            onCreated={() => addToast("success", tc("saved"))}
          />
        ) : stepIndex === 1 ? (
          <IngestStep
            clientProfileId={clientProfileId}
            onComplete={(result) => {
              setExtractResult(result);
              addToast("success", t("extractDone"));
              goNext();
            }}
          />
        ) : stepIndex === 2 ? (
          <ValidateStep
            key={extractResult ? "extract-draft" : "persisted"}
            clientProfileId={clientProfileId}
            draft={extractResult?.brandKit ?? null}
          />
        ) : stepIndex === 3 ? (
          <BrandTrainingAssets clientProfileId={clientProfileId} />
        ) : (
          <BrandVoiceSection clientProfileId={clientProfileId} />
        )}
      </section>

      {clientProfileId !== null && (
        <footer className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={stepIndex === 0}
            className="gap-1.5"
          >
            <ArrowLeft size={16} /> {tc("back")}
          </Button>
          {stepIndex < STEPS.length - 1 ? (
            <Button onClick={goNext} className="gap-1.5">
              {tc("next")} <ArrowRight size={16} />
            </Button>
          ) : (
            <Button onClick={() => router.push("/brand-kit")} className="gap-1.5">
              <Check size={16} /> {t("finish")}
            </Button>
          )}
        </footer>
      )}
    </m.div>
  );
}

/* ------------------------------ Step 1: Profile ------------------------------ */

function ProfileStep({
  selectedId,
  onSelect,
  onCreated,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: () => void;
}) {
  const t = useTranslations("brandTraining");
  const profiles = useClientProfiles();
  const createProfile = useCreateClientProfile();
  const [newName, setNewName] = useState("");

  if (profiles.isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("profileTitle")}</h2>
        <p className="text-xs text-[var(--text-muted)]">{t("profileDesc")}</p>
      </div>

      {profiles.data && profiles.data.length > 0 ? (
        <ul className="grid gap-2">
          {profiles.data.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
                  selectedId === p.id
                    ? "border-[var(--selection-border)] bg-[var(--selection-bg)]"
                    : "border-[var(--border-dim)] bg-[var(--surface-raised)] hover:border-[var(--selection-border)]",
                )}
              >
                <span className="text-sm font-medium text-[var(--text-primary)]">{p.name}</span>
                {selectedId === p.id && <Check size={16} className="text-[var(--selection-text)]" />}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="rounded-lg border border-dashed border-[var(--border-dim)] p-3">
        <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">{t("createNew")}</p>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("profileNamePlaceholder")}
            className={cn(
              "flex-1 rounded-md border bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "border-[var(--border-dim)]",
              FOCUS_RING,
            )}
          />
          <Button
            disabled={!newName.trim() || createProfile.isPending}
            onClick={() =>
              createProfile.mutate(
                { name: newName.trim() },
                {
                  onSuccess: (p) => {
                    setNewName("");
                    onSelect(p.id);
                    onCreated();
                  },
                },
              )
            }
          >
            {createProfile.isPending ? <Loader2 size={16} className="animate-spin" /> : t("create")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Step 2: Ingest ------------------------------ */

type UploadKind = "guide" | "logo" | "creative";

function IngestStep({
  clientProfileId,
  onComplete,
}: {
  clientProfileId: string;
  onComplete: (result: MultiExtractResult) => void;
}) {
  const t = useTranslations("brandTraining");
  const addToast = useAppStore((s) => s.addToast);
  const extractMulti = useExtractMulti(clientProfileId);
  const [files, setFiles] = useState<Record<string, File>>({});

  const addFiles = (incoming: FileList | null, kind: UploadKind) => {
    if (!incoming) return;
    const next = { ...files };
    Array.from(incoming).forEach((file, idx) => {
      next[`${kind}-${idx}-${file.name}`] = file;
    });
    setFiles(next);
  };

  const grouped = useMemo(() => {
    const groups: Record<UploadKind, Array<{ key: string; file: File }>> = {
      guide: [],
      logo: [],
      creative: [],
    };
    Object.entries(files).forEach(([key, file]) => {
      const kind = key.split("-")[0] as UploadKind;
      groups[kind]?.push({ key, file });
    });
    return groups;
  }, [files]);

  const handleExtract = () => {
    const entries = Object.entries(files).map(([key]) => ({
      fileName: key,
      kind: key.split("-")[0] as UploadKind,
    }));
    if (entries.length === 0) {
      addToast("error", t("noFiles"));
      return;
    }
    extractMulti.mutate(
      { entries, files },
      {
        onSuccess: onComplete,
        onError: (err) => addToast("error", err.message),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("ingestTitle")}</h2>
        <p className="text-xs text-[var(--text-muted)]">{t("ingestDesc")}</p>
      </div>

      {(["guide", "logo", "creative"] as UploadKind[]).map((kind) => (
        <Dropzone
          key={kind}
          kind={kind}
          label={t(`kind_${kind}`)}
          hint={t(`kind_${kind}_hint`)}
          items={grouped[kind]}
          onAdd={(list) => addFiles(list, kind)}
          onRemove={(key) => setFiles((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          })}
        />
      ))}

      <div className="flex items-center justify-between rounded-md bg-[var(--surface-raised)] px-3 py-2">
        <Button onClick={handleExtract} disabled={extractMulti.isPending} className="gap-1.5">
          {extractMulti.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Wand2 size={16} />
          )}
          {t("runExtract")}
        </Button>
      </div>
    </div>
  );
}

function Dropzone({
  kind,
  label,
  hint,
  items,
  onAdd,
  onRemove,
}: {
  kind: UploadKind;
  label: string;
  hint: string;
  items: Array<{ key: string; file: File }>;
  onAdd: (list: FileList | null) => void;
  onRemove: (key: string) => void;
}) {
  const inputId = `drop-${kind}`;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-[var(--text-primary)]">{label}</span>
        <span className="text-[11px] text-[var(--text-muted)]">{hint}</span>
      </div>
      <label
        htmlFor={inputId}
        className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 py-4 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--selection-border)]"
      >
        <Upload size={14} className="mr-1.5" />
        <span>Arraste ou clique para enviar</span>
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            onAdd(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map(({ key, file }) => (
            <li
              key={key}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-base)] border border-[var(--border-dim)] px-2 py-1 text-xs text-[var(--text-primary)]"
            >
              {file.name}
              <button type="button" onClick={() => onRemove(key)} aria-label="remove">
                <X size={12} className="text-[var(--text-muted)] hover:text-[var(--danger-text)]" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------ Step 3: Validate ------------------------------ */

function ValidateStep({
  clientProfileId,
  draft,
}: {
  clientProfileId: string;
  draft: MultiExtractResult["brandKit"] | null;
}) {
  const t = useTranslations("brandTraining");
  const tc = useTranslations("common");
  const addToast = useAppStore((s) => s.addToast);
  const brandKit = useBrandKit(clientProfileId);
  const updateBrandKit = useUpdateBrandKit(clientProfileId);

  // Initial values resolve from the extraction draft first, then fall back to
  // the persisted brand kit. The parent keys this component by its data source,
  // so these lazy initializers re-run cleanly when the source changes rather
  // than syncing via an effect (which the lint rule forbids).
  const [colors, setColors] = useState<string[]>(() =>
    draft?.colors ?? brandKit.data?.brandColors ?? [],
  );
  const [fonts, setFonts] = useState<string[]>(() =>
    draft?.fonts ?? brandKit.data?.brandFonts ?? [],
  );
  const [toneOfVoice, setToneOfVoice] = useState<string>(
    () => draft?.toneOfVoice ?? brandKit.data?.toneOfVoice ?? "",
  );
  const [prohibited, setProhibited] = useState<string>(
    () => draft?.prohibitedElements ?? brandKit.data?.prohibitedElements ?? "",
  );
  const [required, setRequired] = useState<string>(
    () => draft?.requiredElements ?? brandKit.data?.requiredElements ?? "",
  );

  const save = () => {
    updateBrandKit.mutate(
      {
        brandColors: colors,
        brandFonts: fonts,
        toneOfVoice,
        prohibitedElements: prohibited,
        requiredElements: required,
      },
      { onSuccess: () => addToast("success", tc("saved")) },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("validateTitle")}</h2>
        <p className="text-xs text-[var(--text-muted)]">{t("validateDesc")}</p>
      </div>

      <Field label={t("fieldColors")}>
        <TagInput tags={colors} onChange={setColors} placeholder="#000000" />
      </Field>
      <Field label={t("fieldFonts")}>
        <TagInput tags={fonts} onChange={setFonts} placeholder="Inter" />
      </Field>
      <BrandFontFiles clientProfileId={clientProfileId} />
      <BrandKnowledgeReview clientProfileId={clientProfileId} />
      <Field label={t("fieldTone")}>
        <textarea
          value={toneOfVoice}
          onChange={(e) => setToneOfVoice(e.target.value)}
          rows={3}
          className={cn(
            "w-full rounded-md border bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
            "border-[var(--border-dim)]",
            FOCUS_RING,
          )}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("fieldProhibited")}>
          <textarea
            value={prohibited}
            onChange={(e) => setProhibited(e.target.value)}
            rows={2}
            className={cn(
              "w-full rounded-md border bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "border-[var(--border-dim)]",
              FOCUS_RING,
            )}
          />
        </Field>
        <Field label={t("fieldRequired")}>
          <textarea
            value={required}
            onChange={(e) => setRequired(e.target.value)}
            rows={2}
            className={cn(
              "w-full rounded-md border bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "border-[var(--border-dim)]",
              FOCUS_RING,
            )}
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={updateBrandKit.isPending} className="gap-1.5">
          {updateBrandKit.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {tc("save")}
        </Button>
      </div>
    </div>
  );
}

function BrandFontFiles({ clientProfileId }: { clientProfileId: string }) {
  const t = useTranslations("brandTraining.fonts");
  const addToast = useAppStore((s) => s.addToast);
  const fonts = useBrandFonts(clientProfileId);
  const upload = useUploadBrandFont(clientProfileId);
  const review = useReviewBrandFont(clientProfileId);
  const [file, setFile] = useState<File | null>(null);
  const [family, setFamily] = useState("");
  const [source, setSource] = useState("");
  const [weight, setWeight] = useState<BrandFontAssetRecord["weight"]>(400);
  const [style, setStyle] = useState<"normal" | "italic">("normal");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);

  const submit = () => {
    if (!file || !family.trim() || !source.trim() || !rightsConfirmed) return;
    upload.mutate(
      { file, family: family.trim(), source: source.trim(), weight, style },
      {
        onSuccess: () => {
          setFile(null);
          setFamily("");
          setSource("");
          setRightsConfirmed(false);
          addToast("success", t("submitted"));
        },
        onError: (error) => addToast("error", error.message),
      },
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3">
      <div>
        <h3 className="text-xs font-semibold text-[var(--text-primary)]">{t("title")}</h3>
        <p className="text-[11px] text-[var(--text-muted)]">{t("generativeNotice")}</p>
      </div>
      {fonts.data && fonts.data.length > 0 && (
        <ul className="space-y-1 text-xs text-[var(--text-primary)]">
          {fonts.data.map((font) => {
            const status = font.reviewStatus ?? "approved";
            return (
            <li key={font.assetKey} className="flex items-center justify-between gap-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 py-1.5">
              <span>{font.family} · {font.weight} · {font.style}</span>
              <span className="flex items-center gap-2">
                <span className={status === "approved" ? "text-[var(--success-text)]" : "text-[var(--text-muted)]"}>
                  {t(status === "approved" ? "statusApproved" : status === "archived" ? "statusArchived" : "statusPending")}
                </span>
                {status === "pending_approval" ? (
                  <Button
                    type="button"
                    disabled={review.isPending}
                    onClick={() => review.mutate(
                      { assetKey: font.assetKey, reviewStatus: "approved" },
                      {
                        onSuccess: () => addToast("success", t("reviewApproved")),
                        onError: (error) => addToast("error", error.message),
                      },
                    )}
                  >
                    {t("approveReview")}
                  </Button>
                ) : null}
                {status !== "archived" ? (
                  <Button
                    type="button"
                    disabled={review.isPending}
                    onClick={() => review.mutate(
                      { assetKey: font.assetKey, reviewStatus: "archived" },
                      {
                        onSuccess: () => addToast("success", t("reviewArchived")),
                        onError: (error) => addToast("error", error.message),
                      },
                    )}
                  >
                    {t("archiveReview")}
                  </Button>
                ) : null}
              </span>
            </li>
            );
          })}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-[var(--text-primary)]">
          <span>{t("file")}</span>
          <input
            id="brand-font-file"
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-xs text-[var(--text-muted)]"
          />
        </label>
        <label className="space-y-1 text-xs text-[var(--text-primary)]">
          <span>{t("family")}</span>
          <input value={family} onChange={(event) => setFamily(event.target.value)} className={cn("w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 py-1.5", FOCUS_RING)} />
        </label>
        <label className="space-y-1 text-xs text-[var(--text-primary)]">
          <span>{t("source")}</span>
          <input value={source} onChange={(event) => setSource(event.target.value)} className={cn("w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 py-1.5", FOCUS_RING)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-[var(--text-primary)]">
            <span>{t("weight")}</span>
            <select value={weight} onChange={(event) => setWeight(Number(event.target.value) as BrandFontAssetRecord["weight"])} className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 py-1.5">
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-[var(--text-primary)]">
            <span>{t("style")}</span>
            <select value={style} onChange={(event) => setStyle(event.target.value as "normal" | "italic")} className="w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 py-1.5">
              <option value="normal">{t("normal")}</option>
              <option value="italic">{t("italic")}</option>
            </select>
          </label>
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
        <input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />
        <span>{t("rightsConfirmed")}</span>
      </label>
      <Button type="button" onClick={submit} disabled={!file || !family.trim() || !source.trim() || !rightsConfirmed || upload.isPending} className="gap-1.5">
        {upload.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        {t("sendForReview")}
      </Button>
    </div>
  );
}

/* ------------------------------ Step 4 (legacy surface removed) ------------------------------
 * The previous CurateStep / apiCreateReference flow is replaced by the new
 * approved-assets panel (`BrandTrainingAssets`). The legacy reference API at
 * `/api/client-profiles/:id/references` is intentionally left in place because
 * campaign flows still consume it directly.
 */

/* ------------------------------ Step 5: Voice ------------------------------ */

export function BrandVoiceSection({ clientProfileId }: { clientProfileId: string }) {
  const t = useTranslations("brandTraining");
  const tc = useTranslations("common");
  const addToast = useAppStore((s) => s.addToast);
  const extractVoice = useExtractVoice(clientProfileId);
  const approveVoice = useApproveVoice(clientProfileId);
  const [config, setConfig] = useState<BrandVoiceConfig | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("voiceTitle")}</h2>
        <p className="text-xs text-[var(--text-muted)]">{t("voiceDesc")}</p>
      </div>

      {!config ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-xs text-[var(--text-muted)]">{t("voiceOptional")}</p>
          <Button
            onClick={() =>
              extractVoice.mutate(undefined, {
                onSuccess: setConfig,
                onError: (err) => addToast("error", err.message),
              })
            }
            disabled={extractVoice.isPending}
            className="gap-1.5"
          >
            {extractVoice.isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {t("generateVoice")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            {t("voiceReviewStatus")}: <strong>{config.reviewStatus}</strong>
          </p>
          {(["principles", "positiveSignals", "negativeSignals"] as const).map((field) => (
            <Field key={field} label={t(`voice_${field}`)}>
              <textarea
                value={config.config[field].join("\n")}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    config: {
                      ...config.config,
                      [field]: e.target.value.split("\n").filter(Boolean),
                    },
                  })
                }
                rows={4}
                className={cn(
                  "w-full rounded-md border bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)]",
                  "border-[var(--border-dim)]",
                  FOCUS_RING,
                )}
              />
            </Field>
          ))}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfig(null)}
            >
              {tc("cancel")}
            </Button>
            <Button
              onClick={() =>
                approveVoice.mutate(config.config, {
                  onSuccess: (c) => {
                    setConfig(c);
                    addToast("success", t("voiceApproved"));
                  },
                  onError: (err) => addToast("error", err.message),
                })
              }
              disabled={approveVoice.isPending}
              className="gap-1.5"
            >
              {approveVoice.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {t("approveVoice")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Shared bits ------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-[var(--text-primary)]">{label}</label>
      {children}
    </div>
  );
}

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed && !tags.includes(trimmed)) onChange([...tags, trimmed]);
      setInput("");
    }
    if (e.key === "Backspace" && !input && tags.length > 0) onChange(tags.slice(0, -1));
  };
  return (
    <div
      className={cn(
        "flex min-h-[40px] w-full flex-wrap gap-1.5 rounded-md border px-2 py-1.5",
        "border-[var(--border-dim)] bg-[var(--surface-base)]",
        "focus-within:ring-[3px] focus-within:ring-[var(--focus-ring)]",
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-[var(--selection-bg)] px-2 py-0.5 text-xs font-medium text-[var(--selection-text)]"
        >
          {tag}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== tag))}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="min-w-[80px] flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
      />
    </div>
  );
}
