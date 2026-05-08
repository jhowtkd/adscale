"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { Cloud, Upload, Check, AlertCircle, Lightbulb, Replace, FileImage } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useUploadAsset } from "@/lib/hooks/use-assets";

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
  onContinue: () => void;
  onGeneratePreview?: () => void;
  hasPreview?: boolean;
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

export default function UploadStep({ campaignId, onContinue, onGeneratePreview, hasPreview }: UploadStepProps) {
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("upload");
  const uploadAsset = useUploadAsset(campaignId);

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
      await uploadAsset.mutateAsync({
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
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setIsUploading(false);
    }
  }, [t, uploadAsset]);

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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
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
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isValidDimensions = (dim: { width: number; height: number } | null): boolean => {
    if (!dim) return true; // Can't check yet, assume OK
    return dim.width >= 1080 && dim.height >= 1080;
  };

  return (
    <div className="max-w-[960px] mx-auto">
      <div className="flex gap-6">
        {/* Main upload area */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            {/* ---- Uploaded State ---- */}
            {uploadedFile ? (
              <motion.div
                key="uploaded"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] as const }}
              >
                {/* Image Preview */}
                <div className="flex items-center justify-center mb-4">
                  <div className="relative max-h-[400px] overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={uploadedFile.preview}
                      alt={uploadedFile.file.name}
                      className="max-h-[400px] w-auto object-contain rounded-xl"
                    />
                  </div>
                </div>

                {/* File Info Bar */}
                <div className="flex items-center justify-between bg-[var(--surface-raised)] rounded-lg px-4 py-3 border border-[var(--border-dim)]">
                  <div className="flex items-center gap-3">
                    <FileImage size={18} className="text-[var(--accent-blue)]" />
                    <div>
                      <p className="text-sm text-[var(--text-primary)] font-medium">
                        {uploadedFile.file.name}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-[var(--text-muted)]">
                          {formatFileSize(uploadedFile.file.size)}
                        </span>
                        {uploadedFile.dimensions && (
                          <span className="text-xs text-[var(--text-muted)]">
                            {uploadedFile.dimensions.width} \u00d7 {uploadedFile.dimensions.height}px
                          </span>
                        )}
                        <span className="text-xs text-[var(--text-muted)] uppercase">
                          {uploadedFile.file.type.split("/")[1]}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleReplace}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] transition-all duration-200"
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
                    {isValidDimensions(uploadedFile.dimensions) ? (
                      <Check size={16} className="text-[var(--accent-teal)]" />
                    ) : (
                      <AlertCircle size={16} className="text-[var(--accent-amber)]" />
                    )}
                    <span className="text-[var(--text-secondary)]">
                      {uploadedFile.dimensions
                        ? `${uploadedFile.dimensions.width}\u00d7${uploadedFile.dimensions.height}px`
                        : t("checkingDimensions")}
                      {!isValidDimensions(uploadedFile.dimensions) && (
                        <span className="text-[var(--accent-amber)] ml-1">
                          {t("recommendedDimensions")}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Preview + Generate buttons */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="mt-6 flex justify-end gap-3"
                >
                  <button
                    onClick={onGeneratePreview}
                    disabled={!onGeneratePreview}
                    className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-medium transition-all duration-200 border border-[var(--border-dim)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--border-medium)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t("generatePreview")}
                  </button>
                  <button
                    onClick={onContinue}
                    className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 bg-[var(--accent-mint)] hover:bg-[var(--accent-mint-light)] hover:-translate-y-px active:scale-[0.98]"
                  >
                    {hasPreview ? t("generateAll") : t("generateDerivations")}
                  </button>
                </motion.div>
              </motion.div>
            ) : (
              /* ---- Upload Zone ---- */
              <motion.div
                key="upload-zone"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] as const }}
              >
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
                  <input {...getInputProps()} />

                  {/* Cloud Icon */}
                  <motion.div
                    animate={isDragActive ? { y: [0, -8, 0] } : { y: 0 }}
                    transition={
                      isDragActive
                        ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" }
                        : {}
                    }
                    className="mb-4"
                  >
                    <Cloud
                      size={48}
                      className={cn(
                        "transition-colors duration-200",
                        isDragActive ? "text-[var(--accent-mint)]" : "text-[var(--text-muted)]"
                      )}
                    />
                  </motion.div>

                  {/* Text */}
                  <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
                    {isDragActive ? t("dropzone") : t("dropzone")}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mb-4">
                    {t("supportedFormats")}
                  </p>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] hover:border-[var(--border-medium)] active:scale-[0.98]"
                  >
                    <Upload size={14} className="mr-2" />
                    {t("browseFiles")}
                  </button>

                  {/* Uploading state overlay */}
                  <AnimatePresence>
                    {isUploading && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--surface-base)]/80 rounded-2xl"
                      >
                        {/* Progress bar */}
                        <div className="w-64 h-1 bg-[var(--border-dim)] rounded-full overflow-hidden mb-3">
                          <motion.div
                            className="h-full gradient-progress rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(uploadProgress, 100)}%` }}
                            transition={{ duration: 0.2 }}
                          />
                        </div>
                        <p className="text-sm text-[var(--text-primary)] font-medium">
                          {Math.min(Math.round(uploadProgress), 100)}%
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          {t("uploading")}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Error state */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgba(244,63,94,0.08)] border border-[var(--accent-rose)]/20"
                      >
                        <AlertCircle size={16} className="text-[var(--accent-rose)]" />
                        <span className="text-sm text-[var(--accent-rose)]">{error}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ---- Tips Panel (desktop only) ---- */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4, ease: [0.19, 1, 0.22, 1] as const }}
          className="hidden lg:block w-[280px] flex-shrink-0"
        >
          <div className="bg-[var(--surface-raised)] rounded-lg p-5 border border-[var(--border-dim)]">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb size={18} className="text-[var(--accent-amber)]" />
              <h4 className="text-[15px] font-semibold text-[var(--text-primary)]">
                {t("bestPractices")}
              </h4>
            </div>
            <ul className="space-y-3">
              {tips.map((tip, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]"
                >
                  <Check
                    size={16}
                    className="text-[var(--accent-teal)] flex-shrink-0 mt-0.5"
                  />
                  {tip}
                </motion.li>
              ))}
            </ul>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
