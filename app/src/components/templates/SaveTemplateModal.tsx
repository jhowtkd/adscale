"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCreateTemplate } from "@/lib/hooks/use-templates";

interface SaveTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
}

export default function SaveTemplateModal({
  open,
  onOpenChange,
  campaignId,
  campaignName,
}: SaveTemplateModalProps) {
  const tCommon = useTranslations("common");
  const tTemplate = useTranslations("template");
  const tErrors = useTranslations("errors");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createTemplate = useCreateTemplate();

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setError(null);

      if (!name.trim()) {
        setError(tErrors("nameRequired"));
        return;
      }

      try {
        await createTemplate.mutateAsync({
          campaignId,
          name: name.trim(),
          description: description.trim() || undefined,
        });
        setName("");
        setDescription("");
        onOpenChange(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : tErrors("generic");
        setError(message);
      }
    },
    [campaignId, name, description, createTemplate, onOpenChange, tErrors]
  );

  const handleCancel = useCallback(() => {
    onOpenChange(false);
    setName("");
    setDescription("");
    setError(null);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[var(--surface-raised)] border border-[var(--border-dim)] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-[18px] font-semibold text-[var(--text-primary)]">
            {tTemplate("saveAsTemplate")}
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--text-secondary)]">
            {tTemplate("saveDescription", { campaignName })}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="px-6 pb-4 space-y-5"
        >
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tTemplate("templateName")}{" "}
              <span className="text-[var(--accent-rose)]">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tTemplate("namePlaceholder")}
              className={cn(
                "bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                error && "border-[var(--accent-rose)]"
              )}
            />
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-[var(--accent-rose)]"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tTemplate("description")}
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tTemplate("descriptionPlaceholder")}
              className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] min-h-[80px]"
            />
          </div>
        </form>

        <DialogFooter className="px-6 py-4 border-t border-[var(--border-dim)] flex-row justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            className="border-[var(--border-dim)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
          >
            {tCommon("cancel")}
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={createTemplate.isPending}
            className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)]"
          >
            {createTemplate.isPending
              ? tCommon("saving")
              : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
