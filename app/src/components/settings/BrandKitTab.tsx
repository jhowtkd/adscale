"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Check, Upload, X, Wand2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBrandKit,
  useUpdateBrandKit,
  useExtractBrandKit,
  useUploadLogo,
  useClearBrandKit,
} from "@/lib/hooks/use-brand-kit";

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

function TagInput({
  tags,
  onChange,
  placeholder,
  validator,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  validator?: (tag: string) => boolean;
}) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = input.trim();
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
        "focus-within:border-[var(--accent-mint)] focus-within:ring-[3px] focus-within:ring-[rgba(47,182,125,0.15)]",
        "transition-all duration-200"
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-mint-dim)] px-2 py-0.5 text-xs font-medium text-[var(--accent-mint)]"
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

  const { data: brandKit, isLoading, isError, error } = useBrandKit();
  const updateBrandKit = useUpdateBrandKit();
  const extractBrandKit = useExtractBrandKit();
  const uploadLogo = useUploadLogo();
  const clearBrandKit = useClearBrandKit();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visualNotes, setVisualNotes] = useState("");
  const [toneNotes, setToneNotes] = useState("");
  const [constraints, setConstraints] = useState("");
  const [brandColors, setBrandColors] = useState<string[]>([]);
  const [brandFonts, setBrandFonts] = useState<string[]>([]);
  const [logoAssetKey, setLogoAssetKey] = useState<string | null>(null);
  const [toneOfVoice, setToneOfVoice] = useState("");
  const [prohibitedElements, setProhibitedElements] = useState("");
  const [requiredElements, setRequiredElements] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (brandKit) {
      setName(brandKit.name || "");
      setDescription(brandKit.description || "");
      setVisualNotes(brandKit.visualNotes || "");
      setToneNotes(brandKit.toneNotes || "");
      setConstraints(brandKit.constraints || "");
      setBrandColors(brandKit.brandColors || []);
      setBrandFonts(brandKit.brandFonts || []);
      setLogoAssetKey(brandKit.logoAssetKey || null);
      setToneOfVoice(brandKit.toneOfVoice || "");
      setProhibitedElements(brandKit.prohibitedElements || "");
      setRequiredElements(brandKit.requiredElements || "");
    }
  }, [brandKit]);

  const hasChanges =
    name !== (brandKit?.name || "") ||
    description !== (brandKit?.description || "") ||
    visualNotes !== (brandKit?.visualNotes || "") ||
    toneNotes !== (brandKit?.toneNotes || "") ||
    constraints !== (brandKit?.constraints || "") ||
    JSON.stringify(brandColors) !==
      JSON.stringify(brandKit?.brandColors || []) ||
    JSON.stringify(brandFonts) !==
      JSON.stringify(brandKit?.brandFonts || []) ||
    logoAssetKey !== (brandKit?.logoAssetKey || null) ||
    toneOfVoice !== (brandKit?.toneOfVoice || "") ||
    prohibitedElements !== (brandKit?.prohibitedElements || "") ||
    requiredElements !== (brandKit?.requiredElements || "");

  const handleSave = async () => {
    setSaveState("saving");
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
          setSaveState("saved");
          addToast("success", tc("save"));
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = setTimeout(() => setSaveState("idle"), 2000);
        },
        onError: (err) => {
          setSaveState("idle");
          addToast("error", err.message || tc("error"));
        },
      }
    );
  };

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleLogoUpload(file);
    },
    []
  );

  const handleLogoUpload = (file: File) => {
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
          setLogoAssetKey(data.logoAssetKey);
          addToast("success", tc("success"));
        },
        onError: (err) => {
          addToast("error", err.message || tc("error"));
        },
      }
    );
  };

  const handleExtract = () => {
    extractInputRef.current?.click();
  };

  const handleExtractFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    extractBrandKit.mutate(file, {
      onSuccess: (data) => {
        if (data.colors.length > 0)
          setBrandColors((prev) => Array.from(new Set([...prev, ...data.colors])));
        if (data.fonts.length > 0)
          setBrandFonts((prev) => Array.from(new Set([...prev, ...data.fonts])));
        if (data.toneOfVoice) setToneOfVoice(data.toneOfVoice);
        if (data.prohibitedElements) setProhibitedElements(data.prohibitedElements);
        if (data.requiredElements) setRequiredElements(data.requiredElements);
        if (data.logoDescription && !description) setDescription(data.logoDescription);
        addToast("success", tc("success"));
      },
      onError: (err) => {
        addToast("error", err.message || tc("error"));
      },
    });
    e.target.value = "";
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="max-w-[720px] space-y-8"
    >
      {/* Header */}
      <motion.div
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
        <button
          onClick={handleExtract}
          disabled={extractBrandKit.isPending}
          className={cn(
            "h-9 px-4 rounded-md text-sm font-medium text-white flex items-center gap-2",
            "bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-light)]",
            "active:scale-[0.98]",
            "transition-all duration-200",
            "disabled:opacity-60 disabled:cursor-not-allowed"
          )}
        >
          {extractBrandKit.isPending ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
            />
          ) : (
            <Wand2 size={16} />
          )}
          <span>{t("brandKit.extract")}</span>
        </button>
        <input
          ref={extractInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={handleExtractFile}
          className="hidden"
        />
      </motion.div>

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

      {/* Error State */}
      {isError && !isLoading && (
        <motion.div
          variants={itemVariants}
          className="rounded-lg border border-[var(--accent-rose)]/30 bg-[var(--accent-rose)]/10 px-4 py-3 text-sm text-[var(--accent-rose)]"
        >
          {error?.message || tc("error")}
        </motion.div>
      )}

      {/* Form */}
      {!isLoading && !isError && (
        <div className="space-y-6">
          {/* Name */}
          <motion.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.name")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("brandKit.namePlaceholder")}
              className={cn(
                "w-full h-10 rounded-md border px-3 text-sm",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                "focus:outline-none focus:border-[var(--accent-mint)] focus:ring-[3px] focus:ring-[rgba(47,182,125,0.15)]",
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </motion.div>

          {/* Description */}
          <motion.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.description")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("brandKit.descriptionPlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </motion.div>

          {/* Logo Upload */}
          <motion.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.logo")}
            </label>
            {brandKit?.logoUrl ? (
              <div className="flex items-center gap-4 rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-3">
                <img
                  src={brandKit.logoUrl}
                  alt="Logo"
                  className="h-16 w-16 object-contain rounded-md bg-white"
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
                  onClick={() => setLogoAssetKey(null)}
                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent-rose)] hover:bg-[var(--surface-raised)] transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 cursor-pointer transition-all",
                  isDragging
                    ? "border-[var(--accent-mint)] bg-[var(--accent-mint-dim)]"
                    : "border-[var(--border-dim)] bg-[var(--surface-base)] hover:border-[var(--border-medium)] hover:bg-[var(--surface-raised)]"
                )}
              >
                <Upload size={24} className="text-[var(--text-muted)]" />
                <p className="text-sm text-[var(--text-secondary)]">
                  {t("brandKit.logoDropzone")}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  PNG, JPEG, WebP
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLogoUpload(file);
                e.target.value = "";
              }}
              className="hidden"
            />
          </motion.div>

          {/* Brand Colors */}
          <motion.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.colors")}
            </label>
            <TagInput
              tags={brandColors}
              onChange={setBrandColors}
              placeholder={t("brandKit.colorsPlaceholder")}
              validator={(tag) => /^#([0-9A-Fa-f]{6})$/.test(tag)}
            />
            <p className="text-[10px] text-[var(--text-muted)]">
              {t("brandKit.colorsHelp")}
            </p>
          </motion.div>

          {/* Brand Fonts */}
          <motion.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.fonts")}
            </label>
            <TagInput
              tags={brandFonts}
              onChange={setBrandFonts}
              placeholder={t("brandKit.fontsPlaceholder")}
            />
          </motion.div>

          {/* Visual Notes */}
          <motion.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.visualNotes")}
            </label>
            <textarea
              value={visualNotes}
              onChange={(e) => setVisualNotes(e.target.value)}
              placeholder={t("brandKit.visualNotesPlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </motion.div>

          {/* Tone Notes */}
          <motion.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.toneNotes")}
            </label>
            <textarea
              value={toneNotes}
              onChange={(e) => setToneNotes(e.target.value)}
              placeholder={t("brandKit.toneNotesPlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </motion.div>

          {/* Tone of Voice */}
          <motion.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.toneOfVoice")}
            </label>
            <textarea
              value={toneOfVoice}
              onChange={(e) => setToneOfVoice(e.target.value)}
              placeholder={t("brandKit.toneOfVoicePlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </motion.div>

          {/* Prohibited Elements */}
          <motion.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.prohibitedElements")}
            </label>
            <textarea
              value={prohibitedElements}
              onChange={(e) => setProhibitedElements(e.target.value)}
              placeholder={t("brandKit.prohibitedElementsPlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </motion.div>

          {/* Required Elements */}
          <motion.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.requiredElements")}
            </label>
            <textarea
              value={requiredElements}
              onChange={(e) => setRequiredElements(e.target.value)}
              placeholder={t("brandKit.requiredElementsPlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </motion.div>

          {/* Constraints */}
          <motion.div variants={itemVariants} className="space-y-2">
            <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.constraints")}
            </label>
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder={t("brandKit.constraintsPlaceholder")}
              rows={2}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm resize-none",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)]",
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </motion.div>

          {/* Save Button */}
          <motion.div variants={itemVariants} className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={
                !hasChanges || saveState !== "idle" || updateBrandKit.isPending
              }
              className={cn(
                "h-10 px-5 rounded-md text-sm font-medium text-white flex items-center gap-2",
                "bg-[var(--accent-mint)] hover:bg-[var(--accent-mint-light)]",
                "active:scale-[0.98] active:brightness-90",
                "transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {saveState === "saving" && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
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
          </motion.div>

          {/* Danger Zone */}
          <motion.div
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
            <button
              onClick={() => {
                clearBrandKit.mutate(undefined, {
                  onSuccess: () => {
                    addToast("success", t("brandKit.cleared"));
                  },
                  onError: (err) => {
                    addToast("error", err.message || tc("error"));
                  },
                });
              }}
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
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
