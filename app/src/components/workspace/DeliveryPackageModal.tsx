"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DeliveryFormat = "1:1" | "4:5" | "9:16" | "1.91:1" | "16:9";

const ALL_FORMATS: DeliveryFormat[] = ["1:1", "4:5", "9:16", "1.91:1", "16:9"];

interface DeliveryPackageModalProps {
  open: boolean;
  sourceFormat?: string | null;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (formats: DeliveryFormat[]) => void;
}

export default function DeliveryPackageModal({
  open,
  sourceFormat,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: DeliveryPackageModalProps) {
  const t = useTranslations("deliveryPackage");
  const [selected, setSelected] = useState<Record<DeliveryFormat, boolean>>({
    "1:1": true,
    "4:5": true,
    "9:16": true,
    "1.91:1": true,
    "16:9": true,
  });

  const toggleFormat = useCallback((format: DeliveryFormat) => {
    setSelected((prev) => ({ ...prev, [format]: !prev[format] }));
  }, []);

  const handleConfirm = useCallback(() => {
    const formats = ALL_FORMATS.filter((f) => selected[f]);
    onConfirm(formats);
  }, [selected, onConfirm]);

  const hasGeneratableSelection = ALL_FORMATS.some(
    (format) => selected[format] && format !== sourceFormat
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {ALL_FORMATS.map((format) => {
            const isSource = format === sourceFormat;
            return (
              <label
                key={format}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer",
                  selected[format]
                    ? "border-[var(--accent-mint)] bg-[var(--accent-mint-dim)]"
                    : "border-[var(--border-dim)] bg-[var(--surface-base)]"
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border-dim)] text-[var(--accent-mint)] focus:ring-[var(--accent-mint)]"
                  checked={selected[format]}
                  disabled={isSource}
                  onChange={() => toggleFormat(format)}
                  aria-label={format}
                />
                <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">
                  {format}
                </span>
                {isSource && (
                  <span className="text-xs text-[var(--accent-mint)] font-medium">
                    {t("ready")}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || !hasGeneratableSelection}
            className="bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)]"
          >
            {isSubmitting ? t("generating") : t("confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
