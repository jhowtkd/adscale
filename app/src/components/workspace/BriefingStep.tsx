"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Campaign } from "@/lib/mock-data";
import type { AdPlatform } from "@/lib/mock-data";

// ============================================
// Types
// ============================================

export interface BriefingFormData {
  name: string;
  client: string;
  objective: string;
  audience: string;
  platforms: AdPlatform[];
  tone: string;
  offer: string;
  constraints: string;
  notes: string;
}

interface BriefingStepProps {
  campaign?: Campaign | null;
  onContinue: (data: BriefingFormData) => void;
  onSaveDraft: (data: BriefingFormData) => void;
}

// ============================================
// Constants
// ============================================

const objectives = [
  "Brand Awareness",
  "Conversions",
  "App Installs",
  "Lead Generation",
  "Engagement",
  "Traffic",
  "Video Views",
  "Sales",
];

const tones = [
  "Professional",
  "Casual",
  "Playful",
  "Urgent",
  "Luxury",
  "Friendly",
  "Bold",
  "Informative",
  "Emotional",
  "Humorous",
];

const platformOptions: { value: AdPlatform; label: string }[] = [
  { value: "Meta", label: "Meta" },
  { value: "TikTok", label: "TikTok" },
  { value: "Google", label: "Google Ads" },
];

// ============================================
// Animation variants
// ============================================

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const fieldVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.19, 1, 0.22, 1] as const },
  },
};

// ============================================
// Component
// ============================================

