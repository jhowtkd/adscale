"use client";

import { useState, useCallback, useRef } from "react";
import { AnimatePresence, m } from "framer-motion";
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
import { Label } from "@/components/ui/label";

// ============================================
// Types
// ============================================

interface NewCampaignForm {
  name: string;
  clientName: string;
}

interface FormErrors {
  name?: string;
  clientName?: string;
}

interface NewCampaignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    client: string;
    clientProfileId: string | null;
  }) => void;
}

// ============================================
// Component
// ============================================

export default function NewCampaignModal({
  open,
  onOpenChange,
  onSubmit,
}: NewCampaignModalProps) {
  const tCampaign = useTranslations("campaign");
  const tBriefing = useTranslations("briefing");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  const [form, setForm] = useState<NewCampaignForm>({
    name: "",
    clientName: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const touchedRef = useRef<Record<keyof NewCampaignForm, boolean>>({
    name: false,
    clientName: false,
  });

  const updateField = useCallback(
    <K extends keyof NewCampaignForm>(field: K, value: NewCampaignForm[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      if (touchedRef.current[field]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field as keyof FormErrors];
          return next;
        });
      }
    },
    []
  );

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!form.name.trim()) newErrors.name = tErrors("nameRequired");
    if (!form.clientName.trim()) newErrors.clientName = tErrors("clientRequired");
    setErrors(newErrors);
    touchedRef.current = {
      name: true,
      clientName: true,
    };
    return Object.keys(newErrors).length === 0;
  }, [form, tErrors]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!validate()) return;
      onSubmit({
        name: form.name,
        client: form.clientName,
        clientProfileId: null,
      });
      setForm({
        name: "",
        clientName: "",
      });
      setErrors({});
      touchedRef.current = { name: false, clientName: false };
      onOpenChange(false);
    },
    [form, validate, onSubmit, onOpenChange]
  );

  const handleCancel = useCallback(() => {
    onOpenChange(false);
    setForm({ name: "", clientName: "" });
    setErrors({});
    touchedRef.current = { name: false, clientName: false };
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[calc(100vh-2rem)] overflow-hidden bg-[var(--surface-raised)] border border-[var(--border-dim)] p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-[18px] font-semibold text-[var(--text-primary)]">
            {tCampaign("createNew")}
          </DialogTitle>
          <DialogDescription className="text-sm text-[var(--text-secondary)]">
            {tCampaign("createDescription")}
          </DialogDescription>
        </DialogHeader>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="max-h-[calc(100vh-10rem)] overflow-y-auto px-6 pb-4 space-y-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Campaign Name */}
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name" className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("name")} <span className="text-[var(--accent-rose)]">*</span>
            </Label>
            <Input
              id="campaign-name"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              onBlur={() => {
                touchedRef.current = { ...touchedRef.current, name: true };
              }}
              placeholder={tBriefing("namePlaceholder")}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
              className={cn(
                "bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                errors.name && "border-[var(--accent-rose)]"
              )}
            />
            <AnimatePresence>
              {errors.name && (
                <m.p
                  id="name-error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-[var(--accent-rose)]"
                >
                  {errors.name}
                </m.p>
              )}
            </AnimatePresence>
          </div>

          {/* Client/Brand Name */}
          <div className="space-y-1.5">
            <Label htmlFor="campaign-client" className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("client")} <span className="text-[var(--accent-rose)]">*</span>
            </Label>
            <Input
              id="campaign-client"
              value={form.clientName}
              onChange={(e) => updateField("clientName", e.target.value)}
              onBlur={() => {
                touchedRef.current = { ...touchedRef.current, clientName: true };
              }}
              placeholder={tBriefing("clientPlaceholder")}
              aria-invalid={!!errors.clientName}
              aria-describedby={errors.clientName ? "client-error" : undefined}
              className={cn(
                "bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                errors.clientName && "border-[var(--accent-rose)]"
              )}
            />
            <AnimatePresence>
              {errors.clientName && (
                <m.p
                  id="client-error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-[var(--accent-rose)]"
                >
                  {errors.clientName}
                </m.p>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <DialogFooter className="px-6 py-4 border-t border-[var(--border-dim)] flex-row justify-end gap-2 -mx-6 -mb-4 mt-2">
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
              className="bg-[var(--accent-green)] text-[var(--accent-green-on-fill)] hover:opacity-90"
            >
              {tCommon("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
