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
import { Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DerivationIntent } from "@/lib/hooks/use-derivation-flow";

const SHELL_KEY: Record<
  Extract<DerivationIntent, "manual_art" | "auto_art">,
  "manualArt" | "autoArt"
> = {
  manual_art: "manualArt",
  auto_art: "autoArt",
};

interface ArtVariationConfigModalProps {
  open: boolean;
  intent: Extract<DerivationIntent, "manual_art" | "auto_art">;
  onBack: () => void;
  onClose: () => void;
}

export default function ArtVariationConfigModal({
  open,
  intent,
  onBack,
  onClose,
}: ArtVariationConfigModalProps) {
  const t = useTranslations("workspace.derivar");
  const shellKey = SHELL_KEY[intent];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette size={18} className="text-[var(--accent-green)]" />
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
