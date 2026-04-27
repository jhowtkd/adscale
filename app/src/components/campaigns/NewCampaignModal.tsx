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
import { Check } from "lucide-react";

// ============================================
// Types
// ============================================

interface NewCampaignForm {
  name: string;
  clientName: string;
  objective: string;
  targetAudience: string;
  platforms: AdPlatform[];
  toneOfVoice: string;
  primaryCTA: string;
  offer: string;
  constraints: string;
  notes: string;
}

interface FormErrors {
  name?: string;
  clientName?: string;
  objective?: string;
  platforms?: string;
}

interface NewCampaignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (campaign: {
    name: string;
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

  const OBJECTIVES = [
    { value: "awareness", label: tCampaign("objectives.awareness") },
    { value: "consideration", label: tCampaign("objectives.consideration") },
    { value: "conversion", label: tCampaign("objectives.conversion") },
    { value: "retargeting", label: tCampaign("objectives.retargeting") },
  ];

  const TONE_OPTIONS = [
    { value: "professional", label: tCampaign("tones.professional") },
    { value: "casual", label: tCampaign("tones.casual") },
    { value: "bold", label: tCampaign("tones.bold") },
    { value: "emotional", label: tCampaign("tones.emotional") },
    { value: "luxury", label: tCampaign("tones.luxury") },
  ];

  const PLATFORM_OPTIONS: { value: AdPlatform; label: string }[] = [
    { value: "Meta", label: tCampaign("platformNames.Meta") },
    { value: "TikTok", label: tCampaign("platformNames.TikTok") },
    { value: "Google", label: tCampaign("platformNames.Google") },
  ];

  const [form, setForm] = useState<NewCampaignForm>({
    name: "",
    clientName: "",
    objective: "",
    targetAudience: "",
    platforms: [],
    toneOfVoice: "",
    primaryCTA: "",
    offer: "",
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

  const togglePlatform = useCallback((platform: AdPlatform) => {
    setForm((prev) => {
      const has = prev.platforms.includes(platform);
      return {
        ...prev,
        platforms: has
          ? prev.platforms.filter((p) => p !== platform)
          : [...prev.platforms, platform],
      };
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next.platforms;
      return next;
    });
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!form.name.trim()) newErrors.name = tErrors("nameRequired");
    if (!form.clientName.trim()) newErrors.clientName = tErrors("clientRequired");
    if (!form.objective) newErrors.objective = tErrors("objectiveRequired");
    if (form.platforms.length === 0) newErrors.platforms = tErrors("platformRequired");
    setErrors(newErrors);
    setTouched({
      name: true,
      clientName: true,
      objective: true,
      platforms: true,
    });
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const handleSubmit = useCallback(() => {
    if (!validate()) return;
    onSubmit({
      name: form.name,
      platforms: form.platforms,
      status: "draft",
      variations: 0,
      creditsUsed: 0,
    });
    setForm({
      name: "",
      clientName: "",
      objective: "",
      targetAudience: "",
      platforms: [],
      toneOfVoice: "",
      primaryCTA: "",
      offer: "",
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
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-[var(--surface-raised)] border border-[var(--border-dim)] p-0 gap-0">
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
        <div className="px-6 pb-4 space-y-5">
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

          {/* Objective */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("objective")} <span className="text-[var(--accent-rose)]">*</span>
            </Label>
            <Select
              value={form.objective}
              onValueChange={(value) => updateField("objective", value ?? "")}
            >
              <SelectTrigger
                className={cn(
                  "w-full bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)]",
                  errors.objective && "border-[var(--accent-rose)]"
                )}
              >
                <SelectValue placeholder={tBriefing("objectivePlaceholder")} />
              </SelectTrigger>
              <SelectContent className="bg-[var(--surface-raised)] border-[var(--border-dim)]">
                {OBJECTIVES.map((obj) => (
                  <SelectItem
                    key={obj.value}
                    value={obj.value}
                    className="text-[var(--text-primary)] hover:bg-[var(--surface-base)] focus:bg-[var(--surface-base)]"
                  >
                    {obj.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AnimatePresence>
              {errors.objective && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-[var(--accent-rose)]"
                >
                  {errors.objective}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Target Audience */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("audience")}
            </Label>
            <Textarea
              value={form.targetAudience}
              onChange={(e) => updateField("targetAudience", e.target.value)}
              placeholder={tBriefing("audiencePlaceholder")}
              className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] min-h-[60px]"
            />
          </div>

          {/* Platforms */}
          <div className="space-y-2">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("platforms")} <span className="text-[var(--accent-rose)]">*</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((platform) => {
                const isSelected = form.platforms.includes(platform.value);
                return (
                  <button
                    key={platform.value}
                    type="button"
                    onClick={() => togglePlatform(platform.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-all duration-200",
                      isSelected
                        ? "bg-[rgba(99,102,241,0.15)] border-[var(--accent-blue)] text-[var(--accent-blue-light)]"
                        : "bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)]"
                    )}
                  >
                    {isSelected && <Check size={12} />}
                    {platform.label}
                  </button>
                );
              })}
            </div>
            <AnimatePresence>
              {errors.platforms && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-[var(--accent-rose)]"
                >
                  {errors.platforms}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Tone of Voice */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("tone")}
            </Label>
            <Select
              value={form.toneOfVoice}
              onValueChange={(value) => updateField("toneOfVoice", value ?? "")}
            >
              <SelectTrigger className="w-full bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)]">
                <SelectValue placeholder={tBriefing("tonePlaceholder")} />
              </SelectTrigger>
              <SelectContent className="bg-[var(--surface-raised)] border-[var(--border-dim)]">
                {TONE_OPTIONS.map((tone) => (
                  <SelectItem
                    key={tone.value}
                    value={tone.value}
                    className="text-[var(--text-primary)] hover:bg-[var(--surface-base)] focus:bg-[var(--surface-base)]"
                  >
                    {tone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Primary CTA */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("cta")}
            </Label>
            <Input
              value={form.primaryCTA}
              onChange={(e) => updateField("primaryCTA", e.target.value)}
              placeholder={tBriefing("ctaPlaceholder")}
              className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Offer/Promotion */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("offer")}
            </Label>
            <Input
              value={form.offer}
              onChange={(e) => updateField("offer", e.target.value)}
              placeholder='e.g., 20% OFF, Free Shipping'
              className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Constraints */}
          <div className="space-y-1.5">
            <Label className="text-[13px] text-[var(--text-secondary)]">
              {tCampaign("constraints")}
            </Label>
            <Textarea
              value={form.constraints}
              onChange={(e) => updateField("constraints", e.target.value)}
              placeholder="No red backgrounds, Always show product, etc."
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
