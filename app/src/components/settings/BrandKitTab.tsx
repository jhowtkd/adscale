"use client";

import Image from "next/image";
import { useReducer, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { m } from "framer-motion";
import { Check, Upload, X, Wand2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  useBrandKit,
  useUpdateBrandKit,
  useExtractBrandKit,
  useUploadLogo,
  useClearBrandKit,
  BrandKitAmbiguousError,
  BrandKitProfileNotFoundError,
  type AvailableWorkspace,
} from "@/lib/hooks/use-brand-kit";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const FOCUS_RING =
  "focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

interface BrandKitState {
  name: string;
  description: string;
  visualNotes: string;
  toneNotes: string;
  constraints: string;
  brandColors: string[];
  brandFonts: string[];
  logoAssetKey: string | null;
  showClearDialog: boolean;
  toneOfVoice: string;
  prohibitedElements: string;
  requiredElements: string;
  saveState: "idle" | "saving" | "saved";
  isDragging: boolean;
}

const initialBrandKitState: BrandKitState = {
  name: "",
  description: "",
  visualNotes: "",
  toneNotes: "",
  constraints: "",
  brandColors: [],
  brandFonts: [],
  logoAssetKey: null,
  showClearDialog: false,
  toneOfVoice: "",
  prohibitedElements: "",
  requiredElements: "",
  saveState: "idle",
  isDragging: false,
};

function brandKitReducer(
  state: BrandKitState,
  payload: Partial<BrandKitState>
): BrandKitState {
  return { ...state, ...payload };
}

function TagInput({
  tags,
  onChange,
  placeholder,
  validator,
  normalizer,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  validator?: (tag: string) => boolean;
  normalizer?: (tag: string) => string;
}) {
  const [input, setInput] = useState("");

  const normalize = (tag: string) => (normalizer ? normalizer(tag) : tag);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = normalize(input.trim());
      if (trimmed && (!validator || validator(trimmed))) {
        if (!tags.includes(trimmed)) {
          onChange([...tags, trimmed]);
        }
        setInput("");
      }
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "w-full min-h-[40px] rounded-md border px-2 py-1.5 flex flex-wrap gap-1.5",
        "bg-[var(--surface-base)] border-[var(--border-dim)]",
        "focus-within:border-[var(--accent-green)] focus-within:ring-[3px] focus-within:ring-[var(--accent-green-dim)0.15)]",
        "transition-all duration-200"
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-green-dim)] px-2 py-0.5 text-xs font-medium text-[var(--accent-green-text)]"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="hover:text-[var(--accent-rose)]"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        type="text"
        aria-label={placeholder}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[80px] bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
      />
    </div>
  );
}

