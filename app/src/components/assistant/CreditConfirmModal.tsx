"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface CreditConfirmModalProps {
  open: boolean;
  creditCost: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CreditConfirmModal({
  open,
  creditCost,
  isPending,
  onConfirm,
  onCancel,
}: CreditConfirmModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent size="sm" data-testid="credit-confirm-modal">
        <DialogHeader>
          <DialogTitle>Confirmar revisão do criativo</DialogTitle>
          <DialogDescription>
            Esta revisão custa {creditCost} créditos. O valor será descontado agora e a geração
            acontecerá em segundo plano.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            aria-busy={isPending || undefined}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Confirmar
              </>
            ) : (
              "Confirmar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}