"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { CampaignStatus, AdPlatform } from "@/lib/mock-data";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============================================
// Types
// ============================================

interface NewCampaignForm {
  name: string;
  clientName: string;
  generationMode: "art_variation" | "format_adaptation";
  targetFormat: string;
  constraints: string;
  notes: string;
}

interface FormErrors {
  name?: string;
  clientName?: string;
  generationMode?: string;
  targetFormat?: string;
}

interface NewCampaignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (campaign: {
    name: string;
    client: string;
    generationMode: "art_variation" | "format_adaptation";
    targetFormats?: string[];
    constraints?: string;
    notes?: string;
    platforms: AdPlatform[];
    status: CampaignStatus;
    variations: number;
    creditsUsed: number;
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

  const MODE_OPTIONS = [
    {
      value: "art_variation" as const,
      label: tCampaign("modes.artVariation.label"),
      description: tCampaign("modes.artVariation.description"),
    },
    {
      value: "format_adaptation" as const,
      label: tCampaign("modes.formatAdaptation.label"),
      description: tCampaign("modes.formatAdaptation.description"),
    },
  ];

  const [form, setForm] = useState<NewCampaignForm>({
    name: "",
    clientName: "",
    generationMode: "art_variation",
    targetFormat: "",
    constraints: "",
    notes: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const updateField = useCallback(
    <K extends keyof NewCampaignForm>(field: K, value: NewCampaignForm[K]) => {
      if (value === null) return;
      setForm((prev) => ({ ...prev, [field]: value }));
      if (touched[field]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field as keyof FormErrors];
          return next;
        });
      }
    },
    [touched]
  );

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!form.name.trim()) newErrors.name = tErrors("nameRequired");
    if (!form.clientName.trim()) newErrors.clientName = tErrors("clientRequired");
    if (!form.generationMode) newErrors.generationMode = tErrors("modeRequired");
    if (form.generationMode === "format_adaptation" && !form.targetFormat) {
      newErrors.targetFormat = tErrors("targetFormatRequired");
    }
    setErrors(newErrors);
    setTouched({
      name: true,
      clientName: true,
      generationMode: true,
    });
    return Object.keys(newErrors).length === 0;
  }, [form, tErrors]);

  const handleSubmit = useCallback(() => {
    if (!validate()) return;
    onSubmit({
      name: form.name,
      client: form.clientName,
      generationMode: form.generationMode,
      targetFormats: form.generationMode === "format_adaptation" && form.targetFormat
        ? [form.targetFormat]
        : undefined,
      constraints: form.constraints || undefined,
      notes: form.notes || undefined,
      platforms: ["Meta"],
      status: "draft",
      variations: 0,
      creditsUsed: 0,
    });
    setForm({
      name: "",
      clientName: "",
      generationMode: "art_variation",
      targetFormat: "",
      constraints: "",
      notes: "",
    });
    setErrors({});
    setTouched({});
    onOpenChange(false);
  }, [form, validate, onSubmit, onOpenChange]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
    setErrors({});
    setTouched({});
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
        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto px-6 pb-4 space-y-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {/* Campaign Name */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("name")} <span className="text-[var(--accent-rose)]">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, name: true }))}
              placeholder={tBriefing("namePlaceholder")}
              className={cn(
                "bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                errors.name && "border-[var(--accent-rose)]"
              )}
            />
            <AnimatePresence>
              {errors.name && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-[var(--accent-rose)]"
                >
                  {errors.name}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Client/Product Name */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("client")} <span className="text-[var(--accent-rose)]">*</span>
            </Label>
            <Input
              value={form.clientName}
              onChange={(e) => updateField("clientName", e.target.value)}
              onBlur={() => setTouched((p) => ({ ...p, clientName: true }))}
              placeholder={tBriefing("clientPlaceholder")}
              className={cn(
                "bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                errors.clientName && "border-[var(--accent-rose)]"
              )}
            />
            <AnimatePresence>
              {errors.clientName && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-[var(--accent-rose)]"
                >
                  {errors.clientName}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Generation Mode */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("mode")} <span className="text-[var(--accent-rose)]">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {MODE_OPTIONS.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => updateField("generationMode", mode.value)}
                  className={cn(
                    "relative flex flex-col items-start gap-1 rounded-lg border px-4 py-3 text-left transition-all duration-200",
                    form.generationMode === mode.value
                      ? "border-[var(--accent-blue)] bg-[rgba(99,102,241,0.08)] ring-1 ring-[var(--accent-blue)]"
                      : "border-[var(--border-dim)] bg-[var(--surface-base)] hover:border-[var(--border-medium)] hover:bg-[var(--surface-raised)]"
                  )}
                >
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {mode.label}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {mode.description}
                  </span>
                  {form.generationMode === mode.value && (
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[var(--accent-blue)]" />
                  )}
                </button>
              ))}
            </div>
            <AnimatePresence>
              {errors.generationMode && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-[var(--accent-rose)]"
                >
                  {errors.generationMode}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Target Format */}
          {form.generationMode === "format_adaptation" && (
            <div className="space-y-1.5">
              <Label className="text-[13px] text-[var(--text-secondary)]">
                {tBriefing("targetFormat.label")} <span className="text-[var(--accent-rose)]">*</span>
              </Label>
              <div className="grid grid-cols-3 gap-3">
                {["1:1", "4:5", "9:16"].map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => updateField("targetFormat", fmt)}
                    className={cn(
                      "relative rounded-lg border px-3 py-2 text-sm text-center transition-all duration-200",
                      form.targetFormat === fmt
                        ? "border-[var(--accent-blue)] bg-[rgba(99,102,241,0.08)] ring-1 ring-[var(--accent-blue)]"
                        : "border-[var(--border-dim)] bg-[var(--surface-base)] hover:border-[var(--border-medium)] hover:bg-[var(--surface-raised)]"
                    )}
                  >
                    {fmt}
                    {form.targetFormat === fmt && (
                      <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[var(--accent-blue)]" />
                    )}
                  </button>
                ))}
              </div>
              <AnimatePresence>
                {errors.targetFormat && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-xs text-[var(--accent-rose)]"
                  >
                    {errors.targetFormat}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Constraints */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("constraints")}
            </Label>
            <Textarea
              value={form.constraints}
              onChange={(e) => updateField("constraints", e.target.value)}
              placeholder={tBriefing("constraintsPlaceholder")}
              className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] min-h-[60px]"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("notes")}
            </Label>
            <Textarea
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder={tBriefing("notesPlaceholder")}
              className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] min-h-[60px]"
            />
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-[var(--border-dim)] flex-row justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="border-[var(--border-dim)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
          >
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)]"
          >
            {tCommon("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
