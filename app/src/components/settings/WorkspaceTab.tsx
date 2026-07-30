"use client";

import { useReducer, useEffect, useRef, useMemo } from "react";
import { m, useReducedMotion } from "@/components/animations/MotionBoundary";
import { Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useWorkspaceSettings,
  useUpdateWorkspaceSettings,
} from "@/lib/hooks/use-workspace-settings";

const FOCUS_RING =
  "focus:outline-none focus:border-[var(--accent-green)] focus:ring-[3px] focus:ring-[var(--accent-green-dim)]";

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

interface WorkspaceFormState {
  name: string;
  slug: string;
  description: string;
  industry: string;
  website: string;
  timezone: string;
  saveState: "idle" | "saving" | "saved";
}

function workspaceFormReducer(
  state: WorkspaceFormState,
  payload: Partial<WorkspaceFormState>
): WorkspaceFormState {
  return { ...state, ...payload };
}

const initialFormState: WorkspaceFormState = {
  name: "",
  slug: "",
  description: "",
  industry: "",
  website: "",
  timezone: "",
  saveState: "idle",
};

export default function WorkspaceTab() {
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const reducedMotion = useReducedMotion();

  const { data: settings, isLoading, isError, error } = useWorkspaceSettings();
  const updateSettings = useUpdateWorkspaceSettings();

  const [form, updateForm] = useReducer(workspaceFormReducer, initialFormState);
  const { name, slug, description, industry, website, timezone, saveState } = form;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canEdit = settings?.canEdit !== false;

  useEffect(() => {
    const saveTimeoutStore = saveTimeoutRef;
    return () => {
      if (saveTimeoutStore.current) clearTimeout(saveTimeoutStore.current);
    };
  }, []);

  useEffect(() => {
    if (settings) {
      requestAnimationFrame(() => {
        updateForm({
          name: settings.name,
          slug: settings.slug,
          description: settings.description,
          industry: settings.industry,
          website: settings.website,
          timezone: settings.timezone,
        });
      });
    }
  }, [settings]);

  const hasChanges = useMemo(() => {
    if (!settings) {
      return (
        name !== "" ||
        slug !== "" ||
        description !== "" ||
        industry !== "" ||
        website !== "" ||
        timezone !== ""
      );
    }
    return (
      name !== settings.name ||
      slug !== settings.slug ||
      description !== settings.description ||
      industry !== settings.industry ||
      website !== settings.website ||
      timezone !== settings.timezone
    );
  }, [settings, name, slug, description, industry, website, timezone]);

  const handleSave = () => {
    updateForm({ saveState: "saving" });
    updateSettings.mutate(
      { name, slug, description, industry, website, timezone },
      {
        onSuccess: () => {
          updateForm({ saveState: "saved" });
          addToast("success", tc("workspaceUpdated"));
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = setTimeout(
            () => updateForm({ saveState: "idle" }),
            2000
          );
        },
        onError: (err) => {
          updateForm({ saveState: "idle" });
          addToast("error", err.message || tc("error"));
        },
      }
    );
  };

  return (
    <m.div
      variants={containerVariants}
      initial={reducedMotion ? false : "hidden"}
      animate="show"
      className="max-w-[560px] space-y-8"
    >
      {isLoading && (
        <div className="space-y-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      )}

      {isError && !isLoading && (
        <m.div
          variants={itemVariants}
          className="rounded-lg border border-[var(--accent-rose)]/30 bg-[var(--accent-rose)]/10 px-4 py-3 text-sm text-[var(--accent-rose)]"
        >
          {error?.message || tc("error")}
        </m.div>
      )}

      {!isLoading && !isError && (
        <>
          {/* Workspace Info Section */}
          <div className="space-y-5">
            <m.h3
              variants={itemVariants}
              className="text-[15px] font-semibold text-[var(--text-primary)] pb-3 border-b border-[var(--border-dim)]"
            >
              {t("workspaceInformation")}
            </m.h3>

            {!canEdit && (
              <m.div
                variants={itemVariants}
                className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--text-secondary)]"
              >
                {t("workspace.readOnlyNotice")}
              </m.div>
            )}

            <m.div variants={itemVariants} className="space-y-2">
              <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                {t("workspaceName")}
              </label>
              <input
                type="text"
                aria-label={t("workspaceName")}
                value={name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder={t("workspace.namePlaceholder")}
                disabled={!canEdit}
                className={cn(
                  "w-full h-10 rounded-md border px-3 text-sm",
                  "bg-[var(--surface-base)] text-[var(--text-primary)]",
                  "placeholder:text-[var(--text-muted)]",
                  "focus:outline-none focus:border-[var(--accent-green)] focus:ring-[3px] focus:ring-[var(--accent-green-dim)]",
                  "transition-all duration-200 border-[var(--border-dim)]",
                  "disabled:opacity-60 disabled:cursor-not-allowed"
                )}
              />
            </m.div>

            <m.div variants={itemVariants} className="space-y-2">
              <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                {t("workspaceUrl")}
              </label>
              <div className="flex items-center h-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-3 text-sm">
                <span className="text-[var(--text-muted)] select-none">
                  adscale.app/w/
                </span>
                <input
                  type="text"
                  aria-label={t("workspaceUrl")}
                  value={slug}
                  onChange={(e) =>
                    updateForm({
                      slug: e.target.value.replace(/[^a-z0-9-]/g, ""),
                    })
                  }
                  disabled={!canEdit}
                  className={cn(
                    "flex-1 bg-transparent text-[var(--text-primary)] outline-none",
                    "placeholder:text-[var(--text-muted)]",
                    "disabled:opacity-60 disabled:cursor-not-allowed"
                  )}
                />
              </div>
            </m.div>

            <m.div variants={itemVariants} className="space-y-2">
              <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                {t("description")}
              </label>
              <textarea
                aria-label={t("description")}
                value={description}
                onChange={(e) => updateForm({ description: e.target.value })}
                placeholder={t("workspace.descriptionPlaceholder")}
                rows={3}
                disabled={!canEdit}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-sm resize-none",
                  "bg-[var(--surface-base)] text-[var(--text-primary)]",
                  "placeholder:text-[var(--text-muted)]",
                  FOCUS_RING,
                  "transition-all duration-200 border-[var(--border-dim)]",
                  "disabled:opacity-60 disabled:cursor-not-allowed"
                )}
              />
            </m.div>

            <m.div variants={itemVariants} className="space-y-2">
              <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                {t("industry")}
              </label>
              <select
                aria-label={t("industry")}
                value={industry}
                onChange={(e) => updateForm({ industry: e.target.value })}
                disabled={!canEdit}
                className={cn(
                  "w-full h-10 rounded-md border px-3 text-sm",
                  "bg-[var(--surface-base)] text-[var(--text-primary)]",
                  FOCUS_RING,
                  "transition-all duration-200 border-[var(--border-dim)]",
                  "appearance-none cursor-pointer",
                  "disabled:opacity-60 disabled:cursor-not-allowed"
                )}
              >
                <option>Marketing & Advertising</option>
                <option>E-commerce</option>
                <option>Technology</option>
                <option>Finance</option>
                <option>Healthcare</option>
                <option>Education</option>
                <option>Entertainment</option>
                <option>Travel & Hospitality</option>
                <option>Real Estate</option>
                <option>Other</option>
              </select>
            </m.div>

            <m.div variants={itemVariants} className="space-y-2">
              <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                {t("website")}
              </label>
              <input
                type="url"
                aria-label={t("website")}
                value={website}
                onChange={(e) => updateForm({ website: e.target.value })}
                placeholder={t("workspace.urlPlaceholder")}
                disabled={!canEdit}
                className={cn(
                  "w-full h-10 rounded-md border px-3 text-sm",
                  "bg-[var(--surface-base)] text-[var(--text-primary)]",
                  "placeholder:text-[var(--text-muted)]",
                  FOCUS_RING,
                  "transition-all duration-200 border-[var(--border-dim)]",
                  "disabled:opacity-60 disabled:cursor-not-allowed"
                )}
              />
            </m.div>

            <m.div variants={itemVariants} className="space-y-2">
              <label className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                {t("timeZone")}
              </label>
              <select
                aria-label={t("timeZone")}
                value={timezone}
                onChange={(e) => updateForm({ timezone: e.target.value })}
                disabled={!canEdit}
                className={cn(
                  "w-full h-10 rounded-md border px-3 text-sm",
                  "bg-[var(--surface-base)] text-[var(--text-primary)]",
                  FOCUS_RING,
                  "transition-all duration-200 border-[var(--border-dim)]",
                  "appearance-none cursor-pointer",
                  "disabled:opacity-60 disabled:cursor-not-allowed"
                )}
              >
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
                <option value="Europe/London">London (GMT)</option>
                <option value="Europe/Paris">Paris (CET)</option>
                <option value="Asia/Tokyo">Tokyo (JST)</option>
                <option value="Asia/Singapore">Singapore (SGT)</option>
                <option value="Australia/Sydney">Sydney (AEDT)</option>
              </select>
            </m.div>
          </div>

          {/* Save Button */}
          <m.div variants={itemVariants} className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={
                !canEdit ||
                !hasChanges ||
                saveState !== "idle" ||
                updateSettings.isPending
              }
              className={cn(
                "h-10 px-5 rounded-md text-sm font-medium text-[var(--text-on-accent)] flex items-center gap-2",
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
                  className="size-4 border-2 border-[var(--text-on-accent)]/30 border-t-[var(--text-on-accent)] rounded-full"
                />
              )}
              {saveState === "saved" && <Check size={16} />}
              <span>
                {saveState === "saving"
                  ? t("saving")
                  : saveState === "saved"
                    ? t("saved")
                    : t("saveWorkspace")}
              </span>
            </button>
          </m.div>

          {/* Danger Zone */}
          <m.div
            variants={itemVariants}
            className="rounded-xl border border-[var(--danger-border)] p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-[var(--accent-rose)]" />
              <h3 className="text-[15px] font-semibold text-[var(--accent-rose)]">
                {t("dangerZone")}
              </h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {t("deleteWorkspaceWarning")}
            </p>
            <button
              type="button"
              onClick={() => addToast("error", tc("comingSoon"))}
              disabled={!canEdit}
              className={cn(
                "h-9 px-4 rounded-md text-sm font-medium text-[var(--text-on-accent)]",
                "bg-[var(--accent-rose)] hover:brightness-110",
                "active:scale-[0.98]",
                "transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {t("deleteWorkspace")}
            </button>
          </m.div>
        </>
      )}
    </m.div>
  );
}
