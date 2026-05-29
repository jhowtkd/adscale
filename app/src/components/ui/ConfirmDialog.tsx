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
  cancelLabel = "Cancelar",
  variant = "destructive",
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--text-primary)]">
            <AlertTriangle size={20} className="text-[var(--accent-rose)]" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-t border-[var(--border-dim)] pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading || isLoading}
            className="border-[var(--border-dim)] text-[var(--text-secondary)]"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={handleConfirm}
            disabled={loading || isLoading}
            className={
              variant === "destructive"
                ? "bg-[var(--accent-rose)] text-white hover:bg-[var(--accent-rose)]/80"
                : ""
            }
          >
            {loading || isLoading ? "Carregando..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
