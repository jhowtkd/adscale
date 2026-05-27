"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Cloud, Upload, Check, AlertCircle, Lightbulb, Replace, FileImage, Eye, EyeOff, Library } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useCampaignAssets, useUploadAsset } from "@/lib/hooks/use-assets";
import { usePreflightScore, useAnalyzePreflight } from "@/lib/hooks/use-preflight";
import PreflightScoreCard from "@/components/campaigns/PreflightScoreCard";
import dynamic from "next/dynamic";

const AssetLibraryModal = dynamic(() => import("./AssetLibraryModal"), {
  loading: () => null,
  ssr: false,
});

import { apiFetch } from "@/lib/api-client";
import type { WorkspaceAsset } from "@/lib/hooks/use-workspace-assets";

// ============================================
// Types
// ============================================

interface UploadedFile {
  file: File;
  preview: string;
  dimensions: { width: number; height: number } | null;
}

interface UploadStepProps {
  campaignId: string;
      onContinueToPlan: () => void;
}

// ============================================
// Constants
// ============================================

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function readImageDimensions(file: File): Promise<{ preview: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const preview = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      resolve({ preview, width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(preview);
      reject(new Error("invalid-image"));
    };
    img.src = preview;
  });
}

// ============================================
// Component
// ============================================

export default function UploadStep({ campaignId, onContinueToPlan }: UploadStepProps) {
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreflight, setShowPreflight] = useState(true);
  const [latestAssetId, setLatestAssetId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const t = useTranslations("upload");
  const uploadAsset = useUploadAsset(campaignId);
  const { data: existingAssets = [] } = useCampaignAssets(campaignId);
  const existingAsset = uploadedFile ? null : existingAssets[0] ?? null;
  const hasUploadedCreative = Boolean(uploadedFile || existingAsset);

  // Cleanup blob URL on unmount or when uploadedFile changes
  useEffect(() => {
    return () => {
      if (uploadedFile?.preview) {
        URL.revokeObjectURL(uploadedFile.preview);
      }
    };
  }, [uploadedFile?.preview]);

  const activeAssetId = latestAssetId ?? existingAsset?.id ?? null;

  const preflightQuery = usePreflightScore(activeAssetId, campaignId);
  const analyzePreflight = useAnalyzePreflight();

  // Auto-trigger preflight when a new asset appears (only when query is idle, not on every fetch)
  useEffect(() => {
    if (!showPreflight) return;
    if (activeAssetId && !preflightQuery.data && preflightQuery.fetchStatus === "idle") {
      analyzePreflight.mutate({ campaignId, assetId: activeAssetId });
    }
  }, [activeAssetId, showPreflight, campaignId, preflightQuery.data, preflightQuery.fetchStatus, analyzePreflight]);

  const tips = [
    t("tipHighRes"),
    t("tipClearSubject"),
    t("tipWellLit"),
    t("tipLimitedText"),
    t("tipPng"),
  ];

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const image = await readImageDimensions(file);
      setUploadProgress(10);
      const asset = await uploadAsset.mutateAsync({
        file,
        width: image.width,
        height: image.height,
        onProgress: (progress) => setUploadProgress(Math.max(10, progress)),
      });
      setUploadProgress(100);
      setUploadedFile({
        file,
        preview: image.preview,
        dimensions: { width: image.width, height: image.height },
      });
      if (asset?.id) {
        setLatestAssetId(asset.id);
      }
      // Trigger preflight after successful upload
      if (showPreflight && asset?.id) {
        analyzePreflight.mutate({ campaignId, assetId: asset.id });
      }
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setIsUploading(false);
    }
  }, [t, uploadAsset, analyzePreflight, campaignId, showPreflight]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setError(null);

      if (acceptedFiles.length === 0) return;

      const file = acceptedFiles[0];

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(t("invalidFormat"));
        return;
      }

      if (file.size > MAX_SIZE_BYTES) {
        setError(t("fileTooLarge", { max: MAX_SIZE_MB }));
        return;
      }

      void uploadFile(file);
    },
    [t, uploadFile]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
    },
    maxSize: MAX_SIZE_BYTES,
    multiple: false,
  });

  const handleReplace = () => {
    if (uploadedFile?.preview) {
      URL.revokeObjectURL(uploadedFile.preview);
    }
    setUploadedFile(null);
    setUploadProgress(0);
    setError(null);
    open();
  };

  const handleSelectFromLibrary = async (asset: WorkspaceAsset) => {
    setIsLinking(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/campaigns/${campaignId}/assets/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceAssetId: asset.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to link asset");
      }
      const { asset: linkedAsset } = await res.json();
      if (linkedAsset?.id) {
        setLatestAssetId(linkedAsset.id);
      }
    } catch {
      setError(t("linkFailed"));
    } finally {
      setIsLinking(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getAssetName = (key: string): string => {
    return decodeURIComponent(key.split("/").pop() || key).replace(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
      ""
    );
  };

  const isValidDimensions = (dim: { width: number; height: number } | null): boolean => {
    if (!dim) return true; // Can't check yet, assume OK
    return dim.width >= 1080 && dim.height >= 1080;
  };

  const displayedDimensions =
    uploadedFile?.dimensions ??
    (existingAsset?.width && existingAsset.height
      ? { width: existingAsset.width, height: existingAsset.height }
      : null);
  const displayedName =
    uploadedFile?.file.name ?? (existingAsset ? getAssetName(existingAsset.key) : t("uploadedAsset"));
  const displayedType = uploadedFile?.file.type ?? existingAsset?.type ?? "image";
  const displayedSize = uploadedFile?.file.size ?? existingAsset?.size ?? null;

  return (
    <div className="mx-auto w-full max-w-[960px]">
      <input {...getInputProps()} className="sr-only" />
      <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
        {/* Main upload area */}
        <div className="min-w-0 flex-1">
          {/* ---- Uploaded State ---- */}
          {hasUploadedCreative ? (
            <div className="animate-fade-in">
              {/* Image Preview */}
              <div className="flex items-center justify-center mb-4">
                <div className="relative max-h-[400px] overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={uploadedFile?.preview ?? existingAsset?.url ?? ""}
                    alt={displayedName}
                    className="max-h-[400px] w-auto object-contain rounded-xl"
                  />
                </div>
              </div>

              {/* File Info Bar */}
              <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <FileImage size={18} className="text-[var(--accent-blue)]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {displayedName}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {displayedSize && (
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatFileSize(displayedSize)}
                        </span>
                      )}
                      {displayedDimensions && (
                        <span className="text-xs text-[var(--text-muted)]">
                          {displayedDimensions.width} \u00d7 {displayedDimensions.height}px
                        </span>
                      )}
                      <span className="text-xs text-[var(--text-muted)] uppercase">
                        {displayedType.split("/")[1] ?? "image"}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleReplace}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-all duration-200 hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)]"
                >
                  <Replace size={14} />
                  {t("replace")}
                </button>
              </div>

              {/* Validation Checks */}
              <div className="mt-4 space-y-2">
                {/* Format check */}
                <div className="flex items-center gap-2 text-sm">
                  <Check size={16} className="text-[var(--accent-teal)]" />
                  <span className="text-[var(--text-secondary)]">{t("formatValid")}</span>
                </div>
                {/* Size check */}
                <div className="flex items-center gap-2 text-sm">
                  <Check size={16} className="text-[var(--accent-teal)]" />
                  <span className="text-[var(--text-secondary)]">
                    {t("underLimit", { max: MAX_SIZE_MB })}
                  </span>
                </div>
                {/* Dimension check */}
                <div className="flex items-center gap-2 text-sm">
                  {isValidDimensions(displayedDimensions) ? (
                    <Check size={16} className="text-[var(--accent-teal)]" />
                  ) : (
                    <AlertCircle size={16} className="text-[var(--accent-amber)]" />
                  )}
                  <span className="text-[var(--text-secondary)]">
                    {displayedDimensions
                      ? `${displayedDimensions.width}\u00d7${displayedDimensions.height}px`
                      : t("checkingDimensions")}
                    {!isValidDimensions(displayedDimensions) && (
                      <span className="text-[var(--accent-amber)] ml-1">
                        {t("recommendedDimensions")}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Preflight toggle */}
              <div className="mt-4 flex items-center justify-end">
                <button
                  onClick={() => setShowPreflight((s) => !s)}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  {showPreflight ? <Eye size={14} /> : <EyeOff size={14} />}
                  {showPreflight ? t("hidePreflight") : t("showPreflight")}
                </button>
              </div>

              {/* Preflight Score Card */}
              {showPreflight && activeAssetId && (
                <div className="mt-3">
                  <PreflightScoreCard
                    result={preflightQuery.data?.preflight ?? null}
                    status={preflightQuery.data?.status ?? "pending"}
                    onReanalyze={() => analyzePreflight.mutate({ campaignId, assetId: activeAssetId })}
                  />
                </div>
              )}

              {/* Navigation buttons */}
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end animate-fade-in" style={{ animationDelay: "300ms" }}>
                <button
                  onClick={onContinueToPlan}
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--accent-mint)] px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:-translate-y-px hover:bg-[var(--accent-mint-light)] active:scale-[0.98]"
                >
                  {t("continueToPlan")}
                </button>
              </div>
            </div>
          ) : (
            /* ---- Upload Zone ---- */
            <div className="animate-fade-in">
              <div
                {...getRootProps()}
                className={cn(
                  "relative flex flex-col items-center justify-center min-h-[360px] rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden",
                  "bg-[var(--accent-mint-dim)]",
                  isDragActive
                    ? "border-[var(--accent-mint)] bg-[var(--accent-mint-dim)] scale-[1.01]"
                    : error
                    ? "border-[var(--accent-rose)]"
                    : "border-[var(--border-medium)]",
                  "hover:border-[var(--accent-mint)] hover:bg-[var(--accent-mint-dim)]"
                )}
                style={{
                  backgroundImage:
                    "radial-gradient(circle, var(--border-dim) 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              >
                {/* Cloud Icon */}
                <div className="mb-4">
                  <Cloud
                    size={48}
                    className={cn(
                      "transition-colors duration-200",
                      isDragActive ? "text-[var(--accent-mint)]" : "text-[var(--text-muted)]"
                    )}
                  />
                </div>

                {/* Text */}
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
                  {isDragActive ? t("dropzone") : t("dropzone")}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mb-4">
                  {t("supportedFormats")}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      open();
                    }}
                    className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-all duration-200 hover:border-[var(--border-medium)] active:scale-[0.98]"
                  >
                    <Upload size={14} className="mr-2" />
                    {t("browseFiles")}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setLibraryOpen(true);
                    }}
                    disabled={isLinking}
                    className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-all duration-200 hover:border-[var(--border-medium)] hover:text-[var(--text-primary)] active:scale-[0.98] disabled:opacity-50"
                  >
                    <Library size={14} className="mr-2" />
                    {isLinking ? t("linking") : t("chooseFromLibrary")}
                  </button>
                </div>

                {/* Uploading state overlay */}
                {isUploading && (
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--surface-base)]/80 rounded-2xl animate-fade-in"
                    aria-live="polite"
                  >
                    {/* Progress bar */}
                    <div className="w-64 h-1 bg-[var(--border-dim)] rounded-full overflow-hidden mb-3">
                      <div
                        className="h-full gradient-progress rounded-full transition-all duration-200"
                        style={{ width: `${Math.min(uploadProgress, 100)}%` }}
                      />
                    </div>
                    <p className="text-sm text-[var(--text-primary)] font-medium">
                      {Math.min(Math.round(uploadProgress), 100)}%
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {t("uploading")}
                    </p>
                  </div>
                )}

                {/* Error state */}
                {error && (
                  <div
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgba(244,63,94,0.08)] border border-[var(--accent-rose)]/20 animate-fade-in"
                    role="alert"
                  >
                    <AlertCircle size={16} className="text-[var(--accent-rose)]" />
                    <span className="text-sm text-[var(--accent-rose)]">{error}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <AssetLibraryModal
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          onSelect={handleSelectFromLibrary}
        />

        {/* ---- Tips Panel (desktop only) ---- */}
        <div className="hidden w-[280px] flex-shrink-0 lg:block animate-fade-in" style={{ animationDelay: "300ms" }}>
          <div className="bg-[var(--surface-raised)] rounded-lg p-5 border border-[var(--border-dim)]">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb size={18} className="text-[var(--accent-amber)]" />
              <h4 className="text-[15px] font-semibold text-[var(--text-primary)]">
                {t("bestPractices")}
              </h4>
            </div>
            <ul className="space-y-3">
              {tips.map((tip, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)] animate-fade-in"
                  style={{ animationDelay: `${400 + i * 100}ms` }}
                >
                  <Check
                    size={16}
                    className="text-[var(--accent-teal)] flex-shrink-0 mt-0.5"
                  />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
