"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title = "Confirmar ação",
  description = "Tem certeza que deseja continuar? Esta ação não pode ser desfeita.",
  confirmLabel = "Confirmar",
  cancelLabel,
  variant = "destructive",
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  const tCommon = useTranslations("common");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--text-primary)]">
            <AlertTriangle size={20} className="text-[var(--danger-text)]" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading || isLoading}
            className="border-[var(--border-dim)] text-[var(--text-secondary)]"
          >
            {cancelLabel ?? tCommon("cancel")}
          </Button>
          <Button
            variant={variant}
            onClick={handleConfirm}
            disabled={loading || isLoading}
            className={
              variant === "destructive"
                ? "bg-[var(--danger-bg)] text-[var(--danger-text)] hover:bg-[var(--danger-bg)]"
                : ""
            }
          >
            {loading || isLoading ? tCommon("loading") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
