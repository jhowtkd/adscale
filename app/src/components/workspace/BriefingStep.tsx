"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Check, X, Plus, ImageOff, ScanLine, Upload } from "lucide-react";
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
import { platformColors } from "@/lib/mock-data";
import { useBriefingAutoSave } from "@/lib/hooks/use-briefing-autosave";
import {
  useGenerateCreativeDiagnosis,
  useUpdateCreativeDiagnosis,
  useRegenerateCreativeDiagnosis,
} from "@/lib/hooks/use-creative-diagnosis";
import {
  useClientProfiles,
  useCreateClientProfile,
  useClientProfileMemory,
  useClientReferences,
} from "@/lib/hooks/use-client-profiles";
import { useBrandKit } from "@/lib/hooks/use-brand-kit";
import { useCampaignAssets, useUploadAsset, type AssetWithUrl } from "@/lib/hooks/use-assets";
import dynamic from "next/dynamic";

const CompetitorAnalysisSection = dynamic(() => import("@/components/campaigns/CompetitorAnalysisSection"), {
  loading: () => (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 bg-muted rounded w-1/3" />
      <div className="h-32 bg-muted rounded w-full" />
    </div>
  ),
});

const AutoBriefingModal = dynamic(() => import("./AutoBriefingModal"), {
  loading: () => null,
  ssr: false,
});

import PreflightSummary from "./PreflightSummary";
import CreativeDiagnosisCard from "./CreativeDiagnosisCard";
import BriefingRestoreBanner from "./BriefingRestoreBanner";
import { OptimizedImage } from "@/components/ui/OptimizedImage";
import { CreativeUploadWithAnalysis } from "@/components/campaigns/CreativeUploadWithAnalysis";
import { AIDeducedFieldsEditor } from "@/components/campaigns/AIDeducedFieldsEditor";
import type { AiDeducedFields } from "@/server/validation/ai-deduction";
// Types

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
  clientProfileId?: string | null;
  selectedReferenceIds?: string[];
}

interface BriefingStepProps {
  campaign?: Campaign | null;
  onContinue: (data: BriefingFormData) => void;
  onSaveDraft: (data: BriefingFormData) => void;
}

