"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

interface DeleteCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignName: string;
  onConfirm: () => void;
}

export default function DeleteCampaignDialog({
  open,
  onOpenChange,
  campaignName,
  onConfirm,
}: DeleteCampaignDialogProps) {
  const tc = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[var(--surface-raised)] border-[var(--border-dim)] max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold text-[var(--text-primary)]">
            {tc("delete")}
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--text-secondary)]">
            {tc("deleteCampaignConfirm", { name: campaignName })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row justify-end gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-[var(--border-dim)] text-[var(--text-secondary)]"
          >
            {tc("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            className="bg-[var(--accent-rose)] text-white hover:opacity-90"
          >
            {tc("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
