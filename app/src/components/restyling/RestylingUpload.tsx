"use client";

import Image from "next/image";
import { useCallback, useState, useRef } from "react";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface RestylingUploadProps {
  label: string;
  description?: string;
  accept?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  error?: string | null;
  translations: {
    dragDrop: string;
    onlyImages: string;
    maxSize: string;
  };
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RestylingUpload({
  label,
  description,
  accept,
  value,
  onChange,
  error,
  translations,
}: RestylingUploadProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        return translations.onlyImages;
      }
      if (file.size > MAX_SIZE_BYTES) {
        return translations.maxSize;
      }
      return null;
    },
    [translations]
  );

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setLocalError(validationError);
        return;
      }
      setLocalError(null);
      onChange(file);
    },
    [validateFile, onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [handleFile]
  );

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onChange(null as unknown as File);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [onChange]
  );

  const displayError = error || localError;

  return (
    <div className="w-full">
      <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5">
        {label}
      </label>
      {description && (
        <p className="text-xs text-[var(--text-muted)] mb-3">{description}</p>
      )}

      {value ? (
        <div className="relative rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] overflow-hidden animate-fade-in transition-all duration-250">
          <div className="flex items-center gap-4 p-4">
            <div className="size-16 rounded-lg overflow-hidden bg-[var(--neutral)] flex-shrink-0">
              <Image
                src={URL.createObjectURL(value)}
                alt={value.name}
                className="size-full object-cover"
              
        width={800}
        height={800}
        unoptimized
      />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                {value.name}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {formatFileSize(value.size)}
              </p>
            </div>
            <button type="button"
              onClick={handleRemove}
              className="inline-flex items-center justify-center size-8 rounded-lg hover:bg-[var(--surface-base)] transition-colors duration-200"
            >
              <X size={18} className="text-[var(--text-muted)]" />
            </button>
          </div>
        </div>
      ) : (
        <div className="animate-fade-in transition-all duration-250">
          <input
            ref={inputRef}
            type="file"
            aria-label="Upload creative file"
            accept={accept || ACCEPTED_TYPES.join(",")}
            onChange={handleInputChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={openFilePicker}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
              "relative flex flex-col items-center justify-center min-h-[180px] rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer",
              isDragActive
                ? "border-[var(--accent-green)] bg-[var(--accent-green-dim)]"
                : displayError
                ? "border-[var(--accent-rose)]"
                : "border-[var(--border-medium)] bg-[var(--surface-raised)] hover:border-[var(--accent-green)] hover:bg-[var(--accent-green-dim)]"
            )}
          >
            <div className="mb-3">
              <Upload
                size={32}
                className={cn(
                  "transition-colors duration-200",
                  isDragActive
                    ? "text-[var(--accent-green)]"
                    : displayError
                    ? "text-[var(--accent-rose)]"
                    : "text-[var(--text-muted)]"
                )}
              />
            </div>

            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
              {translations.dragDrop}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {translations.onlyImages} ({translations.maxSize})
            </p>

            {displayError && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(244,63,94,0.08)] border border-[var(--accent-rose)]/20 animate-fade-in">
                <X size={14} className="text-[var(--accent-rose)]" />
                <span className="text-xs text-[var(--accent-rose)]">
                  {displayError}
                </span>
              </div>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

