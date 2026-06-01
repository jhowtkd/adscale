"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crop, Layers, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { DerivationIntent } from "@/lib/hooks/use-derivation-flow";

import {
  DERIVATION_FORMATS,
  type DerivationFormat,
} from "@/lib/derivation-formats";

export type { DerivationFormat };

const SHELL_KEY: Record<
  Extract<DerivationIntent, "single_format" | "batch_format">,
  "singleFormat" | "batchFormat"
> = {
  single_format: "singleFormat",
  batch_format: "batchFormat",
};

const FORMAT_I18N_KEY: Record<DerivationFormat, "square" | "portrait" | "stories"> = {
  "1:1": "square",
  "4:5": "portrait",
  "9:16": "stories",
};

export interface FormatAdaptationConfig {
  targetFormats: DerivationFormat[];
}

interface FormatAdaptationConfigModalProps {
  open: boolean;
  intent: Extract<DerivationIntent, "single_format" | "batch_format">;
  isSubmitting?: boolean;
  onBack: () => void;
  onClose: () => void;
  onConfirm: (config: FormatAdaptationConfig) => void;
}

export default function FormatAdaptationConfigModal({
  open,
  intent,
  isSubmitting,
  onBack,
  onClose,
  onConfirm,
}: FormatAdaptationConfigModalProps) {
  const t = useTranslations("workspace.derivar");
  const tBriefing = useTranslations("briefing");
  const shellKey = SHELL_KEY[intent];
  const Icon = intent === "single_format" ? Crop : Layers;

  const [selectedSingle, setSelectedSingle] = useState<DerivationFormat>("1:1");
  const [selectedBatch, setSelectedBatch] = useState<Record<DerivationFormat, boolean>>({
    "1:1": true,
    "4:5": true,
    "9:16": true,
  });

  const batchFormats = DERIVATION_FORMATS.filter((format) => selectedBatch[format]);
  const canConfirm =
    intent === "single_format" ? Boolean(selectedSingle) : batchFormats.length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      targetFormats:
        intent === "single_format" ? [selectedSingle] : batchFormats,
    });
  };

  const toggleBatchFormat = (format: DerivationFormat) => {
    setSelectedBatch((prev) => {
      const next = { ...prev, [format]: !prev[format] };
      const selectedCount = DERIVATION_FORMATS.filter((item) => next[item]).length;
      if (selectedCount === 0) return prev;
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent key={open ? intent : "closed"} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon size={18} className="text-[var(--accent-green)]" />
            {t(`config.${shellKey}.title`)}
          </DialogTitle>
          <DialogDescription>{t(`config.${shellKey}.description`)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {DERIVATION_FORMATS.map((format) => {
            const labelKey = FORMAT_I18N_KEY[format];
            const isSingle = intent === "single_format";
            const isSelected = isSingle
              ? selectedSingle === format
              : selectedBatch[format];

            return (
              <label
                key={format}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  isSelected
                    ? "border-[var(--accent-green)] bg-[var(--accent-green-dim)]"
                    : "border-[var(--border-dim)] bg-[var(--surface-base)]"
                )}
              >
                <input
                  type={isSingle ? "radio" : "checkbox"}
                  name={isSingle ? "derivation-format" : undefined}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--accent-green)]"
                  checked={isSelected}
                  onChange={() => {
                    if (isSingle) {
                      setSelectedSingle(format);
                      return;
                    }
                    toggleBatchFormat(format);
                  }}
                  aria-label={tBriefing(`targetFormats.${labelKey}.label`)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[var(--text-primary)]">
                    {tBriefing(`targetFormats.${labelKey}.label`)}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                    {tBriefing(`targetFormats.${labelKey}.description`)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
            {t("actions.back")}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t("actions.cancel")}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm || isSubmitting}
              className="bg-[var(--accent-green)] text-[var(--accent-green-on-fill)] hover:bg-[var(--accent-green-light)]"
            >
              {isSubmitting ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Sparkles size={14} className="mr-1.5" />
              )}
              {t("actions.confirm")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
