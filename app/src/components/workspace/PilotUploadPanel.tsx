"use client";

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Upload, Check, Loader2, ImageIcon } from "lucide-react";

// ============================================
// Types
// ============================================

interface PilotUploadPanelProps {
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

type UploadState = "empty" | "uploading" | "analyzing" | "reviewing" | "locked";

interface AnalysisStep {
  key: string;
  label: string;
}

const ANALYSIS_STEPS: AnalysisStep[] = [
  { key: "technical", label: "Análise técnica" },
  { key: "visual", label: "Extração visual" },
  { key: "suggestions", label: "Geração de sugestões" },
];

// ============================================
// Component
// ============================================

export default function PilotUploadPanel({
  onAssetUploaded,
  onAnalysisComplete,
}: PilotUploadPanelProps) {
  const [state, setState] = useState<UploadState>("empty");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const simulateUpload = useCallback(
    async (file: File) => {
      setState("uploading");
      setUploadProgress(0);

      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);

      // Simulate upload progress
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((r) => setTimeout(r, 150));
        setUploadProgress(i);
      }

      const assetId = `asset-${Date.now()}`;
      onAssetUploaded(assetId);

      // Start analysis
      setState("analyzing");
      setCompletedSteps([]);

      for (const step of ANALYSIS_STEPS) {
        await new Promise((r) => setTimeout(r, 800));
        setCompletedSteps((prev) => [...prev, step.key]);
      }

      await new Promise((r) => setTimeout(r, 400));

      const mockAnalysis = {
        detectedConcept: "Promoção de produto",
        tone: "Energético",
        elements: "Produto central, fundo gradiente, texto promocional",
        format: "1080x1080 (Feed)",
        suggestedObjective: "Aumentar vendas do lançamento",
        suggestedAudience: "Jovens adultos 18-35",
        suggestedTone: "Direto e persuasivo",
        suggestedPlatforms: "Instagram, Facebook",
        suggestedCta: "Compre agora",
      };

      onAnalysisComplete(mockAnalysis);
      setState("reviewing");
    },
    [onAssetUploaded, onAnalysisComplete]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.type.startsWith("image/")) {
        void simulateUpload(file);
      }
    },
    [simulateUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) {
        void simulateUpload(file);
      }
    },
    [simulateUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleClick = useCallback(() => {
    if (state === "empty" || state === "reviewing") {
      fileInputRef.current?.click();
    }
  }, [state]);

  const isInteractive = state === "empty" || state === "reviewing";

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />

      {/* Dropzone */}
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={cn(
          "relative flex flex-col items-center justify-center min-h-[360px] rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden",
          "bg-[var(--accent-green-dim)]",
          isInteractive
            ? "cursor-pointer hover:border-[var(--accent-green)] hover:bg-[var(--accent-green-dim)]"
            : "cursor-default",
          state === "uploading" || state === "analyzing"
            ? "border-[var(--accent-green)]"
            : "border-[var(--border-medium)]"
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
              <ImageIcon
                size={48}
                className="text-[var(--text-muted)]"
              />
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
              Arraste uma imagem ou clique para upload
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              PNG, JPG ou WebP até 50MB
            </p>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:border-[var(--border-medium)] active:scale-[0.98]"
            >
              <Upload size={14} className="mr-2" />
              Selecionar arquivo
            </button>
          </div>
        )}

        {/* Preview when available */}
        {previewUrl && state !== "empty" && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Preview"
              className="max-h-full max-w-full object-contain rounded-xl opacity-30"
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
              Enviando arquivo...
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
                  (completedSteps.length === 0 ||
                    ANALYSIS_STEPS[completedSteps.length]?.key === step.key);

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
          <div className="relative z-10 flex flex-col items-center animate-fade-in">
            <div className="flex size-12 items-center justify-center rounded-full bg-[var(--accent-green-dim)] mb-3">
              <Check size={24} className="text-[var(--accent-green)]" />
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
              Análise concluída
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Revise as sugestões no formulário abaixo
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
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
