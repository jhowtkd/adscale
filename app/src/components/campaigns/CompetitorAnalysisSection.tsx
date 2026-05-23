"use client";

import { useState, useCallback, useRef } from "react";
import {
  Plus,
  X,
  Upload,
  Eye,
  Sparkles,
  Trash2,
  Check,
  Lightbulb,
  Target,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  useCompetitorAnalyses,
  useCreateCompetitorAnalysis,
  useAnalyzeCompetitorScreenshots,
  useGenerateDifferentiationStrategy,
  useDeleteCompetitorAnalysis,
  type CompetitorAnalysisData,
  type DifferentiationStrategy,
} from "@/lib/hooks/use-competitor-analysis";
import { apiFetch } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";

// ── Types ─────────────────────────────────────────────────────────────

interface CompetitorAnalysisSectionProps {
  campaignId: string;
  onApplyToBrief?: (text: string) => void;
}

interface PendingFile {
  file: File;
  preview: string;
}

interface CompetitorFormData {
  name: string;
  platform: string;
  website: string;
  files: PendingFile[];
  analyzeWithAI: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const MAX_FILES = 3;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadFileToCampaign(
  campaignId: string,
  file: File
): Promise<{ key: string; url: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch(`/api/campaigns/${campaignId}/assets/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Upload failed");
  }

  const data = await res.json();
  return { key: data.asset.key, url: data.asset.url ?? "" };
}

// ── Component ─────────────────────────────────────────────────────────

export default function CompetitorAnalysisSection({
  campaignId,
  onApplyToBrief,
}: CompetitorAnalysisSectionProps) {
  const t = useTranslations("briefing.competitor");
  const tCommon = useTranslations("common");

  const { data: competitors = [], isLoading } = useCompetitorAnalyses(campaignId);
  const createCompetitor = useCreateCompetitorAnalysis();
  const analyzeScreenshots = useAnalyzeCompetitorScreenshots();
  const generateStrategy = useGenerateDifferentiationStrategy();
  const deleteCompetitor = useDeleteCompetitorAnalysis();
  const addToast = useAppStore((s) => s.addToast);

  const [expanded, setExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [strategy, setStrategy] = useState<DifferentiationStrategy | null>(null);
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);

  const [formData, setFormData] = useState<CompetitorFormData>({
    name: "",
    platform: "",
    website: "",
    files: [],
    analyzeWithAI: false,
  });

  const [analysisPreview, setAnalysisPreview] = useState<CompetitorAnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    formData.files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFormData({
      name: "",
      platform: "",
      website: "",
      files: [],
      analyzeWithAI: false,
    });
    setAnalysisPreview(null);
    setFormError(null);
  };

  const handleOpenModal = () => {
    resetForm();
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetForm();
  };

  const validateFiles = (files: FileList | null): PendingFile[] | null => {
    if (!files || files.length === 0) return null;

    const valid: PendingFile[] = [];
    for (const file of Array.from(files)) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setFormError(t("invalidFileType"));
        return null;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setFormError(t("fileTooLarge", { max: MAX_SIZE_MB }));
        return null;
      }
      valid.push({ file, preview: URL.createObjectURL(file) });
    }

    if (formData.files.length + valid.length > MAX_FILES) {
      setFormError(t("maxFiles", { max: MAX_FILES }));
      return null;
    }

    setFormError(null);
    return valid;
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const pending = validateFiles(e.dataTransfer.files);
      if (pending) {
        setFormData((prev) => ({ ...prev, files: [...prev.files, ...pending] }));
      }
    },
    [formData.files, validateFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pending = validateFiles(e.target.files);
    if (pending) {
      setFormData((prev) => ({ ...prev, files: [...prev.files, ...pending] }));
    }
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFormData((prev) => {
      const next = [...prev.files];
      URL.revokeObjectURL(next[index].preview);
      next.splice(index, 1);
      return { ...prev, files: next };
    });
  };

  const handleAnalyze = async () => {
    if (formData.files.length === 0) return;
    setIsAnalyzing(true);
    setFormError(null);
    try {
      const result = await analyzeScreenshots.mutateAsync({
        campaignId,
        files: formData.files.map((f) => f.file),
        name: formData.name || undefined,
        platform: formData.platform || undefined,
      });
      setAnalysisPreview(result);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("analysisFailed"));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setFormError(t("nameRequired"));
      return;
    }
    if (formData.files.length === 0) {
      setFormError(t("screenshotsRequired"));
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      // Upload files to R2 via existing asset upload endpoint
      const uploaded = await Promise.all(
        formData.files.map((f) => uploadFileToCampaign(campaignId, f.file))
      );
      const keys = uploaded.map((u) => u.key);

      // If analyzeWithAI was checked but not yet analyzed, analyze now
      let analysisData = analysisPreview;
      if (formData.analyzeWithAI && !analysisData) {
        try {
          analysisData = await analyzeScreenshots.mutateAsync({
            campaignId,
            files: formData.files.map((f) => f.file),
            name: formData.name || undefined,
            platform: formData.platform || undefined,
          });
        } catch {
          // Non-blocking: save without analysis if AI fails
        }
      }

      await createCompetitor.mutateAsync({
        campaignId,
        name: formData.name.trim(),
        platform: formData.platform || null,
        website: formData.website.trim() || null,
        screenshotKeys: keys,
        strengths: analysisData?.strengths,
        weaknesses: analysisData?.weaknesses,
        differentiators: analysisData?.differentiationOpportunities,
        analysis: analysisData
          ? {
              visualPatterns: analysisData.visualPatterns,
              messaging: analysisData.messaging,
            }
          : null,
      });

      handleCloseModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateStrategy = async () => {
    if (competitors.length === 0) return;
    setIsGeneratingStrategy(true);
    try {
      const result = await generateStrategy.mutateAsync(campaignId);
      setStrategy(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("strategyFailed");
      addToast("error", message);
    } finally {
      setIsGeneratingStrategy(false);
    }
  };

  const handleApplyStrategy = () => {
    if (!strategy || !onApplyToBrief) return;
    const lines = [
      ...strategy.insights.map((i) => `• ${i}`),
      ...strategy.recommendations.map((r) => `• ${r}`),
    ];
    onApplyToBrief(lines.join("\n"));
  };

  const platformOptions = [
    { value: "Meta", label: "Meta" },
    { value: "TikTok", label: "TikTok" },
    { value: "Google", label: "Google" },
    { value: "Other", label: t("other") },
  ];

  return (
    <div className="animate-fade-in space-y-3">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-raised)]"
      >
        <div className="flex items-center gap-2">
          <Target size={16} className="text-[var(--accent-blue)]" />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {t("title")}
          </span>
          {competitors.length > 0 && (
            <span className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
              {competitors.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-[var(--text-muted)]" />
        ) : (
          <ChevronDown size={16} className="text-[var(--text-muted)]" />
        )}
      </button>

      {expanded && (
        <div className="space-y-4 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4">
          {/* Competitor list */}
          {isLoading ? (
            <p className="text-xs text-[var(--text-muted)]">{tCommon("loading")}</p>
          ) : competitors.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">{t("emptyState")}</p>
          ) : (
            <div className="space-y-3">
              {competitors.map((comp) => {
                const strengths = Array.isArray(comp.strengths)
                  ? comp.strengths.filter((s): s is string => typeof s === "string")
                  : [];
                const weaknesses = Array.isArray(comp.weaknesses)
                  ? comp.weaknesses.filter((s): s is string => typeof s === "string")
                  : [];
                const differentiators = Array.isArray(comp.differentiators)
                  ? comp.differentiators.filter((s): s is string => typeof s === "string")
                  : [];

                return (
                  <div
                    key={comp.id}
                    className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {comp.screenshotUrls?.[0] ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={comp.screenshotUrls[0]}
                            alt={comp.name}
                            className="h-12 w-12 rounded-md object-cover shrink-0"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[var(--surface-base)]">
                            <Eye size={18} className="text-[var(--text-muted)]" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                            {comp.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {comp.platform && (
                              <span className="rounded bg-[var(--surface-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                                {comp.platform}
                              </span>
                            )}
                            {comp.website && (
                              <a
                                href={comp.website.startsWith("http") ? comp.website : `https://${comp.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-[10px] text-[var(--accent-mint)] hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {comp.website.replace(/^https?:\/\//, "").slice(0, 24)}
                                <ExternalLink size={8} />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          deleteCompetitor.mutate({ campaignId, competitorId: comp.id })
                        }
                        disabled={deleteCompetitor.isPending}
                        className="shrink-0 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-base)] hover:text-[var(--accent-rose)] transition-colors disabled:opacity-50"
                        title={tCommon("delete")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Strengths / Weaknesses */}
                    {(strengths.length > 0 || weaknesses.length > 0) && (
                      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                        {strengths.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--accent-mint)]">
                              {t("strengths")}
                            </p>
                            <ul className="mt-1 space-y-0.5">
                              {strengths.slice(0, 3).map((s, i) => (
                                <li key={i} className="text-[11px] text-[var(--text-primary)] list-disc list-inside">
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {weaknesses.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--accent-rose)]">
                              {t("weaknesses")}
                            </p>
                            <ul className="mt-1 space-y-0.5">
                              {weaknesses.slice(0, 3).map((w, i) => (
                                <li key={i} className="text-[11px] text-[var(--text-primary)] list-disc list-inside">
                                  {w}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Differentiation tip */}
                    {differentiators.length > 0 && (
                      <div className="mt-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-mint)]/10 px-2 py-1 text-[11px] font-medium text-[var(--accent-mint)]">
                          <Lightbulb size={10} />
                          {differentiators[0]}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenModal}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
            >
              <Plus size={14} />
              {t("addCompetitor")}
            </button>

            {competitors.length > 0 && (
              <button
                type="button"
                onClick={handleGenerateStrategy}
                disabled={isGeneratingStrategy || generateStrategy.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors disabled:opacity-60"
              >
                <Sparkles size={14} />
                {isGeneratingStrategy ? t("generatingStrategy") : t("generateStrategy")}
              </button>
            )}
          </div>

          {/* Strategy card */}
          {strategy && (
            <div className="rounded-md border border-[var(--accent-mint)]/20 bg-[var(--accent-mint)]/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                  {t("strategyTitle")}
                </h4>
                {onApplyToBrief && (
                  <button
                    type="button"
                    onClick={handleApplyStrategy}
                    className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-mint)] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[var(--accent-mint-light)] transition-colors"
                  >
                    <Check size={10} />
                    {t("applyToBrief")}
                  </button>
                )}
              </div>
              {strategy.insights.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                    {t("insights")}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {strategy.insights.map((insight, i) => (
                      <li key={i} className="text-xs text-[var(--text-primary)] list-disc list-inside">
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {strategy.recommendations.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                    {t("recommendations")}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {strategy.recommendations.map((rec, i) => (
                      <li key={i} className="text-xs text-[var(--text-primary)] list-disc list-inside">
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Competitor Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("modalTitle")}</DialogTitle>
            <DialogDescription>{t("modalDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">
                {t("competitorName")}
              </Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t("namePlaceholder")}
                className="h-9 bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)]"
              />
            </div>

            {/* Platform */}
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">
                {t("platform")}
              </Label>
              <Select
                value={formData.platform}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, platform: value || "" }))}
              >
                <SelectTrigger className="h-9 bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs">
                  <SelectValue placeholder={t("platformPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {platformOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Website */}
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">
                {t("website")}
              </Label>
              <Input
                value={formData.website}
                onChange={(e) => setFormData((prev) => ({ ...prev, website: e.target.value }))}
                placeholder={t("websitePlaceholder")}
                className="h-9 bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)]"
              />
            </div>

            {/* Screenshots upload */}
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-secondary)]">
                {t("screenshots")}
              </Label>

              {/* Dropzone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 transition-colors",
                  dragActive
                    ? "border-[var(--accent-mint)] bg-[var(--accent-mint)]/5"
                    : "border-[var(--border-dim)] bg-[var(--surface-raised)] hover:border-[var(--border-medium)]"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Upload size={20} className="text-[var(--text-muted)]" />
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  {t("dropzoneText")}
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                  {t("dropzoneHint", { max: MAX_FILES })}
                </p>
              </div>

              {/* File previews */}
              {formData.files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.files.map((f, idx) => (
                    <div
                      key={idx}
                      className="relative flex items-center gap-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-2 py-1.5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.preview}
                        alt={f.file.name}
                        className="h-8 w-8 rounded object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[11px] text-[var(--text-primary)] max-w-[120px]">
                          {f.file.name}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {formatFileSize(f.file.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(idx);
                        }}
                        className="ml-1 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--accent-rose)] transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Analyze with AI checkbox */}
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={formData.analyzeWithAI}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, analyzeWithAI: e.target.checked }));
                  if (e.target.checked && !analysisPreview && formData.files.length > 0) {
                    // Auto-trigger analysis when checked and files are present
                    void handleAnalyze();
                  }
                }}
                className="h-4 w-4 accent-[var(--accent-mint)] rounded border-[var(--border-dim)]"
              />
              <span className="text-xs text-[var(--text-primary)]">{t("analyzeWithAI")}</span>
            </label>

            {/* Analysis preview */}
            {analysisPreview && (
              <div className="rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3 space-y-2">
                <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                  {t("analysisPreview")}
                </p>
                {analysisPreview.strengths.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-[var(--accent-mint)]">
                      {t("strengths")}
                    </p>
                    <ul className="mt-0.5 space-y-0.5">
                      {analysisPreview.strengths.slice(0, 3).map((s, i) => (
                        <li key={i} className="text-[11px] text-[var(--text-primary)] list-disc list-inside">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysisPreview.weaknesses.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-[var(--accent-rose)]">
                      {t("weaknesses")}
                    </p>
                    <ul className="mt-0.5 space-y-0.5">
                      {analysisPreview.weaknesses.slice(0, 3).map((w, i) => (
                        <li key={i} className="text-[11px] text-[var(--text-primary)] list-disc list-inside">
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysisPreview.differentiationOpportunities.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-[var(--accent-blue)]">
                      {t("opportunities")}
                    </p>
                    <ul className="mt-0.5 space-y-0.5">
                      {analysisPreview.differentiationOpportunities.slice(0, 3).map((o, i) => (
                        <li key={i} className="text-[11px] text-[var(--text-primary)] list-disc list-inside">
                          {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {formError && (
              <p className="text-xs text-[var(--accent-rose)]">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseModal}
              disabled={isSaving}
              className="text-xs"
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || isAnalyzing}
              className="text-xs bg-[var(--accent-mint)] text-white hover:bg-[var(--accent-mint-light)]"
            >
              {isSaving ? tCommon("sending") : tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
