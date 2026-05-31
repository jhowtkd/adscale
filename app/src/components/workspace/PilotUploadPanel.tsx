"use client";

import Image from "next/image";
import { useReducer, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Upload, Check, Loader2, ImageIcon, AlertCircle } from "lucide-react";
import { useUploadAsset } from "@/lib/hooks/use-assets";
import { useCreativeAnalysis } from "@/components/campaigns/useCreativeAnalysis";
import { useAnalyzePreflight } from "@/lib/hooks/use-preflight";

// ============================================
// Types
// ============================================

interface PilotUploadPanelProps {
  campaignId: string;
  onAssetUploaded: (assetId: string) => void;
  onAnalysisComplete: (analysis: {
    detectedConcept: string;
    tone: string;
    elements: string;
    format: string;
    suggestedObjective?: string;
    suggestedAudience?: string;
    suggestedTone?: string;
    suggestedPlatforms?: string;
    suggestedCta?: string;
  }) => void;
}

type UploadState = "empty" | "uploading" | "analyzing" | "reviewing" | "locked" | "error";

interface AnalysisStep {
  key: string;
  label: string;
}

const ANALYSIS_STEPS: AnalysisStep[] = [
  { key: "technical", label: "Análise técnica" },
  { key: "visual", label: "Extração visual" },
  { key: "suggestions", label: "Geração de sugestões" },
];

interface UploadUiState {
  state: UploadState;
  uploadProgress: number;
  completedSteps: string[];
  previewUrl: string | null;
  errorMessage: string | null;
  warningMessage: string | null;
}

type UploadUiAction =
  | { type: "uploadStarted"; previewUrl: string }
  | { type: "analysisStarted" }
  | { type: "stepCompleted"; step: string }
  | { type: "analysisFailed"; message: string }
  | { type: "analysisCompleted"; warningMessage: string | null }
  | { type: "uploadProgressChanged"; progress: number }
  | { type: "uploadFailed"; message: string }
  | { type: "previewCleared" };

const initialUploadUiState: UploadUiState = {
  state: "empty",
  uploadProgress: 0,
  completedSteps: [],
  previewUrl: null,
  errorMessage: null,
  warningMessage: null,
};

function uploadUiReducer(
  current: UploadUiState,
  action: UploadUiAction
): UploadUiState {
  switch (action.type) {
    case "uploadStarted":
      return {
        ...current,
        state: "uploading",
        uploadProgress: 0,
        completedSteps: [],
        previewUrl: action.previewUrl,
        errorMessage: null,
        warningMessage: null,
      };
    case "analysisStarted":
      return {
        ...current,
        state: "analyzing",
        completedSteps: [],
        errorMessage: null,
      };
    case "stepCompleted":
      return current.completedSteps.includes(action.step)
        ? current
        : { ...current, completedSteps: [...current.completedSteps, action.step] };
    case "analysisFailed":
      return { ...current, state: "error", errorMessage: action.message };
    case "analysisCompleted":
      return {
        ...current,
        state: "reviewing",
        warningMessage: action.warningMessage,
      };
    case "uploadProgressChanged":
      return { ...current, uploadProgress: action.progress };
    case "uploadFailed":
      return {
        ...current,
        state: "error",
        previewUrl: null,
        errorMessage: action.message,
      };
    case "previewCleared":
      return { ...current, previewUrl: null };
  }
}

// ============================================
// Component
// ============================================