// Component

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
    clientProfileId: campaign?.clientProfileId ?? null,
    selectedReferenceIds: campaign?.selectedReferenceIds ?? [],
  });

  const [showNotes, setShowNotes] = useState(Boolean(campaign?.notes));
  const [errors, setErrors] = useState<Partial<Record<keyof BriefingFormData, string>>>({});
  const [autoBriefingOpen, setAutoBriefingOpen] = useState(false);

  const [editingDiagnosis, setEditingDiagnosis] = useState(false);
  const [localDiagnosis, setLocalDiagnosis] = useState(() => {
    const d = campaign?.creativeDiagnosis;
    return {
      detectedConcept: d?.detectedConcept ?? "",
      elementsToPreserve: d?.elementsToPreserve?.join("\n") ?? "",
      variationOpportunities: d?.variationOpportunities?.join("\n") ?? "",
    };
  });

  // AI-deduced fields from creative analysis
  const [aiDeducedFields, setAiDeducedFields] = useState<AiDeducedFields | null>(null);
  const [hasUserEdits, setHasUserEdits] = useState(false);

  const handleAnalysisComplete = useCallback((analysis: AiDeducedFields) => {
    setAiDeducedFields(analysis);
    setHasUserEdits(false);
    
    // Auto-fill form fields with AI-deduced values (only if field is empty)
    setFormData((prev) => {
      const next = { ...prev };
      if (analysis.objective?.value && !next.objective) {
        next.objective = analysis.objective.value;
      }
      if (analysis.targetAudience?.value && !next.audience) {
        next.audience = analysis.targetAudience.value;
      }
      if (analysis.tone?.value && !next.tone) {
        next.tone = analysis.tone.value;
      }
      if (analysis.offer?.value && !next.offer) {
        next.offer = analysis.offer.value;
      }
      if (analysis.platforms?.value?.length && next.platforms.length === 0) {
        next.platforms = analysis.platforms.value as AdPlatform[];
      }
      return next;
    });
  }, []);

  const handleAiFieldsChange = useCallback((fields: Partial<Record<string, string>>) => {
    setHasUserEdits(true);
    setFormData((prev) => {
      const next = { ...prev };
      if (fields.objective !== undefined) next.objective = fields.objective;
      if (fields.targetAudience !== undefined) next.audience = fields.targetAudience;
      if (fields.tone !== undefined) next.tone = fields.tone;
      if (fields.offer !== undefined) next.offer = fields.offer;
      if (fields.platforms !== undefined) {
        next.platforms = fields.platforms.split(", ").filter(Boolean) as AdPlatform[];
      }
      return next;
    });
  }, []);

  const generateDiagnosis = useGenerateCreativeDiagnosis(campaign?.id ?? "");
  const updateDiagnosis = useUpdateCreativeDiagnosis(campaign?.id ?? "");
  const regenerateDiagnosis = useRegenerateCreativeDiagnosis(campaign?.id ?? "");
  const { data: diagnosisAssets = [], isLoading: diagnosisAssetsLoading } = useCampaignAssets(campaign?.id ?? "new");
  const hasDiagnosisAsset = diagnosisAssets.length > 0;

  const { data: clientProfilesData } = useClientProfiles();
  const createProfile = useCreateClientProfile();
  const { data: clientReferencesData } = useClientReferences(formData.clientProfileId);
  const { data: clientMemoryData, isLoading: clientMemoryLoading } = useClientProfileMemory(formData.clientProfileId);
  const { data: brandKitData } = useBrandKit();

  const [showCreateProfile, setShowCreateProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileNotes, setNewProfileNotes] = useState("");

  const campaignId = campaign?.id ?? "new";
  const autoSave = useBriefingAutoSave(campaignId, formData);
  const { clearDraft, hasDraft, isSaving, lastSavedAt, restoreDraft } = autoSave;
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);

  // Show restore banner if there's a draft and we're on a new/empty campaign
  useEffect(() => {
    if (hasDraft && !campaign?.name && !campaign?.client) {
      const draft = restoreDraft();
      if (draft && (draft.name.trim() || draft.client.trim())) {
        requestAnimationFrame(() => setShowRestoreBanner(true));
      }
    }
  }, [hasDraft, campaign?.name, campaign?.client, restoreDraft]);

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
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleGenerateDiagnosis = () => {
    if (!campaign?.id || !hasDiagnosisAsset) return;
    generateDiagnosis.mutate(undefined, {
      onSuccess: (data) => {
        setLocalDiagnosis({
          detectedConcept: data.diagnosis.detectedConcept,
          elementsToPreserve: data.diagnosis.elementsToPreserve.join("\n"),
          variationOpportunities: data.diagnosis.variationOpportunities.join("\n"),
        });
        setEditingDiagnosis(false);
      },
    });
  };

  const handleRegenerateDiagnosis = () => {
    if (!campaign?.id || !hasDiagnosisAsset) return;
    regenerateDiagnosis.mutate(undefined, {
      onSuccess: (data) => {
        setLocalDiagnosis({
          detectedConcept: data.diagnosis.detectedConcept,
          elementsToPreserve: data.diagnosis.elementsToPreserve.join("\n"),
          variationOpportunities: data.diagnosis.variationOpportunities.join("\n"),
        });
        setEditingDiagnosis(false);
      },
    });
  };

  const handleSaveDiagnosisEdit = () => {
    if (!campaign?.id) return;
    const diagnosis = {
      detectedConcept: localDiagnosis.detectedConcept.trim(),
      elementsToPreserve: localDiagnosis.elementsToPreserve
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      variationOpportunities: localDiagnosis.variationOpportunities
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    };
    updateDiagnosis.mutate(diagnosis, {
      onSuccess: () => setEditingDiagnosis(false),
    });
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
      setFormData(draft);
      setShowNotes(Boolean(draft.notes));
    }
    setShowRestoreBanner(false);
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setShowRestoreBanner(false);
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

      <form
        className="max-w-[720px] mx-auto space-y-5"
        onSubmit={(e) => e.preventDefault()}
      >
        {/* ---- Campaign Info ---- */}
        <div  className="animate-fade-in">
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
            <p className="text-xs text-[var(--accent-rose)] mt-1 animate-fade-in">
              {errors.name}
            </p>
          )}
        </div>

        {/* ---- Client / Product ---- */}
        <div  className="animate-fade-in" style={{ animationDelay: "50ms" }}>
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
            <p className="text-xs text-[var(--accent-rose)] mt-1 animate-fade-in">
              {errors.client}
            </p>
          )}
        </div>

        {/* ---- Client Profile ---- */}
        <div className="animate-fade-in space-y-2" style={{ animationDelay: "100ms" }}>
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-[var(--text-secondary)]">
              {tBriefing("clientProfileLabel")}
            </Label>
            <button
              type="button"
              onClick={() => setShowCreateProfile((s) => !s)}
              className="inline-flex items-center gap-1 text-xs text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors"
            >
              <Plus size={12} />
              {tBriefing("createClientProfile")}
            </button>
          </div>
          <Select
            value={formData.clientProfileId ?? ""}
            onValueChange={(value) => {
              updateField("clientProfileId", value || null);
              updateField("selectedReferenceIds", []);
            }}
          >
            <SelectTrigger
              className={cn(
                "w-full h-10 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)]",
                !formData.clientProfileId && "text-[var(--text-muted)]"
              )}
            >
              <SelectValue placeholder={tBriefing("clientProfilePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{tBriefing("noClientProfile")}</SelectItem>
              {clientProfilesData?.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showCreateProfile && (
            <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3 space-y-2">
              <Input
                placeholder={tBriefing("newProfileNamePlaceholder")}
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                className="h-9 bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)]"
              />
              <Textarea
                placeholder={tBriefing("newProfileNotesPlaceholder")}
                rows={2}
                value={newProfileNotes}
                onChange={(e) => setNewProfileNotes(e.target.value)}
                className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)] resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!newProfileName.trim()) return;
                    createProfile.mutate(
                      { name: newProfileName.trim(), description: newProfileNotes.trim() || undefined },
                      {
                        onSuccess: (data) => {
                          updateField("clientProfileId", data.id);
                          updateField("selectedReferenceIds", []);
                          setShowCreateProfile(false);
                          setNewProfileName("");
                          setNewProfileNotes("");
                        },
                      }
                    );
                  }}
                  disabled={!newProfileName.trim() || createProfile.isPending}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-mint)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-mint-light)] disabled:opacity-60"
                >
                  <Check size={12} />
                  {tBriefing("saveProfile")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateProfile(false);
                    setNewProfileName("");
                    setNewProfileNotes("");
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-base)]"
                >
                  <X size={12} />
                  {tBriefing("cancelProfile")}
                </button>
              </div>
            </div>
          )}

          {formData.clientProfileId && clientReferencesData && (
            <div className="space-y-2">
              {clientReferencesData.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <ImageOff size={14} />
                  {tBriefing("noReferences")}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                    {tBriefing("selectReferences")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {clientReferencesData.map((ref) => {
                      const isSelected = formData.selectedReferenceIds?.includes(ref.id);
                      return (
                        <button
                          key={ref.id}
                          type="button"
                          onClick={() => {
                            const current = formData.selectedReferenceIds ?? [];
                            const next = isSelected
                              ? current.filter((id) => id !== ref.id)
                              : [...current, ref.id];
                            updateField("selectedReferenceIds", next);
                          }}
                          aria-pressed={isSelected}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
                            isSelected
                              ? "border-[var(--accent-mint)] bg-[var(--accent-mint-dim)] text-[var(--accent-mint)]"
                              : "border-[var(--border-dim)] bg-[var(--surface-base)] text-[var(--text-secondary)] hover:border-[var(--border-medium)] hover:text-[var(--text-primary)]"
                          )}
                          title={ref.notes ?? ""}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-[var(--accent-mint)]" : "bg-[var(--text-muted)]")} />
                          {ref.label}
                          <span className="text-[10px] opacity-70">({ref.kind})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {formData.clientProfileId &&
            (clientMemoryLoading || Boolean(clientMemoryData?.items.length)) && (
              <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[var(--accent-mint)]" />
                  <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                    {tBriefing("brandMemoryTitle")}
                  </h4>
                </div>
                {clientMemoryLoading ? (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {tBriefing("brandMemoryLoading")}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {clientMemoryData?.items.slice(0, 4).map((item, index) => (
                      <li key={`${item.source}-${index}`} className="flex gap-2 text-[11px] text-[var(--text-secondary)]">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-mint)]" />
                        <span>
                          {item.text}
                          <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                            {tBriefing(`brandMemorySource.${item.source}`)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

          {/* ---- Brand Kit Summary ---- */}
          {formData.clientProfileId && brandKitData && (
            <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[var(--text-primary)]">
                  {tBriefing("brandKitTitle")}
                </h4>
                {brandKitData.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brandKitData.logoUrl}
                    alt="Logo"
                    className="h-6 w-6 object-contain rounded"
                  />
                )}
              </div>
              {brandKitData.brandColors && brandKitData.brandColors.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {brandKitData.brandColors.map((color) => (
                    <div key={color} className="flex items-center gap-1">
                      <div
                        className="h-3 w-3 rounded-full border border-[var(--border-dim)]"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        {color}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {brandKitData.brandFonts && brandKitData.brandFonts.length > 0 && (
                <p className="text-[11px] text-[var(--text-secondary)]">
                  <span className="font-medium">{tBriefing("brandKitFonts")}:</span>{" "}
                  {brandKitData.brandFonts.join(", ")}
                </p>
              )}
              {brandKitData.toneOfVoice && (
                <p className="text-[11px] text-[var(--text-secondary)]">
                  <span className="font-medium">{tBriefing("brandKitTone")}:</span>{" "}
                  {brandKitData.toneOfVoice}
                </p>
              )}
            </div>
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
            className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-mint)] focus:ring-[3px] focus:ring-[rgba(47,182,125,0.15)] resize-none"
          />
        </div>

        {/* ---- Platforms ---- */}
        <div className="animate-fade-in space-y-2" style={{ animationDelay: "250ms" }}>
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
        </div>

        {/* ---- Tone ---- */}
        <div className="animate-fade-in space-y-2" style={{ animationDelay: "300ms" }}>
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
        </div>

        {/* ---- Offer ---- */}
        <div className="animate-fade-in space-y-2" style={{ animationDelay: "350ms" }}>
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
        </div>

        {/* ---- Auto Briefing ---- */}
        {campaign?.id && (
          <div className="animate-fade-in" style={{ animationDelay: "375ms" }}>
            <button
              type="button"
              onClick={() => setAutoBriefingOpen(true)}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] text-[var(--text-secondary)] text-sm font-medium hover:border-[var(--accent-mint)] hover:text-[var(--accent-mint)] transition-colors"
            >
              <ScanLine size={16} />
              {tBriefing("extractFromImage")}
            </button>
          </div>
        )}

        {/* ---- Competitor Analysis ---- */}
        {campaign?.id && campaign.id !== "new" && (
          <div className="animate-fade-in" style={{ animationDelay: "380ms" }}>
            <CompetitorAnalysisSection
              campaignId={campaign.id}
              onApplyToBrief={(text) => {
                updateField("notes", formData.notes ? `${formData.notes}\n\n${text}` : text);
              }}
            />
          </div>
        )}

        {/* ---- Preflight Summary ---- */}
        {campaign?.id && campaign.id !== "new" && (
          <PreflightSummary campaignId={campaign.id} tBriefing={tBriefing} />
        )}

        {/* ---- Creative Diagnosis ---- */}
        {campaign?.id && campaign.id !== "new" && (
          <div className="animate-fade-in space-y-3" style={{ animationDelay: "400ms" }}>
            <div className="rounded-lg border border-[var(--accent-mint)]/30 bg-[var(--accent-mint)]/[0.04] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-[var(--accent-mint)]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {tBriefing("diagnosis.baseCreativeTitle")}
                </h3>
              </div>
              <CreativeUploadWithAnalysis
                campaignId={campaign.id}
                onAnalysisComplete={handleAnalysisComplete}
              />
            </div>

            {/* AI Deduced Fields Editor */}
            {aiDeducedFields && (
              <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-card)] p-4">
                <AIDeducedFieldsEditor
                  analysis={aiDeducedFields}
                  onChange={handleAiFieldsChange}
                />
              </div>
            )}

            <CreativeDiagnosisCard
              campaign={campaign}
              editing={editingDiagnosis}
              localDiagnosis={localDiagnosis}
              setLocalDiagnosis={setLocalDiagnosis}
              onEdit={() => setEditingDiagnosis(true)}
              onSave={handleSaveDiagnosisEdit}
              onCancel={() => {
                setEditingDiagnosis(false);
                const d = campaign.creativeDiagnosis;
                setLocalDiagnosis({
                  detectedConcept: d?.detectedConcept ?? "",
                  elementsToPreserve: d?.elementsToPreserve?.join("\n") ?? "",
                  variationOpportunities: d?.variationOpportunities?.join("\n") ?? "",
                });
              }}
              onGenerate={handleGenerateDiagnosis}
              onRegenerate={handleRegenerateDiagnosis}
              isGenerating={generateDiagnosis.isPending || regenerateDiagnosis.isPending}
              isSaving={updateDiagnosis.isPending}
              canGenerate={hasDiagnosisAsset}
              generateDisabledReason={tBriefing("diagnosis.missingCreative")}
              tBriefing={tBriefing}
            />
          </div>
        )}

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
            className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)] resize-none"
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
              onClick={() => setShowNotes(true)}
              className="text-sm text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)] transition-colors"
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
              className="bg-[var(--surface-base)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-mint)] focus:ring-[3px] focus:ring-[rgba(47,182,125,0.15)] resize-none"
            />
          </div>
        )}
      </form>

      {/* ---- Auto Briefing Modal ---- */}
      {campaign?.id && campaign.id !== "new" && (
        <AutoBriefingModal
          open={autoBriefingOpen}
          onOpenChange={setAutoBriefingOpen}
          campaignId={campaign.id}
          onApply={(partial) => {
            setFormData((prev) => ({ ...prev, ...partial }));
            if (partial.constraints) setShowNotes(true);
          }}
        />
      )}

      {/* ---- AI Assist Badge ---- */}
      <div className="fixed bottom-8 right-8 z-30 animate-fade-in" style={{ animationDelay: "500ms" }}>
        <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium bg-[var(--accent-mint-dim)] text-[var(--accent-mint)] border border-[var(--accent-mint)]/15">
          <Sparkles size={14} />
          {tBriefing("aiAssist")}
        </div>
      </div>

      {/* ---- Form Actions ---- */}
      <div className="max-w-[720px] mx-auto mt-8 flex items-center justify-between animate-fade-in" style={{ animationDelay: "400ms" }}>
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
          className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 bg-[var(--accent-mint)] hover:bg-[var(--accent-mint-light)] hover:-translate-y-px active:scale-[0.98]"
        >
          {tBriefing("saveContinue")}
        </button>
      </div>
    </div>
  );
}

interface BaseCreativeUploadCardProps {
  campaignId: string;
  assets: AssetWithUrl[];
  isLoading: boolean;
  tBriefing: (key: string, values?: Record<string, string | number | Date>) => string;
}

function BaseCreativeUploadCard({ campaignId, assets, isLoading, tBriefing }: BaseCreativeUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadAsset = useUploadAsset(campaignId);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const firstAsset = assets[0] ?? null;
  const isUploading = uploadAsset.isPending;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setUploadProgress(0);

    try {
      await uploadAsset.mutateAsync({
        file,
        onProgress: (progress) => setUploadProgress(progress),
      });
      setUploadProgress(100);
    } catch {
      setUploadError(tBriefing("diagnosis.baseCreativeUploadFailed"));
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="rounded-lg border border-[var(--accent-mint)]/30 bg-[var(--accent-mint)]/[0.04] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--accent-mint)]/25 bg-[var(--accent-mint)]/10 text-[var(--accent-mint)]">
            {firstAsset ? <Check size={18} /> : <ImageOff size={18} />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {tBriefing("diagnosis.baseCreativeTitle")}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
              {firstAsset
                ? tBriefing("diagnosis.baseCreativeReady")
                : tBriefing("diagnosis.baseCreativeHelp")}
            </p>
            {uploadError && (
              <p className="mt-1 text-xs text-[var(--accent-rose)]">{uploadError}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {firstAsset?.url && (
            <OptimizedImage
              src={firstAsset.url}
              alt=""
              className="h-11 w-11 rounded-md border border-[var(--border-dim)] object-cover"
              lazy={false}
            />
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isLoading || isUploading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--accent-mint)]/40 bg-[var(--surface-base)] px-3 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload size={13} />
            {firstAsset ? tBriefing("diagnosis.replaceBaseCreative") : tBriefing("diagnosis.uploadBaseCreative")}
          </button>
        </div>
      </div>

      {isUploading && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-raised)]">
          <div
            className="h-full rounded-full bg-[var(--accent-mint)] transition-all"
            style={{ width: `${Math.max(8, uploadProgress)}%` }}
          />
        </div>
      )}
    </div>
  );
}
