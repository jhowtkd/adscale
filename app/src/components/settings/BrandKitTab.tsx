"use client";

import Image from "next/image";
import { useReducer, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { m, useReducedMotion } from "@/components/animations/MotionBoundary";
import { Upload, X, Wand2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  studioChipClass,
  studioQuietActionClass,
} from "@/components/dashboard/studio-stage/StudioInstrument";
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
  BrandKitProfileNotFoundError,
  resolveBrandKitClientProfileId,
  shouldFetchBrandKit,
} from "@/lib/hooks/use-brand-kit";
import { useCreateClientProfile } from "@/lib/hooks/use-client-profiles";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const FOCUS_RING =
  "focus:outline-none focus:border-[var(--focus-ring)] focus:ring-[3px] focus:ring-[var(--focus-ring)]";

const kitFieldClass =
  "w-full rounded-[var(--radius-control)] border-0 bg-white/6 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

export type BrandKitStage = "identity" | "voice" | "fonts";

const HEX_COLOR = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function normalizeHex(tag: string) {
  const hex = tag.replace("#", "");
  if (hex.length === 3) return `#${hex.split("").map((c) => c + c).join("")}`;
  return tag.startsWith("#") ? tag : `#${tag}`;
}

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
  const tc = useTranslations("common");

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
        "flex min-h-10 w-full flex-wrap gap-1.5 rounded-[var(--radius-control)] bg-white/6 px-2 py-1.5",
        "focus-within:ring-2 focus-within:ring-[var(--focus-ring)]",
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/8 px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            aria-label={`${tc("remove")} ${tag}`}
            className="hover:text-[var(--danger-text)]"
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
        className="min-w-[80px] flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      />
    </div>
  );
}

function ColorOccupancy({
  colors,
  onChange,
  label,
  placeholder,
  removeLabel,
}: {
  colors: string[];
  onChange: (colors: string[]) => void;
  label: string;
  placeholder: string;
  removeLabel: string;
}) {
  const [input, setInput] = useState("");

  const commit = () => {
    const next = normalizeHex(input.trim());
    if (!HEX_COLOR.test(next) || colors.includes(next)) return;
    onChange([...colors, next]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-[var(--text-secondary)]">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        {colors.map((color) => (
          <span key={color} className="group relative size-9">
            <span
              className="block size-9 rounded-full border border-white/15"
              style={{ backgroundColor: color }}
              title={color}
            />
            <button
              type="button"
              aria-label={`${removeLabel} ${color}`}
              onClick={() => onChange(colors.filter((item) => item !== color))}
              className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-black/70 text-[10px] text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          type="text"
          aria-label={label}
          value={input}
          placeholder={placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
          }}
          className="h-9 min-w-[6.5rem] flex-1 rounded-full border-0 bg-transparent px-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        />
      </div>
    </div>
  );
}

function KitField({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
  type?: "text" | "textarea";
}) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
        {label}
      </label>
      {type === "textarea" ? (
        <textarea
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={cn(kitFieldClass, "resize-none")}
        />
      ) : (
        <input
          type="text"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(kitFieldClass, "h-9 py-0")}
        />
      )}
    </div>
  );
}

