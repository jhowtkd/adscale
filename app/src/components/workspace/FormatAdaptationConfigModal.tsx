"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crop, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DerivationIntent } from "@/lib/hooks/use-derivation-flow";

const SHELL_KEY: Record<
  Extract<DerivationIntent, "single_format" | "batch_format">,
  "singleFormat" | "batchFormat"
> = {
  single_format: "singleFormat",
  batch_format: "batchFormat",
};

interface FormatAdaptationConfigModalProps {
  open: boolean;
  intent: Extract<DerivationIntent, "single_format" | "batch_format">;
  onBack: () => void;
  onClose: () => void;
}

export default function FormatAdaptationConfigModal({
  open,
  intent,
  onBack,
  onClose,
}: FormatAdaptationConfigModalProps) {
  const t = useTranslations("workspace.derivar");
  const shellKey = SHELL_KEY[intent];
  const Icon = intent === "single_format" ? Crop : Layers;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon size={18} className="text-[var(--accent-green)]" />
            {t(`shell.${shellKey}.title`)}
          </DialogTitle>
          <DialogDescription>{t(`shell.${shellKey}.description`)}</DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={onBack}>
            {t("actions.back")}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t("actions.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
