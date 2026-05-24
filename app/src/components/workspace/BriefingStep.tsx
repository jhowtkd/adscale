"use client";

import { useState, useEffect } from "react";
import { Sparkles, Check, X, Plus, ImageOff, ScanLine } from "lucide-react";
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
import { useBriefingAutoSave } from "@/lib/hooks/use-briefing-autosave";
import {
  useGenerateCreativeDiagnosis,
  useUpdateCreativeDiagnosis,
  useRegenerateCreativeDiagnosis,
} from "@/lib/hooks/use-creative-diagnosis";
import {
  useClientProfiles,
  useCreateClientProfile,
  useClientReferences,
} from "@/lib/hooks/use-client-profiles";
import { useBrandKit } from "@/lib/hooks/use-brand-kit";
import CompetitorAnalysisSection from "@/components/campaigns/CompetitorAnalysisSection";
import FormatAdaptationPreview from "./FormatAdaptationPreview";

import PreflightSummary from "./PreflightSummary";
import CreativeDiagnosisCard from "./CreativeDiagnosisCard";
import BriefingRestoreBanner from "./BriefingRestoreBanner";
import AutoBriefingModal from "./AutoBriefingModal";
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
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  creativeLevel: "conservative" | "balanced" | "bold" | "extreme";
  targetFormats?: string[];
  ctaVariants: [string, string, string];
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
    generationMode: campaign?.generationMode || "art_variation",
    creativeLevel: campaign?.creativeLevel || "balanced",
    targetFormats: campaign?.targetFormats ?? ["1:1"],
    ctaVariants: [
      campaign?.ctaVariants?.[0] || "",
      campaign?.ctaVariants?.[1] || "",
      campaign?.ctaVariants?.[2] || "",
    ],
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

  const briefingDoctor = useBriefingDoctorAnalysis();
  const generateDiagnosis = useGenerateCreativeDiagnosis(campaign?.id ?? "");
  const updateDiagnosis = useUpdateCreativeDiagnosis(campaign?.id ?? "");
  const regenerateDiagnosis = useRegenerateCreativeDiagnosis(campaign?.id ?? "");
  const localAnalysis = analyzeBriefingLocal(formData);
  const aiAnalysis = briefingDoctor.data;

  const { data: clientProfilesData } = useClientProfiles();
  const createProfile = useCreateClientProfile();
  const { data: clientReferencesData } = useClientReferences(formData.clientProfileId);
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

  const handleGenerateDiagnosis = () => {
    if (!campaign?.id) return;
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
    if (!campaign?.id) return;
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

  const targetFormatOptions = [
    { id: "1:1", label: tBriefing("targetFormats.square.label"), desc: tBriefing("targetFormats.square.description") },
    { id: "4:5", label: tBriefing("targetFormats.portrait.label"), desc: tBriefing("targetFormats.portrait.description") },
    { id: "9:16", label: tBriefing("targetFormats.stories.label"), desc: tBriefing("targetFormats.stories.description") },
    { id: "1.91:1", label: tBriefing("targetFormats.horizontal.label"), desc: tBriefing("targetFormats.horizontal.description") },
    { id: "16:9", label: tBriefing("targetFormats.widescreen.label"), desc: tBriefing("targetFormats.widescreen.description") },
  ];

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
        {campaign?.id && (
          <div className="animate-fade-in" style={{ animationDelay: "380ms" }}>
            <CompetitorAnalysisSection
              campaignId={campaign.id}
              onApplyToBrief={(text) => {
                updateField("notes", formData.notes ? `${formData.notes}\n\n${text}` : text);
              }}
            />
          </div>
        )}

        {/* ---- Generation Mode ---- */}
        <div  className="animate-fade-in" style={{ animationDelay: "400ms" }}>
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
        </div>

        {/* ---- Target Formats ---- */}
        {formData.generationMode === "format_adaptation" && (
          <div className="animate-fade-in space-y-3" style={{ animationDelay: "450ms" }}>
            <Label className="text-xs font-medium text-[var(--text-secondary)]">
              {tBriefing("targetFormat.label")}
            </Label>
            <p className="text-xs text-[var(--text-muted)]">
              {tBriefing("targetFormatsHelp")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {targetFormatOptions.map((fmt) => (
                <label
                  key={fmt.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all ${
                    formData.targetFormats?.includes(fmt.id)
                      ? "border-[var(--accent-mint)] bg-[var(--accent-mint-dim)]"
                      : "border-[var(--border-dim)] bg-[var(--surface-raised)] hover:bg-[var(--deep-bg)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.targetFormats?.includes(fmt.id) ?? false}
                    onChange={(e) => {
                      const current = formData.targetFormats ?? [];
                      if (e.target.checked) {
                        updateField("targetFormats", [...current, fmt.id]);
                      } else {
                        updateField(
                          "targetFormats",
                          current.filter((f) => f !== fmt.id)
                        );
                      }
                    }}
                    className="mt-0.5 accent-[var(--accent-mint)]"
                  />
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{fmt.label}</p>
                    <p className="text-xs text-[var(--text-muted)]">{fmt.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Smart Resize Preview */}
            {campaign?.id && (
              <FormatAdaptationPreview campaignId={campaign.id} />
            )}
          </div>
        )}

        {/* ---- Creative Level ---- */}
        {formData.generationMode === "art_variation" && (
          <div className="animate-fade-in space-y-3" style={{ animationDelay: "500ms" }}>
            <Label className="text-xs font-medium text-[var(--text-secondary)]">
              {tBriefing("creativeLevel.label")}
            </Label>
            <RadioGroup
              value={formData.creativeLevel}
              onValueChange={(value) => updateField("creativeLevel", value as BriefingFormData["creativeLevel"])}
              className="flex flex-col space-y-3"
            >
              {(
                [
                  "conservative",
                  "balanced",
                  "bold",
                  "extreme",
                ] as BriefingFormData["creativeLevel"][]
              ).map((level) => (
                <div key={level} className="flex items-start space-x-2">
                  <RadioGroupItem value={level} id={`cl-${level}`} className="mt-0.5" />
                  <div className="flex flex-col">
                    <Label htmlFor={`cl-${level}`} className="text-sm text-[var(--text-primary)] font-medium">
                      {tBriefing(`creativeLevel.${level}`)}
                    </Label>
                    <span className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      {tBriefing(`creativeLevel.contract.${level}`)}
                    </span>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>
        )}

        {/* ---- Preflight Summary ---- */}
        {campaign?.id && (
          <PreflightSummary campaignId={campaign.id} tBriefing={tBriefing} />
        )}

        {/* ---- Creative Diagnosis ---- */}
        {formData.generationMode === "art_variation" && campaign?.id && (
          <div  className="animate-fade-in" style={{ animationDelay: "550ms" }}>
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
              tBriefing={tBriefing}
            />
          </div>
        )}

        {/* ---- CTA Variants ---- */}
        <div className="animate-fade-in space-y-3" style={{ animationDelay: "600ms" }}>
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
                  : tBriefing("ctaFormat", { format: formData.targetFormats?.[idx] ?? "" })}
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
            <p className="text-xs text-[var(--accent-rose)] mt-1 animate-fade-in">
              {errors.ctaVariants}
            </p>
          )}
        </div>

        {/* ---- Briefing Doctor ---- */}
        <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4 space-y-3 animate-fade-in">
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
      {campaign?.id && (
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
