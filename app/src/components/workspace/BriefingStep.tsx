"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Campaign } from "@/lib/mock-data";
import type { AdPlatform } from "@/lib/mock-data";
import { platformColors } from "@/lib/mock-data";
import {
  analyzeBriefingLocal,
  applyBriefingFieldPatch,
  type BriefingFieldPatch,
} from "@/lib/briefing-doctor";
import { useBriefingDoctorAnalysis } from "@/lib/hooks/use-briefing-doctor";

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
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  creativeLevel: "conservative" | "balanced" | "bold" | "extreme";
  targetFormat?: string;
  ctaVariants: [string, string, string];
}

interface BriefingStepProps {
  campaign?: Campaign | null;
  onContinue: (data: BriefingFormData) => void;
  onSaveDraft: (data: BriefingFormData) => void;
}

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
  const tErrors = useTranslations("errors");
  const [formData, setFormData] = useState<BriefingFormData>({
    name: campaign?.name || "",
    client: campaign?.client || "",
    objective: campaign?.objective || "",
    audience: campaign?.audience || "",
    platforms: (campaign?.platforms as AdPlatform[]) || ["Meta"],
    tone: campaign?.tone || "",
    offer: campaign?.offer || "",
    constraints: campaign?.constraints || "",
    notes: campaign?.notes || "",
    generationMode: campaign?.generationMode || "art_variation",
    creativeLevel: campaign?.creativeLevel || "balanced",
    targetFormat: campaign?.targetFormats?.[0] || "",
    ctaVariants: [
      campaign?.ctaVariants?.[0] || "",
      campaign?.ctaVariants?.[1] || "",
      campaign?.ctaVariants?.[2] || "",
    ],
  });

  const [showNotes, setShowNotes] = useState(Boolean(campaign?.notes));
  const [errors, setErrors] = useState<Partial<Record<keyof BriefingFormData, string>>>({});

  const briefingDoctor = useBriefingDoctorAnalysis();
  const localAnalysis = analyzeBriefingLocal(formData);
  const aiAnalysis = briefingDoctor.data;

  const handleAnalyzeBriefing = () => {
    briefingDoctor.mutate(formData);
  };

  const handleApplyPatch = (patch: BriefingFieldPatch) => {
    const next = applyBriefingFieldPatch(formData, patch);
    setFormData(next as BriefingFormData);
  };

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

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof BriefingFormData, string>> = {};
    if (!formData.name.trim()) newErrors.name = tErrors("nameRequired");
    if (!formData.client.trim()) newErrors.client = tErrors("clientRequired");
    const hasAnyCta = formData.ctaVariants.some((v) => v.trim().length > 0);
    if (formData.generationMode === "art_variation" && !hasAnyCta) {
      newErrors.ctaVariants = tErrors("ctaRequiredAtLeastOne");
    }
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
              "focus:border-[var(--accent-mint)] focus:ring-[3px] focus:ring-[rgba(47,182,125,0.15)]",
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
            {tCampaign("client")}
            <span className="text-[var(--accent-rose)]">*</span>
          </Label>
          <Input
            placeholder={tBriefing("clientPlaceholder")}
            value={formData.client}
            onChange={(e) => updateField("client", e.target.value)}
            className={cn(
              "h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "focus:border-[var(--accent-mint)] focus:ring-[3px] focus:ring-[rgba(47,182,125,0.15)]",
              errors.client && "border-[var(--accent-rose)] ring-[3px] ring-[rgba(244,63,94,0.15)]"
            )}
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {tBriefing("clientHelp")}
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

        {/* ---- Objective ---- */}
        <motion.div variants={fieldVariants} className="space-y-2">
          <Label className="text-xs font-medium text-[var(--text-secondary)]">
            {tCampaign("objective")}
          </Label>
          <Select
            value={formData.objective}
            onValueChange={(value) => updateField("objective", value ?? "")}
          >
            <SelectTrigger
              className={cn(
                "w-full h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)]",
                !formData.objective && "text-[var(--text-muted)]"
              )}
            >
              <SelectValue placeholder={tBriefing("objectivePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(tCampaign.raw("objectives") as Record<string, string>).map(
                ([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </motion.div>

        {/* ---- Audience ---- */}
        <motion.div variants={fieldVariants} className="space-y-2">
          <Label className="text-xs font-medium text-[var(--text-secondary)]">
            {tCampaign("audience")}
          </Label>
          <Textarea
            placeholder={tBriefing("audiencePlaceholder")}
            rows={2}
            value={formData.audience}
            onChange={(e) => updateField("audience", e.target.value)}
            className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-mint)] focus:ring-[3px] focus:ring-[rgba(47,182,125,0.15)] resize-none"
          />
        </motion.div>

        {/* ---- Platforms ---- */}
        <motion.div variants={fieldVariants} className="space-y-2">
          <Label className="text-xs font-medium text-[var(--text-secondary)]">
            {tCampaign("platforms")}
          </Label>
          <div className="flex flex-wrap gap-2">
            {(["Meta", "TikTok", "Google"] as AdPlatform[]).map((platform) => {
              const colors = platformColors[platform];
              const isSelected = formData.platforms.includes(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => {
                    const next = isSelected
                      ? formData.platforms.filter((p) => p !== platform)
                      : [...formData.platforms, platform];
                    if (next.length > 0) {
                      updateField("platforms", next);
                    }
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 border",
                    isSelected
                      ? "border-transparent"
                      : "border-[var(--border-dim)] bg-[var(--surface-base)] text-[var(--text-muted)] hover:border-[var(--border-medium)] hover:text-[var(--text-secondary)]"
                  )}
                  style={
                    isSelected
                      ? {
                          backgroundColor: colors.bg,
                          color: colors.text,
                          borderColor: "transparent",
                        }
                      : undefined
                  }
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isSelected ? "opacity-100" : "opacity-40 bg-[var(--text-muted)]"
                    )}
                    style={isSelected ? { backgroundColor: colors.text } : undefined}
                  />
                  {(tCampaign.raw("platformNames") as Record<string, string>)[platform] || platform}
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* ---- Tone ---- */}
        <motion.div variants={fieldVariants} className="space-y-2">
          <Label className="text-xs font-medium text-[var(--text-secondary)]">
            {tCampaign("tone")}
          </Label>
          <Select
            value={formData.tone}
            onValueChange={(value) => updateField("tone", value ?? "")}
          >
            <SelectTrigger
              className={cn(
                "w-full h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)]",
                !formData.tone && "text-[var(--text-muted)]"
              )}
            >
              <SelectValue placeholder={tBriefing("tonePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(tCampaign.raw("tones") as Record<string, string>).map(
                ([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </motion.div>

        {/* ---- Offer ---- */}
        <motion.div variants={fieldVariants} className="space-y-2">
          <Label className="text-xs font-medium text-[var(--text-secondary)]">
            {tCampaign("offer")}
          </Label>
          <Input
            placeholder={tBriefing("offerPlaceholder")}
            value={formData.offer}
            onChange={(e) => updateField("offer", e.target.value)}
            className="h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-mint)] focus:ring-[3px] focus:ring-[rgba(47,182,125,0.15)]"
          />
          <p className="text-xs text-[var(--text-muted)]">{tBriefing("offerHelp")}</p>
        </motion.div>

        {/* ---- Generation Mode ---- */}
        <motion.div variants={fieldVariants}>
          <Label className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] mb-2">
            {tCampaign("mode")}
          </Label>
          <div className="grid grid-cols-2 gap-3">
            {[
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
            ].map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => updateField("generationMode", mode.value)}
                className={cn(
                  "relative flex flex-col items-start gap-1 rounded-lg border px-4 py-3 text-left transition-all duration-200",
                  formData.generationMode === mode.value
                    ? "border-[var(--accent-mint)] bg-[var(--accent-mint-dim)] ring-1 ring-[var(--accent-mint)]"
                    : "border-[var(--border-dim)] bg-[var(--surface-base)] hover:border-[var(--border-medium)] hover:bg-[var(--surface-raised)]"
                )}
              >
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {mode.label}
                </span>
                <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {mode.description}
                </span>
                {formData.generationMode === mode.value && (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[var(--accent-mint)]" />
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ---- Target Format ---- */}
        {formData.generationMode === "format_adaptation" && (
          <motion.div variants={fieldVariants} className="space-y-2">
            <Label className="text-xs font-medium text-[var(--text-secondary)]">
              {tBriefing("targetFormat.label")}
            </Label>
            <RadioGroup
              value={formData.targetFormat}
              onValueChange={(value) => updateField("targetFormat", value)}
              className="flex flex-col space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="1:1" id="tf-1-1" />
                <Label htmlFor="tf-1-1" className="text-sm text-[var(--text-primary)]">
                  1:1
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="4:5" id="tf-4-5" />
                <Label htmlFor="tf-4-5" className="text-sm text-[var(--text-primary)]">
                  4:5
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="9:16" id="tf-9-16" />
                <Label htmlFor="tf-9-16" className="text-sm text-[var(--text-primary)]">
                  9:16
                </Label>
              </div>
            </RadioGroup>
          </motion.div>
        )}

        {/* ---- Creative Level ---- */}
        {formData.generationMode === "art_variation" && (
          <motion.div variants={fieldVariants} className="space-y-2">
            <Label className="text-xs font-medium text-[var(--text-secondary)]">
              {tBriefing("creativeLevel.label")}
            </Label>
            <RadioGroup
              value={formData.creativeLevel}
              onValueChange={(value) => updateField("creativeLevel", value as BriefingFormData["creativeLevel"])}
              className="flex flex-col space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="conservative" id="cl-conservative" />
                <Label htmlFor="cl-conservative" className="text-sm text-[var(--text-primary)]">
                  {tBriefing("creativeLevel.conservative")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="balanced" id="cl-balanced" />
                <Label htmlFor="cl-balanced" className="text-sm text-[var(--text-primary)]">
                  {tBriefing("creativeLevel.balanced")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bold" id="cl-bold" />
                <Label htmlFor="cl-bold" className="text-sm text-[var(--text-primary)]">
                  {tBriefing("creativeLevel.bold")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="extreme" id="cl-extreme" />
                <Label htmlFor="cl-extreme" className="text-sm text-[var(--text-primary)]">
                  {tBriefing("creativeLevel.extreme")}
                </Label>
              </div>
            </RadioGroup>
          </motion.div>
        )}

        {/* ---- CTA Variants ---- */}
        <motion.div variants={fieldVariants} className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-[var(--text-secondary)]">
              {tBriefing("ctaVariants")}
            </Label>
            <span className="text-[11px] text-[var(--text-muted)]">
              {formData.generationMode === "art_variation"
                ? tBriefing("ctaHelpArt")
                : tBriefing("ctaHelpFormat")}
            </span>
          </div>
          {formData.ctaVariants.map((cta, idx) => (
            <div key={idx} className="space-y-1">
              <Label className="text-[11px] text-[var(--text-muted)]">
                {formData.generationMode === "art_variation"
                  ? tBriefing("ctaPiece", { number: idx + 1 })
                  : tBriefing("ctaFormat", { format: ["1:1", "4:5", "9:16"][idx] })}
              </Label>
              <Input
                placeholder={tBriefing("ctaPlaceholder")}
                value={cta}
                onChange={(e) => {
                  const next: [string, string, string] = [...formData.ctaVariants] as [string, string, string];
                  next[idx] = e.target.value;
                  updateField("ctaVariants", next);
                }}
                className={cn(
                  "h-9 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                  "focus:border-[var(--accent-mint)] focus:ring-[3px] focus:ring-[rgba(47,182,125,0.15)]"
                )}
              />
            </div>
          ))}
          {errors.ctaVariants && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-[var(--accent-rose)] mt-1"
            >
              {errors.ctaVariants}
            </motion.p>
          )}
        </motion.div>

        {/* ---- Briefing Doctor ---- */}
        <motion.div
          variants={fieldVariants}
          className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {tBriefing("doctor.title")}
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {tBriefing("doctor.subtitle")}
              </p>
            </div>
            <span className="rounded-md bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-secondary)]">
              {tBriefing(`doctor.readiness.${aiAnalysis?.readiness ?? localAnalysis.readiness}`)}
            </span>
          </div>

          {localAnalysis.issues.length > 0 ? (
            <div className="space-y-2">
              {localAnalysis.issues.slice(0, 3).map((issue, index) => (
                <div key={`${issue.field}-${index}`} className="rounded-md bg-[var(--surface-raised)] p-2">
                  <p className="text-xs font-medium text-[var(--text-primary)]">{tBriefing(issue.messageKey)}</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{tBriefing(issue.impactKey)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-secondary)]">
              {tBriefing("doctor.noLocalIssues")}
            </p>
          )}

          {briefingDoctor.isError && (
            <p className="text-xs text-[var(--accent-rose)]">
              {tBriefing("doctor.analysisFailed")}
            </p>
          )}

          {aiAnalysis?.suggestions?.length ? (
            <div className="space-y-2">
              {aiAnalysis.suggestions.slice(0, 4).map((suggestion, index) => {
                const patch = aiAnalysis.fieldPatches.find((item) => item.field === suggestion.field);
                return (
                  <div key={`${suggestion.field}-${index}`} className="rounded-md border border-[var(--border-dim)] p-3">
                    <p className="text-xs font-medium text-[var(--text-primary)]">{suggestion.title}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">{suggestion.rationale}</p>
                    {patch && (
                      <button
                        type="button"
                        onClick={() => handleApplyPatch(patch)}
                        className="mt-2 text-xs font-medium text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)]"
                      >
                        {tBriefing("doctor.apply")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleAnalyzeBriefing}
            disabled={briefingDoctor.isPending}
            className="inline-flex items-center rounded-md border border-[var(--border-dim)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-raised)] disabled:opacity-60"
          >
            {briefingDoctor.isPending ? tBriefing("doctor.analyzing") : tBriefing("doctor.analyze")}
          </button>
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
            {tBriefing("constraintsHelp")}
          </p>
        </motion.div>

        {/* ---- Additional Notes (expandable) ---- */}
        {!showNotes ? (
          <motion.div variants={fieldVariants}>
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="text-sm text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors"
            >
              + {tBriefing("addNotes")}
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
              className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-mint)] focus:ring-[3px] focus:ring-[rgba(47,182,125,0.15)] resize-none"
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
        <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium bg-[var(--accent-mint-dim)] text-[var(--accent-mint)] border border-[var(--accent-mint)]/15">
          <Sparkles size={14} />
          {tBriefing("aiAssist")}
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
          {tBriefing("saveDraft")}
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 bg-[var(--accent-mint)] hover:bg-[var(--accent-mint-light)] hover:-translate-y-px active:scale-[0.98]"
        >
          {tBriefing("saveContinue")}
        </button>
      </motion.div>
    </div>
  );
}
