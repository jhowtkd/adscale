"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DeliveryFormat = "1:1" | "4:5" | "9:16" | "1.91:1" | "16:9";

const ALL_FORMATS: DeliveryFormat[] = ["1:1", "4:5", "9:16", "1.91:1", "16:9"];

interface DeliveryPackageModalProps {
  open: boolean;
  sourceFormat?: string | null;
  isDownloading?: boolean;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onDownloadCurrent: () => void;
  onConfirm: (formats: DeliveryFormat[]) => void;
}

export default function DeliveryPackageModal({
  open,
  sourceFormat,
  isDownloading,
  isSubmitting,
  onOpenChange,
  onDownloadCurrent,
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
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {t("downloadCurrentTitle")}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {sourceFormat
                  ? t("downloadCurrentDescription", { format: sourceFormat })
                  : t("downloadCurrentDescriptionFallback")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={onDownloadCurrent}
              disabled={isDownloading}
              className="shrink-0"
            >
              {isDownloading ? t("downloading") : t("downloadCurrent")}
            </Button>
          </div>

          <div className="space-y-3">
            {ALL_FORMATS.map((format) => {
              const isSource = format === sourceFormat;
              return (
                <label
                  key={format}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer",
                    selected[format]
                      ? "border-[var(--accent-green)] bg-[var(--accent-green-dim)]"
                      : "border-[var(--border-dim)] bg-[var(--surface-base)]"
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-[var(--border-dim)] text-[var(--accent-green)] focus:ring-[var(--accent-green)]"
                    checked={selected[format]}
                    disabled={isSource}
                    onChange={() => toggleFormat(format)}
                    aria-label={format}
                  />
                  <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">
                    {format}
                  </span>
                  {isSource && (
                    <span className="text-xs text-[var(--accent-green)] font-medium">
                      {t("ready")}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || !hasGeneratableSelection}
            className="bg-[var(--accent-green)] text-[var(--accent-green-on-fill)] hover:bg-[var(--accent-green-light)]"
          >
            {isSubmitting ? t("generating") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
