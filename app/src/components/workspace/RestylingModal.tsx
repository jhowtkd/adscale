"use client";

import { useReducer, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { ImageIcon, UploadCloud } from "lucide-react";

interface RestylingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

interface RestylingModalState {
  form: RestylingForm;
  baseImage: File | null;
  styleImage: File | null;
  errors: FormErrors;
  isSubmitting: boolean;
}

const initialRestylingModalState: RestylingModalState = {
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

function restylingModalReducer(
  state: RestylingModalState,
  payload: Partial<RestylingModalState>
): RestylingModalState {
  return { ...state, ...payload };
}

export default function RestylingModal({ open, onOpenChange }: RestylingModalProps) {
  const t = useTranslations("restyling");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();

  const [state, updateState] = useReducer(restylingModalReducer, initialRestylingModalState);
  const { form, baseImage, styleImage, errors, isSubmitting } = state;

  const updateField = useCallback(<K extends keyof RestylingForm>(field: K, value: RestylingForm[K]) => {
    const nextForm = { ...form, [field]: value };
    if (errors[field as keyof FormErrors]) {
      const nextErrors = { ...errors };
      delete nextErrors[field as keyof FormErrors];
      updateState({ form: nextForm, errors: nextErrors });
      return;
    }
    updateState({ form: nextForm });
  }, [errors, form]);

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!form.name.trim()) {
      newErrors.name = tErrors("nameRequired");
    }
    if (!baseImage) {
      newErrors.baseImage = t("baseImageRequired");
    }
    if (!styleImage) {
      newErrors.styleImage = t("styleImageRequired");
    }
    updateState({ errors: newErrors });
    return Object.keys(newErrors).length === 0;
  }, [form.name, baseImage, styleImage, tErrors, t]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      updateState({ isSubmitting: true });
      const controller = new AbortController();

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
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const devMsg = data.details?.devError?.message;
          throw new Error(
            devMsg || data.error || data.message || "Submission failed"
          );
        }

        const data = await res.json();
        onOpenChange(false);
        router.push(data.redirectUrl || `/campaigns/${data.campaignId}`);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        logger.error("[RestylingModal] submit error", { error: err instanceof Error ? err.message : String(err) });
        updateState({ errors: {
          name: err instanceof Error ? err.message : "Submission failed",
        } });
      } finally {
        updateState({ isSubmitting: false });
      }

      return () => controller.abort();
    },
    [form, baseImage, styleImage, validate, onOpenChange, router]
  );

  const handleBaseImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    const nextErrors = { ...errors };
    delete nextErrors.baseImage;
    updateState({ baseImage: file, errors: nextErrors });
  }, [errors]);

  const handleStyleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    const nextErrors = { ...errors };
    delete nextErrors.styleImage;
    updateState({ styleImage: file, errors: nextErrors });
  }, [errors]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader>
          <div className="border-b border-[var(--border-dim)] px-5 py-4">
            <DialogTitle className="text-[18px]">{t("title")}</DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 px-5 pb-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Name */}
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

            {/* Client */}
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

            {/* Offer */}
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

            {/* CTA Text */}
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

            {/* Notes */}
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

          {/* Style Intensity */}
          <div className="space-y-1.5 sm:col-span-2">
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
                      ? "border-[var(--accent-green)] bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
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
              onChange={handleBaseImageChange}
            />
            <FilePicker
              id="restyling-style-image"
              label={t("styleImageLabel")}
              selectLabel={t("selectFile")}
              replaceLabel={t("replaceFile")}
              file={styleImage}
              error={errors.styleImage}
              disabled={isSubmitting}
              onChange={handleStyleImageChange}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-3 border-t border-[var(--border-dim)] pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? tCommon("loading") : t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--accent-green-dim)] text-[var(--accent-green)]">
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
