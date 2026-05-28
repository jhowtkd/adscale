"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RestylingFormProps {
  name: string;
  onNameChange: (v: string) => void;
  client: string;
  onClientChange: (v: string) => void;
  offer: string;
  onOfferChange: (v: string) => void;
  ctaText: string;
  onCtaTextChange: (v: string) => void;
  styleIntensity: "soft" | "medium" | "strong";
  onStyleIntensityChange: (v: "soft" | "medium" | "strong") => void;
  errors: {
    name?: string;
  };
}

const intensityOptions = [
  {
    value: "soft" as const,
    labelKey: "styleIntensity.soft",
    descriptionKey: "styleIntensity.softDescription",
  },
  {
    value: "medium" as const,
    labelKey: "styleIntensity.medium",
    descriptionKey: "styleIntensity.mediumDescription",
  },
  {
    value: "strong" as const,
    labelKey: "styleIntensity.strong",
    descriptionKey: "styleIntensity.strongDescription",
  },
];

export default function RestylingForm({
  name,
  onNameChange,
  client,
  onClientChange,
  offer,
  onOfferChange,
  ctaText,
  onCtaTextChange,
  styleIntensity,
  onStyleIntensityChange,
  errors,
}: RestylingFormProps) {
  const t = useTranslations("restyling");

  return (
    <div className="max-w-[720px] mx-auto space-y-5">
      {/* ---- Name ---- */}
      <div>
        <Label className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] mb-2">
          {t("name")}
          <span className="text-[var(--accent-rose)]">*</span>
        </Label>
        <Input
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className={cn(
            "h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
            "focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
            errors.name && "border-[var(--accent-rose)] ring-[3px] ring-[rgba(244,63,94,0.15)]"
          )}
          autoFocus
        />
        {errors.name && (
          <p className="text-xs text-[var(--accent-rose)] mt-1 animate-fade-in">
            {errors.name}
          </p>
        )}
      </div>

      {/* ---- Client / Offer ---- */}
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[var(--text-secondary)]">
              {t("client")}
            </Label>
            <Input
              placeholder={t("clientPlaceholder")}
              value={client}
              onChange={(e) => onClientChange(e.target.value)}
              className="h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[var(--text-secondary)]">
              {t("offer")}
            </Label>
            <Input
              placeholder={t("offerPlaceholder")}
              value={offer}
              onChange={(e) => onOfferChange(e.target.value)}
              className="h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]"
            />
          </div>
        </div>
      </div>

      {/* ---- CTA Text ---- */}
      <div>
        <Label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
          {t("ctaText")}
        </Label>
        <Input
          placeholder={t("ctaTextPlaceholder")}
          value={ctaText}
          onChange={(e) => onCtaTextChange(e.target.value)}
          className="h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]"
        />
      </div>

      {/* ---- Style Intensity ---- */}
      <div>
        <Label className="text-xs font-medium text-[var(--text-secondary)] mb-3 block">
          {t("styleIntensity.label")}
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {intensityOptions.map((option) => {
            const isSelected = styleIntensity === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onStyleIntensityChange(option.value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-center transition-all duration-200",
                  isSelected
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10"
                    : "border-[var(--border-dim)] bg-[var(--surface-base)] hover:border-[var(--border-medium)] hover:bg-[var(--surface-raised)]"
                )}
              >
                <span
                  className={cn(
                    "text-sm font-medium",
                    isSelected ? "text-[var(--accent-blue)]" : "text-[var(--text-primary)]"
                  )}
                >
                  {t(option.labelKey)}
                </span>
                <span
                  className={cn(
                    "text-[11px] leading-relaxed",
                    isSelected ? "text-[var(--accent-blue)]/80" : "text-[var(--text-muted)]"
                  )}
                >
                  {t(option.descriptionKey)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
