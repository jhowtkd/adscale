"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAutoBriefing, type AutoBriefingResult } from "@/lib/hooks/use-auto-briefing";
import { useUploadAsset } from "@/lib/hooks/use-assets";
import {
  UploadCloud,
  ScanLine,
  Check,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";

interface AutoBriefingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  onApply: (data: Partial<{
    client: string;
    offer: string;
    objective: string;
    audience: string;
    constraints: string;
  }>) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function AutoBriefingModal({
  open,
  onOpenChange,
  campaignId,
  onApply,
}: AutoBriefingModalProps) {
  const t = useTranslations("briefing");
  const tc = useTranslations("common");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AutoBriefingResult | null>(null);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

  const uploadAsset = useUploadAsset(campaignId);
  const autoBriefing = useAutoBriefing(campaignId);

  const validateAndSetFile = useCallback((f: File) => {
    setError(null);
    setResult(null);
    setSelectedFields(new Set());

    if (!f.type.startsWith("image/")) {
      setError(t("invalidFileType"));
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError(t("fileTooLarge", { max: "10MB" }));
      return;
    }

    setFile(f);
    setPreview(URL.createObjectURL(f));
  }, [t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) validateAndSetFile(dropped);
  }, [validateAndSetFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  }, [validateAndSetFile]);

  const handleAnalyze = async () => {
    if (!file) return;
    setError(null);

    try {
      const asset = await uploadAsset.mutateAsync({ file });
      const analysis = await autoBriefing.mutateAsync(asset.key);
      setResult(analysis);

      // Auto-select fields with confidence >= 0.7
      const autoSelected = new Set<string>();
      if (analysis.confidence.client >= 0.7) autoSelected.add("client");
      if (analysis.confidence.offer >= 0.7) autoSelected.add("offer");
      if (analysis.confidence.ctaText >= 0.7) autoSelected.add("ctaText");
      if (analysis.confidence.audience >= 0.7) autoSelected.add("audience");
      setSelectedFields(autoSelected);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("analysisFailed"));
    }
  };

  const toggleField = (field: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const handleApply = () => {
    if (!result) return;
    const data: Partial<{
      client: string;
      offer: string;
      objective: string;
      audience: string;
      constraints: string;
    }> = {};

    if (selectedFields.has("client")) data.client = result.extracted.client;
    if (selectedFields.has("offer")) data.offer = result.extracted.offer;
    if (selectedFields.has("ctaText")) {
      data.objective = result.extracted.objective;
    }
    if (selectedFields.has("audience")) data.audience = result.extracted.audience;
    if (selectedFields.has("constraints")) data.constraints = result.extracted.constraints;

    onApply(data);
    handleClose();
  };

  const handleClose = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setError(null);
    setResult(null);
    setSelectedFields(new Set());
    onOpenChange(false);
  };

  const isAnalyzing = uploadAsset.isPending || autoBriefing.isPending;

  const confidenceColor = (score: number) => {
    if (score >= 0.8) return "text-[var(--accent-teal)]";
    if (score >= 0.5) return "text-[var(--accent-amber)]";
    return "text-[var(--accent-rose)]";
  };

  const confidenceLabel = (score: number) => {
    if (score >= 0.8) return t("highConfidence");
    if (score >= 0.5) return t("mediumConfidence");
    return t("lowConfidence");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine size={20} />
            {t("extractFromImage")}
          </DialogTitle>
        </DialogHeader>

        {/* Upload State */}
        {!result && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-colors",
                "border-[var(--border-dim)] hover:border-[var(--accent-mint)]",
                "bg-[var(--surface-base)]"
              )}
            >
              {preview ? (
                <div className="relative inline-block">
                  <img
                    src={preview}
                    alt="Preview"
                    className="max-h-48 rounded-lg object-contain"
                  />
                  <button
                    onClick={() => {
                      setFile(null);
                      setPreview(null);
                    }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--accent-rose)] text-white flex items-center justify-center"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <UploadCloud
                    size={40}
                    className="mx-auto mb-3 text-[var(--text-muted)]"
                  />
                  <p className="text-sm text-[var(--text-secondary)] mb-2">
                    {t("dropzoneText")}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    PNG, JPEG, WebP — {t("maxSize", { size: "10MB" })}
                  </p>
                </>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleFileSelect}
                className="hidden"
                id="auto-briefing-file"
              />
              {!preview && (
                <label
                  htmlFor="auto-briefing-file"
                  className="mt-3 inline-block px-4 py-2 rounded-md text-sm font-medium bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)] cursor-pointer transition-colors"
                >
                  {tc("chooseFile")}
                </label>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-[var(--accent-rose)]">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {file && (
              <Button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {t("analyzingImage")}
                  </>
                ) : (
                  <>
                    <ScanLine size={16} />
                    {t("analyzeImage")}
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Preview State */}
        {result && (
          <div className="space-y-4">
            {preview && (
              <img
                src={preview}
                alt="Analyzed"
                className="max-h-32 rounded-lg object-contain mx-auto"
              />
            )}

            <p className="text-sm text-[var(--text-secondary)]">
              {t("fieldsDetected", { count: Object.keys(result.extracted).length })}
            </p>

            <div className="space-y-2">
              {Object.entries(result.extracted).map(([key, value]) => {
                if (!value) return null;
                const conf = result.confidence[key as keyof typeof result.confidence];
                const isSelected = selectedFields.has(key);

                return (
                  <button
                    key={key}
                    onClick={() => toggleField(key)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all",
                      "flex items-start gap-3",
                      isSelected
                        ? "border-[var(--accent-mint)] bg-[var(--accent-mint-dim)]"
                        : "border-[var(--border-dim)] hover:border-[var(--border-medium)]"
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors",
                        isSelected
                          ? "bg-[var(--accent-mint)] text-white"
                          : "border-2 border-[var(--border-medium)]"
                      )}
                    >
                      {isSelected && <Check size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase">
                          {t(`field.${key}`)}
                        </span>
                        {conf !== undefined && (
                          <span className={cn("text-xs font-medium", confidenceColor(conf))}>
                            {confidenceLabel(conf)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--text-primary)] truncate">
                        {String(value)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1"
              >
                {tc("cancel")}
              </Button>
              <Button
                onClick={handleApply}
                disabled={selectedFields.size === 0}
                className="flex-1 gap-2"
              >
                <Check size={16} />
                {t("applyExtracted", { count: selectedFields.size })}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