export default function PilotUploadPanel({
  campaignId,
  onAssetUploaded,
  onAnalysisComplete,
}: PilotUploadPanelProps) {
  const [uiState, dispatch] = useReducer(uploadUiReducer, initialUploadUiState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const uploadAsset = useUploadAsset(campaignId);
  const { analyze, isAnalyzing: isAnalyzingCreative } = useCreativeAnalysis(campaignId);
  const analyzePreflight = useAnalyzePreflight();
  const {
    state,
    uploadProgress,
    completedSteps,
    previewUrl,
    errorMessage,
    warningMessage,
  } = uiState;

  useEffect(() => {
    const previewUrlStore = previewUrlRef;
    return () => {
      if (previewUrlStore.current) URL.revokeObjectURL(previewUrlStore.current);
    };
  }, []);

  const runAnalysis = useCallback(
    async (assetId: string) => {
      dispatch({ type: "analysisStarted" });

      try {
        // Run both analyses in parallel
        const preflightPromise = analyzePreflight
          .mutateAsync({ campaignId, assetId })
          .then((result) => {
            dispatch({ type: "stepCompleted", step: "technical" });
            return result;
          })
          .catch(() => {
            dispatch({ type: "stepCompleted", step: "technical" });
            return null;
          });

        const creativePromise = analyze(assetId)
          .then((result) => {
            const hasData = result?.analysis && Object.keys(result.analysis).length > 0;
            if (hasData) {
              dispatch({ type: "stepCompleted", step: "visual" });
              dispatch({ type: "stepCompleted", step: "suggestions" });
            }
            return result;
          })
          .catch(() => {
            return null;
          });

        const [preflightResult, creativeResult] = await Promise.all([
          preflightPromise,
          creativePromise,
        ]);

        const preflight = preflightResult?.preflight;
        const creative = creativeResult?.analysis;

        const hasCreativeData = creative && Object.keys(creative).length > 0;
        const hasPreflightData = preflight && (preflight.criticalIssues?.length || preflight.suggestions?.length || preflight.technical);

        // If both analyses failed completely, show error
        if (!hasCreativeData && !hasPreflightData) {
          dispatch({
            type: "analysisFailed",
            message: "Não foi possível analisar o criativo. Verifique a imagem e tente novamente.",
          });
          return;
        }

        // Map analysis results to the expected shape
        const suggestedPlatforms = creative?.platforms?.value?.join(", ") ?? "";
        const suggestedCta = creative?.suggestedCtas?.[0]?.value ?? "";

        const analysis = {
          detectedConcept:
            creative?.product?.value ??
            preflight?.breakdown?.visualHierarchy?.suggestion ??
            "Criativo publicitário",
          tone: creative?.tone?.value ?? "",
          elements:
            preflight?.criticalIssues?.join("; ") ??
            preflight?.suggestions?.join("; ") ??
            "",
          format: preflight?.technical
            ? `${preflight.technical.actualWidth}x${preflight.technical.actualHeight}px`
            : "",
          suggestedObjective: creative?.objective?.value ?? "",
          suggestedAudience: creative?.targetAudience?.value ?? "",
          suggestedTone: creative?.tone?.value ?? "",
          suggestedPlatforms,
          suggestedCta,
        };

        onAnalysisComplete(analysis);
        dispatch({
          type: "analysisCompleted",
          warningMessage: !hasCreativeData && hasPreflightData
            ? "Não foi possível extrair sugestões automaticamente do criativo. Preencha os campos manualmente ou tente outra imagem."
            : null,
        });
      } catch {
        dispatch({
          type: "analysisFailed",
          message: "Não foi possível completar a análise. Você pode preencher os campos manualmente.",
        });
      }
    },
    [campaignId, analyze, analyzePreflight, onAnalysisComplete]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      const objectUrl = URL.createObjectURL(file);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = objectUrl;
      dispatch({ type: "uploadStarted", previewUrl: objectUrl });

      try {
        const asset = await uploadAsset.mutateAsync({
          file,
          onProgress: (progress) =>
            dispatch({ type: "uploadProgressChanged", progress }),
        });

        onAssetUploaded(asset.id);
        await runAnalysis(asset.id);
      } catch (err) {
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = null;
        }
        dispatch({
          type: "uploadFailed",
          message: err instanceof Error ? err.message : "Erro no upload",
        });
      }
    },
    [uploadAsset, onAssetUploaded, runAnalysis]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.type.startsWith("image/")) {
        void handleUpload(file);
      }
    },
    [handleUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) {
        void handleUpload(file);
      }
    },
    [handleUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const openFilePicker = useCallback(() => {
    if (state === "empty" || state === "reviewing" || state === "error") {
      fileInputRef.current?.click();
    }
  }, [state]);

  const isInteractive = state === "empty" || state === "reviewing" || state === "error";
  const isProcessing = state === "uploading" || state === "analyzing";

  return (
    <PilotUploadDropzone
      state={state}
      uploadProgress={uploadProgress}
      completedSteps={completedSteps}
      previewUrl={previewUrl}
      errorMessage={errorMessage}
      warningMessage={warningMessage}
      isInteractive={isInteractive}
      isProcessing={isProcessing}
      fileInputRef={fileInputRef}
      onFileChange={handleFileChange}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onOpenFilePicker={openFilePicker}
    />
  );
}

interface PilotUploadDropzoneProps {
  state: UploadState;
  uploadProgress: number;
  completedSteps: string[];
  previewUrl: string | null;
  errorMessage: string | null;
  warningMessage: string | null;
  isInteractive: boolean;
  isProcessing: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onOpenFilePicker: () => void;
}