export default function BrandKitTab() {
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(undefined);
  const [pendingProfileChoice, setPendingProfileChoice] = useState<string>("");
  const { data: brandKit, isLoading, isError, error } = useBrandKit(selectedProfileId);
  const updateBrandKit = useUpdateBrandKit(selectedProfileId);
  const extractBrandKit = useExtractBrandKit(selectedProfileId);
  const uploadLogo = useUploadLogo(selectedProfileId);
  const clearBrandKit = useClearBrandKit(selectedProfileId);

  const ambiguityError =
    error instanceof BrandKitAmbiguousError ? error : null;
  const profileNotFoundError =
    error instanceof BrandKitProfileNotFoundError ? error : null;
  const availableWorkspaces: AvailableWorkspace[] =
    ambiguityError?.availableWorkspaces ?? [];

  const [state, updateState] = useReducer(brandKitReducer, initialBrandKitState);
  const {
    name,
    description,
    visualNotes,
    toneNotes,
    constraints,
    brandColors,
    brandFonts,
    logoAssetKey,
    showClearDialog,
    toneOfVoice,
    prohibitedElements,
    requiredElements,
    saveState,
    isDragging,
  } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saveTimeoutStore = saveTimeoutRef;
    return () => {
      if (saveTimeoutStore.current) clearTimeout(saveTimeoutStore.current);
    };
  }, []);

  useEffect(() => {
    if (brandKit) {
      requestAnimationFrame(() => {
        updateState({
          name: brandKit.name || "",
          description: brandKit.description || "",
          visualNotes: brandKit.visualNotes || "",
          toneNotes: brandKit.toneNotes || "",
          constraints: brandKit.constraints || "",
          brandColors: brandKit.brandColors || [],
          brandFonts: brandKit.brandFonts || [],
          logoAssetKey: brandKit.logoAssetKey || null,
          toneOfVoice: brandKit.toneOfVoice || "",
          prohibitedElements: brandKit.prohibitedElements || "",
          requiredElements: brandKit.requiredElements || "",
        });
      });
    }
  }, [brandKit]);

  const hasChanges = useMemo(() => {
    if (!brandKit) {
      return (
        name !== "" ||
        description !== "" ||
        visualNotes !== "" ||
        toneNotes !== "" ||
        constraints !== "" ||
        brandColors.length > 0 ||
        brandFonts.length > 0 ||
        logoAssetKey !== null ||
        toneOfVoice !== "" ||
        prohibitedElements !== "" ||
        requiredElements !== ""
      );
    }
    return (
      name !== (brandKit.name || "") ||
      description !== (brandKit.description || "") ||
      visualNotes !== (brandKit.visualNotes || "") ||
      toneNotes !== (brandKit.toneNotes || "") ||
      constraints !== (brandKit.constraints || "") ||
      JSON.stringify(brandColors) !== JSON.stringify(brandKit.brandColors || []) ||
      JSON.stringify(brandFonts) !== JSON.stringify(brandKit.brandFonts || []) ||
      logoAssetKey !== (brandKit.logoAssetKey || null) ||
      toneOfVoice !== (brandKit.toneOfVoice || "") ||
      prohibitedElements !== (brandKit.prohibitedElements || "") ||
      requiredElements !== (brandKit.requiredElements || "")
    );
  }, [
    brandKit,
    name,
    description,
    visualNotes,
    toneNotes,
    constraints,
    brandColors,
    brandFonts,
    logoAssetKey,
    toneOfVoice,
    prohibitedElements,
    requiredElements,
  ]);

  const handleSave = async () => {
    updateState({ saveState: "saving" });
    updateBrandKit.mutate(
      {
        name: name || undefined,
        description: description || undefined,
        visualNotes: visualNotes || undefined,
        toneNotes: toneNotes || undefined,
        constraints: constraints || undefined,
        brandColors: brandColors.length > 0 ? brandColors : undefined,
        brandFonts: brandFonts.length > 0 ? brandFonts : undefined,
        logoAssetKey: logoAssetKey ?? undefined,
        toneOfVoice: toneOfVoice || undefined,
        prohibitedElements: prohibitedElements || undefined,
        requiredElements: requiredElements || undefined,
      },
      {
        onSuccess: () => {
          updateState({ saveState: "saved" });
          addToast("success", tc("save"));
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = setTimeout(() => updateState({ saveState: "idle" }), 2000);
        },
        onError: (err) => {
          updateState({ saveState: "idle" });
          addToast("error", err.message || tc("error"));
        },
      }
    );
  };

  const handleLogoUpload = useCallback((file: File) => {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      addToast("error", tc("error"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      addToast("error", tc("error"));
      return;
    }
    uploadLogo.mutate(
      { file },
      {
        onSuccess: (data) => {
          updateState({ logoAssetKey: data.logoAssetKey });
          addToast("success", tc("success"));
        },
        onError: (err) => {
          addToast("error", err.message || tc("error"));
        },
      }
    );
  }, [addToast, tc, uploadLogo]);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      updateState({ isDragging: false });
      const file = e.dataTransfer.files[0];
      if (!file) return;
      handleLogoUpload(file);
    },
    [handleLogoUpload]
  );

  const handleExtract = () => {
    extractInputRef.current?.click();
  };

  const handleExtractFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    extractBrandKit.mutate(file, {
      onSuccess: (data) => {
        updateState({
          brandColors: data.colors.length > 0
            ? Array.from(new Set([...brandColors, ...data.colors]))
            : brandColors,
          brandFonts: data.fonts.length > 0
            ? Array.from(new Set([...brandFonts, ...data.fonts]))
            : brandFonts,
          toneOfVoice: data.toneOfVoice || toneOfVoice,
          prohibitedElements: data.prohibitedElements || prohibitedElements,
          requiredElements: data.requiredElements || requiredElements,
          description: data.logoDescription && !description ? data.logoDescription : description,
        });
        addToast("success", tc("success"));
      },
      onError: (err) => {
        addToast("error", err.message || tc("error"));
      },
    });
    e.target.value = "";
  };

  return (
    <m.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="max-w-[720px] space-y-8"
    >
      {/* Header */}
      <m.div
        variants={itemVariants}
        className="flex items-center justify-between"
      >
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            {t("brandKit.title")}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {t("brandKit.subtitle")}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleExtract}
          disabled={extractBrandKit.isPending}
        >
          {extractBrandKit.isPending ? (
            <m.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="size-4 border-2 border-current/30 border-t-current rounded-full"
            />
          ) : (
            <Wand2 size={16} aria-hidden="true" />
          )}
          <span>{t("brandKit.extract")}</span>
        </Button>
        <input
          ref={extractInputRef}
          type="file"
          aria-label={t("brandKit.extract")}
          accept="image/png,image/jpeg,image/webp"
          onChange={handleExtractFile}
          className="hidden"
        />
      </m.div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Ambiguous Workspace — profile selector CTA */}
      {ambiguityError && !isLoading && (
        <m.div
          variants={itemVariants}
          className="rounded-lg border border-[var(--accent-green)]/40 bg-[var(--accent-green-dim)] px-4 py-4 space-y-3"
          role="group"
          aria-labelledby="brand-kit-workspace-selector-title"
        >
          <div>
            <h4
              id="brand-kit-workspace-selector-title"
              className="text-sm font-semibold text-[var(--text-primary)]"
            >
              {t("brandKit.workspaceSelector.title")}
            </h4>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {t("brandKit.workspaceSelector.description")}
            </p>
          </div>
          <select
            value={pendingProfileChoice}
            onChange={(e) => setPendingProfileChoice(e.target.value)}
            aria-label={t("brandKit.workspaceSelector.placeholder")}
            className={cn(
              "w-full h-10 rounded-md border px-3 text-sm",
              "bg-[var(--surface-base)] text-[var(--text-primary)]",
              "focus:outline-none focus:border-[var(--accent-green)] focus:ring-[3px] focus:ring-[var(--accent-green-dim)0.15)]",
              "transition-all duration-200 border-[var(--border-dim)]"
            )}
          >
            <option value="">{t("brandKit.workspaceSelector.placeholder")}</option>
            {availableWorkspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setPendingProfileChoice("");
                setSelectedProfileId(undefined);
              }}
            >
              {t("brandKit.workspaceSelector.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!pendingProfileChoice}
              onClick={() => {
                setSelectedProfileId(pendingProfileChoice);
              }}
            >
              {t("brandKit.workspaceSelector.confirm")}
            </Button>
          </div>
        </m.div>
      )}

      {/* Profile Not Found / Generic Error State */}
      {isError && !isLoading && !ambiguityError && (
        <m.div
          variants={itemVariants}
          className="rounded-lg border border-[var(--accent-rose)]/30 bg-[var(--accent-rose)]/10 px-4 py-3 text-sm text-[var(--accent-rose)]"
        >
          {profileNotFoundError
            ? t("brandKit.workspaceSelector.retryFailed")
            : error?.message || tc("error")}
        </m.div>
      )}

      {/* Form */}
      {!isLoading && !isError && (
        <div className="space-y-6">
          {/* Name */}
          <m.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.name")}
            </label>
            <input
              type="text"
              aria-label={t("brandKit.name")}
              value={name}
              onChange={(e) => updateState({ name: e.target.value })}
              placeholder={t("brandKit.namePlaceholder")}
              className={cn(
                "w-full h-10 rounded-md border px-3 text-sm",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                "focus:outline-none focus:border-[var(--accent-green)] focus:ring-[3px] focus:ring-[var(--accent-green-dim)0.15)]",
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </m.div>

          {/* Description */}
          <m.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.description")}
            </label>
            <textarea
              aria-label={t("brandKit.description")}
              value={description}
              onChange={(e) => updateState({ description: e.target.value })}
              placeholder={t("brandKit.descriptionPlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                FOCUS_RING,
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </m.div>

          {/* Logo Upload */}
          <m.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.logo")}
            </label>
            {brandKit?.logoUrl ? (
              <div className="flex items-center gap-4 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-3">
                <Image
                  src={brandKit.logoUrl}
                  alt="Logo"
                  className="size-16 object-contain rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)]"
                
        width={800}
        height={800}
        unoptimized
      />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {t("brandKit.logoUploaded")}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {logoAssetKey}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateState({ logoAssetKey: null })}
                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent-rose)] hover:bg-[var(--surface-raised)] transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onDragOver={(e) => {
                  e.preventDefault();
                  updateState({ isDragging: true });
                }}
                onDragLeave={() => updateState({ isDragging: false })}
                onDrop={handleFileDrop}
                onClick={() => !uploadLogo.isPending && fileInputRef.current?.click()}
                disabled={uploadLogo.isPending}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 cursor-pointer transition-all",
                  isDragging
                    ? "border-[var(--accent-green)] bg-[var(--accent-green-dim)]"
                    : "border-[var(--border-dim)] bg-[var(--surface-base)] hover:border-[var(--border-medium)] hover:bg-[var(--surface-raised)]"
                )}
              >
                {uploadLogo.isPending ? (
                  <div className="size-6 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload size={24} className="text-[var(--text-muted)]" />
                )}
                <p className="text-sm text-[var(--text-secondary)]">
                  {t("brandKit.logoDropzone")}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  PNG, JPEG, WebP
                </p>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              aria-label={t("brandKit.logoDropzone")}
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLogoUpload(file);
                e.target.value = "";
              }}
              className="hidden"
            />
          </m.div>

          {/* Brand Colors */}
          <m.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.colors")}
            </label>
            <TagInput
              tags={brandColors}
              onChange={(colors) => updateState({ brandColors: colors })}
              placeholder={t("brandKit.colorsPlaceholder")}
              validator={(tag) => /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(tag)}
              normalizer={(tag) => {
                const hex = tag.replace("#", "");
                if (hex.length === 3) {
                  return "#" + hex.split("").map((c) => c + c).join("");
                }
                return tag;
              }}
            />
            <p className="text-[10px] text-[var(--text-muted)]">
              {t("brandKit.colorsHelp")}
            </p>
          </m.div>

          {/* Brand Fonts */}
          <m.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.fonts")}
            </label>
            <TagInput
              tags={brandFonts}
              onChange={(fonts) => updateState({ brandFonts: fonts })}
              placeholder={t("brandKit.fontsPlaceholder")}
            />
          </m.div>

          {/* Visual Notes */}
          <m.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.visualNotes")}
            </label>
            <textarea
              aria-label={t("brandKit.visualNotes")}
              value={visualNotes}
              onChange={(e) => updateState({ visualNotes: e.target.value })}
              placeholder={t("brandKit.visualNotesPlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                FOCUS_RING,
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </m.div>

          {/* Tone Notes */}
          <m.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.toneNotes")}
            </label>
            <textarea
              aria-label={t("brandKit.toneNotes")}
              value={toneNotes}
              onChange={(e) => updateState({ toneNotes: e.target.value })}
              placeholder={t("brandKit.toneNotesPlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                FOCUS_RING,
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </m.div>

          {/* Tone of Voice */}
          <m.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.toneOfVoice")}
            </label>
            <textarea
              aria-label={t("brandKit.toneOfVoice")}
              value={toneOfVoice}
              onChange={(e) => updateState({ toneOfVoice: e.target.value })}
              placeholder={t("brandKit.toneOfVoicePlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                FOCUS_RING,
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </m.div>

          {/* Prohibited Elements */}
          <m.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.prohibitedElements")}
            </label>
            <textarea
              aria-label={t("brandKit.prohibitedElements")}
              value={prohibitedElements}
              onChange={(e) => updateState({ prohibitedElements: e.target.value })}
              placeholder={t("brandKit.prohibitedElementsPlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                FOCUS_RING,
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </m.div>

          {/* Required Elements */}
          <m.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.requiredElements")}
            </label>
            <textarea
              aria-label={t("brandKit.requiredElements")}
              value={requiredElements}
              onChange={(e) => updateState({ requiredElements: e.target.value })}
              placeholder={t("brandKit.requiredElementsPlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                FOCUS_RING,
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </m.div>

          {/* Constraints */}
          <m.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.constraints")}
            </label>
            <textarea
              aria-label={t("brandKit.constraints")}
              value={constraints}
              onChange={(e) => updateState({ constraints: e.target.value })}
              placeholder={t("brandKit.constraintsPlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                FOCUS_RING,
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </m.div>

          {/* Save Button */}
          <m.div variants={itemVariants} className="flex justify-end">
            <button type="button"
              onClick={handleSave}
              disabled={
                !hasChanges || saveState !== "idle" || updateBrandKit.isPending
              }
              className={cn(
                "h-10 px-5 rounded-md text-sm font-medium text-white flex items-center gap-2",
                "bg-[var(--accent-green)] hover:bg-[var(--accent-green-light)]",
                "active:scale-[0.98] active:brightness-90",
                "transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {saveState === "saving" && (
                <m.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="size-4 border-2 border-white/30 border-t-white rounded-full"
                />
              )}
              {saveState === "saved" && <Check size={16} />}
              <span>
                {saveState === "saving"
                  ? t("saving")
                  : saveState === "saved"
                    ? t("saved")
                    : t("saveChanges")}
              </span>
            </button>
          </m.div>

          {/* Danger Zone */}
          <m.div
            variants={itemVariants}
            className="rounded-xl border border-[rgba(244,63,94,0.3)] p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Trash2 size={16} className="text-[var(--accent-rose)]" />
              <h3 className="text-[15px] font-semibold text-[var(--accent-rose)]">
                {t("brandKit.clearTitle")}
              </h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {t("brandKit.clearWarning")}
            </p>
            <button type="button"
              onClick={() => updateState({ showClearDialog: true })}
              disabled={clearBrandKit.isPending || !brandKit}
              className={cn(
                "h-9 px-4 rounded-md text-sm font-medium text-white",
                "bg-[var(--accent-rose)] hover:brightness-110",
                "active:scale-[0.98]",
                "transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {clearBrandKit.isPending ? tc("loading") : t("brandKit.clearButton")}
            </button>
          </m.div>
        </div>
      )}
      <ConfirmDialog
        open={showClearDialog}
        onOpenChange={(open) => updateState({ showClearDialog: open })}
        title={t("brandKit.clearTitle")}
        description={t("brandKit.confirmClear")}
        confirmLabel={t("brandKit.clearButton")}
        variant="destructive"
        onConfirm={() => {
          clearBrandKit.mutate(undefined, {
            onSuccess: () => {
              addToast("success", t("brandKit.cleared"));
            },
            onError: (err) => {
              addToast("error", err.message || tc("error"));
            },
          });
        }}
      />
    </m.div>
  );
}
