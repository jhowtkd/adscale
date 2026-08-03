"use client";

import { useReducer } from "react";
import { Sparkles } from "lucide-react";
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
import { useBriefingAutoSave } from "@/lib/hooks/use-briefing-autosave";
import dynamic from "next/dynamic";

const AutoBriefingSheet = dynamic(() => import("./AutoBriefingSheet"), {
  loading: () => null,
  ssr: false,
});

import BriefingRestoreBanner from "./BriefingRestoreBanner";
// Types

export interface BriefingFormData {
  name: string;
  client: string;
  objective: string;
  audience: string;
  constraints: string;
  notes: string;
}

interface BriefingStepProps {
  campaign?: Campaign | null;
  onContinue: (data: BriefingFormData) => void;
  onSaveDraft: (data: BriefingFormData) => void;
}

interface BriefingState {
  formData: BriefingFormData;
  showNotes: boolean;
  errors: Partial<Record<keyof BriefingFormData, string>>;
  autoBriefingOpen: boolean;
  restoreBannerDismissed: boolean;
}

function briefingReducer(
  state: BriefingState,
  payload: Partial<BriefingState>
): BriefingState {
  return { ...state, ...payload };
}

// Component

export default function BriefingStep({ campaign, onContinue, onSaveDraft }: BriefingStepProps) {
  const tCampaign = useTranslations("campaign");
  const tBriefing = useTranslations("briefing");
  const tErrors = useTranslations("errors");
  const [state, updateState] = useReducer(briefingReducer, {
    formData: {
      name: campaign?.name || "",
      client: campaign?.client || "",
      objective: campaign?.objective || "",
      audience: campaign?.audience || "",
      constraints: campaign?.constraints || "",
      notes: campaign?.notes || "",
    },
    showNotes: Boolean(campaign?.notes),
    errors: {},
    autoBriefingOpen: false,
    restoreBannerDismissed: false,
  });
  const { formData, showNotes, errors, autoBriefingOpen, restoreBannerDismissed } = state;

  const campaignId = campaign?.id ?? "new";
  const autoSave = useBriefingAutoSave(campaignId, formData);
  const { clearDraft, hasDraft, isSaving, lastSavedAt, restoreDraft } = autoSave;
  const showRestoreBanner = hasDraft && !campaign?.name && !campaign?.client && !restoreBannerDismissed;

  const updateField = <K extends keyof BriefingFormData>(field: K, value: BriefingFormData[K]) => {
    const nextFormData = { ...formData, [field]: value };
    if (errors[field]) {
      const nextErrors = { ...errors };
      delete nextErrors[field];
      updateState({ formData: nextFormData, errors: nextErrors });
      return;
    }
    updateState({ formData: nextFormData });
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof BriefingFormData, string>> = {};
    if (!formData.name.trim()) newErrors.name = tErrors("nameRequired");
    if (!formData.client.trim()) newErrors.client = tErrors("clientRequired");
    updateState({ errors: newErrors });
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (validate()) {
      clearDraft();
      onContinue(formData);
    }
  };

  const handleSaveDraftLocal = () => {
    clearDraft();
    onSaveDraft(formData);
  };

  const handleRestoreDraft = () => {
    const draft = restoreDraft();
    if (draft) {
      updateState({ formData: draft, showNotes: Boolean(draft.notes) });
    }
    updateState({ restoreBannerDismissed: true });
  };

  const handleDiscardDraft = () => {
    clearDraft();
    updateState({ restoreBannerDismissed: true });
  };

  return (
    <div className="relative">
      {showRestoreBanner && (
        <BriefingRestoreBanner
          tBriefing={tBriefing}
          onRestore={handleRestoreDraft}
          onDiscard={handleDiscardDraft}
        />
      )}

      <div
        className="max-w-[720px] mx-auto space-y-5"
      >
        {/* ---- Campaign Info ---- */}
        <div  className="animate-fade-in">
          <Label className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] mb-2">
            {tCampaign("name")}
            <span className="text-[var(--danger-text)]">*</span>
          </Label>
          <Input
            placeholder={tBriefing("namePlaceholder")}
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            className={cn(
              "h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "focus:border-[var(--focus-ring)] focus:ring-[3px] focus:ring-[var(--focus-ring)]",
              errors.name && "border-[var(--danger-border)] ring-[3px] ring-[var(--danger-bg)]"
            )}
            autoFocus
          />
          {errors.name && (
            <p className="text-xs text-[var(--danger-text)] mt-1 animate-fade-in">
              {errors.name}
            </p>
          )}
        </div>

        {/* ---- Client / Product ---- */}
        <div  className="animate-fade-in" style={{ animationDelay: "50ms" }}>
          <Label className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] mb-2">
            {tCampaign("client")}
            <span className="text-[var(--danger-text)]">*</span>
          </Label>
          <Input
            placeholder={tBriefing("clientPlaceholder")}
            value={formData.client}
            onChange={(e) => updateField("client", e.target.value)}
            className={cn(
              "h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "focus:border-[var(--focus-ring)] focus:ring-[3px] focus:ring-[var(--focus-ring)]",
              errors.client && "border-[var(--danger-border)] ring-[3px] ring-[var(--danger-bg)]"
            )}
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {tBriefing("clientHelp")}
          </p>
          {errors.client && (
            <p className="text-xs text-[var(--danger-text)] mt-1 animate-fade-in">
              {errors.client}
            </p>
          )}
        </div>

        {/* ---- Objective ---- */}
        <div className="animate-fade-in space-y-2" style={{ animationDelay: "150ms" }}>
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
        </div>

        {/* ---- Audience ---- */}
        <div className="animate-fade-in space-y-2" style={{ animationDelay: "200ms" }}>
          <Label className="text-xs font-medium text-[var(--text-secondary)]">
            {tCampaign("audience")}
          </Label>
          <Textarea
            placeholder={tBriefing("audiencePlaceholder")}
            rows={2}
            value={formData.audience}
            onChange={(e) => updateField("audience", e.target.value)}
              className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)] focus:ring-[3px] focus:ring-[var(--focus-ring)] resize-none"
          />
        </div>

        {/* ---- Constraints ---- */}
        <div  className="animate-fade-in" style={{ animationDelay: "650ms" }}>
          <Label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
            {tCampaign("constraints")}
          </Label>
          <Textarea
            placeholder={tBriefing("constraintsPlaceholder")}
            rows={2}
            value={formData.constraints}
            onChange={(e) => updateField("constraints", e.target.value)}
            className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)] focus:ring-[3px] focus:ring-[var(--focus-ring)] resize-none"
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {tBriefing("constraintsHelp")}
          </p>
        </div>

        {/* ---- Additional Notes (expandable) ---- */}
        {!showNotes ? (
          <div  className="animate-fade-in" style={{ animationDelay: "700ms" }}>
            <button
              type="button"
              onClick={() => updateState({ showNotes: true })}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              + {tBriefing("addNotes")}
            </button>
          </div>
        ) : (
          <div className="animate-fade-in">
            <Label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">
              {tCampaign("notes")}
            </Label>
            <Textarea
              placeholder={tBriefing("notesPlaceholder")}
              rows={3}
              value={formData.notes}
              onChange={(e) => updateField("notes", e.target.value)}
            className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)] focus:ring-[3px] focus:ring-[var(--focus-ring)] resize-none"
            />
          </div>
        )}
      </div>

      {campaign?.id && campaign.id !== "new" && (
        <AutoBriefingSheet
          open={autoBriefingOpen}
          onOpenChange={(open) => updateState({ autoBriefingOpen: open })}
          campaignId={campaign.id}
          onApply={(partial) => {
            updateState({
              formData: { ...formData, ...partial },
              showNotes: partial.constraints ? true : showNotes,
            });
          }}
        />
      )}

      {/* ---- AI Assist Badge + Form Actions ---- */}
      <div className="max-w-[720px] mx-auto mt-8 space-y-4 animate-fade-in" style={{ animationDelay: "400ms" }}>
        <div className="flex justify-end animate-fade-in" style={{ animationDelay: "500ms" }}>
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--selection-border)] bg-[var(--selection-bg)] px-3.5 py-2 text-xs font-medium text-[var(--selection-text)]">
            <Sparkles size={14} />
            {tBriefing("aiAssist")}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveDraftLocal}
              className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-all duration-200 bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] hover:bg-[var(--surface-base)] hover:border-[var(--border-medium)] active:scale-[0.98]"
            >
              {tBriefing("saveDraft")}
            </button>
            {isSaving ? (
              <span className="text-xs text-[var(--text-muted)] animate-fade-in">
                {tBriefing("saving")}
              </span>
            ) : lastSavedAt ? (
              <span className="text-xs text-[var(--text-muted)] animate-fade-in">
                {tBriefing("draftAutoSaved")}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleContinue}
            className="inline-flex items-center justify-center rounded-md bg-[var(--action-primary-bg)] px-6 py-2.5 text-sm font-medium text-[var(--action-primary-text)] transition-colors duration-200 hover:bg-[var(--action-primary-hover)] active:scale-[0.98]"
          >
            {tBriefing("saveContinue")}
          </button>
        </div>
      </div>
    </div>
  );
}