function PilotUploadDropzone({
  state,
  uploadProgress,
  completedSteps,
  previewUrl,
  errorMessage,
  warningMessage,
  isInteractive,
  isProcessing,
  fileInputRef,
  onFileChange,
  onDrop,
  onDragOver,
  onOpenFilePicker,
}: PilotUploadDropzoneProps) {
  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Selecionar imagem piloto"
        onChange={onFileChange}
      />

      {/* Dropzone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        className={cn(
          "relative flex flex-col items-center justify-center min-h-[360px] rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden",
          "bg-[var(--accent-green-dim)]",
          isInteractive
            ? "cursor-pointer hover:border-[var(--accent-green)] hover:bg-[var(--accent-green-dim)]"
            : "cursor-default",
          isProcessing ? "border-[var(--accent-green)]" : "border-[var(--border-medium)]"
        )}
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--border-dim) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        {/* Empty State */}
        {state === "empty" && (
          <div className="flex flex-col items-center animate-fade-in">
            <div className="mb-4">
              <ImageIcon size={48} className="text-[var(--text-muted)]" />
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
              Arraste uma imagem ou clique para upload
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              PNG, JPG ou WebP até 50MB
            </p>
            <button
              type="button"
              onClick={onOpenFilePicker}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:border-[var(--border-medium)] active:scale-[0.98]"
            >
              <Upload size={14} className="mr-2" />
              Selecionar arquivo
            </button>
          </div>
        )}

        {/* Error State */}
        {state === "error" && (
          <div className="flex flex-col items-center animate-fade-in px-6">
            <div className="mb-4">
              <AlertCircle size={48} className="text-[var(--accent-rose)]" />
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
              Falha no processamento
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4 text-center max-w-xs">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={onOpenFilePicker}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:border-[var(--border-medium)] active:scale-[0.98]"
            >
              <Upload size={14} className="mr-2" />
              Tentar novamente
            </button>
          </div>
        )}

        {/* Preview when available */}
        {previewUrl && state !== "empty" && state !== "error" && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <Image
              src={previewUrl}
              alt="Preview"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              unoptimized
              className="object-contain rounded-xl opacity-30"
            />
          </div>
        )}

        {/* Uploading State */}
        {state === "uploading" && (
          <div className="relative z-10 flex flex-col items-center animate-fade-in">
            <Loader2 size={32} className="text-[var(--accent-green)] animate-spin mb-3" />
            <div className="w-48 h-1 bg-[var(--border-dim)] rounded-full overflow-hidden mb-2">
              <div
                className="h-full gradient-progress rounded-full transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {uploadProgress}%
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--ghost)] mt-1">
              Enviando arquivo…
            </p>
          </div>
        )}

        {/* Analyzing State */}
        {state === "analyzing" && (
          <div className="relative z-10 flex flex-col items-center w-full max-w-xs animate-fade-in">
            <div className="space-y-3 w-full">
              {ANALYSIS_STEPS.map((step) => {
                const isDone = completedSteps.includes(step.key);
                const isCurrent =
                  !isDone &&
                  ANALYSIS_STEPS[completedSteps.length]?.key === step.key;

                return (
                  <div
                    key={step.key}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-300",
                      isDone
                        ? "border-[var(--accent-green)]/30 bg-[var(--accent-green-dim)]"
                        : isCurrent
                        ? "border-[var(--border-medium)] bg-[var(--surface-base)]"
                        : "border-[var(--border-dim)] bg-[var(--surface-base)]/50"
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full border transition-all duration-300",
                        isDone
                          ? "border-[var(--accent-green)] bg-[var(--accent-green)] text-white"
                          : isCurrent
                          ? "border-[var(--accent-green)]"
                          : "border-[var(--border-dim)]"
                      )}
                    >
                      {isDone ? (
                        <Check size={12} />
                      ) : isCurrent ? (
                        <Loader2 size={12} className="text-[var(--accent-green)] animate-spin" />
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "font-mono text-[10px] uppercase tracking-wide",
                        isDone
                          ? "text-[var(--accent-green)]"
                          : isCurrent
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--ghost)]"
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Reviewing State */}
        {state === "reviewing" && (
          <div className="relative z-10 flex flex-col items-center animate-fade-in max-w-sm px-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-[var(--accent-green-dim)] mb-3">
              <Check size={24} className="text-[var(--accent-green)]" />
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
              Análise concluída
            </h3>
            {warningMessage ? (
              <p className="text-xs text-[var(--accent-amber)] mb-4 text-center">
                {warningMessage}
              </p>
            ) : (
              <p className="text-xs text-[var(--text-muted)] mb-4">
                Revise as sugestões no formulário abaixo
              </p>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenFilePicker();
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all duration-200 hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)]"
            >
              <Upload size={14} />
              Substituir imagem
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
