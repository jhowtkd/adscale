"use client";

import { useReducer, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { m } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageFrame from "@/components/layout/PageFrame";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { ImageIcon, UploadCloud } from "lucide-react";

interface RestylingForm {
  name: string;
  client: string;
  offer: string;
  ctaText: string;
  notes: string;
  styleIntensity: "soft" | "medium" | "strong";
}

interface FormErrors {
  name?: string;
  baseImage?: string;
  styleImage?: string;
}

interface RestylingPageState {
  form: RestylingForm;
  baseImage: File | null;
  styleImage: File | null;
  errors: FormErrors;
  isSubmitting: boolean;
}

const initialState: RestylingPageState = {
  form: {
    name: "",
    client: "",
    offer: "",
    ctaText: "",
    notes: "",
    styleIntensity: "medium",
  },
  baseImage: null,
  styleImage: null,
  errors: {},
  isSubmitting: false,
};

function pageReducer(
  state: RestylingPageState,
  payload: Partial<RestylingPageState>
): RestylingPageState {
  return { ...state, ...payload };
}

export default function QuickToolsRestylingPage() {
  const t = useTranslations("restyling");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();

  const [state, updateState] = useReducer(pageReducer, initialState);
  const { form, baseImage, styleImage, errors, isSubmitting } = state;

  const updateField = useCallback(
    <K extends keyof RestylingForm>(field: K, value: RestylingForm[K]) => {
      const nextForm = { ...form, [field]: value };
      if (errors[field as keyof FormErrors]) {
        const nextErrors = { ...errors };
        delete nextErrors[field as keyof FormErrors];
        updateState({ form: nextForm, errors: nextErrors });
        return;
      }
      updateState({ form: nextForm });
    },
    [errors, form]
  );

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!form.name.trim()) newErrors.name = tErrors("nameRequired");
    if (!baseImage) newErrors.baseImage = t("baseImageRequired");
    if (!styleImage) newErrors.styleImage = t("styleImageRequired");
    updateState({ errors: newErrors });
    return Object.keys(newErrors).length === 0;
  }, [form.name, baseImage, styleImage, tErrors, t]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      updateState({ isSubmitting: true });

      try {
        const formData = new FormData();
        formData.append("name", form.name.trim());
        formData.append("client", form.client.trim());
        formData.append("offer", form.offer.trim());
        formData.append("ctaText", form.ctaText.trim());
        formData.append("notes", form.notes.trim());
        formData.append("styleIntensity", form.styleIntensity);
        if (baseImage) formData.append("baseImage", baseImage);
        if (styleImage) formData.append("styleImage", styleImage);

        const res = await fetch("/api/quick-tools/restyling", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const devMsg = data.details?.devError?.message;
          throw new Error(devMsg || data.error || data.message || "Submission failed");
        }

        const data = await res.json();
        router.push(data.redirectUrl || `/campaigns/${data.campaignId}`);
      } catch (err) {
        logger.error("[QuickToolsRestyling] submit error", {
          error: err instanceof Error ? err.message : String(err),
        });
        toast.error(err instanceof Error ? err.message : tCommon("error"));
        updateState({
          errors: {
            name: err instanceof Error ? err.message : "Submission failed",
          },
        });
      } finally {
        updateState({ isSubmitting: false });
      }
    },
    [form, baseImage, styleImage, validate, router, tCommon]
  );

  const handleCancel = useCallback(() => {
    router.push("/campaigns");
  }, [router]);

  return (
    <PageFrame width="form" className="[--content-max:42rem]">
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.19, 1, 0.22, 1] }}
        className="pb-6 border-b border-[var(--border-dim)] mb-8"
      >
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("description")}</p>
      </m.div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="restyling-name">{t("nameLabel")}</Label>
            <Input
              id="restyling-name"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder={t("namePlaceholder")}
              disabled={isSubmitting}
            />
            {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="restyling-client">{t("clientLabel")}</Label>
            <Input
              id="restyling-client"
              value={form.client}
              onChange={(e) => updateField("client", e.target.value)}
              placeholder={t("clientPlaceholder")}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="restyling-offer">{t("offerLabel")}</Label>
            <Input
              id="restyling-offer"
              value={form.offer}
              onChange={(e) => updateField("offer", e.target.value)}
              placeholder={t("offerPlaceholder")}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="restyling-cta">{t("ctaLabel")}</Label>
            <Input
              id="restyling-cta"
              value={form.ctaText}
              onChange={(e) => updateField("ctaText", e.target.value)}
              placeholder={t("ctaPlaceholder")}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="restyling-notes">{t("notesLabel")}</Label>
            <Textarea
              id="restyling-notes"
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder={t("notesPlaceholder")}
              rows={3}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("styleIntensityLabel")}</Label>
          <div className="flex gap-2">
            {(["soft", "medium", "strong"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={form.styleIntensity === option}
                onClick={() => updateField("styleIntensity", option)}
                disabled={isSubmitting}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  form.styleIntensity === option
                    ? "border-[var(--accent-green)] bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]"
                    : "border-[var(--border-medium)] bg-[var(--surface-raised)] text-[var(--text-muted)] hover:border-[var(--accent-green)] hover:text-[var(--text-primary)]",
                  isSubmitting && "pointer-events-none opacity-60"
                )}
              >
                {t(`styleIntensity.${option}`)}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {t(`styleIntensity.help.${form.styleIntensity}`)}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FilePicker
            id="restyling-base-image"
            label={t("baseImageLabel")}
            selectLabel={t("selectFile")}
            replaceLabel={t("replaceFile")}
            file={baseImage}
            error={errors.baseImage}
            disabled={isSubmitting}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              const nextErrors = { ...errors };
              delete nextErrors.baseImage;
              updateState({ baseImage: file, errors: nextErrors });
            }}
          />
          <FilePicker
            id="restyling-style-image"
            label={t("styleImageLabel")}
            selectLabel={t("selectFile")}
            replaceLabel={t("replaceFile")}
            file={styleImage}
            error={errors.styleImage}
            disabled={isSubmitting}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              const nextErrors = { ...errors };
              delete nextErrors.styleImage;
              updateState({ styleImage: file, errors: nextErrors });
            }}
          />
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-[var(--border-dim)] pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? tCommon("loading") : t("submit")}
          </Button>
        </div>
      </form>
    </PageFrame>
  );
}

function FilePicker({
  id,
  label,
  selectLabel,
  replaceLabel,
  file,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  selectLabel: string;
  replaceLabel: string;
  file: File | null;
  error?: string;
  disabled: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <label
        htmlFor={id}
        className={cn(
          "flex min-h-[116px] cursor-pointer flex-col justify-between rounded-lg border border-dashed border-[var(--border-medium)] bg-[var(--surface-raised)] p-4 transition-colors",
          "hover:border-[var(--accent-green)] hover:bg-[var(--surface-base)]",
          disabled && "pointer-events-none opacity-60",
          error && "border-[var(--accent-rose)] bg-[rgba(225,29,72,0.12)]"
        )}
      >
        <span className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--accent-green-dim)] text-[var(--accent-green-text)]">
            {file ? <ImageIcon size={18} /> : <UploadCloud size={18} />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
              {file ? file.name : "PNG, JPG, WebP"}
            </span>
            {file && (
              <span className="mt-1 block text-xs text-[var(--text-muted)]">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </span>
            )}
          </span>
        </span>
        <span className="text-xs font-medium text-[var(--accent-green)]">
          {file ? replaceLabel : selectLabel}
        </span>
      </label>
      <Input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
