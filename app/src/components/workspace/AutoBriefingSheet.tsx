"use client";

import Image from "next/image";
import { useCallback, useReducer } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
} from "lucide-react";

interface AutoBriefingSheetProps {
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

interface AutoBriefingState {
  file: File | null;
  preview: string | null;
  error: string | null;
  result: AutoBriefingResult | null;
  selectedFields: Set<string>;
}

const initialAutoBriefingState: AutoBriefingState = {
  file: null,
  preview: null,
  error: null,
  result: null,
  selectedFields: new Set(),
};

function autoBriefingReducer(
  state: AutoBriefingState,
  payload: Partial<AutoBriefingState>
): AutoBriefingState {
  return { ...state, ...payload };
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function confidenceColor(score: number) {
  if (score >= 0.8) return "text-[var(--accent-teal)]";
  if (score >= 0.5) return "text-[var(--accent-amber)]";
  return "text-[var(--accent-rose)]";
}

export default function AutoBriefingSheet({
  open,
  onOpenChange,
  campaignId,
  onApply,
}: AutoBriefingSheetProps) {
  const t = useTranslations("briefing");
  const tc = useTranslations("common");
  const [state, updateState] = useReducer(autoBriefingReducer, initialAutoBriefingState);
  const { file, preview, error, result, selectedFields } = state;

  const uploadAsset = useUploadAsset(campaignId);
  const autoBriefing = useAutoBriefing(campaignId);

  const validateAndSetFile = useCallback((f: File) => {
    updateState({ error: null, result: null, selectedFields: new Set() });

    if (!f.type.startsWith("image/")) {
      updateState({ error: t("invalidFileType") });
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      updateState({ error: t("fileTooLarge", { max: "10MB" }) });
      return;
    }

    updateState({ file: f, preview: URL.createObjectURL(f) });
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
    updateState({ error: null });

    try {
      const asset = await uploadAsset.mutateAsync({ file });
      const analysis = await autoBriefing.mutateAsync(asset.key);
      const autoSelected = new Set<string>();
      if (analysis.confidence.client >= 0.7) autoSelected.add("client");
      if (analysis.confidence.offer >= 0.7) autoSelected.add("offer");
      if (analysis.confidence.ctaText >= 0.7) autoSelected.add("ctaText");
      if (analysis.confidence.audience >= 0.7) autoSelected.add("audience");
      updateState({ result: analysis, selectedFields: autoSelected });
    } catch (err) {
      updateState({ error: err instanceof Error ? err.message : t("analysisFailed") });
    }
  };

  const toggleField = (field: string) => {
    const next = new Set(selectedFields);
    if (next.has(field)) next.delete(field);
    else next.add(field);
    updateState({ selectedFields: next });
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
    updateState(initialAutoBriefingState);
    onOpenChange(false);
  };

  const isAnalyzing = uploadAsset.isPending || autoBriefing.isPending;

  const confidenceLabel = (score: number) => {
    if (score >= 0.8) return t("highConfidence");
    if (score >= 0.5) return t("mediumConfidence");
    return t("lowConfidence");
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && handleClose()}>
      <SheetContent side="right" size="md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ScanLine size={20} />
            {t("extractFromImage")}
          </SheetTitle>
        </SheetHeader>

        <SheetBody>
          {!result ? (
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center transition-colors",
                  "border-[var(--border-dim)] hover:border-[var(--accent-green)]",
                  "bg-[var(--surface-base)]"
                )}
              >
                {preview ? (
                  <div className="relative inline-block">
                    <Image
                      src={preview}
                      alt="Preview"
                      className="max-h-48 rounded-lg object-contain"
                      width={800}
                      height={800}
                      unoptimized
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => updateState({ file: null, preview: null })}
                    >
                      {tc("cancel")}
                    </Button>
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
                      PNG, JPEG, WebP, {t("maxSize", { size: "10MB" })}
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
          ) : (
            <div className="space-y-4">
              {preview && (
                <Image
                  src={preview}
                  alt="Analyzed"
                  className="max-h-32 rounded-lg object-contain mx-auto"
                  width={800}
                  height={800}
                  unoptimized
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
                      type="button"
                      key={key}
                      onClick={() => toggleField(key)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all",
                        "flex items-start gap-3",
                        isSelected
                          ? "border-[var(--accent-green)] bg-[var(--accent-green-dim)]"
                          : "border-[var(--border-dim)] hover:border-[var(--border-medium)]"
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 size-5 rounded flex items-center justify-center flex-shrink-0 transition-colors",
                          isSelected
                            ? "bg-[var(--accent-green)] text-[var(--accent-green-on-fill)]"
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
            </div>
          )}
        </SheetBody>

        {result && (
          <SheetFooter>
            <Button variant="outline" onClick={handleClose} className="flex-1 sm:flex-none">
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleApply}
              disabled={selectedFields.size === 0}
              className="flex-1 sm:flex-none gap-2"
            >
              <Check size={16} />
              {t("applyExtracted", { count: selectedFields.size })}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
