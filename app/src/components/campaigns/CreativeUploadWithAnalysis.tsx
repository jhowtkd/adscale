"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Upload, X, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUploadAsset } from "@/lib/hooks/use-assets";
import { useCreativeAnalysis } from "./useCreativeAnalysis";
import type { AiDeducedFields } from "@/server/validation/ai-deduction";

interface CreativeUploadWithAnalysisProps {
  campaignId: string;
  onAnalysisComplete?: (result: AiDeducedFields) => void;
}

export function CreativeUploadWithAnalysis({ 
  campaignId, 
  onAnalysisComplete 
}: CreativeUploadWithAnalysisProps) {
  const t = useTranslations("campaign");
  const tCommon = useTranslations("common");
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [, setUploadProgress] = useState(0);
  
  const uploadAsset = useUploadAsset(campaignId);
  const { analyze, isAnalyzing, analysisResult, analysisError } = useCreativeAnalysis(campaignId);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file);
    setUploadProgress(0);
    
    // Upload first
    uploadAsset.mutate(
      { file, onProgress: (progress) => setUploadProgress(progress) },
      {
        onSuccess: (asset) => {
          setUploadProgress(100);
          
          // Trigger AI analysis after successful upload
          if (asset?.id) {
            analyze(asset.id).then((result) => {
              if (result.status === "completed" && onAnalysisComplete) {
                onAnalysisComplete(result.analysis);
              }
            }).catch(() => {
              // Analysis failure is non-blocking
            });
          }
        },
        onError: () => {
          setUploadProgress(0);
          setSelectedFile(null);
        },
      }
    );
  }, [uploadAsset, analyze, onAnalysisComplete]);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setUploadProgress(0);
  }, []);

  const isProcessing = uploadAsset.isPending || isAnalyzing;
  const showAnalysisWarning = analysisResult?.status === "failed" || analysisError;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "border border-dashed rounded-lg p-6 transition-colors relative",
          selectedFile
            ? "border-[var(--accent-green)] bg-[var(--accent-green-dim)0.05)]"
            : "border-[var(--border-dim)] hover:border-[var(--border-medium)] hover:bg-[var(--surface-raised)]",
          isProcessing && "opacity-75"
        )}
      >
        {selectedFile ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--surface-base)] flex items-center justify-center">
                <Upload size={20} className="text-[var(--accent-green)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text-primary)] truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {isProcessing && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <Loader2 size={14} className="animate-spin" />
                  {uploadAsset.isPending ? tCommon("sending") : (
                    <>
                      <Sparkles size={14} className="text-[var(--accent-blue)]" />
                      {t("analyzing")}
                    </>
                  )}
                </div>
              )}
              {!isProcessing && (
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="p-1.5 hover:bg-[var(--surface-base)] rounded-md transition-colors"
                >
                  <X size={16} className="text-[var(--text-muted)]" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <label className="flex flex-col items-center gap-3 cursor-pointer">
            <div className="w-12 h-12 rounded-xl bg-[var(--surface-base)] flex items-center justify-center">
              <Upload size={24} className="text-[var(--text-muted)]" />
            </div>
            <div className="text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                {t("uploadCreativeHint")}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                PNG, JPG, WebP — {t("maxFileSize")}
              </p>
            </div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessing}
            />
          </label>
        )}
      </div>

      {/* Analysis warning */}
      {showAnalysisWarning && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)]">
          <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-amber-700">
              {t("analysisFailed")}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {t("analysisFailedHint")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