export default function BrandKitTab({
  stage = "identity",
}: {
  stage?: BrandKitStage;
} = {}) {
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const tClient = useTranslations("campaign.pilotSidebar");
  const reducedMotion = useReducedMotion();

  const [pendingProfileChoice, setPendingProfileChoice] = useState<string>("");
  const [newClientName, setNewClientName] = useState("");
  const {
    profiles: clientProfiles,
    activeClientProfileId,
    isLoading: clientProfilesLoading,
    selectProfile,
  } = useActiveClientProfile();
  const clientProfilesLoaded = !clientProfilesLoading;
  const createClientProfile = useCreateClientProfile();
  const brandKitClientProfileId = resolveBrandKitClientProfileId({
    clientProfileId: activeClientProfileId ?? undefined,
    clientProfiles,
  });
  const brandKitQueryEnabled = shouldFetchBrandKit({
    clientProfileId: brandKitClientProfileId,
    clientProfiles,
    profilesLoaded: clientProfilesLoaded,
  });
  const {
    data: brandKitData,
    isLoading,
    isError,
    error,
  } = useBrandKit(brandKitClientProfileId, {
    enabled: brandKitQueryEnabled,
  });
  const brandKit = brandKitQueryEnabled ? brandKitData : undefined;
  const updateBrandKit = useUpdateBrandKit(brandKitClientProfileId);
  const extractBrandKit = useExtractBrandKit(brandKitClientProfileId);
  const uploadLogo = useUploadLogo(brandKitClientProfileId);
  const clearBrandKit = useClearBrandKit(brandKitClientProfileId);

  const profileNotFoundError =
    error instanceof BrandKitProfileNotFoundError ? error : null;
  const needsClientProfileSetup =
    clientProfilesLoaded &&
    !brandKitClientProfileId &&
    (clientProfiles.length === 0 || clientProfiles.length > 1);

  const handleCreateClientProfile = () => {
    const name = newClientName.trim();
    if (!name) return;

    createClientProfile.mutate(
      { name },
      {
        onSuccess: (profile) => {
          setNewClientName("");
          selectProfile(profile.id);
          addToast("success", tClient("toastProfileCreatedAndLinked"));
        },
        onError: (error) =>
          addToast(
            "error",
            error instanceof Error ? error.message : tClient("toastProfileCreateFailed")
          ),
      }
    );
  };

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
      initial={reducedMotion ? false : "hidden"}
      animate="show"
      className="max-w-3xl space-y-8"
    >
      {!isLoading && !needsClientProfileSetup && !isError ? (
        <m.div variants={itemVariants} className="flex flex-wrap items-center justify-end gap-1">
          {stage === "identity" ? (
            <button
              type="button"
              onClick={handleExtract}
              disabled={extractBrandKit.isPending}
              className={studioChipClass}
            >
              {extractBrandKit.isPending ? (
                <m.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="size-3.5 rounded-full border-2 border-current/30 border-t-current"
                />
              ) : (
                <Wand2 size={14} aria-hidden="true" />
              )}
              <span>{t("brandKit.extract")}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saveState !== "idle" || updateBrandKit.isPending}
            className={studioQuietActionClass}
          >
            {saveState === "saving"
              ? t("saving")
              : saveState === "saved"
                ? t("saved")
                : t("saveChanges")}
          </button>
          {stage === "identity" ? (
            <button
              type="button"
              onClick={() => updateState({ showClearDialog: true })}
              disabled={clearBrandKit.isPending || !brandKit}
              className={studioQuietActionClass}
            >
              {clearBrandKit.isPending ? tc("loading") : t("brandKit.clearButton")}
            </button>
          ) : null}
          <input
            ref={extractInputRef}
            type="file"
            aria-label={t("brandKit.extract")}
            accept="image/png,image/jpeg,image/webp"
            onChange={handleExtractFile}
            className="hidden"
          />
        </m.div>
      ) : null}

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
      {needsClientProfileSetup && !isLoading && (
        <m.div
          variants={itemVariants}
          className="rounded-lg border border-[var(--selection-border)] bg-[var(--selection-bg)] px-4 py-4 space-y-3"
          role="group"
          aria-labelledby="brand-kit-workspace-selector-title"
        >
          <div>
            <h4
              id="brand-kit-workspace-selector-title"
              className="text-sm font-semibold text-[var(--text-primary)]"
            >
              {clientProfiles.length === 0
                ? tClient("newClientTitle")
                : t("brandKit.workspaceSelector.title")}
            </h4>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {clientProfiles.length === 0
                ? tClient("newClientDescription")
                : t("brandKit.workspaceSelector.description")}
            </p>
          </div>
          {clientProfiles.length > 1 ? (
            <>
              <select
                value={pendingProfileChoice}
                onChange={(e) => setPendingProfileChoice(e.target.value)}
                aria-label={t("brandKit.workspaceSelector.placeholder")}
                className={cn(
                  "w-full h-10 rounded-md border px-3 text-sm",
                  "bg-[var(--surface-base)] text-[var(--text-primary)]",
                  "focus:outline-none focus:border-[var(--focus-ring)] focus:ring-[3px] focus:ring-[var(--focus-ring)]",
                  "transition-all duration-200 border-[var(--border-dim)]"
                )}
              >
                <option value="">{t("brandKit.workspaceSelector.placeholder")}</option>
                {clientProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
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
                  }}
                >
                  {t("brandKit.workspaceSelector.cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!pendingProfileChoice}
                  onClick={() => {
                    selectProfile(pendingProfileChoice);
                  }}
                >
                  {t("brandKit.workspaceSelector.confirm")}
                </Button>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">{tClient("existingClientLabel")}</p>
            </>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="brand-kit-new-client-name" className="block text-xs font-medium text-[var(--text-secondary)]">
              {tClient("clientNameLabel")}
            </label>
            <input
              id="brand-kit-new-client-name"
              type="text"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder={tClient("clientNamePlaceholder")}
              disabled={createClientProfile.isPending}
              className={cn(
                "w-full h-10 rounded-md border px-3 text-sm",
                "bg-[var(--surface-base)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-muted)]",
                FOCUS_RING,
                "transition-all duration-200 border-[var(--border-dim)]"
              )}
            />
          </div>
          <div className="flex justify-end">

            <Button
              type="button"
              size="sm"
              disabled={!newClientName.trim() || createClientProfile.isPending}
              onClick={handleCreateClientProfile}
            >
              {createClientProfile.isPending ? tClient("saving") : tClient("createClientProfile")}
            </Button>
          </div>
        </m.div>
      )}

      {/* Profile Not Found / Generic Error State */}
      {isError && !isLoading && !needsClientProfileSetup && (
        <m.div
          variants={itemVariants}
          className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-text)]"
        >
          {profileNotFoundError
            ? t("brandKit.workspaceSelector.retryFailed")
            : error?.message || tc("error")}
        </m.div>
      )}

      {!isLoading && !needsClientProfileSetup && !isError && stage === "identity" ? (
        <m.div
          variants={itemVariants}
          data-testid="brand-kit-identity"
          className="grid gap-6 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start"
        >
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-[var(--text-secondary)]">
              {t("brandKit.logo")}
            </p>
            {brandKit?.logoUrl ? (
              <div className="group relative">
                <Image
                  src={brandKit.logoUrl}
                  alt={name ? `${name} logo` : t("brandKit.logo")}
                  width={800}
                  height={800}
                  unoptimized
                  className="h-auto w-full rounded-2xl bg-white/6 object-contain"
                />
                <button
                  type="button"
                  onClick={() => updateState({ logoAssetKey: null })}
                  aria-label={tc("remove")}
                  className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  <Trash2 size={12} />
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
                  "flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl bg-white/6 text-xs text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                  isDragging && "bg-[var(--selection-bg)] ring-2 ring-[var(--focus-ring)]",
                )}
              >
                {uploadLogo.isPending ? (
                  <div className="size-5 animate-spin rounded-full border-2 border-[var(--text-muted)] border-t-transparent" />
                ) : (
                  <Upload size={16} aria-hidden="true" />
                )}
                <span>{t("brandKit.logoEmpty")}</span>
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
          </div>
          <div className="space-y-5">
            <ColorOccupancy
              colors={brandColors}
              onChange={(colors) => updateState({ brandColors: colors })}
              label={t("brandKit.colors")}
              placeholder={t("brandKit.colorsPlaceholder")}
              removeLabel={tc("remove")}
            />
            <KitField
              label={t("brandKit.name")}
              value={name}
              onChange={(value) => updateState({ name: value })}
              placeholder={t("brandKit.namePlaceholder")}
            />
            <KitField
              label={t("brandKit.description")}
              value={description}
              onChange={(value) => updateState({ description: value })}
              placeholder={t("brandKit.descriptionPlaceholder")}
              type="textarea"
            />
            <KitField
              label={t("brandKit.visualNotes")}
              value={visualNotes}
              onChange={(value) => updateState({ visualNotes: value })}
              placeholder={t("brandKit.visualNotesPlaceholder")}
              type="textarea"
            />
          </div>
        </m.div>
      ) : null}

      {!isLoading && !needsClientProfileSetup && !isError && stage === "voice" ? (
        <m.div variants={itemVariants} data-testid="brand-kit-voice" className="space-y-5">
          <KitField
            label={t("brandKit.toneOfVoice")}
            value={toneOfVoice}
            onChange={(value) => updateState({ toneOfVoice: value })}
            placeholder={t("brandKit.toneOfVoicePlaceholder")}
            type="textarea"
          />
          <KitField
            label={t("brandKit.toneNotes")}
            value={toneNotes}
            onChange={(value) => updateState({ toneNotes: value })}
            placeholder={t("brandKit.toneNotesPlaceholder")}
            type="textarea"
          />
          <KitField
            label={t("brandKit.prohibitedElements")}
            value={prohibitedElements}
            onChange={(value) => updateState({ prohibitedElements: value })}
            placeholder={t("brandKit.prohibitedElementsPlaceholder")}
            type="textarea"
          />
          <KitField
            label={t("brandKit.requiredElements")}
            value={requiredElements}
            onChange={(value) => updateState({ requiredElements: value })}
            placeholder={t("brandKit.requiredElementsPlaceholder")}
            type="textarea"
          />
          <KitField
            label={t("brandKit.constraints")}
            value={constraints}
            onChange={(value) => updateState({ constraints: value })}
            placeholder={t("brandKit.constraintsPlaceholder")}
            type="textarea"
          />
        </m.div>
      ) : null}

      {!isLoading && !needsClientProfileSetup && !isError && stage === "fonts" ? (
        <m.div variants={itemVariants} data-testid="brand-kit-fonts" className="space-y-2">
          <TagInput
            tags={brandFonts}
            onChange={(fonts) => updateState({ brandFonts: fonts })}
            placeholder={t("brandKit.fontsPlaceholder")}
          />
        </m.div>
      ) : null}

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