export default function BriefingStep({ campaign, onContinue, onSaveDraft }: BriefingStepProps) {
  const tCampaign = useTranslations("campaign");
  const tBriefing = useTranslations("briefing");

  const [formData, setFormData] = useState<BriefingFormData>({
    name: campaign?.name || "",
    client: campaign?.client || "",
    objective: campaign?.objective || "",
    audience: campaign?.audience || "",
    platforms: (campaign?.platforms as AdPlatform[]) || [],
    tone: campaign?.tone || "",
    offer: campaign?.offer || "",
    constraints: campaign?.constraints || "",
    notes: campaign?.notes || "",
  });

  const [showNotes, setShowNotes] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof BriefingFormData, string>>>({});

  const updateField = <K extends keyof BriefingFormData>(field: K, value: BriefingFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const togglePlatform = (platform: AdPlatform) => {
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform],
    }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof BriefingFormData, string>> = {};
    if (!formData.name.trim()) newErrors.name = "Campaign name is required";
    if (!formData.client.trim()) newErrors.client = "Client or product is required";
    if (!formData.objective) newErrors.objective = "Campaign objective is required";
    if (formData.platforms.length === 0) newErrors.platforms = "Select at least one platform";
    if (!formData.tone) newErrors.tone = "Tone of voice is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (validate()) {
      onContinue(formData);
    }
  };

  return (
    <div className="relative">
      <motion.form
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="max-w-[720px] mx-auto space-y-5"
        onSubmit={(e) => e.preventDefault()}
      >
        {/* ---- Campaign Info ---- */}
        <motion.div variants={fieldVariants}>
          <Label className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] mb-2">
            {tCampaign("name")}
            <span className="text-[var(--accent-rose)]">*</span>
          </Label>
          <Input
            placeholder={tBriefing("namePlaceholder")}
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            className={cn(
              "h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
              errors.name && "border-[var(--accent-rose)] ring-[3px] ring-[rgba(244,63,94,0.15)]"
            )}
            autoFocus
          />
          {errors.name && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-[var(--accent-rose)] mt-1"
            >
              {errors.name}
            </motion.p>
          )}
        </motion.div>

        {/* ---- Client / Product ---- */}
        <motion.div variants={fieldVariants}>
          <Label className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] mb-2">
            Client or Product
            <span className="text-[var(--accent-rose)]">*</span>
          </Label>
          <Input
            placeholder={tBriefing("clientPlaceholder")}
            value={formData.client}
            onChange={(e) => updateField("client", e.target.value)}
            className={cn(
              "h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
              errors.client && "border-[var(--accent-rose)] ring-[3px] ring-[rgba(244,63,94,0.15)]"
            )}
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            The brand or product being advertised
          </p>
          {errors.client && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-[var(--accent-rose)] mt-1"
            >
              {errors.client}
            </motion.p>
          )}
        </motion.div>

        {/* ---- Campaign Objective ---- */}
        <motion.div variants={fieldVariants}>
          <Label className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] mb-2">
            {tCampaign("objective")}
            <span className="text-[var(--accent-rose)]">*</span>
          </Label>
          <Select value={formData.objective} onValueChange={(v) => updateField("objective", v ?? "")}>
            <SelectTrigger
              className={cn(
                "h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)]",
                errors.objective && "border-[var(--accent-rose)] ring-[3px] ring-[rgba(244,63,94,0.15)]"
              )}
            >
              <SelectValue placeholder={tBriefing("objectivePlaceholder")} />
            </SelectTrigger>
            <SelectContent className="bg-[var(--surface-raised)] border-[var(--border-dim)]">
              {objectives.map((obj) => (
                <SelectItem
                  key={obj}
                  value={obj}
                  className="text-[var(--text-primary)] hover:bg-[var(--surface-base)] focus:bg-[var(--surface-base)]"
                >
                  {obj}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.objective && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-[var(--accent-rose)] mt-1"
            >
              {errors.objective}
            </motion.p>
          )}
        </motion.div>

        {/* ---- Target Audience ---- */}
        <motion.div variants={fieldVariants}>
          <Label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
            {tCampaign("audience")}
          </Label>
          <Textarea
            placeholder={tBriefing("audiencePlaceholder")}
            rows={3}
            value={formData.audience}
            onChange={(e) => updateField("audience", e.target.value)}
            className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)] resize-none"
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Describe demographics, interests, and behaviors
          </p>
        </motion.div>

        {/* ---- Platforms ---- */}
        <motion.div variants={fieldVariants}>
          <Label className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] mb-2">
            {tCampaign("platforms")}
            <span className="text-[var(--accent-rose)]">*</span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {platformOptions.map((platform) => {
              const isSelected = formData.platforms.includes(platform.value);
              return (
                <motion.button
                  key={platform.value}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => togglePlatform(platform.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200",
                    isSelected
                      ? "bg-[var(--accent-blue-dim)] text-[var(--accent-blue-light)]"
                      : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:scale-[1.02]"
                  )}
                >
                  {isSelected && <Check size={14} strokeWidth={2.5} />}
                  {platform.label}
                </motion.button>
              );
            })}
          </div>
          {errors.platforms && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-[var(--accent-rose)] mt-1"
            >
              {errors.platforms}
            </motion.p>
          )}
        </motion.div>

        {/* ---- Tone of Voice ---- */}
        <motion.div variants={fieldVariants}>
          <Label className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] mb-2">
            {tCampaign("tone")}
            <span className="text-[var(--accent-rose)]">*</span>
          </Label>
          <Select value={formData.tone} onValueChange={(v) => updateField("tone", v ?? "")}>
            <SelectTrigger
              className={cn(
                "h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)]",
                errors.tone && "border-[var(--accent-rose)] ring-[3px] ring-[rgba(244,63,94,0.15)]"
              )}
            >
              <SelectValue placeholder={tBriefing("tonePlaceholder")} />
            </SelectTrigger>
            <SelectContent className="bg-[var(--surface-raised)] border-[var(--border-dim)]">
              {tones.map((tone) => (
                <SelectItem
                  key={tone}
                  value={tone}
                  className="text-[var(--text-primary)] hover:bg-[var(--surface-base)] focus:bg-[var(--surface-base)]"
                >
                  {tone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.tone && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-[var(--accent-rose)] mt-1"
            >
              {errors.tone}
            </motion.p>
          )}
        </motion.div>

        {/* ---- Offer / CTA ---- */}
        <motion.div variants={fieldVariants}>
          <Label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
            Offer or Call-to-Action
          </Label>
          <Textarea
            placeholder={tBriefing("offerPlaceholder")}
            rows={2}
            value={formData.offer}
            onChange={(e) => updateField("offer", e.target.value)}
            className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)] resize-none"
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            What action should viewers take?
          </p>
        </motion.div>

        {/* ---- Constraints ---- */}
        <motion.div variants={fieldVariants}>
          <Label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
            {tCampaign("constraints")}
          </Label>
          <Textarea
            placeholder={tBriefing("constraintsPlaceholder")}
            rows={2}
            value={formData.constraints}
            onChange={(e) => updateField("constraints", e.target.value)}
            className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)] resize-none"
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Any rules or limitations for the generated creatives
          </p>
        </motion.div>

        {/* ---- Additional Notes (expandable) ---- */}
        {!showNotes ? (
          <motion.div variants={fieldVariants}>
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="text-sm text-[var(--accent-blue)] hover:text-[var(--accent-blue-light)] transition-colors"
            >
              + Add notes
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.6, 1] as const }}
            variants={fieldVariants}
          >
            <Label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
              {tCampaign("notes")}
            </Label>
            <Textarea
              placeholder={tBriefing("notesPlaceholder")}
              rows={3}
              value={formData.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)] resize-none"
            />
          </motion.div>
        )}
      </motion.form>

      {/* ---- AI Assist Badge ---- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="fixed bottom-8 right-8 z-30"
      >
        <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium bg-[rgba(167,139,250,0.08)] text-[var(--accent-purple)] border border-[rgba(167,139,250,0.15)]">
          <Sparkles size={14} />
          AI will use this brief to generate your creative plan
        </div>
      </motion.div>

      {/* ---- Form Actions ---- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="max-w-[720px] mx-auto mt-8 flex items-center justify-between"
      >
        <button
          type="button"
          onClick={() => onSaveDraft(formData)}
          className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-all duration-200 bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] hover:bg-[var(--surface-base)] hover:border-[var(--border-medium)] active:scale-[0.98]"
        >
          Save as Draft
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-light)] hover:-translate-y-px active:scale-[0.98]"
        >
          Save &amp; Continue
        </button>
      </motion.div>
    </div>
  );
}
